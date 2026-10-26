import type { TipoDeFase } from '@potrero/shared';

/** Color de cada fase (en el orden de la lista): fondo y texto legible encima. */
const PALETA: [string, string][] = [
  ['#d6ff3d', '#0a0a0a'],
  ['#0a0a0a', '#ffffff'],
  ['#7aa2ff', '#0a0a0a'],
  ['#ff9f43', '#0a0a0a'],
  ['#f472b6', '#0a0a0a'],
  ['#2dd4bf', '#0a0a0a'],
  ['#a78bfa', '#0a0a0a'],
  ['#facc15', '#0a0a0a'],
];

export const colorDeFase = (i: number) => PALETA[i % PALETA.length]![0];
export const tintaDeFase = (i: number) => PALETA[i % PALETA.length]![1];

export const NOMBRE_DE_TIPO: Record<TipoDeFase, string> = {
  TODOS_CONTRA_TODOS: 'Todos contra todos',
  GRUPOS: 'Grupos',
  ELIMINACION: 'Eliminación',
};

/** Fecha corta (d/m) del sábado número `n`, contando desde el primero. */
export function diaDelSabado(primero: Date | null, n: number): string {
  if (!primero) return '';
  const d = new Date(primero);
  d.setDate(d.getDate() + (n - 1) * 7);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/** El próximo sábado a partir de hoy. */
export function proximoSabado(hoy = new Date()): Date {
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  return d;
}
