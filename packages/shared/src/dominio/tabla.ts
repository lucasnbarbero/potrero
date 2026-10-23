import type { Desempate, Reglamento, ResultadoPartido } from './tipos.js';

export interface FilaTabla {
  posicion: number;
  equipoId: string;
  pj: number;
  pg: number;
  pe: number;
  pp: number;
  gf: number;
  gc: number;
  dg: number;
  pts: number;
  amarillas: number;
  rojas: number;
}

/** Puntos de juego limpio: menos es mejor. */
const puntosJuegoLimpio = (f: FilaTabla) => f.amarillas + f.rojas * 3;

function filaVacia(equipoId: string): FilaTabla {
  return {
    posicion: 0,
    equipoId,
    pj: 0,
    pg: 0,
    pe: 0,
    pp: 0,
    gf: 0,
    gc: 0,
    dg: 0,
    pts: 0,
    amarillas: 0,
    rojas: 0,
  };
}

function acumular(equipoIds: readonly string[], partidos: readonly ResultadoPartido[], r: Reglamento) {
  const filas = new Map(equipoIds.map((id) => [id, filaVacia(id)]));
  for (const p of partidos) {
    const local = filas.get(p.localId);
    const visitante = filas.get(p.visitanteId);
    if (!local || !visitante) continue;
    let gl = p.golesLocal;
    let gv = p.golesVisitante;
    if (p.ganadorWO) {
      gl = p.ganadorWO === p.localId ? r.golesWO : 0;
      gv = p.ganadorWO === p.visitanteId ? r.golesWO : 0;
    }
    for (const [f, a, b] of [
      [local, gl, gv],
      [visitante, gv, gl],
    ] as const) {
      f.pj++;
      f.gf += a;
      f.gc += b;
      if (a > b) {
        f.pg++;
        f.pts += r.puntosVictoria;
      } else if (a === b) {
        f.pe++;
        f.pts += r.puntosEmpate;
      } else {
        f.pp++;
        f.pts += r.puntosDerrota;
      }
    }
    for (const t of p.tarjetas ?? []) {
      const f = filas.get(t.equipoId);
      if (f) {
        f.amarillas += t.amarillas;
        f.rojas += t.rojas;
      }
    }
  }
  for (const f of filas.values()) f.dg = f.gf - f.gc;
  return filas;
}

/** Agrupa una lista ya ordenada en bloques de valores iguales según `clave`. */
function agrupar<T>(items: T[], clave: (t: T) => number): T[][] {
  const grupos: T[][] = [];
  for (const it of items) {
    const ultimo = grupos.at(-1);
    if (ultimo && clave(ultimo[0]!) === clave(it)) ultimo.push(it);
    else grupos.push([it]);
  }
  return grupos;
}

/**
 * Ordena un grupo de equipos empatados aplicando los desempates en orden.
 * Cada criterio parte el grupo; los subgrupos que siguen empatados pasan al criterio siguiente.
 */
function desempatar(
  empatados: FilaTabla[],
  criterios: readonly Desempate[],
  partidos: readonly ResultadoPartido[],
  r: Reglamento,
  sorteo: (ids: string[]) => string[],
): FilaTabla[] {
  if (empatados.length < 2 || criterios.length === 0) return empatados;
  const [criterio, ...resto] = criterios as [Desempate, ...Desempate[]];
  let clave: (f: FilaTabla) => number;
  switch (criterio) {
    case 'DIFERENCIA_GOL':
      clave = (f) => -f.dg;
      break;
    case 'GOLES_FAVOR':
      clave = (f) => -f.gf;
      break;
    case 'JUEGO_LIMPIO':
      clave = (f) => puntosJuegoLimpio(f);
      break;
    case 'ENTRE_SI': {
      const ids = new Set(empatados.map((f) => f.equipoId));
      const entreSi = partidos.filter((p) => ids.has(p.localId) && ids.has(p.visitanteId));
      const mini = acumular([...ids], entreSi, r);
      clave = (f) => {
        const m = mini.get(f.equipoId)!;
        // Puntos, luego diferencia y goles en los partidos entre sí, en una sola clave ordenable.
        return -(m.pts * 10_000_000 + (m.dg + 1000) * 1000 + m.gf);
      };
      break;
    }
    case 'SORTEO': {
      const orden = sorteo(empatados.map((f) => f.equipoId));
      clave = (f) => orden.indexOf(f.equipoId);
      break;
    }
  }
  const ordenados = [...empatados].sort((a, b) => clave(a) - clave(b));
  return agrupar(ordenados, clave).flatMap((g) => desempatar(g, resto, partidos, r, sorteo));
}

/**
 * Tabla de posiciones. Es derivada: se calcula siempre desde los partidos cerrados y nunca se edita a mano.
 * `sorteo` define el orden cuando todos los criterios empatan; por defecto, alfabético por id (reproducible).
 */
export function tablaDePosiciones(
  equipoIds: readonly string[],
  partidos: readonly ResultadoPartido[],
  reglamento: Reglamento,
  sorteo: (ids: string[]) => string[] = (ids) => [...ids].sort(),
): FilaTabla[] {
  const filas = [...acumular(equipoIds, partidos, reglamento).values()].sort((a, b) => b.pts - a.pts);
  const ordenadas = agrupar(filas, (f) => -f.pts).flatMap((g) =>
    desempatar(g, reglamento.desempates, partidos, reglamento, sorteo),
  );
  return ordenadas.map((f, i) => ({ ...f, posicion: i + 1 }));
}
