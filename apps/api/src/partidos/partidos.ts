import { Body, Controller, Get, HttpStatus, Injectable, Module, Param, Post } from '@nestjs/common';
import {
  amarillasQueAcumulan,
  estadoSancion,
  eventoSchema,
  type EventoInput,
  eventosVigentes,
  marcador,
  sancionesDelPartido,
} from '@potrero/shared';
import { z } from 'zod';
import { auditar } from '../comun/auditoria.js';
import { type Contexto, Ctx, ErrorNegocio, noEncontrado, Permiso, Zod } from '../comun/http.js';
import { DbService, enSerie, type Tx } from '../db/db.service.js';
import { aReglamento } from '../torneos/torneos.js';

/** Jugadores suspendidos de un torneo al momento de jugar la fecha indicada. */
async function suspendidosParaFecha(tx: Tx, torneoId: string, fecha: number) {
  const [sanciones, partidos] = await enSerie([
    () => tx.sancion.findMany({ where: { torneoId } }),
    () =>
      tx.partido.findMany({
        where: { torneoId },
        select: { id: true, fecha: true, estado: true, localId: true, visitanteId: true },
      }),
  ]);
  const fechaDe = new Map(partidos.map((p) => [p.id, p.fecha]));
  const suspendidos = new Map<string, { causa: string; restantes: number }>();
  for (const s of sanciones) {
    const origen = fechaDe.get(s.partidoOrigenId) ?? 0;
    if (origen >= fecha) continue;
    const jugadosAntes = partidos.filter(
      (p) =>
        p.estado === 'FINALIZADO' &&
        p.fecha > origen &&
        p.fecha < fecha &&
        (p.localId === s.equipoId || p.visitanteId === s.equipoId),
    ).length;
    const e = estadoSancion(s.partidos, jugadosAntes);
    if (e.activa) suspendidos.set(s.jugadorId, { causa: s.causa, restantes: e.restantes });
  }
  return suspendidos;
}

@Injectable()
export class PartidosService {
  constructor(private readonly db: DbService) {}

