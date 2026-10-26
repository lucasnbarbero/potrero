// Tribunal de disciplina (E14): expedientes con informe del árbitro, descargo del capitán y resolución (que puede ampliar o
// reducir lo sugerido), multas que generan un cargo al equipo, levantar una suspensión pagando (E14-08) e historial
// disciplinario. Las reglas puras viven en @potrero/shared.
import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Injectable,
  Module,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
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
  levantarSancion,
  levantarSancionReglamentoSchema,
  type LevantarSancionReglamentoInput,
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
import { acreditadosPorSancion, cumplimiento, SELECT_PARTIDO_SANCION } from './levantar.js';

/** Pedidos de levantar todavía sin pagar (ni anulados), por sanción. */
async function levantamientosPendientes(tx: Tx, sancionIds: string[]) {
  const pedidos = await tx.levantamientoSancion.findMany({
    where: { sancionId: { in: sancionIds }, anuladoEn: null },
    orderBy: { creadoEn: 'asc' },
  });
  const pendientes = new Set(
    (
      await tx.cargo.findMany({
        where: { id: { in: pedidos.map((p) => p.cargoId) }, estado: 'PENDIENTE' },
        select: { id: true },
      })
    ).map((c) => c.id),
  );
  const porSancion = new Map<string, { id: string; cargoId: string; monto: number }[]>();
  for (const p of pedidos)
    if (pendientes.has(p.cargoId))
      porSancion.set(p.sancionId, [
        ...(porSancion.get(p.sancionId) ?? []),
        { id: p.id, cargoId: p.cargoId, monto: p.monto },
      ]);
  return porSancion;
}

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
      const reglamento = aReglamento(torneo.reglamento);
      // Levantar pagando (E14-08): nunca lo que revisó el tribunal en un expediente.
      const revisadas = new Set(expedientes.flatMap((e) => (e.sancionId ? [e.sancionId] : [])));
      const pendientes = await levantamientosPendientes(
        tx,
        activas.map((s) => s.id),
      );
      return {
        torneo: { id: torneo.id, nombre: torneo.nombre },
        reglamento,
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
          levantados: s.levantados,
          pendientes: pendientes.get(s.id) ?? [],
          levantar: levantarSancion(
            {
              causa: s.causa,
              revisadaPorTribunal: revisadas.has(s.id),
              restantes: s.restantes,
              pendientes: pendientes.get(s.id)?.length ?? 0,
            },
            reglamento,
          ),
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
            levantados: s.levantados,
            activa: s.activa,
          })),
      };
    });
  }

  /** Historial disciplinario por jugador y por equipo del torneo. */
  historial(c: Contexto, torneoId: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const [eventos, sanciones, expedientes, partidos, acreditados] = await enSerie([
        () =>
          tx.eventoPartido.findMany({
            where: { partido: { torneoId, estado: 'FINALIZADO' }, tipo: { in: ['AMARILLA', 'ROJA'] } },
          }),
        () => tx.sancion.findMany({ where: { torneoId } }),
        () => tx.expediente.findMany({ where: { torneoId } }),
        () => tx.partido.findMany({ where: { torneoId }, select: SELECT_PARTIDO_SANCION }),
        () => acreditadosPorSancion(tx, torneoId),
      ]);
      const levantados = new Map(
        sanciones.map((s) => [s.id, cumplimiento(s, partidos, acreditados).levantados]),
      );
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
          levantados: levantados.get(s.id),
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
          levantados: levantados.get(s.id),
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

  /**
   * Opción del reglamento del torneo: levantar una suspensión pagando (E14-08). El reglamento es versionado: el cambio
   * crea una versión nueva y el torneo pasa a usarla.
   */
  reglamentoLevantar(c: Contexto, torneoId: string, d: LevantarSancionReglamentoInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const torneo = await tx.torneo.findUnique({ where: { id: torneoId }, include: { reglamento: true } });
      if (!torneo) throw noEncontrado('el torneo');
      const { id: _id, creadoEn: _creadoEn, version, ...actual } = torneo.reglamento;
      const nuevo = await tx.reglamento.create({
        data: {
          ...actual,
          version: version + 1,
          levantarSancionPagando: d.levantarSancionPagando,
          levantarSancionTipos: [...new Set(d.levantarSancionTipos)],
          levantarSancionMonto: d.levantarSancionMonto,
        },
      });
      await tx.torneo.update({ where: { id: torneoId }, data: { reglamentoId: nuevo.id } });
      await auditar(tx, c, 'reglamento.levantar_sancion', 'torneo', torneoId, {
        antes: {
          levantarSancionPagando: actual.levantarSancionPagando,
          levantarSancionTipos: actual.levantarSancionTipos,
          levantarSancionMonto: actual.levantarSancionMonto,
        },
        despues: d,
      });
      return aReglamento(nuevo);
    });
  }

  /**
   * Pedido de levantar un partido de suspensión pagando: genera un cargo al equipo en el rubro MULTAS. El jugador queda
   * habilitado recién cuando ese cargo se paga (pago manual aprobado o acreditado por la pasarela).
   */
  levantar(c: Contexto, sancionId: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const s = await tx.sancion.findUnique({
        where: { id: sancionId },
        include: { torneo: { include: { reglamento: true } } },
      });
      if (!s) throw noEncontrado('la sanción');
      const [partidos, acreditados, revisiones, pendientes, jugador, insc] = await enSerie([
        () => tx.partido.findMany({ where: { torneoId: s.torneoId }, select: SELECT_PARTIDO_SANCION }),
        () => acreditadosPorSancion(tx, s.torneoId),
        () => tx.expediente.count({ where: { sancionId } }),
        () => levantamientosPendientes(tx, [sancionId]),
        () => tx.jugador.findUnique({ where: { id: s.jugadorId } }),
        () =>
          tx.inscripcion.findUnique({
            where: { torneoId_equipoId: { torneoId: s.torneoId, equipoId: s.equipoId } },
          }),
      ]);
      const estado = cumplimiento(s, partidos, acreditados);
      const r = levantarSancion(
        {
          causa: s.causa,
          revisadaPorTribunal: revisiones > 0,
          restantes: estado.restantes,
          pendientes: pendientes.get(sancionId)?.length ?? 0,
        },
        aReglamento(s.torneo.reglamento),
      );
      if (!r.ok) throw new ErrorNegocio(r.mensaje);
      if (!insc)
        throw new ErrorNegocio('El equipo no está inscripto en el torneo: no se le puede generar el cargo.');
      const nombre = jugador ? `${jugador.nombre} ${jugador.apellido}` : 'jugador';
      const cargo = await tx.cargo.create({
        data: {
          organizacionId: c.organizacionId,
          inscripcionId: insc.id,
          concepto: `Levantar sanción de ${nombre} — 1 partido`,
          monto: r.monto,
          categoria: 'MULTAS',
        },
      });
      const levantamiento = await tx.levantamientoSancion.create({
        data: {
          organizacionId: c.organizacionId,
          sancionId,
          cargoId: cargo.id,
          monto: r.monto,
          solicitadoPorId: c.usuarioId,
        },
      });
      await auditar(tx, c, 'sancion.levantar', 'sancion', sancionId, {
        despues: { cargoId: cargo.id, monto: formatoPesos(r.monto), partidos: 1 },
      });
      return { ...levantamiento, cargo };
    });
  }

  /** Anula un pedido de levantar que todavía no se pagó: el cargo queda anulado y no se levanta nada. */
  anularLevantamiento(c: Contexto, id: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const l = await tx.levantamientoSancion.findUnique({ where: { id } });
      if (!l) throw noEncontrado('el pedido');
      if (l.anuladoEn) throw new ErrorNegocio('El pedido ya está anulado.', HttpStatus.CONFLICT);
      const cargo = await tx.cargo.findUnique({ where: { id: l.cargoId }, include: { pagos: true } });
      if (cargo?.estado === 'PAGADO' || cargo?.pagos.some((p) => p.estado === 'APROBADO'))
        throw new ErrorNegocio(
          'El cargo ya tiene pagos acreditados: no se puede anular el pedido.',
          HttpStatus.CONFLICT,
        );
      if (cargo) await tx.cargo.update({ where: { id: cargo.id }, data: { estado: 'ANULADO' } });
      const anulado = await tx.levantamientoSancion.update({
        where: { id },
        data: { anuladoEn: new Date() },
      });
      await auditar(tx, c, 'sancion.levantar_anular', 'sancion', l.sancionId, {
        despues: { cargoId: l.cargoId },
      });
      return anulado;
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

  @Patch('torneos/:id/reglamento/levantar-sancion')
  @Permiso('torneo.escribir')
  reglamentoLevantar(
    @Ctx() c: Contexto,
    @Param('id') id: string,
    @Body(new Zod(levantarSancionReglamentoSchema)) d: LevantarSancionReglamentoInput,
  ) {
    return this.s.reglamentoLevantar(c, id, d);
  }

  @Post('sanciones/:id/levantar')
  @Permiso('sancion.resolver')
  levantar(@Ctx() c: Contexto, @Param('id') id: string) {
    return this.s.levantar(c, id);
  }

  @Post('levantamientos/:id/anular')
  @Permiso('sancion.resolver')
  anularLevantamiento(@Ctx() c: Contexto, @Param('id') id: string) {
    return this.s.anularLevantamiento(c, id);
  }
}

@Module({ controllers: [TribunalController], providers: [TribunalService], exports: [TribunalService] })
export class TribunalModule {}
