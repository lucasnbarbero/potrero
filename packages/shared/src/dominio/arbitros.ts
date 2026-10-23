// Árbitros y canchas (E08): disponibilidad, designación automática (un árbitro por franja) y ocupación de canchas.
import { diaArgentina } from './reprogramacion.js';

/** Una ventana en la que el árbitro puede dirigir. `dia`: 0 = domingo … 6 = sábado, hora de Argentina. */
export interface FranjaDisponible {
  dia: number;
  desde: string;
  hasta: string;
}

const ZONA_MS = 3 * 3_600_000;

/** Día de la semana (0 = domingo) y hora (HH:MM) de un instante, en la hora de Argentina. */
export function momentoLocal(inicio: string): { dia: number; hora: string; fecha: string } {
  const local = new Date(new Date(inicio).getTime() - ZONA_MS);
  return {
    dia: local.getUTCDay(),
    hora: local.toISOString().slice(11, 16),
    fecha: diaArgentina(inicio),
  };
}

/** Sin franjas cargadas, el árbitro está disponible siempre. Con franjas, el partido tiene que caer dentro de alguna. */
export function estaDisponible(
  disponibilidad: readonly FranjaDisponible[] | null | undefined,
  inicio: string,
): boolean {
  if (!disponibilidad || disponibilidad.length === 0) return true;
  const { dia, hora } = momentoLocal(inicio);
  return disponibilidad.some((f) => f.dia === dia && hora >= f.desde && hora < f.hasta);
}

export interface PartidoADesignar {
  id: string;
  inicio: string;
}

export interface ArbitroDesignable {
  id: string;
  disponibilidad?: readonly FranjaDisponible[] | null;
  activo?: boolean;
}

export interface Ocupacion {
  arbitroId: string;
  inicio: string;
}

export interface ResultadoDesignacion {
  asignaciones: { partidoId: string; arbitroId: string }[];
  sinAsignar: { partidoId: string; motivo: string }[];
}

/**
 * Designa árbitros a los partidos sin árbitro respetando lo duro: un árbitro dirige un solo partido por franja y solo
 * cuando está disponible. Entre los que pueden, elige al que menos partidos lleva (reparto parejo); si empatan, por id.
 * `ocupados` son las designaciones ya hechas (de este y otros torneos): cuentan para la franja y para el reparto.
 */
export function designarAutomatico(
  partidos: readonly PartidoADesignar[],
  arbitros: readonly ArbitroDesignable[],
  ocupados: readonly Ocupacion[] = [],
): ResultadoDesignacion {
  const activos = arbitros.filter((a) => a.activo !== false);
  const carga = new Map(activos.map((a) => [a.id, 0]));
  const franjas = new Map<string, Set<string>>(); // inicio → árbitros ocupados
  for (const o of ocupados) {
    if (carga.has(o.arbitroId)) carga.set(o.arbitroId, carga.get(o.arbitroId)! + 1);
    (franjas.get(o.inicio) ?? franjas.set(o.inicio, new Set()).get(o.inicio)!).add(o.arbitroId);
  }
  const resultado: ResultadoDesignacion = { asignaciones: [], sinAsignar: [] };
  const orden = [...partidos].sort((a, b) => a.inicio.localeCompare(b.inicio) || a.id.localeCompare(b.id));
  for (const p of orden) {
    const libres = franjas.get(p.inicio) ?? new Set<string>();
    const disponibles = activos.filter((a) => estaDisponible(a.disponibilidad, p.inicio));
    const candidatos = disponibles.filter((a) => !libres.has(a.id));
    if (candidatos.length === 0) {
      resultado.sinAsignar.push({
        partidoId: p.id,
        motivo:
          activos.length === 0
            ? 'No hay árbitros cargados.'
            : disponibles.length === 0
              ? 'Ningún árbitro está disponible a esa hora.'
              : 'Todos los árbitros disponibles ya dirigen a esa hora.',
      });
      continue;
    }
    const elegido = candidatos.sort(
      (a, b) => carga.get(a.id)! - carga.get(b.id)! || a.id.localeCompare(b.id),
    )[0]!;
    carga.set(elegido.id, carga.get(elegido.id)! + 1);
    (franjas.get(p.inicio) ?? franjas.set(p.inicio, new Set()).get(p.inicio)!).add(elegido.id);
    resultado.asignaciones.push({ partidoId: p.id, arbitroId: elegido.id });
  }
  return resultado;
}

export interface OcupacionDeCancha {
  canchaId: string;
  /** Partidos de la cancha ese día. */
  partidos: number;
  /** Franjas (horarios) que la liga usa ese día en alguna cancha: lo que se podría haber ocupado. */
  franjas: number;
  /** Porcentaje de esas franjas que ocupa esta cancha. */
  pct: number;
}

/**
 * Ocupación de cada cancha en un día: partidos de la cancha sobre las franjas que la liga usa ese día.
 * Las canchas sin partidos aparecen en 0 %.
 */
export function ocupacionDeCanchas(
  partidos: readonly { canchaId: string | null; inicio: string }[],
  canchaIds: readonly string[],
  fecha: string,
): OcupacionDeCancha[] {
  const delDia = partidos.filter((p) => p.canchaId && momentoLocal(p.inicio).fecha === fecha);
  const franjas = new Set(delDia.map((p) => p.inicio)).size;
  return canchaIds.map((canchaId) => {
    const n = delDia.filter((p) => p.canchaId === canchaId).length;
    return { canchaId, partidos: n, franjas, pct: franjas > 0 ? Math.round((n / franjas) * 100) : 0 };
  });
}

// ───────────── Texto de disponibilidad ─────────────

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const;

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');

const hora = (h: string) => {
  const [hh, mm] = h.split(':');
  return `${hh!.padStart(2, '0')}:${mm}`;
};

/**
 * Lee la disponibilidad que escribe una persona: "sáb 14:00-22:00, dom 10:00-14:00".
 * Un texto vacío es "disponible siempre". Falla con un mensaje claro si no entiende alguna franja.
 */
export function parsearDisponibilidad(texto: string): FranjaDisponible[] {
  const partes = texto
    .split(/[,;\n]/)
    .map((p) => p.trim())
    .filter(Boolean);
  return partes.map((p) => {
    const m =
      /^([a-záéíóú]+)\.?\s+(\d{1,2}:\d{2})\s*(?:-|a|hasta)\s*(\d{1,2}:\d{2})$/i.exec(
        sinTildes(p).replace(/\s+/g, ' '),
      ) ?? null;
    const dia = m
      ? DIAS_CORTOS.findIndex((d) => sinTildes(d) === sinTildes(m[1]!.toLowerCase().slice(0, 3)))
      : -1;
    const desde = m ? hora(m[2]!) : '';
    const hasta = m ? hora(m[3]!) : '';
    const valida = (h: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h);
    if (!m || dia < 0 || !valida(desde) || !valida(hasta) || desde >= hasta)
      throw new Error(`No entendimos "${p}". Escribilo así: sáb 14:00-22:00 (día, hora de inicio y de fin).`);
    return { dia, desde, hasta };
  });
}

/** El texto con el que se muestra y se edita la disponibilidad: "sáb 14:00-22:00, dom 10:00-14:00". */
export function formatearDisponibilidad(franjas: readonly FranjaDisponible[]): string {
  return franjas.map((f) => `${DIAS_CORTOS[f.dia]} ${f.desde}-${f.hasta}`).join(', ');
}
