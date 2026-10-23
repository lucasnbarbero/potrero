// Llaves y playoffs (E10) y sorteo (E09-03). Todo es función pura: la API solo guarda y orquesta.

/** De dónde sale cada lado de un cruce: un equipo ya conocido o el ganador de otro cruce. */
export type Origen = { tipo: 'equipo'; equipoId: string } | { tipo: 'ganador'; de: string };

export interface PartidoLlave {
  /** Identificador estable dentro de la llave: `ronda-posición`, por ejemplo "1-3". */
  clave: string;
  ronda: number;
  posicion: number;
  local: Origen;
  visitante: Origen;
}

export interface RondaLlave {
  numero: number;
  nombre: string;
  partidos: PartidoLlave[];
}

export interface Llave {
  rondas: RondaLlave[];
}

const esPotenciaDeDos = (n: number) => n >= 2 && (n & (n - 1)) === 0;

/** Mayor potencia de dos que no supera `n`. */
const potenciaDeDosHasta = (n: number) => 2 ** Math.floor(Math.log2(n));

/** Menor potencia de dos que alcanza para `n`. */
const potenciaDeDosDesde = (n: number) => 2 ** Math.ceil(Math.log2(n));

/**
 * Posición de cada semilla en un cuadro de `tamano` lugares (potencia de dos), de modo que
 * la 1 y la 2 solo se crucen en la final, y las mejores semillas reciban los rivales más flojos.
 * Para 8: [1, 8, 4, 5, 2, 7, 3, 6] (cruces 1-8, 4-5, 2-7, 3-6).
 */
export function ordenDeSiembra(tamano: number): number[] {
  if (!esPotenciaDeDos(tamano)) throw new Error('El tamaño del cuadro tiene que ser potencia de dos.');
  let orden = [1, 2];
  while (orden.length < tamano) {
    const suma = orden.length * 2 + 1;
    orden = orden.flatMap((s) => [s, suma - s]);
  }
  return orden;
}

function nombreDeRonda(restantes: number): string {
  if (restantes === 0) return 'Final';
  if (restantes === 1) return 'Semifinales';
  if (restantes === 2) return 'Cuartos de final';
  if (restantes === 3) return 'Octavos de final';
  return `Ronda de ${2 ** (restantes + 1)}`;
}

/**
 * Arma el cuadro desde los lugares ya ordenados (de arriba hacia abajo). Un lugar `null` es un pase libre:
 * el rival avanza solo, sin partido.
 */
export function llaveDesdeCuadro(lugares: readonly (string | null)[]): Llave {
  if (!esPotenciaDeDos(lugares.length)) throw new Error('El cuadro tiene que tener 2, 4, 8, 16… lugares.');
  const totalRondas = Math.log2(lugares.length);
  let entradas: (Origen | null)[] = lugares.map((id) => (id ? { tipo: 'equipo', equipoId: id } : null));
  const rondas: RondaLlave[] = [];
  for (let r = 1; r <= totalRondas; r++) {
    const partidos: PartidoLlave[] = [];
    const siguiente: (Origen | null)[] = [];
    for (let i = 0; i < entradas.length; i += 2) {
      const a = entradas[i] ?? null;
      const b = entradas[i + 1] ?? null;
      if (a && b) {
        const posicion = i / 2 + 1;
        const clave = `${r}-${posicion}`;
        partidos.push({ clave, ronda: r, posicion, local: a, visitante: b });
        siguiente.push({ tipo: 'ganador', de: clave });
      } else {
        siguiente.push(a ?? b);
      }
    }
    if (partidos.length) rondas.push({ numero: r, nombre: nombreDeRonda(totalRondas - r), partidos });
    entradas = siguiente;
  }
  return { rondas };
}

/**
 * Llave de eliminación directa para los equipos dados, ordenados de mejor a peor semilla.
 * Si no son potencia de dos, las mejores semillas pasan la primera ronda libres.
 */
export function armarLlave(semillas: readonly string[]): Llave {
  return llaveDesdeCuadro(cuadroDeSemillas(semillas));
}

