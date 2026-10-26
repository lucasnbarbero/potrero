// Protege el panel: sin sesión redirige a /ingresar. Si el token de acceso venció pero hay token de renovación,
// renueva la sesión del lado del servidor antes de renderizar (los componentes de servidor no pueden escribir cookies).
import { type NextRequest, NextResponse } from 'next/server';

const API = process.env.API_URL ?? 'http://localhost:4000';

/**
 * Capitán (E19): su lugar es /capitan, no el panel del organizador (y al revés). Lee el rol del token sin verificarlo:
 * es solo para elegir la pantalla; la API es la que controla los permisos.
 */
function rolDe(token: string | undefined) {
  try {
    return token
      ? (JSON.parse(atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))).rol as string)
      : null;
  } catch {
    return null;
  }
}
function pantallaDelRol(req: NextRequest, token: string | undefined) {
  const esCapitan = rolDe(token) === 'CAPITAN';
  const enCapitan = req.nextUrl.pathname.startsWith('/capitan');
  if (esCapitan === enCapitan) return null;
  return NextResponse.redirect(new URL(esCapitan ? '/capitan' : '/panel', req.url));
}

export async function proxy(req: NextRequest) {
  if (req.cookies.has('potrero_at'))
    return pantallaDelRol(req, req.cookies.get('potrero_at')?.value) ?? NextResponse.next();
  const refresh = req.cookies.get('potrero_rt')?.value;
  const aIngresar = NextResponse.redirect(
    new URL(`/ingresar?volver=${encodeURIComponent(req.nextUrl.pathname)}`, req.url),
  );
  if (!refresh) return aIngresar;
  const r = await fetch(`${API}/api/auth/renovar`, {
    method: 'POST',
    headers: { cookie: `potrero_rt=${refresh}` },
  });
  if (!r.ok) return aIngresar;
  const s = (await r.json()) as { acceso: string; refresh: string; accesoSeg: number; refreshDias: number };
  // Las cookies nuevas viajan en el pedido (para este render) y en la respuesta (para el navegador).
  const headers = new Headers(req.headers);
  headers.set('cookie', `potrero_at=${s.acceso}; potrero_rt=${s.refresh}`);
  const res = pantallaDelRol(req, s.acceso) ?? NextResponse.next({ request: { headers } });
  const base = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
  res.cookies.set('potrero_at', s.acceso, { ...base, maxAge: s.accesoSeg });
  res.cookies.set('potrero_rt', s.refresh, { ...base, maxAge: s.refreshDias * 86_400 });
  return res;
}

export const config = { matcher: ['/panel/:path*', '/capitan/:path*'] };
