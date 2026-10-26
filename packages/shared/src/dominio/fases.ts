// Torneos por fases (ADR-026, E10-07/08) y llaves ida y vuelta (E10-03). Funciones puras: la API guarda y orquesta.
// A partir del formato validado (formato.ts), resuelve qué equipos entran a cada fase, arma sus grupos, fechas y
// cuadro, y define las series de ida y vuelta (global y penales en la vuelta).
import type { FilaTabla } from './tabla.js';
import type { Fecha } from './fixture.js';
import { todosContraTodos } from './fixture.js';
import {
  cantidadDeGruposDeFase,
  type EntradaDeFase,
  type FaseDeFormato,
  type FormatoFlexible,
  idaYVueltaDeRonda,
  tamanosDeGrupos,
} from './formato.js';
import {
  cuadroDeSemillas,
  llaveDesdeCuadro,
  ordenDeSiembra,
  type ResultadoLlave,
  resolverLlave,
} from './llaves.js';

const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const esPotenciaDeDos = (n: number) => n >= 1 && (n & (n - 1)) === 0;

// ───────────── Estado de las fases ya jugadas ─────────────

/** Lo que dejó una fase: sus tablas (grupos o liga) o, si es eliminación, quién ganó y perdió cada ronda. */
export interface ResultadoDeFase {
  tipo: FaseDeFormato['tipo'];
  /** La fase ya existe (se generó). */
  generada: boolean;
  /** Todos sus partidos están cerrados y, si es eliminación, hay campeón. */
  terminada: boolean;
  /** Grupos y todos contra todos: una tabla por grupo, ordenada (la 1ª fila es el 1º). */
  tablas?: FilaTabla[][];
  /** Eliminación: por ronda (1 = la primera), si ya se definió y quiénes ganaron y perdieron, en orden del cuadro. */
  rondas?: { definida: boolean; ganadores: string[]; perdedores: string[] }[];
}

export type EntradasResueltas =
  | {
      ok: true;
      /** Equipos de la fase, de mejor a peor semilla. */
      equipoIds: string[];
      /** Si la fase toma puestos de una sola fase de grupos: los clasificados de cada grupo (para el cruce entre grupos). */
      porGrupo?: string[][];
    }
  | { ok: false; motivo: string };

/** Ordena filas de distintos grupos que terminaron en el mismo puesto: puntos, diferencia de gol, goles a favor. */
export function compararEntreGrupos(a: FilaTabla, b: FilaTabla): number {
  return b.pts - a.pts || b.dg - a.dg || b.gf - a.gf || a.equipoId.localeCompare(b.equipoId);
}

function mejoresDelPuesto(tablas: FilaTabla[][], puesto: number, cantidad: number): string[] {
  return tablas
    .map((t) => t[puesto - 1])
    .filter((f): f is FilaTabla => !!f)
    .sort(compararEntreGrupos)
    .slice(0, cantidad)
    .map((f) => f.equipoId);
}

/** Equipos que una fase entrega a otras por puesto (PUESTOS y MEJORES), según el formato completo. */
function tomadosDe(formato: FormatoFlexible, origenId: string, tablas: FilaTabla[][]): Set<string> {
  const tomados = new Set<string>();
  for (const f of formato.fases)
    for (const e of f.entradas) {
      if (e.tipo === 'PUESTOS' && e.fase === origenId)
        for (const t of tablas)
          for (let p = e.desde; p <= e.hasta; p++) if (t[p - 1]) tomados.add(t[p - 1]!.equipoId);
      if (e.tipo === 'MEJORES' && e.fase === origenId)
        for (const id of mejoresDelPuesto(tablas, e.puesto, e.cantidad)) tomados.add(id);
    }
  return tomados;
}

/** Por puesto y después por grupo: 1º A, 1º B, 2º A, 2º B… (así quedan sembrados). */
function porPuesto(tablas: FilaTabla[][], filtro: (id: string) => boolean): string[] {
  const largo = Math.max(0, ...tablas.map((t) => t.length));
  const ids: string[] = [];
  for (let p = 0; p < largo; p++)
    for (const t of tablas) {
      const f = t[p];
      if (f && filtro(f.equipoId)) ids.push(f.equipoId);
    }
  return ids;
}

/**
 * Resuelve los equipos que entran a una fase. Cada entrada necesita lo suyo: los puestos, los mejores y los no
 * clasificados, que la fase de origen haya terminado; los ganadores o perdedores de una ronda, que esa ronda esté definida.
 */
