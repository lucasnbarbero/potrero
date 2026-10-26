// Armado flexible de torneos por fases ("Armá el formato"). Motor puro: valida y simula el formato
// (equipos, partidos y fechas por fase, calendario de sábados y recaudación) sin persistir nada.
// Hoy lo usa el simulador del panel; la versión definitiva va a crear el fixture de cada fase con esto.
import { z } from 'zod';

// ───────────── Modelo ─────────────

export const TIPOS_DE_FASE = ['TODOS_CONTRA_TODOS', 'GRUPOS', 'ELIMINACION'] as const;
export type TipoDeFase = (typeof TIPOS_DE_FASE)[number];

const idFase = z.string().min(1).max(40);
const puesto = z.number().int().min(1).max(64);

/** De dónde salen los equipos de una fase. Una fase puede tomar de varias y alimentar a varias. */
export const esquemaEntrada = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('INSCRIPTOS') }),
  /** Puestos desde–hasta de cada grupo (o de la tabla) de la fase. */
  z.object({ tipo: z.literal('PUESTOS'), fase: idFase, desde: puesto, hasta: puesto }),
  /** Los `cantidad` mejores que terminaron en ese puesto entre todos los grupos (ej.: el mejor 2º). */
  z.object({
    tipo: z.literal('MEJORES'),
    fase: idFase,
    puesto,
    cantidad: z.number().int().min(1).max(32),
  }),
  /** Ganadores o perdedores de una ronda (1 = la primera) de una eliminación. */
  z.object({ tipo: z.literal('GANADORES'), fase: idFase, ronda: z.number().int().min(1).max(8) }),
  z.object({ tipo: z.literal('PERDEDORES'), fase: idFase, ronda: z.number().int().min(1).max(8) }),
  /** Los equipos de la fase que no pasaron a ninguna otra por puesto. */
  z.object({ tipo: z.literal('NO_CLASIFICADOS'), fase: idFase }),
]);
export type EntradaDeFase = z.infer<typeof esquemaEntrada>;

export const esquemaFase = z.object({
  id: idFase,
  nombre: z.string().trim().min(1).max(60),
  tipo: z.enum(TIPOS_DE_FASE),
  entradas: z.array(esquemaEntrada).max(8),
  /** DESPUES: arranca cuando termina la fase anterior de la lista. EN_PARALELO: apenas tiene sus equipos. */
  inicio: z.enum(['DESPUES', 'EN_PARALELO']),
  /** Todos contra todos y grupos: cuántas veces se enfrentan (1 = solo ida, 2 = ida y vuelta). */
  ruedas: z.number().int().min(1).max(4),
  /** Grupos: por cantidad de grupos o por equipos por grupo. El reparto es en serpentina. */
  grupos: z.object({ modo: z.enum(['CANTIDAD', 'TAMANO']), valor: z.number().int().min(1).max(32) }),
  /**
   * Eliminación: ida y vuelta por ronda, contando desde la final (0 = final, 1 = semis, 2 = cuartos…).
   * Las rondas que no figuran toman el último valor. Empate global en ida y vuelta: penales.
   */
  idaYVuelta: z.array(z.boolean()).max(8),
  /** Eliminación: siembra estándar (1 vs último) o cruzada entre grupos (1º A vs 8º B). */
  cruces: z.enum(['SIEMBRA', 'CRUZADO_ENTRE_GRUPOS']),
});
export type FaseDeFormato = z.infer<typeof esquemaFase>;

export const esquemaFormatoFlexible = z.object({ fases: z.array(esquemaFase).min(1).max(12) });
export type FormatoFlexible = z.infer<typeof esquemaFormatoFlexible>;

export const esquemaSimulacion = z.object({
  equipos: z.number().int().min(2).max(128),
  canchas: z.number().int().min(1).max(30),
  franjasPorDia: z.number().int().min(1).max(24),
  cuotaPorFecha: z.number().int().min(0),
  inscripcion: z.number().int().min(0),
});
export type DatosDeSimulacion = z.infer<typeof esquemaSimulacion>;

/** Definición de empate global en las series de ida y vuelta. */
export const DEFINICION_DE_EMPATE = 'PENALES' as const;

// ───────────── Resultados ─────────────

export interface Problema {
  nivel: 'ERROR' | 'AVISO';
  faseId?: string;
  mensaje: string;
}

export interface RondaSimulada {
  numero: number;
  nombre: string;
  partidos: number;
  idaYVuelta: boolean;
  pasesLibres: number;
}

export interface FaseSimulada {
  id: string;
  nombre: string;
  tipo: TipoDeFase;
  equipos: number;
  /** Tamaño de cada grupo (todos contra todos = un solo grupo). */
  grupos: number[];
  rondas: RondaSimulada[];
  partidos: number;
  fechas: number;
  /** Cruces de la primera ronda de una eliminación, con etiquetas ("1º A vs 8º B"). */
  cruces: string[];
  primerSabado: number | null;
  ultimoSabado: number | null;
}

export interface SabadoSimulado {
  numero: number;
  partidos: number;
  equiposJugando: number;
  equiposLibres: number;
  porFase: { faseId: string; partidos: number; equipos: number; etiqueta: string }[];
  recaudacion: number;
}