  /** Acta: partido, planteles con habilitación de cada jugador, eventos vigentes y marcador. */
  acta(c: Contexto, id: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const p = await tx.partido.findUnique({
        where: { id },
        include: {
          eventos: { orderBy: { creadoEn: 'asc' } },
          cancha: { include: { sede: true } },
          torneo: true,
        },
      });
      if (!p) throw noEncontrado('el partido');
      const [equipos, suspendidos] = await enSerie([
        () =>
          tx.equipo.findMany({
            where: { id: { in: [p.localId, p.visitanteId] } },
            include: { plantel: { include: { jugador: true }, orderBy: { numero: 'asc' } } },
          }),
        () => suspendidosParaFecha(tx, p.torneoId, p.fecha),
      ]);
      const equipo = (eid: string) => {
        const e = equipos.find((x) => x.id === eid)!;
        return {
          id: e.id,
          nombre: e.nombre,
          jugadores: e.plantel.map((pl) => {
            const s = suspendidos.get(pl.jugadorId);
            return {
              id: pl.jugadorId,
              nombre: `${pl.jugador.nombre} ${pl.jugador.apellido}`,
              numero: pl.numero,
              habilitado: !s,
              motivo: s
                ? `Suspendido (${s.causa.replace('_', ' ').toLowerCase()}), le falta${s.restantes > 1 ? 'n' : ''} ${s.restantes} partido${s.restantes > 1 ? 's' : ''}`
                : null,
            };
          }),
        };
      };
      const vigentes = eventosVigentes(p.eventos);
      return {
        id: p.id,
        torneo: { id: p.torneo.id, nombre: p.torneo.nombre },
        fecha: p.fecha,
        inicio: p.inicio,
        estado: p.estado,
        cancha: p.cancha ? `${p.cancha.sede.nombre} · ${p.cancha.nombre}` : null,
        local: equipo(p.localId),
        visitante: equipo(p.visitanteId),
        marcador: marcador(p.eventos, p.localId, p.visitanteId),
        eventos: vigentes.map((e) => ({
          id: e.id,
          tipo: e.tipo,
          equipoId: e.equipoId,
          jugadorId: e.jugadorId,
          minuto: e.minuto,
        })),
      };
    });
  }

  iniciar(c: Contexto, id: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const p = await tx.partido.findUnique({ where: { id } });
      if (!p) throw noEncontrado('el partido');
      if (p.estado !== 'PROGRAMADO')
        throw new ErrorNegocio('El partido ya empezó o está cerrado.', HttpStatus.CONFLICT);
      await auditar(tx, c, 'partido.iniciar', 'partido', id);
      return tx.partido.update({ where: { id }, data: { estado: 'EN_JUEGO' } });
    });
  }

  /**
   * Carga un evento. Idempotente por clientUuid: si el mismo evento llega dos veces (reintento, sincronización offline),
   * se devuelve el ya guardado. Si el jugador está suspendido, se guarda igual y se devuelve una advertencia.
   */
  cargarEvento(c: Contexto, id: string, d: EventoInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const repetido = await tx.eventoPartido.findUnique({ where: { clientUuid: d.clientUuid } });
      if (repetido) return { evento: repetido, repetido: true, advertencia: null };
      const p = await tx.partido.findUnique({ where: { id } });
      if (!p) throw noEncontrado('el partido');
      if (p.estado !== 'EN_JUEGO')
        throw new ErrorNegocio('Iniciá el partido para cargar eventos.', HttpStatus.CONFLICT);
      if (d.equipoId !== p.localId && d.equipoId !== p.visitanteId)
        throw new ErrorNegocio('Ese equipo no juega este partido.');
      let advertencia: string | null = null;
      if (d.jugadorId) {
        const enPlantel = await tx.plantelJugador.findFirst({
          where: { equipoId: d.equipoId, jugadorId: d.jugadorId },
        });
        if (!enPlantel) throw new ErrorNegocio('El jugador no está en el plantel de ese equipo.');
        if ((await suspendidosParaFecha(tx, p.torneoId, p.fecha)).has(d.jugadorId))
          advertencia = 'Este jugador está suspendido. Quedó registrado y el tribunal lo va a revisar.';
      }
      const evento = await tx.eventoPartido.create({
        data: {
          organizacionId: c.organizacionId,
          partidoId: id,
          tipo: d.tipo,
          equipoId: d.equipoId,
          jugadorId: d.jugadorId ?? null,
          minuto: d.minuto ?? null,
          clientUuid: d.clientUuid,
          cargadoPorId: c.usuarioId,
        },
      });
      return { evento, repetido: false, advertencia };
    });
  }

  /** Las correcciones son eventos de anulación: el acta nunca se edita ni se borra. */
  anularEvento(c: Contexto, id: string, eventoId: string, clientUuid: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const repetido = await tx.eventoPartido.findUnique({ where: { clientUuid } });
      if (repetido) return repetido;
      const [p, e] = await enSerie([
        () => tx.partido.findUnique({ where: { id } }),
        () => tx.eventoPartido.findUnique({ where: { id: eventoId } }),
      ]);
      if (!p || !e || e.partidoId !== id) throw noEncontrado('el evento');
      if (p.estado !== 'EN_JUEGO')
        throw new ErrorNegocio('Solo se puede corregir un acta abierta.', HttpStatus.CONFLICT);
      return tx.eventoPartido.create({
        data: {
          organizacionId: c.organizacionId,
          partidoId: id,
          tipo: 'ANULACION',
          equipoId: e.equipoId,
          anulaA: e.id,
          clientUuid,
          cargadoPorId: c.usuarioId,
        },
      });
    });
  }

  /**
   * Cierra el acta con la firma de ambos capitanes o la justificación del árbitro.
   * Al cerrar: se guarda el resultado y se generan las sanciones. La tabla y los goleadores se derivan de los partidos cerrados.
   */
  cerrar(c: Contexto, id: string, d: CierreInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const p = await tx.partido.findUnique({
        where: { id },
        include: { eventos: true, torneo: { include: { reglamento: true } } },
      });
      if (!p) throw noEncontrado('el partido');
      if (p.estado !== 'EN_JUEGO')
        throw new ErrorNegocio('Solo se puede cerrar un partido en juego.', HttpStatus.CONFLICT);
      if (!(d.firmaLocal && d.firmaVisitante) && !d.justificacion)
        throw new ErrorNegocio('Falta la firma de ambos capitanes o la justificación del árbitro.');
      const m = marcador(p.eventos, p.localId, p.visitanteId);
      // Amarillas que el jugador ya acumulaba en el torneo antes de este partido.
      const anteriores = await tx.eventoPartido.findMany({
        where: { partido: { torneoId: p.torneoId, estado: 'FINALIZADO', fecha: { lt: p.fecha } } },
      });
      const previas = new Map<string, number>();
      const porPartido = Map.groupBy(anteriores, (e) => e.partidoId);
      for (const evs of porPartido.values())
        for (const [jugador, n] of amarillasQueAcumulan(evs))
          previas.set(jugador, (previas.get(jugador) ?? 0) + n);
      const sanciones = sancionesDelPartido(p.eventos, previas, aReglamento(p.torneo.reglamento));
      await tx.sancion.createMany({
        data: sanciones.map((s) => ({
          organizacionId: c.organizacionId,
          torneoId: p.torneoId,
          partidoOrigenId: id,
          ...s,
        })),
        skipDuplicates: true,
      });
      const cerrado = await tx.partido.update({
        where: { id },
        data: {
          estado: 'FINALIZADO',
          golesLocal: m.local,
          golesVisitante: m.visitante,
          cerradoEn: new Date(),
        },
      });
      await auditar(tx, c, 'partido.cerrar', 'partido', id, {
        despues: { marcador: m, sanciones, firmas: d },
      });
      return { partido: cerrado, sanciones: sanciones.length };
    });
  }

  /** W.O.: el reglamento define el resultado; no suma estadísticas individuales. */
  walkover(c: Contexto, id: string, ganadorId: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const p = await tx.partido.findUnique({ where: { id } });
      if (!p) throw noEncontrado('el partido');
      if (p.estado === 'FINALIZADO' || p.estado === 'WO')
        throw new ErrorNegocio('El partido ya está cerrado.', HttpStatus.CONFLICT);
      if (ganadorId !== p.localId && ganadorId !== p.visitanteId)
        throw new ErrorNegocio('Ese equipo no juega este partido.');
      await auditar(tx, c, 'partido.wo', 'partido', id, { despues: { ganadorId } });
      return tx.partido.update({
        where: { id },
        data: { estado: 'WO', ganadorWOId: ganadorId, cerradoEn: new Date() },
      });
    });
  }
}

