// Sitio público: perfil del jugador (E20) y página del partido (E21). Funciones puras: la API carga los datos,
// las llama y publica solo lo que devuelven. Nunca reciben ni devuelven DNI, contacto ni fecha de nacimiento.
import { eventosVigentes, goleadores } from './acta.js';
import { type ConsentimientoBasico, esMenor, puedePublicarImagen } from './documentacion.js';
import type { EventoPartido } from './tipos.js';

// ───────────── Privacidad del jugador (E20-04) ─────────────

/** Cómo se nombra al jugador en el sitio público. Por defecto, nombre e inicial del apellido. */
export const PREFERENCIAS_NOMBRE = ['INICIALES', 'APODO', 'COMPLETO'] as const;
export type PreferenciaNombre = (typeof PREFERENCIAS_NOMBRE)[number];

export interface JugadorPrivado {
  nombre: string;
  apellido: string;
  apodo?: string | null;
  nombrePublico?: string | null;
  fechaNacimiento?: Date | string | null;
  consentimientos: readonly ConsentimientoBasico[];
}

export interface JugadorPublico {
  /** Lo único que se muestra del nombre. */
  nombre: string;
  /** Para el avatar. */
  iniciales: string;
  /** Si tiene perfil público (y se lo puede enlazar). */
  perfil: boolean;
}

const inicial = (s: string) => s.trim().charAt(0).toUpperCase();

/**
 * Qué se puede mostrar de un jugador. Un mayor tiene perfil público y se lo nombra según su preferencia
 * (por defecto "Matías P."). Un menor no tiene perfil salvo que el tutor haya dado el consentimiento de imagen;
 * sin él solo aparecen sus iniciales ("M. P.") y nunca su nombre completo.
 */
export function jugadorPublico(j: JugadorPrivado, hoy: Date): JugadorPublico {
  const menor = esMenor(j.fechaNacimiento, hoy);
  const perfil = puedePublicarPerfil(menor, j.consentimientos);
  const iniciales = `${inicial(j.nombre)}${inicial(j.apellido)}`;
  if (!perfil) return { nombre: `${inicial(j.nombre)}. ${inicial(j.apellido)}.`, iniciales, perfil };
  const apodo = j.apodo?.trim();
  if (j.nombrePublico === 'APODO' && apodo) return { nombre: apodo, iniciales, perfil };
  if (j.nombrePublico === 'COMPLETO' && !menor)
    return { nombre: `${j.nombre.trim()} ${j.apellido.trim()}`, iniciales, perfil };
  return { nombre: `${j.nombre.trim()} ${inicial(j.apellido)}.`, iniciales, perfil };
}

/** Un mayor tiene perfil público; un menor, solo con el consentimiento de imagen y la autorización del tutor. */
export function puedePublicarPerfil(menor: boolean, consentimientos: readonly ConsentimientoBasico[]) {
  return !menor || puedePublicarImagen(true, consentimientos);
}

// ───────────── Línea de tiempo del partido (E21-01) ─────────────

export type Lado = 'LOCAL' | 'VISITANTE';

export interface ItemLineaDeTiempo {
  id: string;
  minuto: number | null;
  tipo: 'GOL' | 'GOL_EN_CONTRA' | 'AMARILLA' | 'ROJA' | 'CAMBIO';
  /** Equipo del protagonista. En un gol en contra, el equipo del que lo hizo (el gol suma al otro). */
  lado: Lado;
  jugadorId: string | null;
  /** Segunda amarilla del mismo jugador en el partido: lo deja afuera. */
  segundaAmarilla: boolean;
  /** Marcador después del evento. */
  marcador: { local: number; visitante: number };
}

/**
 * Eventos vigentes del acta en orden de juego (sin anulaciones ni anulados). Los eventos sin minuto van al final
 * en el orden en que se cargaron; con el mismo minuto se respeta el orden de carga.
 */
