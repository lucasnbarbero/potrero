import type { EventoPartido } from './tipos.js';

/** Eventos que siguen en pie: descarta las anulaciones y los eventos anulados. */
export function eventosVigentes<T extends EventoPartido>(eventos: readonly T[]): T[] {
  const anulados = new Set(eventos.filter((e) => e.tipo === 'ANULACION' && e.anulaA).map((e) => e.anulaA));
  return eventos.filter((e) => e.tipo !== 'ANULACION' && !anulados.has(e.id));
}

/** Marcador a partir de los eventos del acta. */
export function marcador(eventos: readonly EventoPartido[], localId: string, visitanteId: string) {
  let local = 0;
  let visitante = 0;
  for (const e of eventosVigentes(eventos)) {
    if (e.tipo === 'GOL') {
      if (e.equipoId === localId) local++;
      else if (e.equipoId === visitanteId) visitante++;
    } else if (e.tipo === 'GOL_EN_CONTRA') {
      if (e.equipoId === localId) visitante++;
      else if (e.equipoId === visitanteId) local++;
    }
  }
  return { local, visitante };
}

/** Tarjetas por equipo (para el juego limpio de la tabla). */
export function tarjetasPorEquipo(eventos: readonly EventoPartido[]) {
  const porEquipo = new Map<string, { equipoId: string; amarillas: number; rojas: number }>();
  for (const e of eventosVigentes(eventos)) {
    if (e.tipo !== 'AMARILLA' && e.tipo !== 'ROJA') continue;
    const t = porEquipo.get(e.equipoId) ?? { equipoId: e.equipoId, amarillas: 0, rojas: 0 };
    if (e.tipo === 'AMARILLA') t.amarillas++;
    else t.rojas++;
    porEquipo.set(e.equipoId, t);
  }
  return [...porEquipo.values()];
}

export interface FilaGoleador {
  jugadorId: string;
  equipoId: string;
  goles: number;
}

/** Goleadores: cuenta goles (no los goles en contra) de todos los partidos. */
export function goleadores(eventos: readonly EventoPartido[]): FilaGoleador[] {
  const porJugador = new Map<string, FilaGoleador>();
  for (const e of eventosVigentes(eventos)) {
    if (e.tipo !== 'GOL' || !e.jugadorId) continue;
    const f = porJugador.get(e.jugadorId) ?? { jugadorId: e.jugadorId, equipoId: e.equipoId, goles: 0 };
    f.goles++;
    porJugador.set(e.jugadorId, f);
  }
  return [...porJugador.values()].sort((a, b) => b.goles - a.goles || a.jugadorId.localeCompare(b.jugadorId));
}

/**
 * Línea de tiempo del acta: por minuto; si empatan, en el orden en que se cargaron. Los eventos sin minuto van al final,
 * también en orden de carga. Recibe los eventos en orden de carga.
 */
export function ordenarLineaDeTiempo<T extends { minuto: number | null | undefined }>(
  eventos: readonly T[],
): T[] {
  return eventos
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      const ma = a.e.minuto ?? Number.POSITIVE_INFINITY;
      const mb = b.e.minuto ?? Number.POSITIVE_INFINITY;
      return ma === mb ? a.i - b.i : ma - mb;
    })
    .map((x) => x.e);
}

/** Equipo ausente: desde cuándo se puede marcar (hora del partido más la tolerancia del reglamento). */
export function vencimientoDeTolerancia(inicio: Date | string, toleranciaMinutos: number): Date {
  return new Date(new Date(inicio).getTime() + toleranciaMinutos * 60_000);
}

/**
 * Si ya se puede marcar un equipo ausente. Sin horario no se puede: no hay desde cuándo contar la tolerancia.
 * Devuelve el motivo para mostrarle al usuario cuando todavía no se puede.
 */
export function puedeMarcarAusente(
  inicio: Date | string | null,
  toleranciaMinutos: number,
  ahora: Date = new Date(),
): { puede: true } | { puede: false; motivo: 'SIN_HORARIO' | 'TOLERANCIA'; desde?: Date } {
  if (!inicio) return { puede: false, motivo: 'SIN_HORARIO' };
  const desde = vencimientoDeTolerancia(inicio, toleranciaMinutos);
  return ahora.getTime() >= desde.getTime() ? { puede: true } : { puede: false, motivo: 'TOLERANCIA', desde };
}

/** Resultado de un partido con un equipo ausente: el que se presentó gana por los goles que fija el reglamento. */
export function resultadoPorAusencia(ganadorId: string, localId: string, golesWO: number) {
  return ganadorId === localId ? { local: golesWO, visitante: 0 } : { local: 0, visitante: golesWO };
}
