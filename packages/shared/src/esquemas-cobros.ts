// Validaciones de entrada de los pagos manuales (completos o parciales), la edición y el estado del torneo.
import { z } from 'zod';

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usá el formato AAAA-MM-DD.');

/** Pago en efectivo o transferencia de un equipo. Sin `cargoId`, cubre sus cargos pendientes por vencimiento. */
export const registrarPagoSchema = z.object({
  metodo: z.enum(['EFECTIVO', 'TRANSFERENCIA'], 'Elegí el medio de pago.'),
  monto: z
    .number('Ingresá el monto.')
    .int('El monto va en pesos, sin centavos.')
    .positive('Ingresá el monto.'),
  /** Día en que se cobró (AAAA-MM-DD). Por defecto, hoy. */
  fecha: dia.optional(),
  comprobante: z.string().trim().max(200).optional(),
  cargoId: z.string().min(1).optional(),
});
export type RegistrarPagoInput = z.infer<typeof registrarPagoSchema>;

export const anularPagoSchema = z.object({ motivo: z.string().trim().max(200).optional() });
export type AnularPagoInput = z.infer<typeof anularPagoSchema>;

export const editarTorneoSchema = z.object({
  nombre: z.string().trim().min(1, 'Completá este campo.').max(120).optional(),
  cupo: z.number().int().min(2, 'El cupo mínimo es 2.').max(64).optional(),
  inscripcion: z.number().int().min(0).optional(),
  /** Vencimiento del pago de la inscripción; null lo saca. */
  venceInscripcion: dia.nullable().optional(),
  puntosVictoria: z.number().int().min(0).max(10).optional(),
  puntosEmpate: z.number().int().min(0).max(10).optional(),
  umbralAmarillas: z.number().int().min(1).max(20).optional(),
});
export type EditarTorneoInput = z.infer<typeof editarTorneoSchema>;

export const estadoTorneoSchema = z.object({
  estado: z.enum(['INSCRIPCION', 'EN_CURSO', 'FINALIZADO']),
  /** Finalizar con partidos sin jugar exige confirmarlo. */
  confirmar: z.boolean().optional(),
});
export type EstadoTorneoInput = z.infer<typeof estadoTorneoSchema>;
