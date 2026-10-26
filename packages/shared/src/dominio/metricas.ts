// Métricas de la organización (E24): retención de equipos, cobranza, ocupación de canchas y horarios más pedidos.
// Todo se deriva de los datos que ya existen (torneos, inscripciones, cargos, pagos, partidos y canchas): no hay tablas
// propias. Las funciones son puras; la API solo junta los datos y llama a `calcularMetricas`.
import { sumarDias } from './fixture.js';
import { METODOS_PAGO, type Formato, type MetodoPago } from './tipos.js';

/** Argentina no tiene horario de verano desde 2009: la hora local es UTC−3 todo el año. */
const DESFASE_ARGENTINA_MS = -3 * 60 * 60 * 1000;

export const PERIODOS_METRICAS = ['30D', 'TEMPORADA', 'HISTORICO'] as const;
export type PeriodoMetricas = (typeof PERIODOS_METRICAS)[number];

export type EstadoTorneoMetricas = 'BORRADOR' | 'INSCRIPCION' | 'EN_CURSO' | 'FINALIZADO';
export type EstadoPartidoMetricas = 'PROGRAMADO' | 'EN_JUEGO' | 'FINALIZADO' | 'SUSPENDIDO' | 'WO';

export interface PagoParaMetricas {
  metodo: MetodoPago;
  monto: number;
  estado: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO' | 'ANULADO';
  /** Cuándo se acreditó (o se registró, si no tiene acreditación). ISO. */
  fecha: string;
}

export interface CargoParaMetricas {
  monto: number;
  estado: 'PENDIENTE' | 'PAGADO' | 'ANULADO';
  /** Cargo de inscripción (no cuota por fecha, seguro ni multa): es el que se mide "antes del inicio". */
  esInscripcion: boolean;
  pagos: PagoParaMetricas[];
}

export interface PartidoParaMetricas {
  /** ISO con zona. Los partidos sin horario no cuentan para canchas ni horarios. */
  inicio: string | null;
  canchaId: string | null;
  estado: EstadoPartidoMetricas;
}

export interface TorneoParaMetricas {
  id: string;
  nombre: string;
  formato: Formato;
  estado: EstadoTorneoMetricas;
  creadoEn: string;
  /** Equipos inscriptos (sin las bajas). */
  equipos: { id: string; nombre: string }[];
  cargos: CargoParaMetricas[];
  partidos: PartidoParaMetricas[];
}

// ───────────── Fechas y períodos ─────────────

/** Día (AAAA-MM-DD) y hora (0–23) en Argentina de un instante. */
export function enArgentina(iso: string): { dia: string; hora: number; diaSemana: number } {
  const d = new Date(new Date(iso).getTime() + DESFASE_ARGENTINA_MS);
  return { dia: d.toISOString().slice(0, 10), hora: d.getUTCHours(), diaSemana: d.getUTCDay() };
}

const instante = (dia: string, fin = false) =>
  new Date(`${dia}T${fin ? '23:59:59.999' : '00:00:00'}-03:00`).getTime();

export interface Rango {
  desde: string | null;
  hasta: string | null;
}

/** Ventana de un período, en días de Argentina. "Temporada" es el año calendario de hoy; "Histórico" no tiene límites. */
export function rangoDelPeriodo(periodo: PeriodoMetricas, hoy: string): Rango {
  if (periodo === '30D') return { desde: sumarDias(hoy, -29), hasta: hoy };
  if (periodo === 'TEMPORADA') return { desde: `${hoy.slice(0, 4)}-01-01`, hasta: `${hoy.slice(0, 4)}-12-31` };
  return { desde: null, hasta: null };
}

const dentro = (iso: string, r: Rango) => {
  const t = new Date(iso).getTime();
  return (r.desde === null || t >= instante(r.desde)) && (r.hasta === null || t <= instante(r.hasta, true));
};

/** Primer y último partido con horario del torneo. Sin partidos, el torneo "empieza" cuando se creó. */
export function actividadDelTorneo(t: Pick<TorneoParaMetricas, 'creadoEn' | 'partidos' | 'estado'>): {
  inicio: string | null;
  desde: string;
  hasta: string | null;
} {
  const horarios = t.partidos
    .map((p) => p.inicio)
    .filter((x): x is string => !!x)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  const inicio = horarios[0] ?? null;
  return {
    inicio,
    desde: inicio ?? t.creadoEn,
    // Un torneo que no terminó sigue activo: no tiene fin.
    hasta: t.estado === 'FINALIZADO' ? (horarios.at(-1) ?? t.creadoEn) : null,
  };
}