export function lineaDeTiempo(
  eventos: readonly EventoPartido[],
  localId: string,
  visitanteId: string,
): ItemLineaDeTiempo[] {
  const vigentes = eventosVigentes(eventos)
    .map((e, orden) => ({ e, orden }))
    .filter(({ e }) => e.equipoId === localId || e.equipoId === visitanteId)
    .sort(
      (a, b) =>
        (a.e.minuto ?? Number.POSITIVE_INFINITY) - (b.e.minuto ?? Number.POSITIVE_INFINITY) ||
        a.orden - b.orden,
    );
  const marcador = { local: 0, visitante: 0 };
  const amarillas = new Map<string, number>();
  return vigentes.map(({ e }) => {
    const lado: Lado = e.equipoId === localId ? 'LOCAL' : 'VISITANTE';
    if (e.tipo === 'GOL') marcador[lado === 'LOCAL' ? 'local' : 'visitante']++;
    if (e.tipo === 'GOL_EN_CONTRA') marcador[lado === 'LOCAL' ? 'visitante' : 'local']++;
    let segundaAmarilla = false;
    if (e.tipo === 'AMARILLA' && e.jugadorId) {
      const n = (amarillas.get(e.jugadorId) ?? 0) + 1;
      amarillas.set(e.jugadorId, n);
      segundaAmarilla = n === 2;
    }
    return {
      id: e.id,
      minuto: e.minuto ?? null,
      tipo: e.tipo as ItemLineaDeTiempo['tipo'],
      lado,
      jugadorId: e.jugadorId ?? null,
      segundaAmarilla,
      marcador: { ...marcador },
    };
  });
}

// ───────────── Crónica automática (E21-02) ─────────────

export interface DatosCronica {
  /** Para elegir variantes de redacción siempre igual en el mismo partido. */
  id: string;
  local: string;
  visitante: string;
  estado: string;
  golesLocal: number | null;
  golesVisitante: number | null;
  penalesLocal?: number | null;
  penalesVisitante?: number | null;
  /** En un W.O., quién ganó. */
  ganadorWO?: Lado | null;
  /** "por la fecha 3", "por la semifinal"... */
  instancia?: string;
  lineaDeTiempo: readonly ItemLineaDeTiempo[];
  /** Nombre público de cada jugador (ya pasado por `jugadorPublico`). */
  nombres: Readonly<Record<string, string>>;
  /** Posición actual en la tabla, si el partido es de liga o de grupos. */
  tabla?: { local: { posicion: number; pts: number }; visitante: { posicion: number; pts: number } } | null;
}

const hash = (s: string) => {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
};

/** "A", "A y B", "A, B y C". */
export function enumerar(xs: readonly string[]): string {
  if (xs.length <= 1) return xs[0] ?? '';
  return `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`;
}

const minuto = (m: number | null) => (m != null ? ` a los ${m}'` : '');

/**
 * Crónica del partido armada con plantillas a partir del resultado y los eventos del acta (sin IA).
 * Devuelve párrafos; vacío si el partido todavía no se jugó.
 */
