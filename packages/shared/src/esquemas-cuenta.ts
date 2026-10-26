// Validaciones de la cuenta del usuario (E04-02, E04-10, E04-14): recuperación, verificación, perfil y organización activa.
import { z } from 'zod';

const email = z.email('Ingresá un email válido.').toLowerCase();
const passwordNueva = z
  .string()
  .min(10, 'La contraseña necesita al menos 10 caracteres.')
  .max(200, 'La contraseña es demasiado larga.');
const token = z.string().trim().min(20, 'El link no es válido.').max(200);

export const recuperarSchema = z.object({ email });
export type RecuperarInput = z.infer<typeof recuperarSchema>;

export const restablecerSchema = z.object({ token, password: passwordNueva });
export type RestablecerInput = z.infer<typeof restablecerSchema>;

export const verificarEmailSchema = z.object({ token });
export type VerificarEmailInput = z.infer<typeof verificarEmailSchema>;

export const perfilSchema = z.object({
  nombre: z.string().trim().min(1, 'Completá este campo.').max(120),
  email,
});
export type PerfilInput = z.infer<typeof perfilSchema>;

export const cambiarPasswordSchema = z
  .object({
    actual: z.string().min(1, 'Ingresá tu contraseña actual.'),
    nueva: passwordNueva,
  })
  .refine((d) => d.actual !== d.nueva, {
    path: ['nueva'],
    message: 'La contraseña nueva tiene que ser distinta de la actual.',
  });
export type CambiarPasswordInput = z.infer<typeof cambiarPasswordSchema>;

export const organizacionActivaSchema = z.object({ organizacionId: z.string().min(1) });
export type OrganizacionActivaInput = z.infer<typeof organizacionActivaSchema>;