export interface Simulacion {
  fases: FaseSimulada[];
  sabados: SabadoSimulado[];
  problemas: Problema[];
  totales: {
    sabados: number;
    partidos: number;
    capacidadPorSabado: number;
    sabadosConTodos: number;
    porcentajeConTodos: number;
    /** Promedio de sábados jugados por equipo. */
    sabadosPorEquipo: number;
    inscripcion: number;
    cuotas: number;
    recaudacion: number;
  };
}

// ───────────── Utilidades ─────────────

const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const esPotenciaDeDos = (n: number) => n >= 1 && (n & (n - 1)) === 0;
const potenciaDeDosDesde = (n: number) => (n <= 1 ? 1 : 2 ** Math.ceil(Math.log2(n)));

/** Nombre de la ronda según cuántas faltan para la final (0 = final). */
export function nombreDeRondaFlexible(restantes: number): string {
  if (restantes === 0) return 'Final';
  if (restantes === 1) return 'Semifinales';
  if (restantes === 2) return 'Cuartos de final';
  if (restantes === 3) return 'Octavos de final';
  if (restantes === 4) return '16avos de final';
  return `Ronda de ${2 ** (restantes + 1)}`;
}

/** Tamaños de los grupos al repartir `n` equipos en serpentina en `g` grupos (quedan parejos). */
export function tamanosDeGrupos(n: number, g: number): number[] {
  if (g < 1 || n < 1) return [];
  return Array.from({ length: g }, (_, i) => Math.floor(n / g) + (i < n % g ? 1 : 0));
}

function cantidadDeGrupos(fase: FaseDeFormato, equipos: number): number {
  if (fase.grupos.modo === 'CANTIDAD') return Math.max(1, Math.min(fase.grupos.valor, equipos));
  return Math.max(1, Math.round(equipos / Math.max(1, fase.grupos.valor)));
}

/** Fechas y partidos por fecha de un todos contra todos de `n` equipos. */
function fechasDeLiga(n: number, ruedas: number): number[] {
  if (n < 2) return [];
  const fechas = (n % 2 === 0 ? n - 1 : n) * ruedas;
  return Array.from({ length: fechas }, () => Math.floor(n / 2));
}

export const idaYVueltaDeRonda = (fase: Pick<FaseDeFormato, 'idaYVuelta'>, restantes: number) =>
  fase.idaYVuelta[Math.min(restantes, fase.idaYVuelta.length - 1)] ?? false;

/** Rondas de una eliminación de `n` equipos. Si no es potencia de dos, las mejores semillas pasan libres. */
export function rondasDeEliminacion(fase: Pick<FaseDeFormato, 'idaYVuelta'>, n: number): RondaSimulada[] {
  if (n < 2) return [];
  const cuadro = potenciaDeDosDesde(n);
  const total = Math.log2(cuadro);
  return Array.from({ length: total }, (_, i) => {
    const numero = i + 1;
    const restantes = total - numero;
    const partidos = numero === 1 ? n - cuadro / 2 : cuadro / 2 ** numero;
    return {
      numero,
      nombre: nombreDeRondaFlexible(restantes),
      partidos,
      idaYVuelta: idaYVueltaDeRonda(fase, restantes),
      pasesLibres: numero === 1 ? cuadro - n : 0,
    };
  });
}

// ───────────── Análisis (cantidades y problemas) ─────────────

interface FaseAnalizada {
  fase: FaseDeFormato;
  equipos: number;
  grupos: number[];
  rondas: RondaSimulada[];
  /** Partidos de cada fecha, en orden. */
  fechas: number[];
  /** Fecha (índice desde 1) con la que termina cada ronda de la eliminación. */
  finDeRonda: number[];
  etiquetas: string[];
}

interface Analisis {
  fases: FaseAnalizada[];
  problemas: Problema[];
}

const ordinal = (n: number) => `${n}º`;

function analizar(formato: FormatoFlexible, equipos: number): Analisis {
  // Los que no clasificaron dependen de lo que tomen las fases siguientes: se itera hasta que se estabiliza.
  let afuera = new Map<string, number>();
  let r = analizarPasada(formato, equipos, afuera);
  for (let k = 0; k < 4; k++) {
    const nuevo = new Map(
      r.fases
        .filter((a) => a.fase.tipo !== 'ELIMINACION')
        .map((a) => [a.fase.id, a.equipos - (r.tomados.get(a.fase.id) ?? 0)] as const),
    );
    if ([...nuevo].every(([id, n]) => afuera.get(id) === n)) break;
    afuera = nuevo;
    r = analizarPasada(formato, equipos, afuera);
  }
  for (const a of r.fases) {
    const tomados = r.tomados.get(a.fase.id) ?? 0;
    if (tomados > a.equipos)
      r.problemas.push({
        nivel: 'ERROR',
        faseId: a.fase.id,
        mensaje: `De ${a.fase.nombre} clasifican ${tomados} equipos, pero tiene ${a.equipos}.`,
      });
  }
  return { fases: r.fases, problemas: r.problemas };
}