export function resolverEntradas(
  formato: FormatoFlexible,
  faseId: string,
  inscriptos: readonly string[],
  resultados: Readonly<Record<string, ResultadoDeFase | undefined>>,
): EntradasResueltas {
  const fase = formato.fases.find((f) => f.id === faseId);
  if (!fase) return { ok: false, motivo: 'La fase no existe en el formato del torneo.' };
  const nombreDe = (id: string) => formato.fases.find((f) => f.id === id)?.nombre ?? id;
  const ids: string[] = [];
  let porGrupo: string[][] | undefined;
  const conPuestos = fase.entradas.filter((e) => e.tipo === 'PUESTOS');
  for (const e of fase.entradas as EntradaDeFase[]) {
    if (e.tipo === 'INSCRIPTOS') {
      ids.push(...inscriptos);
      continue;
    }
    const origen = resultados[e.fase];
    if (!origen?.generada) return { ok: false, motivo: `Todavía no se generó ${nombreDe(e.fase)}.` };
    if (e.tipo === 'GANADORES' || e.tipo === 'PERDEDORES') {
      const ronda = origen.rondas?.[e.ronda - 1];
      if (!ronda) return { ok: false, motivo: `${nombreDe(e.fase)} no tiene ronda ${e.ronda}.` };
      if (!ronda.definida)
        return { ok: false, motivo: `Falta terminar la ronda ${e.ronda} de ${nombreDe(e.fase)}.` };
      ids.push(...(e.tipo === 'GANADORES' ? ronda.ganadores : ronda.perdedores));
      continue;
    }
    if (!origen.terminada) return { ok: false, motivo: `Falta terminar ${nombreDe(e.fase)}.` };
    const tablas = origen.tablas ?? [];
    if (e.tipo === 'PUESTOS') {
      const dentro = (id: string) =>
        tablas.some((t) => {
          const i = t.findIndex((f) => f.equipoId === id);
          return i + 1 >= e.desde && i + 1 <= e.hasta;
        });
      ids.push(...porPuesto(tablas, dentro));
      if (conPuestos.length === 1 && fase.entradas.length === 1 && tablas.length > 1)
        porGrupo = tablas.map((t) => t.slice(e.desde - 1, e.hasta).map((f) => f.equipoId));
    } else if (e.tipo === 'MEJORES') {
      ids.push(...mejoresDelPuesto(tablas, e.puesto, e.cantidad));
    } else {
      const tomados = tomadosDe(formato, e.fase, tablas);
      ids.push(...porPuesto(tablas, (id) => !tomados.has(id)));
    }
  }
  const unicos = [...new Set(ids)];
  if (unicos.length < 2)
    return { ok: false, motivo: `${fase.nombre} tiene ${unicos.length} equipo(s): hacen falta al menos 2.` };
  return { ok: true, equipoIds: unicos, ...(porGrupo ? { porGrupo } : {}) };
}

// ───────────── Armado de una fase ─────────────

export interface GrupoDeFase {
  /** Letra del grupo; null en un todos contra todos. */
  grupo: string | null;
  equipoIds: string[];
}

/** Reparte los equipos (de mejor a peor semilla) en serpentina según el formato de la fase. */
export function gruposDeFase(fase: FaseDeFormato, equipoIds: readonly string[]): GrupoDeFase[] {
  if (fase.tipo === 'ELIMINACION') return [];
  if (fase.tipo === 'TODOS_CONTRA_TODOS') return [{ grupo: null, equipoIds: [...equipoIds] }];
  const tamanos = tamanosDeGrupos(equipoIds.length, cantidadDeGruposDeFase(fase, equipoIds.length));
  const grupos: GrupoDeFase[] = tamanos.map((_, i) => ({ grupo: LETRAS[i]!, equipoIds: [] }));
  const g = grupos.length;
  equipoIds.forEach((id, i) => {
    const vuelta = Math.floor(i / g);
    const pos = i % g;
    grupos[vuelta % 2 === 0 ? pos : g - 1 - pos]!.equipoIds.push(id);
  });
  return grupos;
}

/** Fechas de una fase de liga o grupos: todos los grupos juegan su fecha n a la vez. Cada cruce lleva su grupo. */
export function fechasDeFase(
  fase: FaseDeFormato,
  grupos: readonly GrupoDeFase[],
): { fechas: Fecha[]; grupoDe: Map<string, string | null> } {
  const grupoDe = new Map<string, string | null>();
  const porGrupo = grupos.map((g) => {
    const ida = todosContraTodos(g.equipoIds, false);
    const fechas: Fecha[] = [];
    for (let r = 0; r < fase.ruedas; r++)
      for (const f of ida)
        fechas.push({
          numero: fechas.length + 1,
          cruces: f.cruces.map((c) => (r % 2 === 0 ? c : { localId: c.visitanteId, visitanteId: c.localId })),
        });
    for (const f of fechas) for (const c of f.cruces) grupoDe.set(`${c.localId}|${c.visitanteId}`, g.grupo);
    return fechas;
  });
  const total = Math.max(0, ...porGrupo.map((f) => f.length));
  const fechas = Array.from({ length: total }, (_, i) => ({
    numero: i + 1,
    cruces: porGrupo.flatMap((f) => f[i]?.cruces ?? []),
  }));
  return { fechas, grupoDe };
}

