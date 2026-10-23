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
