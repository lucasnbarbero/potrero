// Validaciones de entrada de usuarios e invitaciones (E04-09) y del panel del capitán (E19).
import { z } from 'zod';
import { ROLES_INVITABLES } from './dominio/usuarios.js';

const texto = (max = 120) => z.string().trim().min(1, 'Completá este campo.').max(max);

export const invitarSchema = z.object({
  email: z.email('Ingresá un email válido.').toLowerCase(),
  nombre: texto(80).optional(),
  rol: z.enum(ROLES_INVITABLES, 'Elegí un rol.'),
  /** Solo para CAPITAN. */
  equipoId: z.string().min(1).optional(),
});
export type InvitarInput = z.infer<typeof invitarSchema>;

/** Aceptar una invitación: con cuenta nueva (nombre y contraseña) o con la contraseña de la cuenta que ya existe. */
export const aceptarInvitacionSchema = z.object({
  nombre: texto(80).optional(),
  password: z.string().min(1, 'Ingresá tu contraseña.').max(200),
});
export type AceptarInvitacionInput = z.infer<typeof aceptarInvitacionSchema>;

export const altaJugadorCapitanSchema = z.object({
  nombre: texto(60),
  apellido: texto(60),
  numero: z.number().int().min(0).max(99).optional(),
  /** Opcional: con DNI se detectan duplicados entre equipos (queda cifrado, como lo carga el organizador). */
  dni: z
    .string()
    .trim()
    .regex(/^[\d.\s]{7,12}$/, 'El DNI son 7 u 8 números')
    .optional(),
  fechaNacimiento: z.iso.date().optional(),
});
export type AltaJugadorCapitanInput = z.infer<typeof altaJugadorCapitanSchema>;

export const respuestaConvocatoriaSchema = z.object({
  jugadorId: z.string().min(1),
  respuesta: z.enum(['VA', 'NO_VA', 'PENDIENTE']),
});
export type RespuestaConvocatoriaInput = z.infer<typeof respuestaConvocatoriaSchema>;
