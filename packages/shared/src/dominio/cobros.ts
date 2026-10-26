import { DATOS } from '../datos.js';
import { sumarDias } from './fixture.js';
import type { MetodoPago, Plan } from './tipos.js';

/** Porcentaje de comisión de la plataforma según el plan (de docs/datos.json). */
export function porcentajeComision(plan: Plan): number {
  return DATOS.planes[plan].comisionPct;
}

/**
 * Comisión de Potrero sobre un cobro, en pesos enteros.
 * Solo se cobra sobre pagos con Mercado Pago: los pagos manuales no pagan comisión.
 */
export function comisionPlataforma(monto: number, plan: Plan, metodo: MetodoPago): number {
  if (metodo !== 'MERCADO_PAGO' && !DATOS.pagosManualesConComision) return 0;
  return Math.round((monto * porcentajeComision(plan)) / 100);
}

export function formatoPesos(monto: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(monto);
}

// ───────────── Cuota por fecha y seguro por jugador (E06-20, E06-21) ─────────────
// Un cargo por equipo y por fecha: la cuota (monto fijo) y el seguro (monto × jugadores del plantel). Vencen el día del
// partido. Se generan unos días antes de cada fecha (no todo el torneo de una vez): así "por cobrar" muestra lo que ya
// corresponde pagar y el seguro toma el plantel de ese momento.

export interface ConfigCobrosPorFecha {
  /** Monto fijo por equipo y por fecha, en pesos. 0 = no se cobra. */
  cuotaPorFecha: number;
  /** Monto por jugador del plantel en cada fecha que el equipo juega, en pesos. 0 = no se cobra. */
  seguroPorJugadorPorFecha: number;
  cobrarFechaLibre: boolean;
  cobrarPartidoSuspendido: boolean;
  cobrarWO: boolean;
  /** Encendido: el equipo con cuotas vencidas impagas figura con alerta de no habilitado en el acta. */
  deudaBloqueaJugar: boolean;
  /**
   * Primera fecha que se cobra de la cuota y del seguro. La fija el servidor al activar cada cobro: con el torneo ya
   * empezado, se cobra desde la próxima fecha, nunca las ya jugadas. Nulo = desde la fecha 1.
   */
  cuotaDesdeFecha: number | null;
  seguroDesdeFecha: number | null;
}

const { anticipacionDias, ...cobrosPorFechaPorDefecto } = DATOS.cobrosPorFechaPorDefecto;
export const COBROS_POR_FECHA_POR_DEFECTO: ConfigCobrosPorFecha = {
  ...cobrosPorFechaPorDefecto,
  cuotaDesdeFecha: null,
  seguroDesdeFecha: null,
};

/** La configuración guardada en el torneo, completada con los valores por defecto de datos.json. */
export function configCobrosPorFecha(guardada?: Partial<ConfigCobrosPorFecha> | null): ConfigCobrosPorFecha {
  return { ...COBROS_POR_FECHA_POR_DEFECTO, ...(guardada ?? {}) };
}

/**
 * Próxima fecha del torneo: la siguiente a la última con algún partido jugado o en juego. Nulo si no empezó.
 * Un partido postergado de una fecha anterior no la cambia: esa fecha ya se jugó.
 */
export function proximaFecha(
  partidos: readonly { fecha: number; estado: PartidoParaCobro['estado'] }[],
): number | null {
  const jugadas = partidos.filter(
    (p) => p.estado === 'EN_JUEGO' || p.estado === 'FINALIZADO' || p.estado === 'WO',
  );
  return jugadas.length ? Math.max(...jugadas.map((p) => p.fecha)) + 1 : null;
}

/**
 * Desde qué fecha se cobra cada concepto al guardar la configuración. Al activarlo (monto de 0 a más de 0) se cobra
 * desde la próxima fecha; si ya estaba activo, se mantiene; si se apaga, se olvida.
 */