/** El torneo estuvo activo en algún momento del rango. */
export function torneoEnRango(t: Pick<TorneoParaMetricas, 'creadoEn' | 'partidos' | 'estado'>, r: Rango): boolean {
  const a = actividadDelTorneo(t);
  const empiezaAntesDelFin = r.hasta === null || new Date(a.desde).getTime() <= instante(r.hasta, true);
  const terminaDespuesDelInicio =
    r.desde === null || a.hasta === null || new Date(a.hasta).getTime() >= instante(r.desde);
  return empiezaAntesDelFin && terminaDespuesDelInicio;
}

const ordenCronologico = <T extends Pick<TorneoParaMetricas, 'creadoEn' | 'partidos' | 'estado'>>(ts: T[]) =>
  [...ts].sort(
    (a, b) => new Date(actividadDelTorneo(a).desde).getTime() - new Date(actividadDelTorneo(b).desde).getTime(),
  );

const proporcion = (parte: number, total: number) => (total > 0 ? parte / total : null);

// ───────────── E24-01 · Retención de equipos ─────────────

/**
 * Las copas relámpago corren en paralelo a la liga con los mismos equipos: no son "el torneo siguiente".
 * La retención y la evolución de inscriptos miran solo los torneos de temporada (liga, grupos, liga + playoffs).
 */
export const esTorneoDeTemporada = (t: Pick<TorneoParaMetricas, 'formato' | 'estado'>) =>
  t.formato !== 'COPA' && t.estado !== 'BORRADOR';

export interface ParDeRetencion {
  desde: { id: string; nombre: string };
  hacia: { id: string; nombre: string };
  /** Equipos del torneo de origen. */
  base: number;
  repiten: { id: string; nombre: string }[];
  seFueron: { id: string; nombre: string }[];
  nuevos: { id: string; nombre: string }[];
  tasa: number | null;
  /** El torneo de destino todavía está en inscripción: la cifra puede subir. */
  abierto: boolean;
}

/** Para cada torneo de temporada, qué equipos del anterior se reinscribieron, cuáles se fueron y cuáles son nuevos. */
export function paresDeRetencion(torneos: TorneoParaMetricas[]): ParDeRetencion[] {
  const serie = ordenCronologico(torneos.filter(esTorneoDeTemporada));
  const pares: ParDeRetencion[] = [];
  for (let i = 1; i < serie.length; i++) {
    const a = serie[i - 1]!;
    const b = serie[i]!;
    const enB = new Set(b.equipos.map((e) => e.id));
    const enA = new Set(a.equipos.map((e) => e.id));
    const repiten = a.equipos.filter((e) => enB.has(e.id));
    pares.push({
      desde: { id: a.id, nombre: a.nombre },
      hacia: { id: b.id, nombre: b.nombre },
      base: a.equipos.length,
      repiten,
      seFueron: a.equipos.filter((e) => !enB.has(e.id)),
      nuevos: b.equipos.filter((e) => !enA.has(e.id)),
      tasa: proporcion(repiten.length, a.equipos.length),
      abierto: b.estado === 'INSCRIPCION',
    });
  }
  return pares;
}

/** Tasa de retención de un conjunto de pares: los que ya cerraron su inscripción; si no hay, todos. */
export function tasaDeRetencion(pares: ParDeRetencion[]): number | null {
  const cerrados = pares.filter((p) => !p.abierto);
  const usar = cerrados.length ? cerrados : pares;
  return proporcion(
    usar.reduce((s, p) => s + p.repiten.length, 0),
    usar.reduce((s, p) => s + p.base, 0),
  );
}

// ───────────── E24-02 · Cobranza ─────────────

export interface Cobranza {
  /** Lo que se le cobró a los equipos (cargos no anulados). */
  facturado: number;
  /** Lo cobrado de esos cargos (pagos aprobados, sin pasar el monto de cada cargo). */
  cobrado: number;
  tasa: number | null;
  /** Inscripciones: cuánto se facturó y cuánto entró antes del primer partido. */
  inscripcion: { facturado: number; antesDelInicio: number; tasa: number | null };
  /** Pagos aprobados por medio de pago: monto y cantidad. */
  porMedio: Record<MetodoPago, { monto: number; cantidad: number }>;
}

