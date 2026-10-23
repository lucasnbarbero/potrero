// Formatos de fecha para los textos que arma la API (mensajes). Siempre en la zona horaria de Buenos Aires.
const ZONA = 'America/Argentina/Buenos_Aires';

/** "sáb 24/10 · 19:00" */
export function cuandoDe(fecha: Date): string {
  const partes = new Intl.DateTimeFormat('es-AR', {
    timeZone: ZONA,
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha);
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? '';
  return `${p('weekday').replace('.', '')} ${p('day')}/${p('month')} · ${p('hour')}:${p('minute')}`;
}

/** La fecha de hoy en Argentina, como AAAA-MM-DD. */
export function hoyEnArgentina(ahora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
  return partes; // en-CA ya da AAAA-MM-DD
}

/** "2026-10-23 14:05": fecha y hora de Argentina, ordenable (para exportaciones). */
export function fechaHoraAR(fecha: Date): string {
  const hora = new Intl.DateTimeFormat('es-AR', {
    timeZone: ZONA,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(fecha);
  return `${hoyEnArgentina(fecha)} ${hora}`;
}
