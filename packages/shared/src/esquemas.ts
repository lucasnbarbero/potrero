// Validaciones de entrada compartidas entre la API y los formularios de la web.
import { z } from 'zod';
import { FORMATOS, METODOS_PAGO, MODALIDADES, TIPOS_EVENTO } from './dominio/tipos.js';

const texto = (max = 120) => z.string().trim().min(1, 'Completá este campo.').max(max);
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usá el formato AAAA-MM-DD.');
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usá el formato HH:MM.');

export const registroSchema = z.object({
  nombre: texto(),
  email: z.email('Ingresá un email válido.').toLowerCase(),
  password: z.string().min(10, 'La contraseña necesita al menos 10 caracteres.').max(200),
  organizacion: texto(),
});
export type RegistroInput = z.infer<typeof registroSchema>;

export const loginSchema = z.object({
  email: z.email('Ingresá un email válido.').toLowerCase(),
  password: z.string().min(1, 'Ingresá tu contraseña.'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const crearTorneoSchema = z.object({
  nombre: texto(),
  modalidad: z.enum(MODALIDADES),
  formato: z.enum(FORMATOS),
  idaYVuelta: z.boolean().default(false),
  cupo: z.number().int().min(2).max(64),
  inscripcion: z.number().int().min(0),
  puntosVictoria: z.number().int().min(0).max(10).default(3),
  puntosEmpate: z.number().int().min(0).max(10).default(1),
  umbralAmarillas: z.number().int().min(1).max(20).default(5),
});
export type CrearTorneoInput = z.infer<typeof crearTorneoSchema>;

export const crearEquipoSchema = z.object({
  nombre: texto(80),
  capitanNombre: texto(80).optional(),
  capitanEmail: z
    .email()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  capitanTelefono: z.string().trim().max(30).optional(),
});
export type CrearEquipoInput = z.infer<typeof crearEquipoSchema>;

export const crearJugadorSchema = z.object({
  nombre: texto(60),
  apellido: texto(60),
  numero: z.number().int().min(0).max(99).optional(),
});
export type CrearJugadorInput = z.infer<typeof crearJugadorSchema>;

export const crearCanchaSchema = z.object({
  sede: texto(80),
  nombre: texto(40),
  direccion: z.string().trim().max(160).optional(),
});
export type CrearCanchaInput = z.infer<typeof crearCanchaSchema>;

export const generarFixtureSchema = z.object({
  primerDia: dia,
  diasEntreFechas: z.number().int().min(1).max(31).default(7),
  horarios: z.array(hora).min(1),
  canchaIds: z.array(z.string().min(1)).min(1),
});
export type GenerarFixtureInput = z.infer<typeof generarFixtureSchema>;

export const eventoSchema = z.object({
  tipo: z.enum(TIPOS_EVENTO).exclude(['ANULACION']),
  equipoId: z.string().min(1),
  jugadorId: z.string().min(1).optional(),
  minuto: z.number().int().min(0).max(150).optional(),
  /** Identificador generado en el dispositivo: hace idempotente la carga (base del acta offline). */
  clientUuid: z.uuid(),
});
export type EventoInput = z.infer<typeof eventoSchema>;

export const pagoManualSchema = z.object({
  metodo: z.enum(METODOS_PAGO).exclude(['MERCADO_PAGO']),
  monto: z.number().int().positive(),
  comprobante: z.string().trim().max(200).optional(),
});
export type PagoManualInput = z.infer<typeof pagoManualSchema>;

export const inscripcionPublicaSchema = z.object({
  equipo: texto(80),
  capitanNombre: texto(80),
  capitanEmail: z.email('Ingresá un email válido.'),
  capitanTelefono: z.string().trim().min(6, 'Ingresá un teléfono.').max(30),
});
export type InscripcionPublicaInput = z.infer<typeof inscripcionPublicaSchema>;