/** Lugares del cuadro (de arriba hacia abajo) para esas semillas; `null` es un pase libre. Es lo que se guarda. */
export function cuadroDeSemillas(semillas: readonly string[]): (string | null)[] {
  if (semillas.length < 2) throw new Error('Se necesitan al menos 2 equipos para armar la llave.');
  if (new Set(semillas).size !== semillas.length) throw new Error('Hay un equipo repetido en la llave.');
  return ordenDeSiembra(potenciaDeDosDesde(semillas.length)).map((s) => semillas[s - 1] ?? null);
}

/** Cuántos equipos clasifican por defecto a los playoffs de una liga: potencia de dos, entre 2 y 8. */
export function cantidadDeClasificados(equipos: number): number {
  if (equipos < 2) return 0;
  return Math.min(8, potenciaDeDosHasta(equipos));
}

/** Los primeros `cantidad` equipos de la tabla, de mejor a peor (la semilla 1 es el líder). */
export function clasificadosDeLiga(tabla: readonly { equipoId: string }[], cantidad: number): string[] {
  if (cantidad < 2) throw new Error('Tienen que clasificar al menos 2 equipos.');
  if (cantidad > tabla.length)
    throw new Error(`Se piden ${cantidad} clasificados pero la tabla tiene ${tabla.length} equipos.`);
  return tabla.slice(0, cantidad).map((f) => f.equipoId);
}

// ───────────── Sorteo y grupos ─────────────