const medios = () =>
  Object.fromEntries(METODOS_PAGO.map((m) => [m, { monto: 0, cantidad: 0 }])) as Cobranza['porMedio'];

/**
 * Cobranza de un torneo. `inicio` es el primer partido: lo pagado hasta ese momento cuenta como "antes del inicio".
 * Si el torneo todavía no empezó, todo lo cobrado es anterior al inicio.
 */
export function cobranzaDelTorneo(cargos: CargoParaMetricas[], inicio: string | null): Cobranza {
  const r: Cobranza = {
    facturado: 0,
    cobrado: 0,
    tasa: null,
    inscripcion: { facturado: 0, antesDelInicio: 0, tasa: null },
    porMedio: medios(),
  };
  const limite = inicio ? new Date(inicio).getTime() : Infinity;
  for (const c of cargos) {
    if (c.estado === 'ANULADO') continue;
    const aprobados = c.pagos.filter((p) => p.estado === 'APROBADO');
    const pagado = aprobados.reduce((s, p) => s + p.monto, 0);
    r.facturado += c.monto;
    r.cobrado += Math.min(c.monto, pagado);
    for (const p of aprobados) {
      r.porMedio[p.metodo].monto += p.monto;
      r.porMedio[p.metodo].cantidad += 1;
    }
    if (c.esInscripcion) {
      const antes = aprobados.filter((p) => new Date(p.fecha).getTime() <= limite).reduce((s, p) => s + p.monto, 0);
      r.inscripcion.facturado += c.monto;
      r.inscripcion.antesDelInicio += Math.min(c.monto, antes);
    }
  }
  r.tasa = proporcion(r.cobrado, r.facturado);
  r.inscripcion.tasa = proporcion(r.inscripcion.antesDelInicio, r.inscripcion.facturado);
  return r;
}

/** Suma la cobranza de varios torneos y recalcula las tasas. */
export function sumarCobranzas(cs: Cobranza[]): Cobranza {
  const r: Cobranza = {
    facturado: 0,
    cobrado: 0,
    tasa: null,
    inscripcion: { facturado: 0, antesDelInicio: 0, tasa: null },
    porMedio: medios(),
  };
  for (const c of cs) {
    r.facturado += c.facturado;
    r.cobrado += c.cobrado;
    r.inscripcion.facturado += c.inscripcion.facturado;
    r.inscripcion.antesDelInicio += c.inscripcion.antesDelInicio;
    for (const m of METODOS_PAGO) {
      r.porMedio[m].monto += c.porMedio[m].monto;
      r.porMedio[m].cantidad += c.porMedio[m].cantidad;
    }
  }
  r.tasa = proporcion(r.cobrado, r.facturado);
  r.inscripcion.tasa = proporcion(r.inscripcion.antesDelInicio, r.inscripcion.facturado);
  return r;
}

/** Proporción de cada medio sobre el total cobrado (por monto). */
export function mezclaDeMedios(porMedio: Cobranza['porMedio']): Record<MetodoPago, number | null> {
  const total = METODOS_PAGO.reduce((s, m) => s + porMedio[m].monto, 0);
  return Object.fromEntries(METODOS_PAGO.map((m) => [m, proporcion(porMedio[m].monto, total)])) as Record<
    MetodoPago,
    number | null
  >;
}

// ───────────── E24-03 · Canchas y horarios ─────────────

/** Ocupan una cancha los partidos con horario y cancha que no se suspendieron. */
const ocupaCancha = (p: PartidoParaMetricas): p is PartidoParaMetricas & { inicio: string; canchaId: string } =>
  !!p.inicio && !!p.canchaId && p.estado !== 'SUSPENDIDO';

export interface OcupacionDeCanchas {
  /** Promedio por jornada: partidos / (canchas × horarios usados ese día). Nulo si no hubo jornadas. */
  promedio: number | null;
  jornadas: number;
  partidos: number;
  porCancha: { id: string; nombre: string; partidos: number; ocupacion: number | null }[];
}

/**
 * Ocupación de canchas. Una jornada es un día con partidos; su capacidad son las canchas habilitadas por los horarios
 * que se usaron ese día (si un sábado se jugó a las 19 y a las 20 en 2 canchas, había 4 lugares).
 */
