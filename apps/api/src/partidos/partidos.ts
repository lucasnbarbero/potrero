import { Body, Controller, Get, HttpStatus, Injectable, Module, Param, Post } from '@nestjs/common';
import {
  amarillasQueAcumulan,
  dispositivoSchema,
  type DispositivoInput,
  eventoSchema,
  type EventoInput,
  eventosVigentes,
  marcador,
  sancionesDelPartido,
  tomarActaSchema,
  type TomarActaInput,
} from '@potrero/shared';
import { z } from 'zod';
import { auditar } from '../comun/auditoria.js';
import { type Contexto, Ctx, ErrorNegocio, noEncontrado, Permiso, Zod } from '../comun/http.js';
import { DbService, enSerie, type Tx } from '../db/db.service.js';
import { CajaModule, CajaService } from '../caja/caja.js';
import { motivosDeNoHabilitacion } from '../documentacion/documentacion.js';
import { MensajeriaModule, MensajeriaService } from '../mensajeria/mensajeria.js';
import { acreditadosPorSancion, cumplimiento, SELECT_PARTIDO_SANCION } from '../tribunal/levantar.js';
import { abrirPorNoHabilitado, abrirPorRoja } from '../tribunal/tribunal.js';
import { avanzarLlave } from '../torneos/llaves.js';
import { aReglamento } from '../torneos/torneos.js';
import { sincronizarCobrosPorFecha } from '../cobros/por-fecha.js';

/**
 * Jugadores suspendidos de un torneo al momento de jugar la fecha indicada. Una suspensión levantada pagando (pago
 * acreditado, E14-08) deja al jugador habilitado.
 * @param cerradoEn si el partido ya se cerró, los pagos acreditados después no cambian su acta.
 */
async function suspendidosParaFecha(tx: Tx, torneoId: string, fecha: number, cerradoEn?: Date | null) {
  const [sanciones, partidos, acreditados] = await enSerie([
    () => tx.sancion.findMany({ where: { torneoId } }),
    () => tx.partido.findMany({ where: { torneoId }, select: SELECT_PARTIDO_SANCION }),
    () => acreditadosPorSancion(tx, torneoId),
  ]);
  const fechaDe = new Map(partidos.map((p) => [p.id, p.fecha]));
  const suspendidos = new Map<string, { causa: string; restantes: number }>();
  for (const s of sanciones) {
    const origen = fechaDe.get(s.partidoOrigenId) ?? 0;
    if (origen >= fecha) continue;
    const e = cumplimiento(s, partidos, acreditados, { antesDeFecha: fecha, acreditadosHasta: cerradoEn });
    if (e.activa) suspendidos.set(s.jugadorId, { causa: s.causa, restantes: e.restantes });
  }
  return suspendidos;
}

/** Solo el dispositivo dueño del acta puede escribir en ella. Sin dispositivo en el pedido (clientes de la API) no se controla. */
function verificarDueno(p: { actaDispositivo: string | null }, dispositivoId?: string) {
  if (dispositivoId && p.actaDispositivo && p.actaDispositivo !== dispositivoId)
    throw new ErrorNegocio(
      'Otro dispositivo tiene el acta de este partido. Tomala para seguir cargando.',
      HttpStatus.CONFLICT,
    );
}