function analizarPasada(
  formato: FormatoFlexible,
  equipos: number,
  afuera: Map<string, number>,
): Analisis & { tomados: Map<string, number> } {
  const problemas: Problema[] = [];
  const error = (mensaje: string, faseId?: string) =>
    problemas.push({ nivel: 'ERROR', mensaje, ...(faseId ? { faseId } : {}) });
  const aviso = (mensaje: string, faseId?: string) =>
    problemas.push({ nivel: 'AVISO', mensaje, ...(faseId ? { faseId } : {}) });

  const indice = new Map(formato.fases.map((f, i) => [f.id, i]));
  if (indice.size !== formato.fases.length) error('Hay dos fases con el mismo identificador.');
  const analizadas: FaseAnalizada[] = [];
  // Equipos que cada fase ya entregó a otras por puesto (para calcular los que no clasificaron).
  const tomadosPorPuesto = new Map<string, number>();
  // Puestos ya tomados de cada fase, para detectar superposiciones.
  const puestosTomados = new Map<string, Set<number>>();

  if (!formato.fases.some((f) => f.entradas.some((e) => e.tipo === 'INSCRIPTOS')))
    error('Ninguna fase toma a los inscriptos: agregá "Todos los inscriptos" en la primera fase.');

  formato.fases.forEach((fase, i) => {
    const nombre = fase.nombre;
    if (fase.entradas.length === 0) error(`${nombre} no tiene de dónde sacar equipos.`, fase.id);
    let total = 0;
    const etiquetas: string[] = [];
    for (const e of fase.entradas) {
      if (e.tipo === 'INSCRIPTOS') {
        total += equipos;
        for (let k = 1; k <= equipos; k++) etiquetas.push(`Equipo ${k}`);
        continue;
      }
      const j = indice.get(e.fase);
      const origen = j === undefined ? undefined : analizadas[j];
      if (j === undefined) {
        error(`${nombre} toma equipos de una fase que no existe.`, fase.id);
        continue;
      }
      if (j >= i || !origen) {
        error(
          `${nombre} toma equipos de ${formato.fases[j]!.nombre}, que viene después: reordená las fases.`,
          fase.id,
        );
        continue;
      }
      const deNombre = origen.fase.nombre;
      if (e.tipo === 'PUESTOS' || e.tipo === 'MEJORES' || e.tipo === 'NO_CLASIFICADOS') {
        if (origen.fase.tipo === 'ELIMINACION') {
          error(`${deNombre} es una eliminación: tomá sus ganadores o perdedores de una ronda.`, fase.id);
          continue;
        }
      }
      if (e.tipo === 'PUESTOS') {
        if (e.desde > e.hasta) {
          error(`${nombre}: el puesto "desde" (${e.desde}) es mayor que el "hasta" (${e.hasta}).`, fase.id);
          continue;
        }
        const mayor = Math.max(0, ...origen.grupos);
        if (e.hasta > mayor) {
          error(
            origen.grupos.length > 1
              ? `${nombre}: los grupos de ${deNombre} tienen ${mayor} equipos como mucho, no hay puesto ${e.hasta}.`
              : `${nombre}: ${deNombre} tiene ${mayor} equipos, no hay puesto ${e.hasta}.`,
            fase.id,
          );
        } else if (origen.grupos.some((t) => t < e.hasta))
          aviso(
            `${nombre}: algún grupo de ${deNombre} no tiene puesto ${e.hasta}; de ese grupo pasan menos.`,
            fase.id,
          );
        const usados = puestosTomados.get(origen.fase.id) ?? new Set<number>();
        for (let p = e.desde; p <= e.hasta; p++) {
          if (usados.has(p))
            error(
              `El puesto ${p} de ${deNombre} ya pasa a otra fase: los puestos no se pueden repetir.`,
              fase.id,
            );
          usados.add(p);
        }
        puestosTomados.set(origen.fase.id, usados);
        let n = 0;
        for (let p = e.desde; p <= e.hasta; p++)
          origen.grupos.forEach((t, g) => {
            if (t >= p) {
              n++;
              etiquetas.push(origen.grupos.length > 1 ? `${ordinal(p)} ${LETRAS[g]}` : ordinal(p));
            }
          });
        total += n;
        tomadosPorPuesto.set(origen.fase.id, (tomadosPorPuesto.get(origen.fase.id) ?? 0) + n);
      } else if (e.tipo === 'MEJORES') {
        const conEsePuesto = origen.grupos.filter((t) => t >= e.puesto).length;
        if (e.cantidad > conEsePuesto) {
          error(
            `${nombre}: piden los ${e.cantidad} mejores ${ordinal(e.puesto)} de ${deNombre}, pero hay ${conEsePuesto}.`,
            fase.id,
          );
          continue;
        }
        const usados = puestosTomados.get(origen.fase.id) ?? new Set<number>();
        if (usados.has(e.puesto))
          error(
            `El puesto ${e.puesto} de ${deNombre} ya pasa a otra fase: los puestos no se pueden repetir.`,
            fase.id,
          );
        total += e.cantidad;
        for (let k = 1; k <= e.cantidad; k++)
          etiquetas.push(
            e.cantidad === 1 ? `Mejor ${ordinal(e.puesto)}` : `${ordinal(k)} mejor ${ordinal(e.puesto)}`,
          );
        tomadosPorPuesto.set(origen.fase.id, (tomadosPorPuesto.get(origen.fase.id) ?? 0) + e.cantidad);
      } else if (e.tipo === 'NO_CLASIFICADOS') {
        const n = Math.max(0, afuera.get(origen.fase.id) ?? 0);
        if (n === 0) aviso(`${nombre}: en ${deNombre} clasifican todos, no queda ninguno afuera.`, fase.id);
        total += n;
        for (let k = 1; k <= n; k++) etiquetas.push(`Afuera ${deNombre} ${k}`);
      } else {
        if (origen.fase.tipo !== 'ELIMINACION') {
          error(
            `${nombre}: ${deNombre} no es una eliminación, no tiene ganadores ni perdedores de ronda.`,
            fase.id,
          );
          continue;
        }
        const ronda = origen.rondas[e.ronda - 1];
        if (!ronda) {
          error(
            `${nombre}: ${deNombre} tiene ${origen.rondas.length} rondas, no hay ronda ${e.ronda}.`,
            fase.id,
          );
          continue;
        }
        const cuadro = potenciaDeDosDesde(origen.equipos);
        const n = e.tipo === 'GANADORES' ? cuadro / 2 ** e.ronda : ronda.partidos;
        total += n;
        const quien = e.tipo === 'GANADORES' ? 'Ganador' : 'Perdedor';
        for (let k = 1; k <= n; k++) etiquetas.push(`${quien} ${ronda.nombre.split(' ')[0]} ${k}`);
      }
    }
    analizadas.push({ fase, equipos: total, grupos: [], rondas: [], fechas: [], finDeRonda: [], etiquetas });
    armarFase(analizadas[i]!);
  });

  // Validaciones por fase, ya con las cantidades definitivas.
  for (const a of analizadas) {
    const { fase } = a;
    if (fase.entradas.length && a.equipos < 2) {
      error(
        `${fase.nombre} tiene ${a.equipos} equipo${a.equipos === 1 ? '' : 's'}: hacen falta al menos 2.`,
        fase.id,
      );
      continue;
    }
    if (fase.tipo === 'GRUPOS') {
      const g = a.grupos.length;
      if (fase.grupos.modo === 'CANTIDAD' && fase.grupos.valor > a.equipos)
        error(`${fase.nombre}: ${fase.grupos.valor} grupos para ${a.equipos} equipos no alcanza.`, fase.id);
      if (a.grupos.some((t) => t < 2))
        error(`${fase.nombre}: hay grupos de menos de 2 equipos. Armá menos grupos.`, fase.id);
      else if (g > 1 && Math.min(...a.grupos) !== Math.max(...a.grupos))
        aviso(
          `${fase.nombre}: grupos desparejos (${a.grupos.join(', ')} equipos). Los de más equipos juegan más fechas.`,
          fase.id,
        );
      if (g === 1) aviso(`${fase.nombre}: con un solo grupo es un todos contra todos.`, fase.id);
    }
    if (fase.tipo === 'ELIMINACION' && a.equipos >= 2 && !esPotenciaDeDos(a.equipos)) {
      const libres = potenciaDeDosDesde(a.equipos) - a.equipos;
      aviso(
        `${fase.nombre}: ${a.equipos} equipos no cierra en 2, 4, 8, 16…: ${libres} pase${libres === 1 ? '' : 's'} libre${libres === 1 ? '' : 's'} en la primera ronda.`,
        fase.id,
      );
    }
    if (
      fase.tipo === 'ELIMINACION' &&
      fase.cruces === 'CRUZADO_ENTRE_GRUPOS' &&
      !crucesCruzados(a, formato, analizadas)
    )
      aviso(
        `${fase.nombre}: el cruce entre grupos necesita una sola entrada de puestos de una fase con cantidad par de grupos y que cierre en potencia de 2. Se usa la siembra estándar.`,
        fase.id,
      );
  }
  return { fases: analizadas, problemas, tomados: tomadosPorPuesto };
}

