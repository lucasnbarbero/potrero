// Acceso a la API desde el servidor (componentes de servidor). Reenvía las cookies de sesión.
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

const API = process.env.API_URL ?? 'http://localhost:4000';

export class ErrorApi extends Error {
  constructor(
    readonly status: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

async function leer<T>(r: Response): Promise<T> {
  if (r.status === 401) redirect('/ingresar');
  if (r.status === 404) notFound();
  const datos = await r.json().catch(() => null);
  if (!r.ok) throw new ErrorApi(r.status, datos?.mensaje ?? 'Error de la API');
  return datos as T;
}

/** Datos privados del organizador: siempre frescos. */
export async function apiServidor<T>(ruta: string): Promise<T> {
  const c = await cookies();
  return leer<T>(await fetch(`${API}/api${ruta}`, { headers: { cookie: c.toString() }, cache: 'no-store' }));
}

/** Datos públicos (sitio del torneo): se regeneran cada pocos segundos para soportar picos del fin de semana. */
export async function apiPublica<T>(ruta: string): Promise<T> {
  return leer<T>(await fetch(`${API}/api${ruta}`, { next: { revalidate: 10 } }));
}