export function desdeFechaAlConfigurar(
  antes: ConfigCobrosPorFecha,
  nueva: Pick<ConfigCobrosPorFecha, 'cuotaPorFecha' | 'seguroPorJugadorPorFecha'>,
  partidos: readonly { fecha: number; estado: PartidoParaCobro['estado'] }[],
): Pick<ConfigCobrosPorFecha, 'cuotaDesdeFecha' | 'seguroDesdeFecha'> {
  const desde = (montoAntes: number, montoNuevo: number, actual: number | null) =>
    montoNuevo <= 0 ? null : montoAntes > 0 ? actual : proximaFecha(partidos);
  return {
    cuotaDesdeFecha: desde(antes.cuotaPorFecha, nueva.cuotaPorFecha, antes.cuotaDesdeFecha),
    seguroDesdeFecha: desde(
      antes.seguroPorJugadorPorFecha,
      nueva.seguroPorJugadorPorFecha,
      antes.seguroDesdeFecha,
    ),
  };
}

/** Cuántos días antes del partido se genera el cargo de la fecha (así el recordatorio de 3 días antes lo encuentra). */
export const DIAS_ANTICIPACION_COBRO_POR_FECHA = anticipacionDias;

export type TipoCargoPorFecha = 'CUOTA' | 'SEGURO';

/** Rubro de la caja de cada cargo por fecha. La cuota es un ingreso del torneo, como la inscripción. */
export const CATEGORIA_CARGO_POR_FECHA = { CUOTA: 'INSCRIPCIONES', SEGURO: 'SEGUROS' } as const;

export interface PartidoParaCobro {
  id: string;
  fecha: number;
  fase: 'LIGA' | 'GRUPOS' | 'LLAVE';
  localId: string;
  visitanteId: string;
  /** Instante ISO del partido. Sin horario todavía, no se cobra. */
  inicio: string | null;
  estado: 'PROGRAMADO' | 'EN_JUEGO' | 'FINALIZADO' | 'SUSPENDIDO' | 'WO';
}

export interface CargoPorFecha {
  /** Identifica el cargo para no generarlo dos veces: tipo, torneo, equipo y número de fecha. */
  clave: string;
  tipo: TipoCargoPorFecha;
  equipoId: string;
  fecha: number;
  /** El partido que lo origina. Nulo en la fecha libre. */
  partidoId: string | null;
  concepto: string;
  monto: number;
  categoria: (typeof CATEGORIA_CARGO_POR_FECHA)[TipoCargoPorFecha];
  /** Día del partido (AAAA-MM-DD, hora de Argentina). */
  vence: string;
}

export const claveCargoPorFecha = (
  tipo: TipoCargoPorFecha,
  torneoId: string,
  equipoId: string,
  fecha: number,
) => `${tipo === 'CUOTA' ? 'cuota' : 'seguro'}:${torneoId}:${equipoId}:${fecha}`;

const ZONA_AR_MS = 3 * 3_600_000; // Argentina es UTC-3 todo el año.
const diaAR = (instante: string) =>
  new Date(new Date(instante).getTime() - ZONA_AR_MS).toISOString().slice(0, 10);

/**
 * Todos los cargos por fecha que corresponden con el fixture actual (sin mirar cuándo se generan).
 * - Un equipo paga la cuota de cada fecha que juega. Suspendido y W.O. según la configuración.
 * - Fecha libre (solo en liga o grupos: en una llave, no jugar es estar eliminado): paga la cuota si está configurado,
 *   con vencimiento el primer día de esa fecha. El seguro nunca se cobra en la fecha libre: no hay partido.
 * - El seguro sigue las mismas reglas que la cuota para suspendidos y W.O., y se calcula con el plantel que se pasa.
 */