@Injectable()
export class PartidosService {
  constructor(
    private readonly db: DbService,
    private readonly mensajeria: MensajeriaService,
    private readonly caja: CajaService,
  ) {}

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
        () => suspendidosParaFecha(tx, p.torneoId, p.fecha, p.cerradoEn),
      ]);
      // Documentación incompleta o duplicado abierto (E15-07): también impide jugar.
      const sinDocumentacion = await motivosDeNoHabilitacion(
        tx,
        p.torneoId,
        equipos.flatMap((e) => e.plantel.map((pl) => pl.jugadorId)),
      );
      const equipo = (eid: string) => {
        const e = equipos.find((x) => x.id === eid)!;
        return {
          id: e.id,
          nombre: e.nombre,
          jugadores: e.plantel.map((pl) => {
            const s = suspendidos.get(pl.jugadorId);
            const docs = sinDocumentacion.get(pl.jugadorId);
            return {
              id: pl.jugadorId,
              nombre: `${pl.jugador.nombre} ${pl.jugador.apellido}`,
              numero: pl.numero,
              habilitado: !s && !docs,
              motivo: s
                ? `Suspendido (${s.causa.replace('_', ' ').toLowerCase()}), le falta${s.restantes > 1 ? 'n' : ''} ${s.restantes} partido${s.restantes > 1 ? 's' : ''}`
                : docs
                  ? docs.join(', ')
                  : null,
            };
          }),
        };
      };
      const vigentes = eventosVigentes(p.eventos);
      const duenoUsuario = p.actaUsuarioId
        ? await tx.usuario.findUnique({ where: { id: p.actaUsuarioId }, select: { nombre: true } })
        : null;
      const dueno = p.actaDispositivo
        ? {
            dispositivoId: p.actaDispositivo,
            usuario: duenoUsuario?.nombre ?? 'otro usuario',
            desde: p.actaTomadaEn,
          }
        : null;
      return {
        id: p.id,
        dueno,
        torneo: { id: p.torneo.id, nombre: p.torneo.nombre },
        fecha: p.fecha,
        fase: p.fase,
        grupo: p.grupo,
        clave: p.clave,
        penalesLocal: p.penalesLocal,
        penalesVisitante: p.penalesVisitante,
        inicio: p.inicio,
        estado: p.estado,
        cancha: p.cancha ? `${p.cancha.sede.nombre} · ${p.cancha.nombre}` : null,
        local: equipo(p.localId),
        visitante: equipo(p.visitanteId),
        marcador: marcador(p.eventos, p.localId, p.visitanteId),
        eventos: vigentes.map((e) => ({
          id: e.id,
          clientUuid: e.clientUuid,
          tipo: e.tipo,
          equipoId: e.equipoId,
          jugadorId: e.jugadorId,
          minuto: e.minuto,
        })),
      };
    });
  }

  iniciar(c: Contexto, id: string, d: DispositivoInput = {}) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const p = await tx.partido.findUnique({ where: { id } });
      if (!p) throw noEncontrado('el partido');
      if (p.estado !== 'PROGRAMADO')
        throw new ErrorNegocio('El partido ya empezó o está cerrado.', HttpStatus.CONFLICT);
      verificarDueno(p, d.dispositivoId);
      await auditar(tx, c, 'partido.iniciar', 'partido', id);
      // Quien inicia el partido y todavía no tiene dueño, se queda con el acta.
      const dueno =
        d.dispositivoId && !p.actaDispositivo
          ? { actaDispositivo: d.dispositivoId, actaUsuarioId: c.usuarioId, actaTomadaEn: new Date() }
          : {};
      return tx.partido.update({ where: { id }, data: { estado: 'EN_JUEGO', ...dueno } });
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
      verificarDueno(p, d.dispositivoId);
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
        const susp = (await suspendidosParaFecha(tx, p.torneoId, p.fecha)).get(d.jugadorId);
        if (susp) {
          advertencia = 'Este jugador está suspendido. Quedó registrado y el tribunal lo va a revisar.';
          // Expediente automático por jugador no habilitado (uno por partido y jugador).
          await abrirPorNoHabilitado(
            tx,
            c,
            p,
            d.equipoId,
            d.jugadorId,
            `Figura en el acta con una suspensión vigente (${susp.causa.replace('_', ' ').toLowerCase()}, le faltaban ${susp.restantes}).`,
          );
        }
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

  /**
   * Un solo dueño del acta por partido: el primer dispositivo que la abre se la queda. Otro dispositivo recibe el aviso
   * de quién la tiene y puede tomarla a propósito (`forzar`), por ejemplo si al delegado se le rompió el celular.
   */
  tomarActa(c: Contexto, id: string, d: TomarActaInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const p = await tx.partido.findUnique({ where: { id } });
      if (!p) throw noEncontrado('el partido');
      if (p.estado === 'FINALIZADO' || p.estado === 'WO')
        return { dueno: false, motivo: 'El acta ya está cerrada.', actual: null };
      const libre = !p.actaDispositivo || p.actaDispositivo === d.dispositivoId;
      if (!libre && !d.forzar) {
        const usuario = p.actaUsuarioId
          ? await tx.usuario.findUnique({ where: { id: p.actaUsuarioId }, select: { nombre: true } })
          : null;
        return {
          dueno: false,
          motivo: 'Otro dispositivo tiene el acta.',
          actual: { usuario: usuario?.nombre ?? 'otro usuario', desde: p.actaTomadaEn },
        };
      }
      if (p.actaDispositivo !== d.dispositivoId) {
        await tx.partido.update({
          where: { id },
          data: { actaDispositivo: d.dispositivoId, actaUsuarioId: c.usuarioId, actaTomadaEn: new Date() },
        });
        await auditar(tx, c, 'partido.acta.tomar', 'partido', id, {
          antes: { dispositivo: p.actaDispositivo },
          despues: { dispositivo: d.dispositivoId, forzado: d.forzar },
        });
      }
      return { dueno: true, motivo: null, actual: null };
    });
  }

  /**
   * Las correcciones son eventos de anulación: el acta nunca se edita ni se borra.
   * El evento a anular se indica por su id o por su `clientUuid`: un evento cargado sin conexión todavía no tiene id del servidor.
   */
  anularEvento(c: Contexto, id: string, eventoId: string, clientUuid: string, dispositivoId?: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const repetido = await tx.eventoPartido.findUnique({ where: { clientUuid } });
      if (repetido) return repetido;
      const [p, e] = await enSerie([
        () => tx.partido.findUnique({ where: { id } }),
        () =>
          tx.eventoPartido.findFirst({
            where: { partidoId: id, OR: [{ id: eventoId }, { clientUuid: eventoId }] },
          }),
      ]);
      if (!p || !e || e.partidoId !== id) throw noEncontrado('el evento');
      verificarDueno(p, dispositivoId);
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
      verificarDueno(p, d.dispositivoId);
      if (p.estado !== 'EN_JUEGO')
        throw new ErrorNegocio('Solo se puede cerrar un partido en juego.', HttpStatus.CONFLICT);
      if (!(d.firmaLocal && d.firmaVisitante) && !d.justificacion)
        throw new ErrorNegocio('Falta la firma de ambos capitanes o la justificación del árbitro.');
      const m = marcador(p.eventos, p.localId, p.visitanteId);
      // En una llave no puede haber empate: se define por penales.
      const empateEnLlave = p.fase === 'LLAVE' && m.local === m.visitante;
      if (
        empateEnLlave &&
        (d.penalesLocal == null || d.penalesVisitante == null || d.penalesLocal === d.penalesVisitante)
      )
        throw new ErrorNegocio(
          'Es un partido de llave y terminó empatado: cargá el resultado de los penales (no pueden quedar iguales).',
        );
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
      // Cada roja directa abre un expediente para el tribunal.
      await abrirPorRoja(tx, c, id, p.torneoId);
      // Cadena al cerrar: aviso de suspensión al capitán (si el organizador lo tiene encendido).
      await this.mensajeria.avisarSuspensiones(tx, c.organizacionId, id, sanciones);
      const cerrado = await tx.partido.update({
        where: { id },
        data: {
          estado: 'FINALIZADO',
          golesLocal: m.local,
          golesVisitante: m.visitante,
          penalesLocal: empateEnLlave ? d.penalesLocal : null,
          penalesVisitante: empateEnLlave ? d.penalesVisitante : null,
          cerradoEn: new Date(),
        },
      });
      await auditar(tx, c, 'partido.cerrar', 'partido', id, {
        despues: { marcador: m, sanciones, firmas: d },
      });
      // Cadena al cerrar: el ganador de una llave avanza y se crea el próximo cruce.
      // Cargos automáticos de la caja: pago al árbitro y alquiler de la cancha, si están encendidos.
      await this.caja.cargosDelPartido(tx, c, id);
      if (p.fase === 'LLAVE') await avanzarLlave(tx, c, p.torneoId);
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
      const cerrado = await tx.partido.update({
        where: { id },
        data: { estado: 'WO', ganadorWOId: ganadorId, cerradoEn: new Date() },
      });
      if (p.fase === 'LLAVE') await avanzarLlave(tx, c, p.torneoId);
      // Cuota por fecha (E06-20): el W.O. se cobra o no según la configuración del torneo.
      await sincronizarCobrosPorFecha(tx, c.organizacionId, p.torneoId);
      return cerrado;
    });
  }
}