function armarFase(a: FaseAnalizada) {
  const { fase, equipos } = a;
  a.rondas = [];
  a.finDeRonda = [];
  if (fase.tipo === 'TODOS_CONTRA_TODOS') {
    a.grupos = equipos > 0 ? [equipos] : [];
    a.fechas = fechasDeLiga(equipos, fase.ruedas);
  } else if (fase.tipo === 'GRUPOS') {
    a.grupos = tamanosDeGrupos(equipos, cantidadDeGrupos(fase, equipos));
    const porGrupo = a.grupos.map((t) => fechasDeLiga(t, fase.ruedas));
    const largo = Math.max(0, ...porGrupo.map((f) => f.length));
    a.fechas = Array.from({ length: largo }, (_, k) => porGrupo.reduce((s, f) => s + (f[k] ?? 0), 0));
  } else {
    a.grupos = [];
    a.rondas = rondasDeEliminacion(fase, equipos);
    a.fechas = [];
    for (const r of a.rondas) {
      a.fechas.push(r.partidos);
      if (r.idaYVuelta) a.fechas.push(r.partidos);
      a.finDeRonda.push(a.fechas.length);
    }
  }
}

/** Cruces "1º A vs 8º B" para una eliminación que sale de los puestos de una fase de grupos, o null si no aplica. */
function crucesCruzados(
  a: FaseAnalizada,
  formato: FormatoFlexible,
  analizadas: FaseAnalizada[],
): string[][] | null {
  const [e, ...resto] = a.fase.entradas;
  if (!e || resto.length || e.tipo !== 'PUESTOS') return null;
  const origen = analizadas[formato.fases.findIndex((f) => f.id === e.fase)];
  if (!origen) return null;
  const g = origen.grupos.length;
  const k = e.hasta - e.desde + 1;
  if (g < 2 || g % 2 !== 0 || k % 2 !== 0 || origen.grupos.some((t) => t < e.hasta)) return null;
  if (!esPotenciaDeDos(g * k)) return null;
  const partidos: { rango: number; cruce: string[] }[] = [];
  for (let par = 0; par < g; par += 2) {
    for (let i = 1; i <= k / 2; i++) {
      for (const [x, y] of [
        [par, par + 1],
        [par + 1, par],
      ] as const) {
        const p = e.desde - 1 + i;
        const q = e.desde - 1 + (k + 1 - i);
        partidos.push({
          rango: (i - 1) * g + x,
          cruce: [`${ordinal(p)} ${LETRAS[x]}`, `${ordinal(q)} ${LETRAS[y]}`],
        });
      }
    }
  }
  partidos.sort((m, n) => m.rango - n.rango);
  if (partidos.length === 1) return [partidos[0]!.cruce];
  return ordenDeSiembraPura(partidos.length).map((s) => partidos[s - 1]!.cruce);
}

