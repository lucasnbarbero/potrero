// Límites del plan de suscripción (E26-02). La regla es pura (`motivoFueraDeLimite` de @potrero/shared); acá solo se
// cuenta lo que la organización ya tiene, dentro de su transacción con RLS.
import { motivoFueraDeLimite, type Plan, type RecursoLimitado } from '@potrero/shared';
import { enSerie, type Tx } from '../db/db.service.js';
import { ErrorNegocio } from './http.js';

/** Roles que cuentan como usuarios del plan (capitanes y jugadores no). */
const ROLES_DE_USUARIO = ['DUENO', 'ADMINISTRADOR', 'TESORERO', 'ARBITRO', 'TRIBUNAL'] as const;

async function cuantos(tx: Tx, recurso: RecursoLimitado): Promise<number> {
  switch (recurso) {
    // Un torneo cuenta como activo mientras no terminó (el borrador también: va a ocupar el lugar).
    case 'torneosActivos':
      return tx.torneo.count({ where: { estado: { not: 'FINALIZADO' } } });
    // Equipos distintos inscriptos (sin bajas) en torneos que no terminaron.
    case 'equiposActivos':
      return (
        await tx.inscripcion.groupBy({
          by: ['equipoId'],
          where: { estado: { not: 'BAJA' }, torneo: { estado: { not: 'FINALIZADO' } } },
        })
      ).length;
    // Miembros y las invitaciones que siguen pendientes (cada una va a ser un usuario más).
    case 'usuarios': {
      const roles = { in: [...ROLES_DE_USUARIO] };
      const [miembros, invitaciones] = await enSerie([
        () => tx.membresia.count({ where: { rol: roles } }),
        () =>
          tx.invitacion.count({
            where: {
              rol: roles,
              aceptadaEn: null,
              rechazadaEn: null,
              anuladaEn: null,
              venceEn: { gt: new Date() },
            },
          }),
      ]);
      return miembros + invitaciones;
    }
  }
}

/** Corta con un error claro si el plan de la organización no permite sumar `nuevos` del recurso. */
export async function exigirLimiteDelPlan(
  tx: Tx,
  organizacionId: string,
  recurso: RecursoLimitado,
  o: { nuevos?: number; equipoId?: string } = {},
) {
  const { plan } = await tx.organizacion.findUniqueOrThrow({
    where: { id: organizacionId },
    select: { plan: true },
  });
  // Un equipo que ya juega otro torneo activo no suma un equipo activo más.
  if (recurso === 'equiposActivos' && o.equipoId) {
    const ya = await tx.inscripcion.findFirst({
      where: { equipoId: o.equipoId, estado: { not: 'BAJA' }, torneo: { estado: { not: 'FINALIZADO' } } },
      select: { id: true },
    });
    if (ya) return;
  }
  const motivo = motivoFueraDeLimite(plan as Plan, recurso, await cuantos(tx, recurso), o.nuevos ?? 1);
  if (motivo) throw new ErrorNegocio(motivo);
}

export const esRolDeUsuario = (rol: string) => (ROLES_DE_USUARIO as readonly string[]).includes(rol);