/**
 * Cuadro de una eliminación. Con cruce entre grupos (y clasificados parejos por grupo, cantidad par de grupos y
 * total potencia de 2), el 1º de un grupo enfrenta al último clasificado del grupo vecino. Si no, siembra estándar.
 */
export function cuadroDeFase(
  fase: FaseDeFormato,
  equipoIds: readonly string[],
  porGrupo?: readonly (readonly string[])[],
): (string | null)[] {
  if (fase.cruces === 'CRUZADO_ENTRE_GRUPOS' && porGrupo) {
    const cruzado = cuadroCruzado(porGrupo);
    if (cruzado) return cruzado;
  }
  return cuadroDeSemillas(equipoIds);
}

function cuadroCruzado(porGrupo: readonly (readonly string[])[]): string[] | null {
  const g = porGrupo.length;
  const k = porGrupo[0]?.length ?? 0;
  if (g < 2 || g % 2 !== 0 || k % 2 !== 0 || porGrupo.some((x) => x.length !== k)) return null;
  if (!esPotenciaDeDos(g * k)) return null;
  const partidos: { rango: number; cruce: [string, string] }[] = [];
  for (let par = 0; par < g; par += 2)
    for (let i = 1; i <= k / 2; i++)
      for (const [x, y] of [
        [par, par + 1],
        [par + 1, par],
      ] as const)
        partidos.push({ rango: (i - 1) * g + x, cruce: [porGrupo[x]![i - 1]!, porGrupo[y]![k - i]!] });
  partidos.sort((m, n) => m.rango - n.rango);
  if (partidos.length === 1) return [...partidos[0]!.cruce];
  return ordenDeSiembra(partidos.length).flatMap((s) => partidos[s - 1]!.cruce);
}

// ───────────── Llaves por fase, con ida y vuelta ─────────────

export interface RondaProgramada {
  numero: number;
  nombre: string;
  idaYVuelta: boolean;
  /** Número de fecha (dentro de la fase, desde 1) de la ida o del partido único. La vuelta es la siguiente. */
  fecha: number;
}

/** Rondas de la llave de la fase con su modo (ida y vuelta o partido único) y la fecha en que se juegan. */
export function rondasDeLaLlave(fase: Pick<FaseDeFormato, 'idaYVuelta'>, cuadro: readonly (string | null)[]) {
  const llave = llaveDesdeCuadro(cuadro);
  const total = Math.log2(cuadro.length);
  let fecha = 1;
  const rondas: RondaProgramada[] = llave.rondas.map((r) => {
    const idaYVuelta = idaYVueltaDeRonda(fase, total - r.numero);
    const x = { numero: r.numero, nombre: r.nombre, idaYVuelta, fecha };
    fecha += idaYVuelta ? 2 : 1;
    return x;
  });
  return { llave, rondas };
}

/** Un partido de una serie: pierna 1 = ida (o partido único), 2 = vuelta. Goles desde su propio local. */
export interface PiernaJugada {
  pierna: number;
  localId: string;
  visitanteId: string;
  cerrado: boolean;
  golesLocal: number;
  golesVisitante: number;
  penalesLocal?: number | null;
  penalesVisitante?: number | null;
  /** Ganador por equipo ausente. */
  ganadorWOId?: string | null;
}

/**
 * Resultado de una serie visto desde el local del cruce (el de mejor semilla).
 * Partido único: el del partido. Ida y vuelta: goles sumados (la vuelta se juega con la localía invertida) y los
 * penales de la vuelta. Un equipo ausente en cualquiera de los dos partidos pierde la serie. Sin terminar: undefined.
 */