function ordenDeSiembraPura(tamano: number): number[] {
  let orden = [1, 2];
  while (orden.length < tamano) {
    const suma = orden.length * 2 + 1;
    orden = orden.flatMap((s) => [s, suma - s]);
  }
  return orden.slice(0, tamano);
}

function crucesDeLaPrimeraRonda(
  a: FaseAnalizada,
  formato: FormatoFlexible,
  analizadas: FaseAnalizada[],
): string[] {
  if (a.fase.tipo !== 'ELIMINACION' || a.equipos < 2) return [];
  const cruzados = a.fase.cruces === 'CRUZADO_ENTRE_GRUPOS' ? crucesCruzados(a, formato, analizadas) : null;
  if (cruzados) return cruzados.map(([x, y]) => `${x} vs ${y}`);
  const cuadro = potenciaDeDosDesde(a.equipos);
  const lugares = ordenDeSiembraPura(cuadro).map((s) => a.etiquetas[s - 1] ?? null);
  const cruces: string[] = [];
  for (let i = 0; i < lugares.length; i += 2) {
    const [x, y] = [lugares[i], lugares[i + 1]];
    cruces.push(x && y ? `${x} vs ${y}` : `${x ?? y} pasa libre`);
  }
  return cruces;
}

// ───────────── API pública ─────────────

/** Errores (impiden armar el torneo) y avisos (se puede, pero conviene mirarlo), en español. */
export function validarFormato(formato: FormatoFlexible, equipos: number): Problema[] {
  const problemas: Problema[] = [];
  if (equipos < 2) problemas.push({ nivel: 'ERROR', mensaje: 'Hacen falta al menos 2 equipos.' });
  if (!formato.fases.length) problemas.push({ nivel: 'ERROR', mensaje: 'Agregá al menos una fase.' });
  return [...problemas, ...analizar(formato, Math.max(0, equipos)).problemas];
}

/** Cantidad de equipos de una fase según su entrada (para los selectores de la pantalla). */
export function equiposPorFase(formato: FormatoFlexible, equipos: number): Record<string, number> {
  return Object.fromEntries(analizar(formato, equipos).fases.map((a) => [a.fase.id, a.equipos]));
}

const MAX_SABADOS = 200;

/**
 * Simula el torneo: por fase, equipos, partidos y fechas; y el calendario de sábados. Cada fase juega una
 * fecha por sábado (un equipo, un partido por fecha). Las fases en paralelo comparten sábados y se reparten
 * la capacidad (canchas × franjas) en el orden de la lista; si una fecha no entra, sigue el sábado siguiente.
 * Recaudación: inscripción × equipos + cuota por fecha × equipos que juegan cada sábado.
 */
