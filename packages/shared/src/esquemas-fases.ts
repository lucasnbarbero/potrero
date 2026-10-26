// Esquemas de los torneos por fases (ADR-026): crear el torneo desde "Armá el formato" y generar cada fase.
import { z } from 'zod';
import { cobrosPorFechaSchema } from './esquemas.js';
import { MODALIDADES } from './dominio/tipos.js';
import { esquemaFormatoFlexible } from './dominio/formato.js';

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usá el formato AAAA-MM-DD.');
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usá el formato HH:MM.');

export const crearTorneoFlexibleSchema = z.object({
  nombre: z.string().trim().min(1, 'Completá este campo.').max(120),
  modalidad: z.enum(MODALIDADES),
  cupo: z.number().int().min(2).max(128),
  inscripcion: z.number().int().min(0),
  puntosVictoria: z.number().int().min(0).max(10).default(3),
  puntosEmpate: z.number().int().min(0).max(10).default(1),
  umbralAmarillas: z.number().int().min(1).max(20).default(5),
  cobrosPorFecha: cobrosPorFechaSchema.partial().optional(),
  formato: esquemaFormatoFlexible,
});
export type CrearTorneoFlexibleInput = z.infer<typeof crearTorneoFlexibleSchema>;

/** Programación de una fase: liga y grupos usan días entre fechas; la eliminación, días entre rondas (y entre ida y vuelta). */
export const generarFaseSchema = z.object({
  primerDia: dia,
  diasEntreFechas: z.number().int().min(1).max(31).default(7),
  horarios: z.array(hora).min(1, 'Elegí al menos un horario.'),
  canchaIds: z.array(z.string().min(1)).min(1, 'Elegí al menos una cancha.'),
});
export type GenerarFaseInput = z.infer<typeof generarFaseSchema>;
