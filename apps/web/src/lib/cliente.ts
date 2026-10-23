// Acceso a la API desde el navegador. Si el token de acceso venció, renueva la sesión una vez y reintenta.
export class ErrorCliente extends Error {
  constructor(
    mensaje: string,
    readonly campos?: Record<string, string>,
  ) {
    super(mensaje);
  }
}

export async function api<T = unknown>(
  metodo: 'GET' | 'POST' | 'PATCH',
  ruta: string,
  cuerpo?: unknown,
): Promise<T> {
  const hacer = () =>
    fetch(`/api${ruta}`, {
      method: metodo,
      headers: cuerpo === undefined ? {} : { 'content-type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  let r = await hacer();
  if (r.status === 401 && !ruta.startsWith('/auth/')) {
    const renovada = await fetch('/api/auth/renovar', { method: 'POST' });
    if (!renovada.ok) {
      window.location.href = `/ingresar?volver=${encodeURIComponent(window.location.pathname)}`;
      throw new ErrorCliente('Tu sesión venció.');
    }
    r = await hacer();
  }
  const datos = await r.json().catch(() => null);
  if (!r.ok)
    throw new ErrorCliente(
      datos?.mensaje ?? 'No pudimos completar la acción. Probá de nuevo.',
      datos?.campos,
    );
  return datos as T;
}