export function cronica(d: DatosCronica): string[] {
  const elegir = (opciones: readonly string[], sal: string) => opciones[hash(d.id + sal) % opciones.length]!;
  const instancia = d.instancia ? ` ${d.instancia}` : '';
  const nombre = (id: string | null) => (id ? d.nombres[id] : undefined);

  if (d.estado === 'WO' && d.ganadorWO) {
    const [g, p] = d.ganadorWO === 'LOCAL' ? [d.local, d.visitante] : [d.visitante, d.local];
    return [`${g} ganó${instancia} porque ${p} no se presentó a jugar.`];
  }
  if (d.estado !== 'FINALIZADO' || d.golesLocal == null || d.golesVisitante == null) return [];

  const gl = d.golesLocal;
  const gv = d.golesVisitante;
  const frases: string[] = [];

  // 1. El resultado.
  if (gl === gv) {
    let f =
      gl === 0
        ? elegir(
            [
              `${d.local} y ${d.visitante} igualaron sin goles${instancia}.`,
              `Empate en cero entre ${d.local} y ${d.visitante}${instancia}.`,
            ],
            'r',
          )
        : elegir(
            [
              `${d.local} y ${d.visitante} empataron ${gl} a ${gv}${instancia}.`,
              `Reparto de puntos${instancia}: ${d.local} y ${d.visitante} igualaron ${gl} a ${gv}.`,
            ],
            'r',
          );
    if (d.penalesLocal != null && d.penalesVisitante != null && d.penalesLocal !== d.penalesVisitante) {
      const ganaLocal = d.penalesLocal > d.penalesVisitante;
      f = `${f.slice(0, -1)} y se definió por penales: ${ganaLocal ? d.local : d.visitante} ganó ${Math.max(d.penalesLocal, d.penalesVisitante)} a ${Math.min(d.penalesLocal, d.penalesVisitante)}.`;
    }
    frases.push(f);
  } else {
    const ganaLocal = gl > gv;
    const [g, p, gg, gp] = ganaLocal ? [d.local, d.visitante, gl, gv] : [d.visitante, d.local, gv, gl];
    // Remontada: el ganador estuvo abajo en algún momento.
    const remonto = d.lineaDeTiempo.some((e) =>
      ganaLocal ? e.marcador.local < e.marcador.visitante : e.marcador.visitante < e.marcador.local,
    );
    let f =
      gg - gp >= 3
        ? elegir(
            [
              `${g} goleó ${gg} a ${gp} a ${p}${instancia}.`,
              `Goleada de ${g}${instancia}: ${gg} a ${gp} sobre ${p}.`,
            ],
            'r',
          )
        : elegir(
            [
              `${g} le ganó ${gg} a ${gp} a ${p}${instancia}.`,
              `${g} se impuso ${gg} a ${gp} ante ${p}${instancia}.`,
            ],
            'r',
          );
    if (!ganaLocal && gg - gp < 3) f = `${f.slice(0, -1)}, de visitante.`;
    if (remonto) f = `${f.slice(0, -1)}, y lo dio vuelta después de ir abajo en el marcador.`;
    else if (gp === 0 && gg - gp < 3) f = `${f.slice(0, -1)}, sin que le convirtieran.`;
    frases.push(f);
  }

  // 2. Los goles, por equipo.
  for (const [lado, equipo] of [
    ['LOCAL', d.local],
    ['VISITANTE', d.visitante],
  ] as const) {
    const porJugador = new Map<string, number>();
    for (const e of d.lineaDeTiempo)
      if (e.tipo === 'GOL' && e.lado === lado && nombre(e.jugadorId))
        porJugador.set(e.jugadorId!, (porJugador.get(e.jugadorId!) ?? 0) + 1);
    const autores = [...porJugador].sort((a, b) => b[1] - a[1]);
    if (autores.length === 1) {
      const [id, n] = autores[0]!;
      const x = nombre(id)!;
      frases.push(
        n === 1
          ? `${x} marcó para ${equipo}.`
          : n === 2
            ? `${x} hizo un doblete para ${equipo}.`
            : n === 3
              ? `${x} se lució con un hat-trick para ${equipo}.`
              : `${x} se despachó con ${n} goles para ${equipo}.`,
      );
    } else if (autores.length > 1) {
      frases.push(
        `Para ${equipo} convirtieron ${enumerar(autores.map(([id, n]) => (n > 1 ? `${nombre(id)} (${n})` : nombre(id)!)))}.`,
      );
    }
    const enContra = d.lineaDeTiempo.filter((e) => e.tipo === 'GOL_EN_CONTRA' && e.lado !== lado);
    if (enContra.length)
      frases.push(
        `${equipo} también sumó ${enContra.length === 1 ? 'un gol en contra' : `${enContra.length} goles en contra`}${
          enContra.length === 1 && nombre(enContra[0]!.jugadorId)
            ? ` de ${nombre(enContra[0]!.jugadorId)}`
            : ''
        }.`,
      );
  }

  // 3. Expulsiones (roja directa o segunda amarilla).
  for (const [lado, equipo] of [
    ['LOCAL', d.local],
    ['VISITANTE', d.visitante],
  ] as const) {
    const afuera = d.lineaDeTiempo.filter(
      (e) => e.lado === lado && (e.tipo === 'ROJA' || (e.tipo === 'AMARILLA' && e.segundaAmarilla)),
    );
    if (afuera.length === 0) continue;
    if (afuera.length === 1) {
      const e = afuera[0]!;
      const quien = nombre(e.jugadorId);
      frases.push(
        `${equipo} terminó con uno menos${quien ? ` por la expulsión de ${quien}` : ' por una expulsión'}${minuto(e.minuto)}${
          e.tipo === 'AMARILLA' ? ', con doble amarilla' : ''
        }.`,
      );
    } else
      frases.push(`${equipo} terminó con ${afuera.length === 2 ? 'dos' : afuera.length} jugadores menos.`);
  }

  // 4. Las amarillas.
  const amarillas = d.lineaDeTiempo.filter((e) => e.tipo === 'AMARILLA').length;
  const rojas = d.lineaDeTiempo.filter((e) => e.tipo === 'ROJA').length;
  if (amarillas + rojas === 0) frases.push('Partido limpio: no hubo tarjetas.');
  else if (amarillas > 0)
    frases.push(`El árbitro mostró ${amarillas === 1 ? 'una amarilla' : `${amarillas} amarillas`}.`);

  // Un nombre abreviado al final ("Lucas D.") no lleva otro punto.
  const parrafos = [frases.map((f) => f.replace(/\.\.$/, '.')).join(' ')];

  // 5. Cómo quedan en la tabla.
  if (d.tabla) {
    const { local: l, visitante: v } = d.tabla;
    const pts = (n: number) => (n === 1 ? '1 punto' : `${n} puntos`);
    parrafos.push(
      l.posicion === 1 || v.posicion === 1
        ? `En la tabla, ${l.posicion === 1 ? d.local : d.visitante} es puntero con ${pts(l.posicion === 1 ? l.pts : v.pts)} y ${
            l.posicion === 1 ? d.visitante : d.local
          } está ${l.posicion === 1 ? v.posicion : l.posicion}° con ${pts(l.posicion === 1 ? v.pts : l.pts)}.`
        : `En la tabla, ${d.local} está ${l.posicion}° con ${pts(l.pts)} y ${d.visitante}, ${v.posicion}° con ${pts(v.pts)}.`,
    );
  }
  return parrafos;
}