export function cargosPorFecha(d: {
  torneoId: string;
  config: ConfigCobrosPorFecha;
  /** Equipos inscriptos (sin las bajas) y cuántos jugadores tiene hoy cada plantel. */
  equipos: readonly { id: string; jugadores: number }[];
  partidos: readonly PartidoParaCobro[];
}): CargoPorFecha[] {
  const k = d.config;
  if (k.cuotaPorFecha <= 0 && k.seguroPorJugadorPorFecha <= 0) return [];
  const cobra = (p: PartidoParaCobro) =>
    p.estado === 'SUSPENDIDO' ? k.cobrarPartidoSuspendido : p.estado === 'WO' ? k.cobrarWO : true;
  const porFecha = Map.groupBy(
    d.partidos.filter((p) => p.inicio),
    (p) => p.fecha,
  );
  // Solo tiene fecha libre quien juega la fase regular (un inscripto que quedó afuera del fixture no debe nada).
  const enFixture = new Set(
    d.partidos.filter((p) => p.fase !== 'LLAVE').flatMap((p) => [p.localId, p.visitanteId]),
  );
  const cargos: CargoPorFecha[] = [];
  for (const [fecha, partidos] of [...porFecha].sort(([a], [b]) => a - b)) {
    const primerDia = partidos.map((p) => diaAR(p.inicio!)).sort()[0]!;
    const regular = partidos.some((p) => p.fase !== 'LLAVE');
    for (const e of d.equipos) {
      const p = partidos.find((x) => x.localId === e.id || x.visitanteId === e.id);
      if (!p && !(regular && k.cobrarFechaLibre && enFixture.has(e.id))) continue;
      if (p && !cobra(p)) continue;
      const base = {
        equipoId: e.id,
        fecha,
        partidoId: p?.id ?? null,
        vence: p ? diaAR(p.inicio!) : primerDia,
      };
      if (k.cuotaPorFecha > 0 && fecha >= (k.cuotaDesdeFecha ?? 1))
        cargos.push({
          ...base,
          clave: claveCargoPorFecha('CUOTA', d.torneoId, e.id, fecha),
          tipo: 'CUOTA',
          concepto: `Cuota fecha ${fecha}${p ? '' : ' (libre)'}`,
          monto: k.cuotaPorFecha,
          categoria: CATEGORIA_CARGO_POR_FECHA.CUOTA,
        });
      if (p && k.seguroPorJugadorPorFecha > 0 && e.jugadores > 0 && fecha >= (k.seguroDesdeFecha ?? 1))
        cargos.push({
          ...base,
          clave: claveCargoPorFecha('SEGURO', d.torneoId, e.id, fecha),
          tipo: 'SEGURO',
          concepto: `Seguro fecha ${fecha} · ${e.jugadores} jugador${e.jugadores === 1 ? '' : 'es'}`,
          monto: k.seguroPorJugadorPorFecha * e.jugadores,
          categoria: CATEGORIA_CARGO_POR_FECHA.SEGURO,
        });
    }
  }
  return cargos;
}

export interface CargoPorFechaGuardado {
  id: string;
  clave: string;
  estado: 'PENDIENTE' | 'PAGADO' | 'ANULADO';
  monto: number;
  concepto: string;
  vence: string | null;
  partidoId: string | null;
  /** Lo que ya se pagó (pagos aprobados). */
  pagado: number;
}

export interface CambiosCargosPorFecha {
  crear: CargoPorFecha[];
  actualizar: {
    id: string;
    vence: string;
    partidoId: string | null;
    estado?: 'PENDIENTE';
    monto?: number;
    concepto?: string;
  }[];
  anular: string[];
}

/**
 * Qué hacer para que los cargos guardados coincidan con los que corresponden. Es idempotente: aplicar el resultado y
 * volver a correrla no cambia nada.
 * - Se crean solo los cargos cuyo partido es dentro de `anticipacion` días o antes (`hoy` en hora de Argentina).
 * - Un cargo pendiente que ya no corresponde (partido suspendido, equipo dado de baja) se anula si no tiene pagos.
 *   Uno pagado no se toca (devolver la plata es un reembolso, E06-12).
 * - Si el partido se movió, el vencimiento lo acompaña. Si un partido suspendido vuelve al fixture, el cargo anulado revive.
 * - El monto queda fijo al generarse (el seguro refleja el plantel de ese momento). Solo con `repreciar` (el organizador
 *   cambió los montos) se recalcula en los pendientes que todavía no tienen pagos.
 */
