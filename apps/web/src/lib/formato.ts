// Formatos para Argentina: pesos, fechas y horas en la zona horaria de Buenos Aires.
export { formatoPesos as pesos } from '@potrero/shared';

const ZONA = 'America/Argentina/Buenos_Aires';

export const fechaCorta = (iso: string | Date | null) =>
  iso
    ? new Intl.DateTimeFormat('es-AR', {
        timeZone: ZONA,
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }).format(new Date(iso))
    : '—';

export const hora = (iso: string | Date | null) =>
  iso
    ? new Intl.DateTimeFormat('es-AR', {
        timeZone: ZONA,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(new Date(iso))
    : '—';

export const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

/** Color estable para el escudo de un equipo a partir de su nombre. */
export function colorEquipo(nombre: string) {
  const colores = [
    '#0a0a0a',
    '#2563eb',
    '#dc2626',
    '#16a34a',
    '#9333ea',
    '#ea580c',
    '#0891b2',
    '#be185d',
    '#4d7c0f',
    '#7c2d12',
  ];
  let h = 0;
  for (const c of nombre) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return colores[h % colores.length]!;
}
