// Contingencias (E17): mover partidos por lluvia, cancha caída, etc. Calcula una propuesta antes de aplicar nada,
// con los conflictos a la vista. Advierte, no bloquea (documento 1, sección 6): el organizador decide.

export interface PartidoCalendario {
  id: string;
  /** Inicio en ISO 8601. */
  inicio: string;
  canchaId: string | null;
  localId: string;
  visitanteId: string;
}

export type AccionReprogramacion =
  /** Corre todo `dias` días (1 = al día siguiente; 7 = una semana después), con los mismos horarios y canchas. */
  | { tipo: 'MOVER'; dias: number }
  /** Pasa los partidos a otras canchas (por ejemplo, techadas) en el mismo horario, mientras haya lugar. */
  | { tipo: 'CAMBIAR_CANCHA'; canchaIds: string[] };

export interface Lugar {
  inicio: string;
  canchaId: string | null;
}

export interface Movimiento {
  partidoId: string;
  de: Lugar;
  a: Lugar;
}

export interface ConflictoReprogramacion {
  tipo: 'CANCHA_OCUPADA' | 'EQUIPO_DOBLE';
  partidoId: string;
  conPartidoId: string;
  mensaje: string;
}

export interface PropuestaReprogramacion {
  movimientos: Movimiento[];
  conflictos: ConflictoReprogramacion[];
  /** Lo que no se pudo resolver con esta acción (por ejemplo, no hay cancha techada libre a esa hora). */
  sinResolver: { partidoId: string; motivo: string }[];
}

const MS_DIA = 86_400_000;
const ZONA_MS = 3 * 3_600_000; // Argentina es UTC-3 todo el año.

/** El día calendario (AAAA-MM-DD) en que cae un instante, en la hora de Argentina. */
export function diaArgentina(inicio: string): string {
  return new Date(new Date(inicio).getTime() - ZONA_MS).toISOString().slice(0, 10);
}

/** Corre un instante `dias` días, conservando la hora local. */
export function sumarDiasAlInstante(inicio: string, dias: number): string {
  return new Date(new Date(inicio).getTime() + dias * MS_DIA).toISOString();
}

/** Qué choca con los partidos ya fijados (los que no se mueven y los que ya se movieron en esta propuesta). */
function conflictosDe(
  movidos: readonly (PartidoCalendario & { nuevo: Lugar })[],
  resto: readonly PartidoCalendario[],
): ConflictoReprogramacion[] {
  const conflictos: ConflictoReprogramacion[] = [];
  const fijos = resto.map((p) => ({ ...p, lugar: { inicio: p.inicio, canchaId: p.canchaId } }));
  const todos = [...fijos, ...movidos.map((m) => ({ ...m, lugar: m.nuevo }))];
  for (const m of movidos) {
    for (const o of todos) {
      if (o.id === m.id) continue;
      // Entre dos partidos movidos se informa una sola vez.
      if (movidos.some((x) => x.id === o.id) && o.id < m.id) continue;
      if (m.nuevo.canchaId && o.lugar.canchaId === m.nuevo.canchaId && o.lugar.inicio === m.nuevo.inicio)
        conflictos.push({
          tipo: 'CANCHA_OCUPADA',
          partidoId: m.id,
          conPartidoId: o.id,
          mensaje: 'La cancha ya está ocupada a esa hora.',
        });
      const comparten = [m.localId, m.visitanteId].some((e) => e === o.localId || e === o.visitanteId);
      if (comparten && diaArgentina(o.lugar.inicio) === diaArgentina(m.nuevo.inicio))
        conflictos.push({
          tipo: 'EQUIPO_DOBLE',
          partidoId: m.id,
          conPartidoId: o.id,
          mensaje: 'Un equipo juega dos partidos el mismo día.',
        });
    }
  }
  return conflictos;
}

/**
 * Calcula cómo quedaría el calendario con la acción pedida, sin tocar nada.
 * `afectados` son los partidos que se mueven; `resto` es el resto del calendario, para detectar choques.
 */
export function proponerReprogramacion(
  afectados: readonly PartidoCalendario[],
  resto: readonly PartidoCalendario[],
  accion: AccionReprogramacion,
): PropuestaReprogramacion {
  const orden = [...afectados].sort((a, b) => a.inicio.localeCompare(b.inicio) || a.id.localeCompare(b.id));
  const movidos: (PartidoCalendario & { nuevo: Lugar })[] = [];
  const sinResolver: PropuestaReprogramacion['sinResolver'] = [];

  if (accion.tipo === 'MOVER') {
    if (!Number.isInteger(accion.dias) || accion.dias === 0)
      throw new Error('Indicá cuántos días se mueven los partidos.');
    for (const p of orden)
      movidos.push({
        ...p,
        nuevo: { inicio: sumarDiasAlInstante(p.inicio, accion.dias), canchaId: p.canchaId },
      });
  } else {
    if (accion.canchaIds.length === 0) throw new Error('Elegí al menos una cancha de destino.');
    const ocupadas = new Set(resto.filter((p) => p.canchaId).map((p) => `${p.canchaId}|${p.inicio}`));
    for (const p of orden) {
      const libre = accion.canchaIds.find((c) => c !== p.canchaId && !ocupadas.has(`${c}|${p.inicio}`));
      if (!libre) {
        sinResolver.push({ partidoId: p.id, motivo: 'No hay una cancha de destino libre a esa hora.' });
        continue;
      }
      ocupadas.add(`${libre}|${p.inicio}`);
      movidos.push({ ...p, nuevo: { inicio: p.inicio, canchaId: libre } });
    }
  }

  return {
    movimientos: movidos.map((m) => ({
      partidoId: m.id,
      de: { inicio: m.inicio, canchaId: m.canchaId },
      a: m.nuevo,
    })),
    conflictos: conflictosDe(movidos, resto),
    sinResolver,
  };
}

/** Cantidad de equipos distintos involucrados en un grupo de partidos. */
export function equiposAfectados(
  partidos: readonly Pick<PartidoCalendario, 'localId' | 'visitanteId'>[],
): string[] {
  return [...new Set(partidos.flatMap((p) => [p.localId, p.visitanteId]))];
}
