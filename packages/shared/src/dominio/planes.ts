// Planes de suscripción (modelo de cobro): cuota mensual, límites y módulos de cada plan. Cifras en docs/datos.json.
import { DATOS } from '../datos.js';
import type { Plan } from './tipos.js';

export type ModuloPlan = (typeof DATOS.planes)[Plan]['modulos'][number];
export type RecursoLimitado = 'torneosActivos' | 'equiposActivos' | 'usuarios';

export const nombrePlan = (plan: Plan) => DATOS.planes[plan].nombre;

/** Cuota mensual que paga la organización: la del plan, con el descuento de por vida si es liga fundadora. */
export function cuotaMensual(plan: Plan, fundadora = false): number {
  const base = DATOS.planes[plan].cuotaMensual;
  return fundadora ? Math.round((base * (100 - DATOS.ligasFundadoras.descuentoPct)) / 100) : base;
}

/** Ingreso mensual recurrente de Gregal por suscripciones. */
export function mrr(orgs: readonly { plan: Plan; fundadora: boolean }[]): number {
  return orgs.reduce((s, o) => s + cuotaMensual(o.plan, o.fundadora), 0);
}

export function tieneModulo(plan: Plan, modulo: ModuloPlan): boolean {
  return (DATOS.planes[plan].modulos as readonly string[]).includes(modulo);
}

/** El plan más barato que incluye el módulo (para sugerir el cambio). */
export function planQueIncluye(modulo: ModuloPlan): Plan {
  return (['TORNEO', 'LIGA', 'PRO'] as const).find((p) => tieneModulo(p, modulo)) ?? 'PRO';
}

export function limiteDelPlan(plan: Plan, recurso: RecursoLimitado): number | null {
  return DATOS.planes[plan].limites[recurso];
}

const QUE: Record<RecursoLimitado, [string, string]> = {
  torneosActivos: ['torneo activo', 'torneos activos'],
  equiposActivos: ['equipo activo', 'equipos activos'],
  usuarios: ['usuario', 'usuarios'],
};

/**
 * Si la organización puede sumar `nuevos` del recurso teniendo `actuales`. Devuelve null si puede o el mensaje para el
 * usuario si el plan no lo permite (con el plan al que conviene pasar).
 */
export function motivoFueraDeLimite(
  plan: Plan,
  recurso: RecursoLimitado,
  actuales: number,
  nuevos = 1,
): string | null {
  const limite = limiteDelPlan(plan, recurso);
  if (limite === null || actuales + nuevos <= limite) return null;
  const siguiente = (['TORNEO', 'LIGA', 'PRO'] as const).find((p) => {
    const l = limiteDelPlan(p, recurso);
    return l === null || actuales + nuevos <= l;
  })!;
  const [uno, varios] = QUE[recurso];
  return `Tu plan ${nombrePlan(plan)} permite ${limite} ${limite === 1 ? uno : varios}: pasá a ${nombrePlan(siguiente)}.`;
}

export function motivoSinModulo(plan: Plan, modulo: ModuloPlan, nombre: string): string | null {
  if (tieneModulo(plan, modulo)) return null;
  return `${nombre} no está en tu plan ${nombrePlan(plan)}: pasá a ${nombrePlan(planQueIncluye(modulo))}.`;
}
