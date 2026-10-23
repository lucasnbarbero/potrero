import { DATOS } from '../datos.js';
import type { MetodoPago, Plan } from './tipos.js';

/** Porcentaje de comisión de la plataforma según el plan (de docs/datos.json). */
export function porcentajeComision(plan: Plan): number {
  return DATOS.planes[plan].comisionPct;
}

/**
 * Comisión de Potrero sobre un cobro, en pesos enteros.
 * Solo se cobra sobre pagos con Mercado Pago: los pagos manuales no pagan comisión.
 */
export function comisionPlataforma(monto: number, plan: Plan, metodo: MetodoPago): number {
  if (metodo !== 'MERCADO_PAGO' && !DATOS.pagosManualesConComision) return 0;
  return Math.round((monto * porcentajeComision(plan)) / 100);
}

export function formatoPesos(monto: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(monto);
}
