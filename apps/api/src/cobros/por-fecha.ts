// Cuota por fecha y seguro por jugador (E06-20, E06-21): genera y mantiene al día un cargo por equipo y por fecha.
// Las reglas son puras (@potrero/shared, dominio/cobros.ts); acá solo se cargan los datos y se guardan los cambios.
// Se llama al generar el fixture o la llave, al cargar un W.O., al reprogramar, al cambiar la configuración y cada hora
// (CobrosService): así los cargos de la próxima fecha aparecen solos unos días antes del partido.
import {
  cambiosDeCargosPorFecha,
  cargosPorFecha,
  type CargoPorFechaGuardado,
  configCobrosPorFecha,
  type ConfigCobrosPorFecha,
  type PartidoParaCobro,
} from '@potrero/shared';
import { auditar } from '../comun/auditoria.js';
import { hoyEnArgentina } from '../comun/formato.js';
import { enSerie, type Tx } from '../db/db.service.js';

export const configDelTorneo = (t: { cobrosPorFecha: unknown }): ConfigCobrosPorFecha =>
  configCobrosPorFecha(t.cobrosPorFecha as Partial<ConfigCobrosPorFecha> | null);

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const aFecha = (d: string) => new Date(`${d}T00:00:00Z`);

export interface ResultadoSincronizacion {
  creados: number;
  actualizados: number;
  anulados: number;
}

/**
 * Deja los cargos por fecha del torneo como corresponden según el fixture, el plantel y la configuración. Idempotente.
 * `repreciar`: el organizador cambió los montos, se recalculan los pendientes que todavía no tienen pagos.
 */
export async function sincronizarCobrosPorFecha(
  tx: Tx,
  organizacionId: string,
  torneoId: string,
  o: { ahora?: Date; repreciar?: boolean; usuarioId?: string | null } = {},
): Promise<ResultadoSincronizacion> {
  const nada = { creados: 0, actualizados: 0, anulados: 0 };
  const torneo = await tx.torneo.findUnique({ where: { id: torneoId } });
  if (!torneo) return nada;
  const config = configDelTorneo(torneo);
  const [inscripciones, partidos, guardados] = await enSerie([
    () =>
      tx.inscripcion.findMany({
        where: { torneoId, estado: { not: 'BAJA' } },
        include: { equipo: { include: { _count: { select: { plantel: true } } } } },
      }),
    () => tx.partido.findMany({ where: { torneoId } }),
    () =>
      tx.cargo.findMany({
        where: { inscripcion: { torneoId }, fecha: { not: null }, clave: { not: null } },
        include: { pagos: { where: { estado: 'APROBADO' } } },
      }),
  ]);
  const activos = config.cuotaPorFecha > 0 || config.seguroPorJugadorPorFecha > 0;
  if (!activos && !guardados.some((g) => g.estado !== 'PAGADO')) return nada;
  const deseados = cargosPorFecha({
    torneoId,
    config,
    // La cantidad de jugadores es la del plantel al momento de generar el cargo (E06-21).
    equipos: inscripciones.map((i) => ({ id: i.equipoId, jugadores: i.equipo._count.plantel })),
    partidos: partidos.map((p): PartidoParaCobro => ({
      id: p.id,
      fecha: p.fecha,
      fase: p.fase,
      localId: p.localId,
      visitanteId: p.visitanteId,
      inicio: p.inicio?.toISOString() ?? null,
      estado: p.estado,
    })),
  });
  const cambios = cambiosDeCargosPorFecha(
    guardados.map((g): CargoPorFechaGuardado => ({
      id: g.id,
      clave: g.clave!,
      estado: g.estado,
      monto: g.monto,
      concepto: g.concepto,
      vence: dia(g.vence),
      partidoId: g.partidoId,
      pagado: g.pagos.reduce((s, p) => s + p.monto, 0),
    })),
    deseados,
    { hoy: hoyEnArgentina(o.ahora), repreciar: o.repreciar },
  );
  const inscripcionDe = new Map(inscripciones.map((i) => [i.equipoId, i.id]));
  if (cambios.crear.length)
    await tx.cargo.createMany({
      data: cambios.crear.map((x) => ({
        organizacionId,
        inscripcionId: inscripcionDe.get(x.equipoId)!,
        concepto: x.concepto,
        monto: x.monto,
        categoria: x.categoria,
        vence: aFecha(x.vence),
        fecha: x.fecha,
        partidoId: x.partidoId,
        clave: x.clave,
      })),
      // Si dos procesos generan a la vez, la clave única evita el duplicado.
      skipDuplicates: true,
    });
  for (const a of cambios.actualizar)
    await tx.cargo.update({
      where: { id: a.id },
      data: {
        vence: aFecha(a.vence),
        partidoId: a.partidoId,
        ...(a.estado ? { estado: a.estado } : {}),
        ...(a.monto !== undefined ? { monto: a.monto, concepto: a.concepto } : {}),
      },
    });
  if (cambios.anular.length)
    await tx.cargo.updateMany({
      where: { id: { in: cambios.anular }, estado: 'PENDIENTE' },
      data: { estado: 'ANULADO' },
    });
  const r = {
    creados: cambios.crear.length,
    actualizados: cambios.actualizar.length,
    anulados: cambios.anular.length,
  };
  if (r.creados + r.actualizados + r.anulados > 0)
    await auditar(
      tx,
      { organizacionId, usuarioId: o.usuarioId },
      'cobros_por_fecha.sincronizar',
      'torneo',
      torneoId,
      { despues: { ...r, crear: cambios.crear.map((x) => x.clave), anular: cambios.anular } },
    );
  return r;
}