export function cambiosDeCargosPorFecha(
  guardados: readonly CargoPorFechaGuardado[],
  deseados: readonly CargoPorFecha[],
  o: { hoy: string; anticipacion?: number; repreciar?: boolean },
): CambiosCargosPorFecha {
  const hasta = sumarDias(o.hoy, o.anticipacion ?? DIAS_ANTICIPACION_COBRO_POR_FECHA);
  const porClave = new Map(guardados.map((g) => [g.clave, g]));
  const claves = new Set(deseados.map((x) => x.clave));
  const r: CambiosCargosPorFecha = { crear: [], actualizar: [], anular: [] };
  for (const x of deseados) {
    const g = porClave.get(x.clave);
    if (!g) {
      if (x.vence <= hasta) r.crear.push(x);
      continue;
    }
    if (g.estado === 'PAGADO') continue;
    const revive = g.estado === 'ANULADO';
    const precio =
      (revive || o.repreciar) && g.pagado === 0 && (g.monto !== x.monto || g.concepto !== x.concepto)
        ? { monto: x.monto, concepto: x.concepto }
        : {};
    if (g.vence !== x.vence || g.partidoId !== x.partidoId || revive || 'monto' in precio)
      r.actualizar.push({
        id: g.id,
        vence: x.vence,
        partidoId: x.partidoId,
        ...(revive ? { estado: 'PENDIENTE' as const } : {}),
        ...precio,
      });
  }
  for (const g of guardados)
    if (g.estado === 'PENDIENTE' && !claves.has(g.clave) && g.pagado === 0) r.anular.push(g.id);
  return r;
}

/** Cargos que deciden la confirmación de la inscripción: inscripción y seña. No las cuotas por fecha ni las multas. */
export function cargoConfirmaInscripcion(c: { categoria: string; fecha: number | null }): boolean {
  return c.categoria === 'INSCRIPCIONES' && c.fecha === null;
}

/** La inscripción queda confirmada cuando no le quedan cargos de inscripción pendientes. */
export function inscripcionConfirmada(
  cargos: readonly { estado: string; categoria: string; fecha: number | null }[],
): boolean {
  return !cargos.some((c) => c.estado === 'PENDIENTE' && cargoConfirmaInscripcion(c));
}

export interface DeudaPorFecha {
  /** Lo que falta pagar de cuotas y seguros que vencen hasta hoy inclusive. */
  monto: number;
  /** De eso, lo vencido antes de hoy. */
  vencido: number;
  cargos: { concepto: string; falta: number; vence: string }[];
}

/** Deuda de cuotas y seguros de un equipo al día de hoy (para el acta y el estado de pago). */
export function deudaPorFecha(
  cargos: readonly {
    concepto: string;
    estado: string;
    fecha: number | null;
    vence: string | null;
    monto: number;
    pagado: number;
  }[],
  hoy: string,
): DeudaPorFecha {
  const vigentes = cargos
    .filter((c) => c.estado === 'PENDIENTE' && c.fecha !== null && c.vence !== null && c.vence <= hoy)
    .map((c) => ({ concepto: c.concepto, falta: Math.max(0, c.monto - c.pagado), vence: c.vence! }))
    .filter((c) => c.falta > 0)
    .sort((a, b) => a.vence.localeCompare(b.vence));
  return {
    monto: vigentes.reduce((s, c) => s + c.falta, 0),
    vencido: vigentes.filter((c) => c.vence < hoy).reduce((s, c) => s + c.falta, 0),
    cargos: vigentes,
  };
}