/** Goleador del partido: el que más goles hizo (con al menos uno). Empate: el que convirtió primero. */
export function goleadorDelPartido(linea: readonly ItemLineaDeTiempo[]) {
  const goles = new Map<string, { jugadorId: string; lado: Lado; goles: number }>();
  for (const e of linea) {
    if (e.tipo !== 'GOL' || !e.jugadorId) continue;
    const g = goles.get(e.jugadorId) ?? { jugadorId: e.jugadorId, lado: e.lado, goles: 0 };
    g.goles++;
    goles.set(e.jugadorId, g);
  }
  let mejor: { jugadorId: string; lado: Lado; goles: number } | null = null;
  for (const g of goles.values()) if (!mejor || g.goles > mejor.goles) mejor = g;
  return mejor;
}

// ───────────── Estadísticas y trayectoria del jugador (E20-02) ─────────────

export interface PartidoParaEstadisticas {
  estado: string;
  eventos: readonly EventoPartido[];
}

export interface EstadisticasJugador {
  /** Partidos jugados por su equipo mientras estuvo en el plantel (el acta no registra quién entró a la cancha). */
  pj: number;
  goles: number;
  amarillas: number;
  rojas: number;
  /** Con dos decimales. */
  golesPorPartido: number;
  /** Más goles en un mismo partido. */
  maximoEnUnPartido: number;
}

const conDosDecimales = (n: number) => Math.round(n * 100) / 100;

/**
 * Estadísticas de un jugador en una lista de partidos de su equipo. Solo cuentan los partidos jugados
 * (no los W.O.: sus goles no son de nadie) y los eventos vigentes del acta.
 */