export function ocupacionPorJornada(
  partidos: PartidoParaMetricas[],
  canchas: { id: string; nombre: string; bloqueada?: boolean }[],
): OcupacionDeCanchas {
  const usados = partidos.filter(ocupaCancha);
  const habilitadas = canchas.filter((c) => !c.bloqueada || usados.some((p) => p.canchaId === c.id));
  const cantidadCanchas = Math.max(habilitadas.length, new Set(usados.map((p) => p.canchaId)).size);
  const porDia = new Map<string, { horarios: Set<string>; partidos: number }>();
  for (const p of usados) {
    const { dia } = enArgentina(p.inicio);
    const j = porDia.get(dia) ?? { horarios: new Set<string>(), partidos: 0 };
    j.horarios.add(new Date(p.inicio).toISOString());
    j.partidos += 1;
    porDia.set(dia, j);
  }
  const jornadas = [...porDia.values()];
  const lugaresPorCancha = jornadas.reduce((s, j) => s + j.horarios.size, 0);
  const ocupaciones = jornadas.map((j) => Math.min(1, j.partidos / (j.horarios.size * cantidadCanchas)));
  return {
    promedio: ocupaciones.length ? ocupaciones.reduce((s, x) => s + x, 0) / ocupaciones.length : null,
    jornadas: jornadas.length,
    partidos: usados.length,
    porCancha: habilitadas.map((c) => {
      const n = usados.filter((p) => p.canchaId === c.id).length;
      return { id: c.id, nombre: c.nombre, partidos: n, ocupacion: proporcion(n, lugaresPorCancha) };
    }),
  };
}

/** Franjas del mapa de calor (hora de inicio en Argentina). Lo anterior a las 8 cae en la primera. */
export const FRANJAS_HORARIAS = [
  { desde: 0, hasta: 12, etiqueta: '8 a 12 hs' },
  { desde: 12, hasta: 16, etiqueta: '12 a 16 hs' },
  { desde: 16, hasta: 20, etiqueta: '16 a 20 hs' },
  { desde: 20, hasta: 24, etiqueta: '20 a 24 hs' },
] as const;

/** Columnas del mapa, de lunes a domingo. */
export const DIAS_SEMANA = [
  { corto: 'L', plural: 'los lunes' },
  { corto: 'M', plural: 'los martes' },
  { corto: 'M', plural: 'los miércoles' },
  { corto: 'J', plural: 'los jueves' },
  { corto: 'V', plural: 'los viernes' },
  { corto: 'S', plural: 'los sábados' },
  { corto: 'D', plural: 'los domingos' },
] as const;

export interface MapaDeHorarios {
  /** celdas[franja][día]: partidos que empezaron en esa franja ese día de la semana (lunes = 0). */
  celdas: number[][];
  maximo: number;
  /** La celda más pedida (la primera, ante un empate). Nulo sin partidos. */
  pico: { franja: number; dia: number; partidos: number } | null;
}

export function mapaDeHorarios(partidos: PartidoParaMetricas[]): MapaDeHorarios {
  const celdas = FRANJAS_HORARIAS.map(() => DIAS_SEMANA.map(() => 0));
  for (const p of partidos) {
    if (!p.inicio || p.estado === 'SUSPENDIDO') continue;
    const { hora, diaSemana } = enArgentina(p.inicio);
    const f = FRANJAS_HORARIAS.findIndex((x) => hora >= x.desde && hora < x.hasta);
    celdas[f]![(diaSemana + 6) % 7]! += 1;
  }
  let pico: MapaDeHorarios['pico'] = null;
  celdas.forEach((fila, f) =>
    fila.forEach((n, d) => {
      if (n > 0 && (!pico || n > pico.partidos)) pico = { franja: f, dia: d, partidos: n };
    }),
  );
  return { celdas, maximo: Math.max(0, ...celdas.flat()), pico };
}

/** Partidos jugados (finalizados o por W.O.) y cuántos fueron W.O. */
export function asistencia(partidos: PartidoParaMetricas[]): { jugados: number; wo: number; tasa: number | null } {
  const jugados = partidos.filter((p) => p.estado === 'FINALIZADO' || p.estado === 'WO').length;
  const wo = partidos.filter((p) => p.estado === 'WO').length;
  return { jugados, wo, tasa: proporcion(jugados - wo, jugados) };
}

