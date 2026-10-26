// Usuarios de la organización (E04-09, E04-06): quién puede invitar a quién, estado de una invitación y cuándo se
// puede quitar un acceso. El dueño no se invita: nace con la organización y nunca se queda sin uno.
import { DATOS } from '../datos.js';

export const ROLES = [
  'DUENO',
  'ADMINISTRADOR',
  'TESORERO',
  'ARBITRO',
  'TRIBUNAL',
  'CAPITAN',
  'JUGADOR',
] as const;
export type RolOrganizacion = (typeof ROLES)[number];

/** Roles que se pueden dar por invitación. */
export const ROLES_INVITABLES = ['ADMINISTRADOR', 'TESORERO', 'ARBITRO', 'TRIBUNAL', 'CAPITAN'] as const;
export type RolInvitable = (typeof ROLES_INVITABLES)[number];

export const NOMBRE_ROL: Record<RolOrganizacion, string> = {
  DUENO: 'Dueño',
  ADMINISTRADOR: 'Administrador de torneo',
  TESORERO: 'Tesorero',
  ARBITRO: 'Árbitro / delegado',
  TRIBUNAL: 'Tribunal de disciplina',
  CAPITAN: 'Capitán',
  JUGADOR: 'Jugador',
};

export const DESCRIPCION_ROL: Record<RolOrganizacion, string> = {
  DUENO: 'Todo, incluido cobros, retiros, usuarios y plan.',
  ADMINISTRADOR:
    'Fixture, sanciones, comunicación, documentación, árbitros y registrar pagos. Sin retirar dinero.',
  TESORERO: 'Ver y registrar pagos, egresos y caja.',
  ARBITRO: 'Cargar y cerrar el acta de los partidos.',
  TRIBUNAL: 'Expedientes, descargos y resoluciones.',
  CAPITAN: 'Solo su equipo: plantel, convocatoria, documentación, sanciones y descargos.',
  JUGADOR: 'Solo lo suyo: próximos partidos, asistencia, estadísticas, sanciones y documentación.',
};

/** Días que vale el link de una invitación (docs/datos.json). */
export const DIAS_VENCIMIENTO_INVITACION: number = DATOS.usuarios.vencimientoInvitacionDias;

/**
 * Quién invita a quién. El dueño, a cualquier rol invitable. El administrador de torneo, solo a roles operativos que no
 * tocan plata (árbitro, tribunal, capitán): sumar un tesorero o otro administrador es decisión del dueño.
 */
export function rolesQuePuedeInvitar(rol: string): RolInvitable[] {
  if (rol === 'DUENO') return [...ROLES_INVITABLES];
  if (rol === 'ADMINISTRADOR') return ['ARBITRO', 'TRIBUNAL', 'CAPITAN'];
  return [];
}

export type EstadoInvitacion = 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA' | 'ANULADA' | 'VENCIDA';

export interface InvitacionBasica {
  venceEn: Date | string;
  aceptadaEn?: Date | string | null;
  rechazadaEn?: Date | string | null;
  anuladaEn?: Date | string | null;
}

/** Estado de una invitación. Usada (aceptada, rechazada o anulada) pesa más que vencida. */
export function estadoInvitacion(i: InvitacionBasica, ahora: Date): EstadoInvitacion {
  if (i.aceptadaEn) return 'ACEPTADA';
  if (i.rechazadaEn) return 'RECHAZADA';
  if (i.anuladaEn) return 'ANULADA';
  return new Date(i.venceEn).getTime() <= ahora.getTime() ? 'VENCIDA' : 'PENDIENTE';
}

/** Vencimiento de una invitación emitida (o reenviada) en `desde`. */
export const vencimientoInvitacion = (desde: Date) =>
  new Date(desde.getTime() + DIAS_VENCIMIENTO_INVITACION * 86_400_000);

export type Decision = { ok: true } | { ok: false; motivo: string };

/**
 * Si `actor` puede quitarle el acceso a un miembro con rol `objetivo`.
 * - Nunca al último dueño: la organización se quedaría sin quien la administre.
 * - Nadie se quita el acceso a sí mismo desde acá (evita quedarse afuera por error).
 * - El administrador solo quita los roles que puede invitar.
 */
export function puedeQuitarAcceso(e: {
  actor: string;
  objetivo: string;
  esUnoMismo: boolean;
  duenos: number;
}): Decision {
  if (e.objetivo === 'DUENO' && e.duenos <= 1)
    return { ok: false, motivo: 'Es el único dueño de la organización: no se le puede quitar el acceso.' };
  if (e.esUnoMismo) return { ok: false, motivo: 'No podés quitarte el acceso a vos mismo.' };
  if (e.actor === 'DUENO') return { ok: true };
  if ((rolesQuePuedeInvitar(e.actor) as string[]).includes(e.objetivo)) return { ok: true };
  return { ok: false, motivo: 'Tu rol no puede quitarle el acceso a este usuario.' };
}

/** Si `actor` puede invitar a `rol`, con su validación (el capitán necesita equipo). */
export function puedeInvitar(actor: string, rol: string, equipoId?: string | null): Decision {
  if (!(rolesQuePuedeInvitar(actor) as string[]).includes(rol))
    return { ok: false, motivo: 'Tu rol no puede invitar a alguien con ese rol.' };
  if (rol === 'CAPITAN' && !equipoId) return { ok: false, motivo: 'Elegí el equipo del capitán.' };
  return { ok: true };
}