export function simularFormato(formato: FormatoFlexible, datos: DatosDeSimulacion): Simulacion {
  const { fases: analizadas } = analizar(formato, datos.equipos);
  const problemas = validarFormato(formato, datos.equipos);
  const capacidad = Math.max(0, datos.canchas) * Math.max(0, datos.franjasPorDia);
  if (capacidad < 1)
    problemas.push({ nivel: 'ERROR', mensaje: 'Necesitás al menos una cancha y una franja por sábado.' });

  const n = analizadas.length;
  const proxima = new Array<number>(n).fill(0); // índice de la próxima fecha a jugar
  const pendienteDeFecha = analizadas.map((a) => a.fechas[0] ?? 0); // partidos que faltan de la fecha en curso
  const fin = new Array<number | null>(n).fill(null); // sábado en que terminó la fase
  const finDeFecha: number[][] = analizadas.map(() => []); // sábado en que terminó cada fecha
  const primero = new Array<number | null>(n).fill(null);
  const ultimo = new Array<number | null>(n).fill(null);
  const indice = new Map(formato.fases.map((f, i) => [f.id, i]));
  const sabados: SabadoSimulado[] = [];
  const avisoPartido = new Set<number>();

  /** Sábado desde el que la fase tiene sus equipos (null = todavía no). */
  const lista = (i: number): number | null => {
    const a = analizadas[i]!;
    let desde = 1;
    if (a.fase.inicio === 'DESPUES' && i > 0) {
      if (fin[i - 1] === null) return null;
      desde = Math.max(desde, fin[i - 1]! + 1);
    }
    for (const e of a.fase.entradas) {
      if (e.tipo === 'INSCRIPTOS') continue;
      const j = indice.get(e.fase);
      if (j === undefined || j >= i) continue;
      let listo: number | null;
      if (e.tipo === 'GANADORES' || e.tipo === 'PERDEDORES') {
        const fecha = analizadas[j]!.finDeRonda[e.ronda - 1];
        listo = fecha === undefined ? fin[j]! : (finDeFecha[j]![fecha - 1] ?? null);
      } else listo = fin[j]!;
      if (listo === null || listo === undefined) return null;
      desde = Math.max(desde, listo + 1);
    }
    return desde;
  };

  if (capacidad >= 1) {
    for (
      let vuelta = 0;
      vuelta < MAX_SABADOS * 2 && sabados.length < MAX_SABADOS && fin.some((f) => f === null);
      vuelta++
    ) {
      const s = sabados.length + 1;
      let libre = capacidad;
      let cambio = false;
      const porFase: SabadoSimulado['porFase'] = [];
      for (let i = 0; i < n; i++) {
        if (fin[i] !== null) continue;
        const a = analizadas[i]!;
        const desde = lista(i);
        if (desde === null || desde > s) continue;
        if (proxima[i]! >= a.fechas.length) {
          fin[i] = s - 1; // fase sin partidos: termina apenas tiene sus equipos
          cambio = true;
          continue;
        }
        if (libre <= 0) continue;
        const jugar = Math.min(libre, pendienteDeFecha[i]!);
        if (jugar < pendienteDeFecha[i]! && a.fechas[proxima[i]!]! > capacidad) avisoPartido.add(i);
        libre -= jugar;
        pendienteDeFecha[i]! -= jugar;
        primero[i] ??= s;
        ultimo[i] = s;
        porFase.push({
          faseId: a.fase.id,
          partidos: jugar,
          equipos: jugar * 2,
          etiqueta: etiquetaDeFecha(a, proxima[i]!),
        });
        if (pendienteDeFecha[i] === 0) {
          finDeFecha[i]!.push(s);
          proxima[i]!++;
          pendienteDeFecha[i] = a.fechas[proxima[i]!] ?? 0;
          if (proxima[i]! >= a.fechas.length) fin[i] = s;
        }
      }
      // Fases que terminaron sin jugar este sábado (vacías) no generan sábado.
      // Nadie jugó: si alguna fase vacía terminó, se reintenta el mismo sábado; si no, el resto no puede arrancar.
      if (!porFase.length) {
        if (cambio) continue;
        break;
      }
      const partidos = porFase.reduce((t, p) => t + p.partidos, 0);
      const jugando = porFase.reduce((t, p) => t + p.equipos, 0);
      sabados.push({
        numero: sabados.length + 1,
        partidos,
        equiposJugando: jugando,
        equiposLibres: Math.max(0, datos.equipos - jugando),
        porFase,
        recaudacion: jugando * datos.cuotaPorFecha,
      });
    }
  }
  for (const i of avisoPartido) {
    const a = analizadas[i]!;
    problemas.push({
      nivel: 'AVISO',
      faseId: a.fase.id,
      mensaje: `${a.fase.nombre}: una fecha tiene ${Math.max(...a.fechas)} partidos y por sábado entran ${capacidad}. La fecha se completa el sábado siguiente.`,
    });
  }

  const fases: FaseSimulada[] = analizadas.map((a, i) => ({
    id: a.fase.id,
    nombre: a.fase.nombre,
    tipo: a.fase.tipo,
    equipos: a.equipos,
    grupos: a.grupos,
    rondas: a.rondas,
    partidos: a.fechas.reduce((t, p) => t + p, 0),
    fechas: a.fechas.length,
    cruces: crucesDeLaPrimeraRonda(a, formato, analizadas),
    primerSabado: primero[i] ?? null,
    ultimoSabado: ultimo[i] ?? null,
  }));
  const partidos = sabados.reduce((t, s) => t + s.partidos, 0);
  const sabadosConTodos = sabados.filter((s) => s.equiposLibres === 0).length;
  const cuotas = sabados.reduce((t, s) => t + s.recaudacion, 0);
  const inscripcion = datos.equipos * datos.inscripcion;
  const partidosJugados = sabados.reduce((t, s) => t + s.equiposJugando, 0);
  return {
    fases,
    sabados,
    problemas,
    totales: {
      sabados: sabados.length,
      partidos,
      capacidadPorSabado: capacidad,
      sabadosConTodos,
      porcentajeConTodos: sabados.length ? Math.round((sabadosConTodos / sabados.length) * 100) : 0,
      sabadosPorEquipo: datos.equipos > 0 ? Math.round((partidosJugados / datos.equipos) * 10) / 10 : 0,
      inscripcion,
      cuotas,
      recaudacion: inscripcion + cuotas,
    },
  };
}

