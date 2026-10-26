'use client';
// Permisos del rol en el panel (vienen de GET /auth/yo): la web oculta los botones que el rol no puede usar. La API
// controla igual cada acción; esto es solo para no mostrar lo que va a dar 403.
import { createContext, useContext } from 'react';

const Permisos = createContext<readonly string[] | null>(null);

export function ProveedorDePermisos({
  permisos,
  children,
}: {
  permisos: readonly string[];
  children: React.ReactNode;
}) {
  return <Permisos.Provider value={permisos}>{children}</Permisos.Provider>;
}

/** Si el rol tiene el permiso. Fuera del panel (sin proveedor) no oculta nada. */
export function usePermiso(permiso: string): boolean {
  const permisos = useContext(Permisos);
  return !permisos || permisos.includes('*') || permisos.includes(permiso);
}
