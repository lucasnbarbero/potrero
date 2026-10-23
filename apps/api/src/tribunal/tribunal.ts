// Tribunal de disciplina (E14): expedientes con informe del árbitro, descargo del capitán y resolución (que puede ampliar o
// reducir lo sugerido), multas que generan un cargo al equipo e historial disciplinario. Las reglas puras viven en @potrero/shared.
import { Body, Controller, Get, HttpStatus, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import {
  descargoExpedienteSchema,
  type DescargoExpedienteInput,
  evaluarResolucion,
  expedienteSchema,
  type ExpedienteInput,
  formatoPesos,
  historialDisciplinario,
  informeExpedienteSchema,
  type InformeExpedienteInput,
  NOMBRE_TIPO_EXPEDIENTE,
  resolverExpedienteSchema,
  type ResolverExpedienteInput,
  sugeridoPorReglamento,
  type TipoExpediente,
} from '@potrero/shared';
import { auditar } from '../comun/auditoria.js';
import { type Contexto, Ctx, ErrorNegocio, noEncontrado, Permiso, Zod } from '../comun/http.js';
import { DbService, enSerie, type Tx } from '../db/db.service.js';
import type { Expediente } from '../generated/prisma/client.js';
import { aReglamento, estadisticasDelTorneo } from '../torneos/torneos.js';

/** Expediente automático por una roja directa: el tribunal revisa lo que el reglamento ya sancionó. */
export async function abrirPorRoja(
  tx: Tx,
  c: Pick<Contexto, 'organizacionId'>,
  partidoId: string,
  torneoId: string,
) {
  const rojas = await tx.sancion.findMany({ where: { partidoOrigenId: partidoId, causa: 'ROJA_DIRECTA' } });
  for (const s of rojas) {
    const clave = `roja:${s.id}`;
    if (await tx.expediente.findFirst({ where: { clave } })) continue;
    await tx.expediente.create({
      data: {
        organizacionId: c.organizacionId,
        torneoId,
        partidoId,
        equipoId: s.equipoId,
        jugadorId: s.jugadorId,
        tipo: 'ROJA_DIRECTA',
        motivo: 'Roja directa',
        sugeridos: s.partidos,
        sancionId: s.id,
        clave,
      },
    });
  }
}

/** Un jugador no habilitado figura en el acta: queda un expediente por partido y jugador (idempotente). */
export async function abrirPorNoHabilitado(
  tx: Tx,
  c: Pick<Contexto, 'organizacionId'>,
  p: { id: string; torneoId: string },
  equipoId: string,
  jugadorId: string,
  detalle: string,
) {
  const clave = `nohab:${p.id}:${jugadorId}`;
  if (await tx.expediente.findFirst({ where: { clave } })) return;
  await tx.expediente.create({
    data: {
      organizacionId: c.organizacionId,
      torneoId: p.torneoId,
      partidoId: p.id,
      equipoId,
      jugadorId,
      tipo: 'JUGADOR_NO_HABILITADO',
      motivo: 'Jugador no habilitado en el acta',
      informeArbitro: detalle,
      clave,
    },
  });
}

@Injectable()
export class TribunalService {
  constructor(private readonly db: DbService) {}

  private async enriquecer(tx: Tx, lista: Expediente[]) {
    const jugadores = await tx.jugador.findMany({
      where: { id: { in: lista.flatMap((e) => (e.jugadorId ? [e.jugadorId] : [])) } },
    });
    const partidos = await tx.partido.findMany({
      where: { id: { in: lista.flatMap((e) => (e.partidoId ? [e.partidoId] : [])) } },
    });
    const equipos = await tx.equipo.findMany({
      where: {
        id: { in: [...lista.map((e) => e.equipoId), ...partidos.flatMap((p) => [p.localId, p.visitanteId])] },
      },
    });
    const nj = new Map(jugadores.map((j) => [j.id, `${j.nombre} ${j.apellido}`]));
    const ne = new Map(equipos.map((e) => [e.id, e.nombre]));
    const nombrePartido = (p: { localId: string; visitanteId: string }) =>
      `${ne.get(p.localId) ?? '—'} vs ${ne.get(p.visitanteId) ?? '—'}`;
    const np = new Map(partidos.map((p) => [p.id, p]));
    return lista.map((e) => {
      const p = e.partidoId ? np.get(e.partidoId) : undefined;
      return {
        ...e,
        tipoNombre: NOMBRE_TIPO_EXPEDIENTE[e.tipo as TipoExpediente],
        jugador: e.jugadorId ? (nj.get(e.jugadorId) ?? '—') : null,
        equipo: ne.get(e.equipoId) ?? '—',
        fecha: p?.fecha ?? null,
        partido: p ? nombrePartido(p) : null,
      };
    });
  }

  /** Panel del tribunal: contadores, expedientes, suspendidos de la fecha y reglamento aplicado. */
  resumen(c: Contexto, torneoId?: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      // Sin torneo elegido: el más reciente que ya tenga sanciones o expedientes (si no, el más reciente).
      const con = torneoId
        ? undefined
        : await tx.torneo.findFirst({
            where: { OR: [{ expedientes: { some: {} } }, { sanciones: { some: {} } }] },
            orderBy: { creadoEn: 'desc' },
            include: { reglamento: true },
          });
      const torneo =
        con ??
        (await tx.torneo.findFirst({
          where: torneoId ? { id: torneoId } : {},
          orderBy: { creadoEn: 'desc' },
          include: { reglamento: true },
        }));
      if (!torneo) return null;
      const [expedientes, est] = await enSerie([
        () => tx.expediente.findMany({ where: { torneoId: torneo.id }, orderBy: { creadoEn: 'desc' } }),
        () => estadisticasDelTorneo(tx, torneo.id),
      ]);
      const lista = await this.enriquecer(tx, expedientes);
      const activas = est.sanciones.filter((s) => s.activa && s.partidos > 0);
      return {
        torneo: { id: torneo.id, nombre: torneo.nombre },
        reglamento: aReglamento(torneo.reglamento),
        contadores: {
          suspendidos: new Set(activas.map((s) => s.jugadorId)).size,
          automaticas: est.sanciones.filter((s) => s.causa === 'ACUMULACION').length,
          abiertos: lista.filter((e) => e.estado === 'ABIERTO').length,
          descargos: lista.filter((e) => e.estado === 'ABIERTO' && e.descargo).length,
        },
        expedientes: lista,
        suspendidos: activas.map((s) => ({
          sancionId: s.id,
          jugador: s.jugador,
          equipo: s.equipo,
          causa: s.causa,
          partidos: s.partidos,
          restantes: s.restantes,
        })),
        automaticas: est.sanciones
          .filter((s) => s.causa !== 'TRIBUNAL')
          .map((s) => ({
            id: s.id,
            jugador: s.jugador,
            equipo: s.equipo,
            causa: s.causa,
            partidos: s.partidos,
            restantes: s.restantes,
            activa: s.activa,
          })),
      };
    });
  }

  /** Historial disciplinario por jugador y por equipo del torneo. */
  historial(c: Contexto, torneoId: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const [eventos, sanciones, expedientes] = await enSerie([
        () =>
          tx.eventoPartido.findMany({
            where: { partido: { torneoId, estado: 'FINALIZADO' }, tipo: { in: ['AMARILLA', 'ROJA'] } },
          }),
        () => tx.sancion.findMany({ where: { torneoId } }),
        () => tx.expediente.findMany({ where: { torneoId } }),
      ]);
      const jugadores = await tx.jugador.findMany({
        where: {
          id: {
            in: [
              ...eventos.flatMap((e) => (e.jugadorId ? [e.jugadorId] : [])),
              ...sanciones.map((s) => s.jugadorId),
              ...expedientes.flatMap((e) => (e.jugadorId ? [e.jugadorId] : [])),
            ],
          },
        },
      });
      const equipos = await tx.equipo.findMany({
        where: {
          id: {
            in: [
              ...eventos.map((e) => e.equipoId),
              ...sanciones.map((s) => s.equipoId),
              ...expedientes.map((e) => e.equipoId),
            ],
          },
        },
      });
      const nj = new Map(jugadores.map((j) => [j.id, `${j.nombre} ${j.apellido}`]));
      const ne = new Map(equipos.map((e) => [e.id, e.nombre]));
      const porJugador = historialDisciplinario([
        ...eventos
          .filter((e) => e.jugadorId)
          .map((e) => ({
            clave: e.jugadorId!,
            nombre: nj.get(e.jugadorId!) ?? '—',
            amarillas: e.tipo === 'AMARILLA' ? 1 : 0,
            rojas: e.tipo === 'ROJA' ? 1 : 0,
          })),
        ...sanciones.map((s) => ({
          clave: s.jugadorId,
          nombre: nj.get(s.jugadorId) ?? '—',
          partidos: s.partidos,
        })),
        ...expedientes
          .filter((e) => e.jugadorId)
          .map((e) => ({
            clave: e.jugadorId!,
            nombre: nj.get(e.jugadorId!) ?? '—',
            multa: e.multa,
            expediente: true,
          })),
      ]);
      const porEquipo = historialDisciplinario([
        ...eventos.map((e) => ({
          clave: e.equipoId,
          nombre: ne.get(e.equipoId) ?? '—',
          amarillas: e.tipo === 'AMARILLA' ? 1 : 0,
          rojas: e.tipo === 'ROJA' ? 1 : 0,
        })),
        ...sanciones.map((s) => ({
          clave: s.equipoId,
          nombre: ne.get(s.equipoId) ?? '—',
          partidos: s.partidos,
        })),
        ...expedientes.map((e) => ({
          clave: e.equipoId,
          nombre: ne.get(e.equipoId) ?? '—',
          multa: e.multa,
          expediente: true,
        })),
      ]);
      return { jugadores: porJugador, equipos: porEquipo };
    });
  }

  abrir(c: Contexto, d: ExpedienteInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const torneo = await tx.torneo.findUnique({ where: { id: d.torneoId }, include: { reglamento: true } });
      if (!torneo) throw noEncontrado('el torneo');
      if (!(await tx.equipo.findUnique({ where: { id: d.equipoId } }))) throw noEncontrado('el equipo');
      if (d.jugadorId) {
        const enPlantel = await tx.plantelJugador.findFirst({
          where: { equipoId: d.equipoId, jugadorId: d.jugadorId },
        });
        if (!enPlantel) throw new ErrorNegocio('El jugador no está en el plantel de ese equipo.');
      }
      if (d.partidoId && !(await tx.partido.findFirst({ where: { id: d.partidoId, torneoId: d.torneoId } })))
        throw noEncontrado('el partido');
      const e = await tx.expediente.create({
        data: {
          organizacionId: c.organizacionId,
          torneoId: d.torneoId,
          partidoId: d.partidoId ?? null,
          equipoId: d.equipoId,
          jugadorId: d.jugadorId ?? null,
          tipo: d.tipo,
          motivo: d.motivo,
          informeArbitro: d.informeArbitro ?? null,
          sugeridos: sugeridoPorReglamento(d.tipo, aReglamento(torneo.reglamento)),
        },
      });
      await auditar(tx, c, 'expediente.abrir', 'expediente', e.id, {
        despues: { tipo: d.tipo, motivo: d.motivo },
      });
      return e;
    });
  }

  private async abierto(tx: Tx, id: string) {
    const e = await tx.expediente.findUnique({ where: { id } });
    if (!e) throw noEncontrado('el expediente');
    if (e.estado === 'RESUELTO')
      throw new ErrorNegocio('El expediente ya está resuelto.', HttpStatus.CONFLICT);
    return e;
  }

  informe(c: Contexto, id: string, d: InformeExpedienteInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      await this.abierto(tx, id);
      const e = await tx.expediente.update({ where: { id }, data: { informeArbitro: d.informeArbitro } });
      await auditar(tx, c, 'expediente.informe', 'expediente', id);
      return e;
    });
  }

  descargo(c: Contexto, id: string, d: DescargoExpedienteInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      await this.abierto(tx, id);
      const e = await tx.expediente.update({
        where: { id },
        data: { descargo: d.descargo, descargoEn: new Date() },
      });
      await auditar(tx, c, 'expediente.descargo', 'expediente', id);
      return e;
    });
  }

  /**
   * Resuelve el expediente. Si revisa una sanción automática, la modifica (ampliar o reducir); si no y hay partidos, crea
   * una sanción del tribunal. La multa se carga como cargo al equipo y entra a la caja cuando se cobra.
   */
  resolver(c: Contexto, id: string, d: ResolverExpedienteInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const e = await this.abierto(tx, id);
      const r = evaluarResolucion(e.sugeridos, d.partidos, d.multa);
      if (!r.ok) throw new ErrorNegocio(r.error);
      if (r.resolucion.partidos > 0 && !e.jugadorId)
        throw new ErrorNegocio('Para suspender partidos el expediente tiene que ser de un jugador.');
      let sancionId = e.sancionId;
      if (sancionId) {
        await tx.sancion.update({ where: { id: sancionId }, data: { partidos: r.resolucion.partidos } });
      } else if (r.resolucion.partidos > 0 && e.jugadorId) {
        // La sanción cuenta desde el partido del expediente; si no tiene partido, desde el último jugado por el equipo.
        const origen =
          e.partidoId ??
          (
            await tx.partido.findFirst({
              where: {
                torneoId: e.torneoId,
                estado: 'FINALIZADO',
                OR: [{ localId: e.equipoId }, { visitanteId: e.equipoId }],
              },
              orderBy: { fecha: 'desc' },
            })
          )?.id;
        if (!origen)
          throw new ErrorNegocio('El equipo todavía no jugó: no hay desde qué partido contar la suspensión.');
        const s = await tx.sancion.create({
          data: {
            organizacionId: c.organizacionId,
            torneoId: e.torneoId,
            jugadorId: e.jugadorId,
            equipoId: e.equipoId,
            partidoOrigenId: origen,
            causa: 'TRIBUNAL',
            partidos: r.resolucion.partidos,
          },
        });
        sancionId = s.id;
      }
      let cargoId: string | null = null;
      if (r.resolucion.multa > 0) {
        const insc = await tx.inscripcion.findUnique({
          where: { torneoId_equipoId: { torneoId: e.torneoId, equipoId: e.equipoId } },
        });
        if (!insc)
          throw new ErrorNegocio('El equipo no está inscripto en el torneo: no se le puede cargar la multa.');
        const cargo = await tx.cargo.create({
          data: {
            organizacionId: c.organizacionId,
            inscripcionId: insc.id,
            concepto: `Multa · ${e.motivo}`,
            monto: r.resolucion.multa,
            categoria: 'MULTAS',
          },
        });
        cargoId = cargo.id;
      }
      const resuelto = await tx.expediente.update({
        where: { id },
        data: {
          estado: 'RESUELTO',
          partidosResueltos: r.resolucion.partidos,
          multa: r.resolucion.multa,
          cargoId,
          sancionId,
          veredicto: r.resolucion.veredicto,
          resolucion: d.resolucion,
          resueltoPorId: c.usuarioId,
          resueltoEn: new Date(),
        },
      });
      await auditar(tx, c, 'expediente.resolver', 'expediente', id, {
        antes: { sugeridos: e.sugeridos },
        despues: {
          partidos: r.resolucion.partidos,
          veredicto: r.resolucion.veredicto,
          multa: r.resolucion.multa > 0 ? formatoPesos(r.resolucion.multa) : null,
        },
      });
      return resuelto;
    });
  }
}