const cierreSchema = z.object({
  firmaLocal: z.boolean().default(false),
  firmaVisitante: z.boolean().default(false),
  justificacion: z.string().trim().max(500).optional(),
});
type CierreInput = z.infer<typeof cierreSchema>;
const anularSchema = z.object({ clientUuid: z.uuid() });
const woSchema = z.object({ ganadorId: z.string().min(1) });

@Controller('partidos')
export class PartidosController {
  constructor(private readonly s: PartidosService) {}

  @Get(':id')
  @Permiso('torneo.leer')
  acta(@Ctx() c: Contexto, @Param('id') id: string) {
    return this.s.acta(c, id);
  }

  @Post(':id/iniciar')
  @Permiso('partido.acta')
  iniciar(@Ctx() c: Contexto, @Param('id') id: string) {
    return this.s.iniciar(c, id);
  }

  @Post(':id/eventos')
  @Permiso('partido.acta')
  evento(@Ctx() c: Contexto, @Param('id') id: string, @Body(new Zod(eventoSchema)) d: EventoInput) {
    return this.s.cargarEvento(c, id, d);
  }

  @Post(':id/eventos/:eventoId/anular')
  @Permiso('partido.acta')
  anular(
    @Ctx() c: Contexto,
    @Param('id') id: string,
    @Param('eventoId') eventoId: string,
    @Body(new Zod(anularSchema)) d: z.infer<typeof anularSchema>,
  ) {
    return this.s.anularEvento(c, id, eventoId, d.clientUuid);
  }

  @Post(':id/cerrar')
  @Permiso('partido.acta')
  cerrar(@Ctx() c: Contexto, @Param('id') id: string, @Body(new Zod(cierreSchema)) d: CierreInput) {
    return this.s.cerrar(c, id, d);
  }

  @Post(':id/wo')
  @Permiso('partido.acta')
  wo(@Ctx() c: Contexto, @Param('id') id: string, @Body(new Zod(woSchema)) d: z.infer<typeof woSchema>) {
    return this.s.walkover(c, id, d.ganadorId);
  }
}

@Module({ controllers: [PartidosController], providers: [PartidosService] })
export class PartidosModule {}
