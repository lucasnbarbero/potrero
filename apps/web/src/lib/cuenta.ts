// Cambio de organización activa (E04-10): la API emite una sesión nueva para esa organización.
import { api } from './cliente';
import { limpiarSinConexion } from './sin-conexion';

export async function cambiarOrganizacion(organizacionId: string) {
  await api('POST', '/cuenta/organizacion', { organizacionId });
  // Los datos guardados para usar sin conexión son de la organización anterior.
  await limpiarSinConexion();
  window.location.href = '/panel';
}
