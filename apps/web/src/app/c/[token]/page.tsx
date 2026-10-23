import { Logo, ProductoDeGregal } from '@potrero/ui';
import { Confirmar } from './Confirmar';

export const metadata = { title: 'Confirmá tu partido', robots: { index: false } };

/** Página pública (sin sesión) a la que llega el capitán desde el mensaje de reprogramación. */
export default async function Confirmacion({ params }: PageProps<'/c/[token]'>) {
  const { token } = await params;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="mx-auto">
        <Logo />
      </div>
      <div className="tile rise mt-8 !p-7">
        <Confirmar token={token} />
      </div>
      <ProductoDeGregal className="mx-auto mt-8" />
    </main>
  );
}