function etiquetaDeFecha(a: FaseAnalizada, fecha: number): string {
  if (a.fase.tipo !== 'ELIMINACION') return `Fecha ${fecha + 1}`;
  let k = 0;
  for (const r of a.rondas) {
    if (fecha === k) return r.idaYVuelta ? `${r.nombre} (ida)` : r.nombre;
    if (r.idaYVuelta && fecha === k + 1) return `${r.nombre} (vuelta)`;
    k += r.idaYVuelta ? 2 : 1;
  }
  return `Fecha ${fecha + 1}`;
}

// ───────────── Textos legibles ─────────────

/** "Los 8 primeros de cada grupo de Fase 1", "Los perdedores de Octavos de final de Playoffs"… */
export function describirEntrada(e: EntradaDeFase, formato: FormatoFlexible, equipos: number): string {
  if (e.tipo === 'INSCRIPTOS') return 'Todos los inscriptos';
  const origen = formato.fases.find((f) => f.id === e.fase);
  const de = origen?.nombre ?? 'una fase que no existe';
  const deCada = origen?.tipo === 'GRUPOS' ? `de cada grupo de ${de}` : `de ${de}`;
  switch (e.tipo) {
    case 'PUESTOS':
      if (e.desde === 1 && e.hasta === 1) return `El 1º ${deCada}`;
      if (e.desde === 1) return `Los ${e.hasta} primeros ${deCada}`;
      if (e.desde === e.hasta) return `El ${ordinal(e.desde)} ${deCada}`;
      return `Del ${ordinal(e.desde)} al ${ordinal(e.hasta)} ${deCada}`;
    case 'MEJORES':
      return e.cantidad === 1
        ? `El mejor ${ordinal(e.puesto)} entre los grupos de ${de}`
        : `Los ${e.cantidad} mejores ${ordinal(e.puesto)} entre los grupos de ${de}`;
    case 'NO_CLASIFICADOS':
      return `Los que no clasificaron de ${de}`;
    case 'GANADORES':
    case 'PERDEDORES': {
      const n = origen ? (equiposPorFase(formato, equipos)[origen.id] ?? 0) : 0;
      const ronda = origen ? rondasDeEliminacion(origen, n)[e.ronda - 1] : undefined;
      const nombre = ronda?.nombre ?? `la ronda ${e.ronda}`;
      return `Los ${e.tipo === 'GANADORES' ? 'ganadores' : 'perdedores'} de ${nombre} de ${de}`;
    }
  }
}

// ───────────── Plantillas ─────────────

type Parcial = Partial<FaseDeFormato> & Pick<FaseDeFormato, 'id' | 'nombre' | 'tipo' | 'entradas'>;
export const nuevaFase = (f: Parcial): FaseDeFormato => ({
  inicio: 'DESPUES',
  ruedas: 1,
  grupos: { modo: 'CANTIDAD', valor: 2 },
  idaYVuelta: [false],
  cruces: 'SIEMBRA',
  ...f,
});

const INSCRIPTOS: EntradaDeFase[] = [{ tipo: 'INSCRIPTOS' }];
const potenciaDeDosHasta = (n: number) => (n < 1 ? 0 : 2 ** Math.floor(Math.log2(n)));

export interface OpcionesCopaEstimulo {
  /** Grupos de la fase 1. Por defecto 2. */
  grupos?: number;
  /** Clasificados por grupo a los playoffs. Por defecto, los que dan la mayor potencia de 2 menor a los equipos. */
  clasificanPorGrupo?: number;
  /** Playoffs ida y vuelta salvo la final. Por defecto sí. */
  idaYVuelta?: boolean;
  finalIdaYVuelta?: boolean;
  /** Equipos por grupo de la copa estímulo. Por defecto 4. */
  equiposPorGrupoCopa?: number;
}

export const PLANTILLAS_DE_FORMATO = [
  { clave: 'LIGA', nombre: 'Liga', descripcion: 'Todos contra todos, una rueda.' },
  { clave: 'LIGA_IDA_Y_VUELTA', nombre: 'Liga ida y vuelta', descripcion: 'Todos contra todos, dos ruedas.' },
  { clave: 'COPA', nombre: 'Copa', descripcion: 'Eliminación directa desde el arranque.' },
  { clave: 'GRUPOS_PLAYOFFS', nombre: 'Grupos + playoffs', descripcion: 'Zonas y cruces entre grupos.' },
  {
    clave: 'LIGA_PLAYOFFS',
    nombre: 'Liga + playoffs',
    descripcion: 'Liga y después llaves con los mejores.',
  },
  {
    clave: 'GRUPOS_PLAYOFFS_COPA',
    nombre: 'Grupos + playoffs + copa estímulo',
    descripcion: 'Nadie se queda sin jugar: los eliminados van a una segunda copa.',
  },
] as const;
export type PlantillaDeFormato = (typeof PLANTILLAS_DE_FORMATO)[number]['clave'];

export function plantillaLiga(_equipos: number, ruedas = 1): FormatoFlexible {
  return {
    fases: [
      nuevaFase({
        id: 'f1',
        nombre: ruedas > 1 ? 'Liga (ida y vuelta)' : 'Liga',
        tipo: 'TODOS_CONTRA_TODOS',
        entradas: INSCRIPTOS,
        ruedas,
      }),
    ],
  };
}

