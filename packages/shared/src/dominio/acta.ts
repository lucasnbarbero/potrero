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