export function resultadoDeSerie(
  localId: string,
  piernas: readonly PiernaJugada[],
  idaYVuelta: boolean,
): ResultadoLlave | undefined {
  const ida = piernas.find((p) => p.pierna === 1);
  const vuelta = piernas.find((p) => p.pierna === 2);
  const desdeLocal = (p: PiernaJugada) =>
    p.localId === localId
      ? {
          gl: p.golesLocal,
          gv: p.golesVisitante,
          pl: p.penalesLocal ?? null,
          pv: p.penalesVisitante ?? null,
        }
      : {
          gl: p.golesVisitante,
          gv: p.golesLocal,
          pl: p.penalesVisitante ?? null,
          pv: p.penalesLocal ?? null,
        };
  if (!idaYVuelta) {
    if (!ida?.cerrado) return undefined;
    const r = desdeLocal(ida);
    return {
      golesLocal: r.gl,
      golesVisitante: r.gv,
      penalesLocal: r.pl,
      penalesVisitante: r.pv,
      ganadorId: ida.ganadorWOId ?? null,
    };
  }
  const wo = [ida, vuelta].find((p) => p?.cerrado && p.ganadorWOId)?.ganadorWOId;
  if (!ida?.cerrado || !vuelta?.cerrado) {
    if (!wo) return undefined;
  }
  const a = ida?.cerrado ? desdeLocal(ida) : { gl: 0, gv: 0, pl: null, pv: null };
  const b = vuelta?.cerrado ? desdeLocal(vuelta) : { gl: 0, gv: 0, pl: null, pv: null };
  return {
    golesLocal: a.gl + b.gl,
    golesVisitante: a.gv + b.gv,
    penalesLocal: b.pl,
    penalesVisitante: b.pv,
    ganadorId: wo ?? null,
  };
}

/**
 * ¿El acta tiene que pedir penales? Partido único de llave: si termina empatado. Ida: nunca. Vuelta: si el global
 * (ida + vuelta) queda empatado. `ida` son los goles de la ida desde el local de la vuelta.
 */
export function pidePenales(
  m: { golesLocal: number; golesVisitante: number },
  o: { pierna: number | null; idaYVuelta: boolean; ida?: { golesLocal: number; golesVisitante: number } },
): boolean {
  if (!o.idaYVuelta) return m.golesLocal === m.golesVisitante;
  if (o.pierna !== 2) return false;
  const ida = o.ida ?? { golesLocal: 0, golesVisitante: 0 };
  return m.golesLocal + ida.golesLocal === m.golesVisitante + ida.golesVisitante;
}

export interface SerieResuelta {
  clave: string;
  ronda: number;
  posicion: number;
  localId?: string;
  visitanteId?: string;
  resultado?: ResultadoLlave;
  ganadorId?: string;
  estado: 'PENDIENTE' | 'LISTO' | 'DEFINIDO' | 'EMPATE_SIN_DEFINIR';
}

/**
 * Resuelve la llave de una fase con sus series: quién juega cada cruce, el global, quién ganó y, por ronda,
 * ganadores (incluidos los pases libres) y perdedores. `piernas` va por clave de cruce ("ronda-posición").
 */
export function resolverLlaveDeFase(
  fase: Pick<FaseDeFormato, 'idaYVuelta'>,
  cuadro: readonly (string | null)[],
  piernas: Readonly<Record<string, readonly PiernaJugada[] | undefined>>,
) {
  const { llave, rondas } = rondasDeLaLlave(fase, cuadro);
  const iyv = new Map(rondas.map((r) => [r.numero, r.idaYVuelta]));
  // Primera pasada: con lo que hay, se sabe quién juega cada cruce; con eso se calcula el resultado de la serie.
  const resultados: Record<string, ResultadoLlave | undefined> = {};
  let resuelta = resolverLlave(llave, {});
  for (let i = 0; i < llave.rondas.length; i++) {
    for (const r of resuelta.rondas)
      for (const p of r.partidos)
        if (p.localId && p.visitanteId)
          resultados[p.clave] = resultadoDeSerie(
            p.localId,
            piernas[p.clave] ?? [],
            iyv.get(p.ronda) ?? false,
          );
    resuelta = resolverLlave(llave, resultados);
  }
  const libresRonda1 = pasesLibres(cuadro);
  const porRonda = resuelta.rondas.map((r) => {
    const definida = r.partidos.every((p) => p.estado === 'DEFINIDO');
    const ganadores = r.partidos.flatMap((p) => (p.ganadorId ? [p.ganadorId] : []));
    const perdedores = r.partidos.flatMap((p) =>
      p.ganadorId ? [p.ganadorId === p.localId ? p.visitanteId! : p.localId!] : [],
    );
    return {
      numero: r.numero,
      definida,
      ganadores: r.numero === llave.rondas[0]?.numero ? [...libresRonda1, ...ganadores] : ganadores,
      perdedores,
    };
  });
  return { llave, rondas, resuelta, porRonda, campeonId: resuelta.campeonId };
}

/** Equipos que pasan libres la primera ronda (su rival en el cuadro es null). */
function pasesLibres(cuadro: readonly (string | null)[]): string[] {
  const libres: string[] = [];
  for (let i = 0; i < cuadro.length; i += 2) {
    const a = cuadro[i] ?? null;
    const b = cuadro[i + 1] ?? null;
    if ((a && !b) || (!a && b)) libres.push((a ?? b)!);
  }
  return libres;
}
