import { Logo, ProductoDeGregal } from '@potrero/ui';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiServidor } from '@/lib/api';
import { Salir } from './Capitan';

/** Marco del panel del capitán (mock 07): encabezado con la liga y la etiqueta "Capitán", sin el menú del organizador. */
export default async function LayoutCapitan({ children }: { children: React.ReactNode }) {
  const yo = await apiServidor<{
    usuario: { nombre: string };
    organizacion: { nombre: string; slug: string };
    rol: string;
  }>('/auth/yo');
  if (yo.rol !== 'CAPITAN') redirect('/panel');
  return (
    <>
      <header
        className="glass sticky top-3 z-40 mx-auto mt-3 flex max-w-5xl items-center gap-3 rounded-full py-2 pl-2 pr-2"
        style={{ width: 'calc(100% - 1.5rem)' }}
      >
        <Link href="/capitan">
          <Logo conTexto={false} />
        </Link>
        <b className="truncate text-sm sm:text-base">{yo.organizacion.nombre}</b>
        <span className="pill-volt hidden sm:inline-flex">Capitán</span>
        <div className="ml-auto flex items-center gap-2">
          <Link href={`/t/${yo.organizacion.slug}`} className="btn-glass btn-sm hidden sm:inline-flex">
            Sitio de la liga
          </Link>
          <Salir nombre={yo.usuario.nombre} />
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-4 px-3 pb-24 pt-4 sm:px-4">{children}</main>
      <footer className="mx-auto flex max-w-5xl justify-end px-4 pb-8">
        <ProductoDeGregal />
      </footer>
    </>
  );
}