@Controller()
export class TribunalController {
  constructor(private readonly s: TribunalService) {}

  @Get('tribunal')
  @Permiso('torneo.leer')
  resumen(@Ctx() c: Contexto, @Query('torneoId') torneoId?: string) {
    return this.s.resumen(c, torneoId);
  }

  @Get('tribunal/historial')
  @Permiso('torneo.leer')
  historial(@Ctx() c: Contexto, @Query('torneoId') torneoId: string) {
    return this.s.historial(c, torneoId);
  }

  @Post('expedientes')
  @Permiso('sancion.resolver')
  abrir(@Ctx() c: Contexto, @Body(new Zod(expedienteSchema)) d: ExpedienteInput) {
    return this.s.abrir(c, d);
  }

  @Post('expedientes/:id/informe')
  @Permiso('partido.acta')
  informe(
    @Ctx() c: Contexto,
    @Param('id') id: string,
    @Body(new Zod(informeExpedienteSchema)) d: InformeExpedienteInput,
  ) {
    return this.s.informe(c, id, d);
  }

  @Post('expedientes/:id/descargo')
  @Permiso('sancion.resolver')
  descargo(
    @Ctx() c: Contexto,
    @Param('id') id: string,
    @Body(new Zod(descargoExpedienteSchema)) d: DescargoExpedienteInput,
  ) {
    return this.s.descargo(c, id, d);
  }

  @Post('expedientes/:id/resolver')
  @Permiso('sancion.resolver')
  resolver(
    @Ctx() c: Contexto,
    @Param('id') id: string,
    @Body(new Zod(resolverExpedienteSchema)) d: ResolverExpedienteInput,
  ) {
    return this.s.resolver(c, id, d);
  }
}

@Module({ controllers: [TribunalController], providers: [TribunalService], exports: [TribunalService] })
export class TribunalModule {}