const cierreSchema = z.object({
  firmaLocal: z.boolean().default(false),
  firmaVisitante: z.boolean().default(false),
  justificacion: z.string().trim().max(500).optional(),
  /** Solo en partidos de llave que terminan empatados. */
  penalesLocal: z.number().int().min(0).max(30).optional(),
  penalesVisitante: z.number().int().min(0).max(30).optional(),
  dispositivoId: z.string().min(8).max(64).optional(),
});
type CierreInput = z.infer<typeof cierreSchema>;
const anularSchema = z.object({ clientUuid: z.uuid(), dispositivoId: z.string().min(8).max(64).optional() });
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
  iniciar(
    @Ctx() c: Contexto,
    @Param('id') id: string,
    @Body(new Zod(dispositivoSchema)) d: DispositivoInput,
  ) {
    return this.s.iniciar(c, id, d);
  }

  @Post(':id/tomar')
  @Permiso('partido.acta')
  tomar(@Ctx() c: Contexto, @Param('id') id: string, @Body(new Zod(tomarActaSchema)) d: TomarActaInput) {
    return this.s.tomarActa(c, id, d);
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
    return this.s.anularEvento(c, id, eventoId, d.clientUuid, d.dispositivoId);
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

@Module({
  imports: [MensajeriaModule, CajaModule],
  controllers: [PartidosController],
  providers: [PartidosService],
})
export class PartidosModule {}
