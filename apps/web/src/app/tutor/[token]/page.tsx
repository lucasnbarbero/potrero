import { Logo, ProductoDeGregal } from '@potrero/ui';
import { Autorizar } from './Autorizar';

export const metadata = { title: 'Autorización del tutor', robots: { index: false } };

/** Página pública (sin sesión) a la que llega el padre, madre o tutor desde el link que le manda la liga. */
export default async function Tutor({ params }: PageProps<'/tutor/[token]'>) {
  const { token } = await params;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="mx-auto">
        <Logo />
      </div>
      <div className="tile rise mt-8 !p-7">
        <Autorizar token={token} />
      </div>
      <ProductoDeGregal className="mx-auto mt-8" />
    </main>
  );
}