function generador(semilla: number) {
  let s = semilla;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sorteo con cabezas de serie: las cabezas ocupan las primeras semillas (en el orden dado) y el resto
 * se mezcla al azar. Con la misma `semilla` sale siempre igual (el sorteo se puede auditar).
 */
export function sortear(
  equipoIds: readonly string[],
  cabezasDeSerie: readonly string[],
  semilla: number,
): string[] {
  for (const c of cabezasDeSerie)
    if (!equipoIds.includes(c)) throw new Error('Una cabeza de serie no está entre los equipos del torneo.');
  if (new Set(cabezasDeSerie).size !== cabezasDeSerie.length)
    throw new Error('Hay una cabeza de serie repetida.');
  const azar = generador(semilla);
  const resto = equipoIds.filter((e) => !cabezasDeSerie.includes(e));
  for (let i = resto.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [resto[i], resto[j]] = [resto[j]!, resto[i]!];
  }
  return [...cabezasDeSerie, ...resto];
}

export interface GrupoArmado {
  grupo: string;
  equipoIds: string[];
}

const LETRAS = 'ABCDEFGHIJKLMNOP';

/**
 * Reparte los equipos en `cantidad` grupos en serpentina (1ª semilla al A, 2ª al B… y vuelve):
 * los grupos quedan parejos. Los equipos deben llegar ordenados de mejor a peor semilla.
 */
export function repartirEnGrupos(equipoIds: readonly string[], cantidad: number): GrupoArmado[] {
  if (cantidad < 2 || cantidad > LETRAS.length) throw new Error('Tiene que haber entre 2 y 16 grupos.');
  if (equipoIds.length < cantidad * 3)
    throw new Error(`Para ${cantidad} grupos hacen falta al menos ${cantidad * 3} equipos (3 por grupo).`);
  const grupos: GrupoArmado[] = Array.from({ length: cantidad }, (_, i) => ({
    grupo: LETRAS[i]!,
    equipoIds: [],
  }));
  equipoIds.forEach((id, i) => {
    const vuelta = Math.floor(i / cantidad);
    const pos = i % cantidad;
    grupos[vuelta % 2 === 0 ? pos : cantidad - 1 - pos]!.equipoIds.push(id);
  });
  return grupos;
}

/**
 * Cuadro de playoffs desde los grupos. `clasificados[g]` son los que avanzan del grupo g, del 1º al último.
 * Con 2 por grupo, el 1º de un grupo se cruza con el 2º del grupo vecino (1A-2B, 1B-2A) y los vecinos
 * quedan en mitades distintas para no repetirse hasta las instancias finales. Con 1 por grupo, se siembra por orden.
 */
export function cuadroDeGrupos(clasificados: readonly (readonly string[])[]): string[] {
  const grupos = clasificados.length;
  const porGrupo = clasificados[0]?.length ?? 0;
  if (clasificados.some((c) => c.length !== porGrupo))
    throw new Error('Todos los grupos clasifican la misma cantidad.');
  if (porGrupo !== 1 && porGrupo !== 2) throw new Error('Clasifican 1 o 2 equipos por grupo.');
  if (!esPotenciaDeDos(grupos * porGrupo))
    throw new Error(
      'Los clasificados tienen que sumar 2, 4, 8, 16… (por ejemplo, 4 grupos con 2 por grupo).',
    );
  if (porGrupo === 1) {
    const orden = ordenDeSiembra(grupos);
    return orden.map((s) => clasificados[s - 1]![0]!);
  }
  if (grupos % 2 !== 0)
    throw new Error('Con 2 clasificados por grupo, la cantidad de grupos tiene que ser par.');
  const arriba: string[] = [];
  const abajo: string[] = [];
  for (let g = 0; g < grupos; g += 2) {
    arriba.push(clasificados[g]![0]!, clasificados[g + 1]![1]!); // 1º del grupo g contra 2º del vecino
    abajo.push(clasificados[g + 1]![0]!, clasificados[g]![1]!);
  }
  return [...arriba, ...abajo];
}

// ───────────── Resolución con resultados ─────────────

export interface ResultadoLlave {
  golesLocal: number;
  golesVisitante: number;
  penalesLocal?: number | null;
  penalesVisitante?: number | null;
  /** Si el partido se resolvió por W.O., el equipo que gana. */
  ganadorId?: string | null;
}

export type EstadoLlave = 'PENDIENTE' | 'LISTO' | 'DEFINIDO' | 'EMPATE_SIN_DEFINIR';

export interface PartidoResuelto extends PartidoLlave {
  localId?: string;
  visitanteId?: string;
  resultado?: ResultadoLlave;
  ganadorId?: string;
  /** PENDIENTE: falta un rival · LISTO: se puede jugar · DEFINIDO: ya tiene ganador · EMPATE_SIN_DEFINIR: falta cargar los penales. */
  estado: EstadoLlave;
}

export interface LlaveResuelta {
  rondas: (Omit<RondaLlave, 'partidos'> & { partidos: PartidoResuelto[] })[];
  campeonId?: string;
}

/** Ganador de un cruce: el W.O., el de más goles o, si empatan, el de más penales. Sin definición, `undefined`. */
export function ganadorDelCruce(localId: string, visitanteId: string, r: ResultadoLlave): string | undefined {
  if (r.ganadorId) return r.ganadorId;
  if (r.golesLocal !== r.golesVisitante) return r.golesLocal > r.golesVisitante ? localId : visitanteId;
  const pl = r.penalesLocal;
  const pv = r.penalesVisitante;
  if (pl == null || pv == null || pl === pv) return undefined;
  return pl > pv ? localId : visitanteId;
}

/**
 * Completa la llave con los resultados cargados: quién juega cada cruce, quién ganó y quién es campeón.
 * `resultados` va por clave de cruce. Un cruce sin resultado no tiene ganador y deja pendientes a los que dependen de él.
 */
export function resolverLlave(
  llave: Llave,
  resultados: Readonly<Record<string, ResultadoLlave | undefined>>,
): LlaveResuelta {
  const ganadores = new Map<string, string>();
  const idDe = (o: Origen) => (o.tipo === 'equipo' ? o.equipoId : ganadores.get(o.de));
  const rondas = llave.rondas.map((ronda) => ({
    ...ronda,
    partidos: ronda.partidos.map((p): PartidoResuelto => {
      const localId = idDe(p.local);
      const visitanteId = idDe(p.visitante);
      const base = { ...p, ...(localId ? { localId } : {}), ...(visitanteId ? { visitanteId } : {}) };
      if (!localId || !visitanteId) return { ...base, estado: 'PENDIENTE' };
      const resultado = resultados[p.clave];
      if (!resultado) return { ...base, estado: 'LISTO' };
      const ganadorId = ganadorDelCruce(localId, visitanteId, resultado);
      if (!ganadorId) return { ...base, resultado, estado: 'EMPATE_SIN_DEFINIR' };
      ganadores.set(p.clave, ganadorId);
      return { ...base, resultado, ganadorId, estado: 'DEFINIDO' };
    }),
  }));
  const final = rondas.at(-1)?.partidos[0];
  return { rondas, ...(final?.ganadorId ? { campeonId: final.ganadorId } : {}) };
}