export function estadisticasDelJugador(
  jugadorId: string,
  partidos: readonly PartidoParaEstadisticas[],
): EstadisticasJugador {
  let pj = 0;
  let goles = 0;
  let amarillas = 0;
  let rojas = 0;
  let maximoEnUnPartido = 0;
  for (const p of partidos) {
    if (p.estado !== 'FINALIZADO') continue;
    pj++;
    let golesDelPartido = 0;
    for (const e of eventosVigentes(p.eventos)) {
      if (e.jugadorId !== jugadorId) continue;
      if (e.tipo === 'GOL') golesDelPartido++;
      else if (e.tipo === 'AMARILLA') amarillas++;
      else if (e.tipo === 'ROJA') rojas++;
    }
    goles += golesDelPartido;
    maximoEnUnPartido = Math.max(maximoEnUnPartido, golesDelPartido);
  }
  return {
    pj,
    goles,
    amarillas,
    rojas,
    golesPorPartido: pj ? conDosDecimales(goles / pj) : 0,
    maximoEnUnPartido,
  };
}

/** Suma las estadísticas de varios torneos. */
export function sumarEstadisticas(lista: readonly EstadisticasJugador[]): EstadisticasJugador {
  const t = lista.reduce(
    (s, x) => ({
      pj: s.pj + x.pj,
      goles: s.goles + x.goles,
      amarillas: s.amarillas + x.amarillas,
      rojas: s.rojas + x.rojas,
      maximoEnUnPartido: Math.max(s.maximoEnUnPartido, x.maximoEnUnPartido),
    }),
    { pj: 0, goles: 0, amarillas: 0, rojas: 0, maximoEnUnPartido: 0 },
  );
  return { ...t, golesPorPartido: t.pj ? conDosDecimales(t.goles / t.pj) : 0 };
}

/** Fue el máximo goleador del torneo (comparte el primer puesto si hay empate). */
export function esGoleadorDelTorneo(
  jugadorId: string,
  partidos: readonly PartidoParaEstadisticas[],
): boolean {
  const tabla = goleadores(partidos.filter((p) => p.estado === 'FINALIZADO').flatMap((p) => p.eventos));
  const primero = tabla[0]?.goles ?? 0;
  return primero > 0 && tabla.some((g) => g.jugadorId === jugadorId && g.goles === primero);
}

export interface ParticipacionBasica {
  estadoTorneo: string;
  /** Para desempatar: la más nueva primero. */
  creadoEn: Date | string;
}

const PRIORIDAD_TORNEO: Record<string, number> = { EN_CURSO: 0, INSCRIPCION: 1, FINALIZADO: 2 };

/** Trayectoria ordenada: primero el torneo en curso, después los que abren inscripción y al final los terminados. */
export function ordenarTrayectoria<T extends ParticipacionBasica>(lista: readonly T[]): T[] {
  return [...lista].sort(
    (a, b) =>
      (PRIORIDAD_TORNEO[a.estadoTorneo] ?? 3) - (PRIORIDAD_TORNEO[b.estadoTorneo] ?? 3) ||
      new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime(),
  );
}

export type Logro =
  { tipo: 'GOLEADOR'; torneo: string } | { tipo: 'HAT_TRICK' } | { tipo: 'DOBLETE' } | { tipo: 'SIN_ROJAS' };

/** Logros del perfil. "Sin rojas" pide al menos 3 partidos jugados para que signifique algo. */
export function logrosDelJugador(totales: EstadisticasJugador, goleadorDe: readonly string[]): Logro[] {
  const logros: Logro[] = goleadorDe.map((torneo) => ({ tipo: 'GOLEADOR', torneo }));
  if (totales.maximoEnUnPartido >= 3) logros.push({ tipo: 'HAT_TRICK' });
  else if (totales.maximoEnUnPartido === 2) logros.push({ tipo: 'DOBLETE' });
  if (totales.pj >= 3 && totales.rojas === 0) logros.push({ tipo: 'SIN_ROJAS' });
  return logros;
}
