// Tribunal de disciplina (E14): expedientes, resolución que puede ampliar o reducir lo sugerido y historial.
import type { Reglamento } from './tipos.js';

export const TIPOS_EXPEDIENTE = [
  'ROJA_DIRECTA',
  'AGRESION',
  'INCIDENTE_HINCHADA',
  'JUGADOR_NO_HABILITADO',
  'OTRO',
] as const;
export type TipoExpediente = (typeof TIPOS_EXPEDIENTE)[number];

export const NOMBRE_TIPO_EXPEDIENTE: Record<TipoExpediente, string> = {
  ROJA_DIRECTA: 'Roja directa',
  AGRESION: 'Agresión',
  INCIDENTE_HINCHADA: 'Incidente de la hinchada',
  JUGADOR_NO_HABILITADO: 'Jugador no habilitado',
  OTRO: 'Otro',
};

export const MAX_PARTIDOS_SANCION = 20;
export const MAX_MULTA = 1_000_000;

/** Cuántos partidos sugiere el reglamento para cada tipo de expediente. La agresión y los incidentes los define el tribunal. */
export function sugeridoPorReglamento(tipo: TipoExpediente, r: Reglamento): number {
  switch (tipo) {
    case 'ROJA_DIRECTA':
      return r.suspensionRojaDirecta;
    case 'JUGADOR_NO_HABILITADO':
      return 0;
    case 'AGRESION':
      return r.suspensionRojaDirecta * 2;
    default:
      return 0;
  }
}

export type Veredicto = 'APLICADA' | 'AMPLIADA' | 'REDUCIDA' | 'ANULADA';

export interface Resolucion {
  partidos: number;
  multa: number;
  veredicto: Veredicto;
}

/** Valida lo que decide el tribunal y lo compara con lo sugerido. Devuelve el veredicto o un mensaje de error. */
export function evaluarResolucion(
  sugeridos: number,
  partidos: number,
  multa: number,
): { ok: true; resolucion: Resolucion } | { ok: false; error: string } {
  if (!Number.isInteger(partidos) || partidos < 0 || partidos > MAX_PARTIDOS_SANCION)
    return { ok: false, error: `Los partidos de suspensión van de 0 a ${MAX_PARTIDOS_SANCION}.` };
  if (!Number.isInteger(multa) || multa < 0 || multa > MAX_MULTA)
    return { ok: false, error: 'La multa tiene que ser un monto entero entre 0 y 1.000.000.' };
  const veredicto: Veredicto =
    partidos === 0 && sugeridos > 0
      ? 'ANULADA'
      : partidos > sugeridos
        ? 'AMPLIADA'
        : partidos < sugeridos
          ? 'REDUCIDA'
          : 'APLICADA';
  return { ok: true, resolucion: { partidos, multa, veredicto } };
}

export interface FilaDisciplina {
  clave: string;
  nombre: string;
  amarillas: number;
  rojas: number;
  partidosSancionados: number;
  /** Partidos de suspensión levantados pagando (E14-08): no cuentan como cumplidos. */
  partidosLevantados: number;
  multas: number;
  expedientes: number;
}

/**
 * Historial disciplinario agrupado por la clave que se elija (jugador o equipo).
 * @param items tarjetas, sanciones (en partidos) y expedientes con multa ya aplanados.
 */
export function historialDisciplinario(
  items: readonly {
    clave: string;
    nombre: string;
    amarillas?: number;
    rojas?: number;
    partidos?: number;
    levantados?: number;
    multa?: number;
    expediente?: boolean;
  }[],
): FilaDisciplina[] {
  const filas = new Map<string, FilaDisciplina>();
  for (const i of items) {
    const f = filas.get(i.clave) ?? {
      clave: i.clave,
      nombre: i.nombre,
      amarillas: 0,
      rojas: 0,
      partidosSancionados: 0,
      partidosLevantados: 0,
      multas: 0,
      expedientes: 0,
    };
    f.amarillas += i.amarillas ?? 0;
    f.rojas += i.rojas ?? 0;
    f.partidosSancionados += i.partidos ?? 0;
    f.partidosLevantados += i.levantados ?? 0;
    f.multas += i.multa ?? 0;
    if (i.expediente) f.expedientes++;
    filas.set(i.clave, f);
  }
  return [...filas.values()].sort(
    (a, b) =>
      b.partidosSancionados - a.partidosSancionados ||
      b.rojas - a.rojas ||
      b.amarillas - a.amarillas ||
      a.nombre.localeCompare(b.nombre, 'es'),
  );
}
