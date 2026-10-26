// Permisos finos por rol (documento 1, sección 2). Un rol tiene una lista de permisos; '*' es todo.
export const PERMISOS_POR_ROL: Record<string, readonly string[]> = {
  DUENO: ['*'],
  ADMINISTRADOR: [
    'torneo.leer',
    'torneo.escribir',
    'equipo.escribir',
    'cancha.escribir',
    'fixture.escribir',
    'partido.acta',
    'cobro.leer',
    'comunicacion.leer',
    'comunicacion.escribir',
    'caja.leer',
    'arbitro.escribir',
    'sancion.resolver',
    'documentacion.leer',
    'documentacion.escribir',
    'documentacion.revisar',
  ],
  TESORERO: [
    'torneo.leer',
    'cobro.leer',
    'cobro.registrar',
    'comunicacion.leer',
    'caja.leer',
    'caja.escribir',
  ],
  ARBITRO: ['torneo.leer', 'partido.acta'],
  TRIBUNAL: ['torneo.leer', 'sancion.resolver'],
};

export function tienePermiso(rol: string, permiso: string): boolean {
  const permisos = PERMISOS_POR_ROL[rol] ?? [];
  return permisos.includes('*') || permisos.includes(permiso);
}

// ── Usuarios e invitaciones (E04-09) y capitán (E19) ──
// El administrador invita y quita accesos de los roles operativos (ver rolesQuePuedeInvitar en @potrero/shared).
PERMISOS_POR_ROL.ADMINISTRADOR = [...PERMISOS_POR_ROL.ADMINISTRADOR!, 'usuario.gestionar'];
// El capitán solo opera su equipo (Membresia.equipoId): no tiene ningún permiso del panel del organizador.
PERMISOS_POR_ROL.CAPITAN = ['capitan.equipo'];

/**
 * Rutas con sesión pero sin @Permiso: un rol acotado (el capitán) solo entra a las de su cuenta. Así una ruta nueva del
 * organizador que se olvide del @Permiso no le muestra datos de toda la liga.
 */
const ROLES_ACOTADOS = new Set(['CAPITAN']);
export function permitidaSinPermiso(rol: string, ruta: string): boolean {
  return !ROLES_ACOTADOS.has(rol) || ruta.startsWith('/api/auth/');
}

// ── Acta y tribunal (F17) ──
// El informe del árbitro en un expediente lo carga el árbitro, el administrador o el tribunal, sin darle al tribunal el acta.
PERMISOS_POR_ROL.ADMINISTRADOR = [...PERMISOS_POR_ROL.ADMINISTRADOR!, 'expediente.informe'];
PERMISOS_POR_ROL.ARBITRO = [...PERMISOS_POR_ROL.ARBITRO!, 'expediente.informe'];
PERMISOS_POR_ROL.TRIBUNAL = [...PERMISOS_POR_ROL.TRIBUNAL!, 'expediente.informe'];

// ── Cobros (decisión del dueño) ──
// El administrador de torneo también registra pagos (efectivo, transferencia, anulaciones, levantamientos). Retirar
// dinero y la caja siguen siendo del dueño y del tesorero.
PERMISOS_POR_ROL.ADMINISTRADOR = [...PERMISOS_POR_ROL.ADMINISTRADOR!, 'cobro.registrar'];
// ── Cuenta del jugador (E20-01) ──
// El jugador solo ve lo suyo (Membresia.jugadorId): ningún permiso del organizador ni del capitán.
PERMISOS_POR_ROL.JUGADOR = ['jugador.cuenta'];
ROLES_ACOTADOS.add('JUGADOR');
