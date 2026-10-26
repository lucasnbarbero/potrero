import { estaDisponible, type FranjaDisponible } from './arbitros.js';
import {
  conflictosDeCalendario,
  type Lugar,
  type Movimiento,
  type PartidoCalendario,
} from './reprogramacion.js';
import type { Formato } from './tipos.js';

export interface Cruce {
  localId: string;
  visitanteId: string;
}

export interface Fecha {
  numero: number;
  cruces: Cruce[];
  /** Equipo que queda libre cuando la cantidad es impar. */
  libre?: string;
}

const LIBRE = '__libre__';

/**
 * Todos contra todos con el método de rotación (circle method).
 * Un equipo queda fijo y el resto rota; la localía del fijo alterna para equilibrar.
 * Con ida y vuelta, la segunda rueda repite los cruces con la localía invertida.
 */
export function todosContraTodos(equipoIds: readonly string[], idaYVuelta = false): Fecha[] {
  if (equipoIds.length < 2) throw new Error('Se necesitan al menos 2 equipos para armar el fixture.');
  const ids = equipoIds.length % 2 === 0 ? [...equipoIds] : [...equipoIds, LIBRE];
  const n = ids.length;
  const fechas: Fecha[] = [];
  // Localía: se le da al equipo que menos veces fue local; ante empate, al que no fue local en la fecha anterior.
  const vecesLocal = new Map<string, number>();
  const fueLocalAntes = new Set<string>();
  let rueda = [...ids];
  for (let f = 0; f < n - 1; f++) {
    const cruces: Cruce[] = [];
    let libre: string | undefined;
    const localesDeEstaFecha = new Set<string>();
    for (let i = 0; i < n / 2; i++) {
      const a = rueda[i]!;
      const b = rueda[n - 1 - i]!;
      if (a === LIBRE || b === LIBRE) {
        libre = a === LIBRE ? b : a;
        continue;
      }
      const la = vecesLocal.get(a) ?? 0;
      const lb = vecesLocal.get(b) ?? 0;
      const localEsA = la !== lb ? la < lb : fueLocalAntes.has(b) || !fueLocalAntes.has(a);
      const [local, visitante] = localEsA ? [a, b] : [b, a];
      vecesLocal.set(local, (vecesLocal.get(local) ?? 0) + 1);
      localesDeEstaFecha.add(local);
      cruces.push({ localId: local, visitanteId: visitante });
    }
    fueLocalAntes.clear();
    localesDeEstaFecha.forEach((id) => fueLocalAntes.add(id));
    fechas.push({ numero: f + 1, cruces, ...(libre ? { libre } : {}) });
    rueda = [rueda[0]!, rueda[n - 1]!, ...rueda.slice(1, n - 1)];
  }
  if (!idaYVuelta) return fechas;
  const vuelta = fechas.map((f) => ({
    numero: f.numero + fechas.length,
    cruces: f.cruces.map((c) => ({ localId: c.visitanteId, visitanteId: c.localId })),
    ...(f.libre ? { libre: f.libre } : {}),
  }));
  return [...fechas, ...vuelta];
}

/** Cantidad de partidos estimada para la vista previa del formato. */
export function cantidadDePartidos(equipos: number, formato: Formato, idaYVuelta = false): number {
  if (equipos < 2) return 0;
  const liga = ((equipos * (equipos - 1)) / 2) * (idaYVuelta ? 2 : 1);
  switch (formato) {
    case 'LIGA':
      return liga;
    case 'COPA':
      return equipos - 1;
    case 'LIGA_PLAYOFFS':
      return liga + Math.min(8, 2 ** Math.floor(Math.log2(equipos))) - 1;
    case 'GRUPOS_PLAYOFFS': {
      const grupos = Math.max(1, Math.round(equipos / 4));
      const porGrupo = equipos / grupos;
      return Math.round(grupos * ((porGrupo * (porGrupo - 1)) / 2)) + grupos * 2 - 1;
    }
  }
}

export interface Franja {
  /** Fecha calendario, formato AAAA-MM-DD. */
  dia: string;
  /** Hora local de Argentina, formato HH:MM. */
  hora: string;
  canchaId: string;
}

export interface PartidoProgramado extends Cruce {
  fecha: number;
  dia: string;
  hora: string;
  canchaId: string;
  /** Inicio en ISO 8601 con la zona horaria de Argentina (-03:00). */
  inicio: string;
}

export interface OpcionesProgramacion {
  /** Primer día de juego (AAAA-MM-DD). */
  primerDia: string;
  /** Días entre una fecha y la siguiente (7 = una por semana). */
  diasEntreFechas: number;
  horarios: readonly string[];
  canchaIds: readonly string[];
}