// ───────────── Todo junto ─────────────

export interface FiltroMetricas {
  periodo: PeriodoMetricas;
  /** Un torneo puntual: manda sobre el período. */
  torneoId?: string | null;
}

export interface CobranzaPorTorneo extends Cobranza {
  id: string;
  nombre: string;
  estado: EstadoTorneoMetricas;
  inicio: string | null;
}

export interface Metricas {
  rango: Rango;
  /** Torneos que entran en el filtro, del más viejo al más nuevo. */
  torneos: { id: string; nombre: string; estado: EstadoTorneoMetricas }[];
  retencion: { tasa: number | null; pares: ParDeRetencion[] };
  /** Equipos inscriptos por torneo de temporada (todos, para ver la tendencia) y variación del último cerrado. */
  inscriptos: {
    serie: { id: string; nombre: string; equipos: number; enFiltro: boolean; abierto: boolean }[];
    variacion: number | null;
  };
  cobranza: Cobranza & { mezcla: Record<MetodoPago, number | null> };
  cobranzaPorTorneo: CobranzaPorTorneo[];
  canchas: OcupacionDeCanchas;
  horarios: MapaDeHorarios;
  asistencia: { jugados: number; wo: number; tasa: number | null };
}

/**
 * Métricas de la organización para un período o un torneo.
 * - Torneos del filtro: el elegido, o los que estuvieron activos en el período.
 * - Retención: los pares cuyo torneo de destino está en el filtro (o que tocan al torneo elegido).
 * - Canchas, horarios y asistencia: los partidos de esos torneos que se jugaron (o se programaron) dentro del período.
 */
export function calcularMetricas(
  todos: TorneoParaMetricas[],
  canchas: { id: string; nombre: string; bloqueada?: boolean }[],
  filtro: FiltroMetricas,
  hoy: string,
): Metricas {
  const elegido = filtro.torneoId ? todos.find((t) => t.id === filtro.torneoId) : undefined;
  const rango: Rango = elegido ? { desde: null, hasta: null } : rangoDelPeriodo(filtro.periodo, hoy);
  const torneos = ordenCronologico(elegido ? [elegido] : todos.filter((t) => torneoEnRango(t, rango)));
  const ids = new Set(torneos.map((t) => t.id));

  // Con un torneo elegido: cuántos de sus equipos siguieron en el próximo; si es el último, de dónde vinieron.
  const todosLosPares = paresDeRetencion(todos);
  const siguiente = elegido ? todosLosPares.filter((p) => p.desde.id === elegido.id) : [];
  const pares = elegido
    ? siguiente.length
      ? siguiente
      : todosLosPares.filter((p) => p.hacia.id === elegido.id)
    : todosLosPares.filter((p) => ids.has(p.hacia.id));

  const serie = ordenCronologico(todos.filter(esTorneoDeTemporada)).map((t) => ({
    id: t.id,
    nombre: t.nombre,
    equipos: t.equipos.length,
    enFiltro: ids.has(t.id),
    abierto: t.estado === 'INSCRIPCION',
  }));
  const cerrados = serie.filter((s) => !s.abierto);
  const [anterior, ultimo] = cerrados.slice(-2);
  const variacion =
    anterior && ultimo && anterior.equipos > 0 ? (ultimo.equipos - anterior.equipos) / anterior.equipos : null;

  const cobranzaPorTorneo = torneos.map((t) => ({
    id: t.id,
    nombre: t.nombre,
    estado: t.estado,
    inicio: actividadDelTorneo(t).inicio,
    ...cobranzaDelTorneo(t.cargos, actividadDelTorneo(t).inicio),
  }));
  const total = sumarCobranzas(cobranzaPorTorneo);

  const partidos = torneos.flatMap((t) => t.partidos).filter((p) => !p.inicio || dentro(p.inicio, rango));

  return {
    rango,
    torneos: torneos.map((t) => ({ id: t.id, nombre: t.nombre, estado: t.estado })),
    retencion: { tasa: tasaDeRetencion(pares), pares },
    inscriptos: { serie, variacion },
    cobranza: { ...total, mezcla: mezclaDeMedios(total.porMedio) },
    cobranzaPorTorneo,
    canchas: ocupacionPorJornada(partidos, canchas),
    horarios: mapaDeHorarios(partidos),
    asistencia: asistencia(partidos),
  };
}