export function plantillaCopa(_equipos: number, idaYVuelta = false): FormatoFlexible {
  return {
    fases: [
      nuevaFase({
        id: 'f1',
        nombre: 'Copa',
        tipo: 'ELIMINACION',
        entradas: INSCRIPTOS,
        idaYVuelta: [false, idaYVuelta],
      }),
    ],
  };
}

export function plantillaLigaPlayoffs(equipos: number): FormatoFlexible {
  const clasifican = Math.max(2, Math.min(8, potenciaDeDosHasta(equipos)));
  return {
    fases: [
      nuevaFase({ id: 'f1', nombre: 'Liga', tipo: 'TODOS_CONTRA_TODOS', entradas: INSCRIPTOS }),
      nuevaFase({
        id: 'f2',
        nombre: 'Playoffs',
        tipo: 'ELIMINACION',
        entradas: [{ tipo: 'PUESTOS', fase: 'f1', desde: 1, hasta: clasifican }],
      }),
    ],
  };
}

export function plantillaGruposPlayoffs(equipos: number): FormatoFlexible {
  // Grupos de 4 o 5, en cantidad potencia de 2, con los 2 primeros a los cruces.
  const grupos = Math.max(2, Math.min(8, potenciaDeDosHasta(Math.floor(equipos / 4))));
  return {
    fases: [
      nuevaFase({
        id: 'f1',
        nombre: 'Fase de grupos',
        tipo: 'GRUPOS',
        entradas: INSCRIPTOS,
        grupos: { modo: 'CANTIDAD', valor: grupos },
      }),
      nuevaFase({
        id: 'f2',
        nombre: 'Playoffs',
        tipo: 'ELIMINACION',
        entradas: [{ tipo: 'PUESTOS', fase: 'f1', desde: 1, hasta: 2 }],
        cruces: 'CRUZADO_ENTRE_GRUPOS',
      }),
    ],
  };
}

/**
 * El formato de una liga real: fase 1 en grupos todos contra todos; los mejores a playoffs ida y vuelta
 * (final a partido único); los eliminados en la primera ronda más los que no clasificaron juegan una
 * copa estímulo en grupos de 4, en paralelo, y sus mejores van a semifinal y final.
 */
export function plantillaGruposPlayoffsCopa(equipos: number, o: OpcionesCopaEstimulo = {}): FormatoFlexible {
  const grupos = o.grupos ?? 2;
  const porGrupo =
    o.clasificanPorGrupo ?? Math.max(1, Math.floor(potenciaDeDosHasta(Math.max(2, equipos - 1)) / grupos));
  const playoffs = grupos * porGrupo;
  const idaYVuelta = o.idaYVuelta ?? true;
  const copa = Math.max(0, equipos - playoffs) + Math.floor(playoffs / 2);
  const tamanoCopa = o.equiposPorGrupoCopa ?? 4;
  const gruposCopa = Math.max(1, Math.round(copa / tamanoCopa));
  const finalistasCopa = Math.max(2, potenciaDeDosDesde(gruposCopa));
  const mejoresSegundos = Math.min(gruposCopa, finalistasCopa - gruposCopa);
  return {
    fases: [
      nuevaFase({
        id: 'f1',
        nombre: 'Fase 1',
        tipo: 'GRUPOS',
        entradas: INSCRIPTOS,
        grupos: { modo: 'CANTIDAD', valor: grupos },
      }),
      nuevaFase({
        id: 'f2',
        nombre: 'Playoffs',
        tipo: 'ELIMINACION',
        entradas: [{ tipo: 'PUESTOS', fase: 'f1', desde: 1, hasta: porGrupo }],
        idaYVuelta: [o.finalIdaYVuelta ?? false, idaYVuelta],
        cruces: 'CRUZADO_ENTRE_GRUPOS',
      }),
      nuevaFase({
        id: 'f3',
        nombre: 'Copa estímulo',
        tipo: 'GRUPOS',
        entradas: [
          { tipo: 'PERDEDORES', fase: 'f2', ronda: 1 },
          { tipo: 'NO_CLASIFICADOS', fase: 'f1' },
        ],
        grupos: { modo: 'TAMANO', valor: tamanoCopa },
        inicio: 'EN_PARALELO',
      }),
      nuevaFase({
        id: 'f4',
        nombre: 'Copa estímulo · Final',
        tipo: 'ELIMINACION',
        entradas: [
          { tipo: 'PUESTOS', fase: 'f3', desde: 1, hasta: 1 },
          ...(mejoresSegundos > 0
            ? [{ tipo: 'MEJORES' as const, fase: 'f3', puesto: 2, cantidad: mejoresSegundos }]
            : []),
        ],
        inicio: 'EN_PARALELO',
      }),
    ],
  };
}

export function plantillaDeFormato(clave: PlantillaDeFormato, equipos: number): FormatoFlexible {
  switch (clave) {
    case 'LIGA':
      return plantillaLiga(equipos);
    case 'LIGA_IDA_Y_VUELTA':
      return plantillaLiga(equipos, 2);
    case 'COPA':
      return plantillaCopa(equipos);
    case 'GRUPOS_PLAYOFFS':
      return plantillaGruposPlayoffs(equipos);
    case 'LIGA_PLAYOFFS':
      return plantillaLigaPlayoffs(equipos);
    case 'GRUPOS_PLAYOFFS_COPA':
      return plantillaGruposPlayoffsCopa(equipos);
  }
}
