import { Icono, Logo, ProductoDeGregal } from '@potrero/ui';
import Link from 'next/link';

/** Estructura de las páginas públicas: encabezado con la liga y pie "Creado con Potrero" (canal de adquisición, E13-07). */
export function MarcoPublico({
  liga,
  etiqueta,
  children,
}: {
  liga?: { nombre: string; slug: string };
  etiqueta?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <header
        className="glass sticky top-3 z-40 mx-auto mt-3 flex max-w-6xl items-center gap-3 rounded-full py-2 pl-2 pr-2"
        style={{ width: 'calc(100% - 1.5rem)' }}
      >
        <Link href={liga ? `/t/${liga.slug}` : '/'}>
          <Logo conTexto={false} />
        </Link>
        <b className="truncate text-sm sm:text-base">{liga?.nombre ?? 'Potrero'}</b>
        {etiqueta && <span className="pill-volt hidden sm:inline-flex">{etiqueta}</span>}
        <Link href="/ingresar" className="btn btn-sm ml-auto">
          Panel
          <Icono nombre="up" />
        </Link>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8">{children}</main>
      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-black/10 px-4 py-6 text-sm text-mute">
        <Link href="/" className="font-semibold text-ink">
          Creado con Potrero · ¿Organizás un torneo? Probalo
        </Link>
        <ProductoDeGregal />
      </footer>
    </>
  );
}