export function sumarDias(dia: string, dias: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Asigna día, horario y cancha a cada cruce.
 * Restricciones duras: una cancha tiene un solo partido por franja y cada equipo juega una vez por fecha
 * (garantizado por el armado de cruces). Si una fecha no entra en las franjas disponibles, falla con un mensaje claro.
 */
export function programar(fechas: readonly Fecha[], o: OpcionesProgramacion): PartidoProgramado[] {
  if (o.canchaIds.length === 0) throw new Error('Cargá al menos una cancha.');
  if (o.horarios.length === 0) throw new Error('Cargá al menos un horario.');
  const horarios = [...o.horarios].sort();
  const franjasPorFecha = horarios.length * o.canchaIds.length;
  const partidos: PartidoProgramado[] = [];
  for (const [i, f] of fechas.entries()) {
    if (f.cruces.length > franjasPorFecha)
      throw new Error(
        `La fecha ${f.numero} tiene ${f.cruces.length} partidos y solo hay ${franjasPorFecha} franjas ` +
          `(${horarios.length} horarios × ${o.canchaIds.length} canchas). Sumá horarios o canchas.`,
      );
    const dia = sumarDias(o.primerDia, i * o.diasEntreFechas);
    f.cruces.forEach((c, j) => {
      // Recorre primero las canchas y después los horarios: llena cada horario antes de pasar al siguiente.
      const hora = horarios[Math.floor(j / o.canchaIds.length)]!;
      const canchaId = o.canchaIds[j % o.canchaIds.length]!;
      partidos.push({ ...c, fecha: f.numero, dia, hora, canchaId, inicio: `${dia}T${hora}:00-03:00` });
    });
  }
  return partidos;
}

export interface Conflicto {
  tipo: 'CANCHA_OCUPADA' | 'EQUIPO_DOBLE';
  mensaje: string;
  partidos: [number, number];
}

/** Detecta conflictos en una programación (por ejemplo, después de mover un partido a mano). Advierte, no bloquea. */
export function detectarConflictos(partidos: readonly PartidoProgramado[]): Conflicto[] {
  const conflictos: Conflicto[] = [];
  for (let i = 0; i < partidos.length; i++) {
    for (let j = i + 1; j < partidos.length; j++) {
      const a = partidos[i]!;
      const b = partidos[j]!;
      if (a.inicio === b.inicio && a.canchaId === b.canchaId)
        conflictos.push({
          tipo: 'CANCHA_OCUPADA',
          mensaje: `Dos partidos en la misma cancha a las ${a.hora} del ${a.dia}.`,
          partidos: [i, j],
        });
      const equipos = [a.localId, a.visitanteId].filter((e) => e === b.localId || e === b.visitanteId);
      if (equipos.length && a.dia === b.dia)
        conflictos.push({
          tipo: 'EQUIPO_DOBLE',
          mensaje: `Un equipo juega dos partidos el ${a.dia}.`,
          partidos: [i, j],
        });
    }
  }
  return conflictos;
}

// ───────────── Mover a mano (E09-07) ─────────────
// El organizador mueve un partido a otro día, cancha u horario, o intercambia el lugar de dos partidos de la misma
// fecha. Se re-evalúan las restricciones y se explica cada conflicto; nunca se bloquea (documento 1, sección 5.2).

export interface PartidoDeLaGrilla extends PartidoCalendario {
  torneoId: string;
  fecha: number;
  arbitroId?: string | null;
}

export interface ArbitroDeLaGrilla {
  id: string;
  nombre: string;
  disponibilidad?: readonly FranjaDisponible[] | null;
}

export interface CanchaDeLaGrilla {
  id: string;
  nombre: string;
  bloqueada: boolean;
  motivoBloqueo?: string | null;
}

export type CambioDeProgramacion =
  /** Lleva el partido a otro lugar (día y hora en `inicio`, y cancha). */
  | { tipo: 'MOVER'; partidoId: string; a: Lugar }
  /** Intercambia el lugar (horario y cancha) de dos partidos de la misma fecha: "este a las 20 y aquel a las 21". */
  | { tipo: 'INTERCAMBIAR'; partidoId: string; conPartidoId: string };

export interface ConflictoDeProgramacion {
  tipo: 'CANCHA_OCUPADA' | 'EQUIPO_DOBLE' | 'CANCHA_BLOQUEADA' | 'ARBITRO_OCUPADO' | 'ARBITRO_NO_DISPONIBLE';
  /** El partido movido que tiene el conflicto. */
  partidoId: string;
  /** El otro partido involucrado, si lo hay (cancha ocupada, equipo o árbitro con dos partidos). */
  conPartidoId: string | null;
  mensaje: string;
}

export interface EvaluacionDeCambio {
  movimientos: Movimiento[];
  conflictos: ConflictoDeProgramacion[];
}

/**
 * Cómo quedaría el calendario con el cambio pedido, sin tocar nada, y qué conflictos trae: cancha ocupada o bloqueada,
 * equipo con dos partidos el mismo día (o a la misma hora) y árbitro designado con otro partido en la franja o fuera de
 * su disponibilidad. `calendario` son los partidos que ocupan canchas, equipos y árbitros (de todos los torneos).
 * Falla con un mensaje claro si el cambio no tiene sentido (mismo lugar, otra fecha, el mismo partido).
 */
export function evaluarCambioDeProgramacion(
  partidos: readonly PartidoDeLaGrilla[],
  cambio: CambioDeProgramacion,
  contexto: { arbitros?: readonly ArbitroDeLaGrilla[]; canchas?: readonly CanchaDeLaGrilla[] } = {},
): EvaluacionDeCambio {
  // Los instantes se comparan normalizados (ISO en UTC), vengan como vengan.
  const calendario = partidos.map((p) => ({ ...p, inicio: new Date(p.inicio).toISOString() }));
  const buscar = (id: string) => {
    const p = calendario.find((x) => x.id === id);
    if (!p) throw new Error('No encontramos el partido en el calendario.');
    return p;
  };
  const mismaHora = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime();
  const partido = buscar(cambio.partidoId);
  const movidos: (PartidoDeLaGrilla & { nuevo: Lugar })[] = [];
  if (cambio.tipo === 'MOVER') {
    if (mismaHora(cambio.a.inicio, partido.inicio) && cambio.a.canchaId === partido.canchaId)
      throw new Error('El partido ya está en ese día, horario y cancha.');
    movidos.push({
      ...partido,
      nuevo: { inicio: new Date(cambio.a.inicio).toISOString(), canchaId: cambio.a.canchaId },
    });
  } else {
    if (cambio.conPartidoId === cambio.partidoId) throw new Error('Elegí otro partido para intercambiar.');
    const otro = buscar(cambio.conPartidoId);
    if (otro.torneoId !== partido.torneoId || otro.fecha !== partido.fecha)
      throw new Error('Solo se pueden intercambiar partidos de la misma fecha del torneo.');
    if (mismaHora(otro.inicio, partido.inicio) && otro.canchaId === partido.canchaId)
      throw new Error('Los dos partidos ya están en el mismo lugar.');
    movidos.push(
      { ...partido, nuevo: { inicio: otro.inicio, canchaId: otro.canchaId } },
      { ...otro, nuevo: { inicio: partido.inicio, canchaId: partido.canchaId } },
    );
  }
  const ids = new Set(movidos.map((m) => m.id));
  const resto = calendario.filter((p) => !ids.has(p.id));

  // Cancha ocupada y equipo con dos partidos: la misma detección que las reprogramaciones.
  const lugarDe = (id: string) => movidos.find((m) => m.id === id)?.nuevo.inicio ?? buscar(id).inicio;
  const conflictos: ConflictoDeProgramacion[] = conflictosDeCalendario(movidos, resto).map((x) => ({
    tipo: x.tipo,
    partidoId: x.partidoId,
    conPartidoId: x.conPartidoId,
    mensaje:
      x.tipo === 'EQUIPO_DOBLE' && mismaHora(lugarDe(x.partidoId), lugarDe(x.conPartidoId))
        ? 'Un equipo juega dos partidos a la misma hora.'
        : x.mensaje,
  }));

  const canchas = new Map((contexto.canchas ?? []).map((c) => [c.id, c]));
  const arbitros = new Map((contexto.arbitros ?? []).map((a) => [a.id, a]));
  const ubicados = [
    ...resto.map((p) => ({ ...p, lugar: p.inicio })),
    ...movidos.map((m) => ({ ...m, lugar: m.nuevo.inicio })),
  ];
  for (const m of movidos) {
    const cancha = m.nuevo.canchaId ? canchas.get(m.nuevo.canchaId) : undefined;
    if (cancha?.bloqueada)
      conflictos.push({
        tipo: 'CANCHA_BLOQUEADA',
        partidoId: m.id,
        conPartidoId: null,
        mensaje: `La cancha ${cancha.nombre} está bloqueada${cancha.motivoBloqueo ? ` (${cancha.motivoBloqueo})` : ''}.`,
      });
    if (!m.arbitroId) continue;
    const arbitro = arbitros.get(m.arbitroId);
    const nombre = arbitro?.nombre ?? 'El árbitro designado';
    for (const o of ubicados) {
      if (o.id === m.id || o.arbitroId !== m.arbitroId || !mismaHora(o.lugar, m.nuevo.inicio)) continue;
      // Entre dos partidos movidos se informa una sola vez.
      if (ids.has(o.id) && o.id < m.id) continue;
      conflictos.push({
        tipo: 'ARBITRO_OCUPADO',
        partidoId: m.id,
        conPartidoId: o.id,
        mensaje: `${nombre} ya dirige otro partido a esa hora. Cambiá la designación o el horario.`,
      });
    }
    if (arbitro && !estaDisponible(arbitro.disponibilidad, m.nuevo.inicio))
      conflictos.push({
        tipo: 'ARBITRO_NO_DISPONIBLE',
        partidoId: m.id,
        conPartidoId: null,
        mensaje: `${nombre} cargó que a esa hora no está disponible. Sigue designado: revisalo.`,
      });
  }

  return {
    movimientos: movidos.map((m) => ({
      partidoId: m.id,
      de: { inicio: m.inicio, canchaId: m.canchaId },
      a: m.nuevo,
    })),
    conflictos,
  };
}
