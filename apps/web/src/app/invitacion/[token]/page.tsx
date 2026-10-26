import { Logo, ProductoDeGregal } from '@potrero/ui';
import { Aceptar } from './Aceptar';

export const metadata = { title: 'Invitación', robots: { index: false } };

/** Página pública (sin sesión) a la que llega la persona invitada a sumarse a una organización (E04-09). */
export default async function Invitacion({ params }: PageProps<'/invitacion/[token]'>) {
  const { token } = await params;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="mx-auto">
        <Logo />
      </div>
      <div className="tile rise mt-8 !p-7">
        <Aceptar token={token} />
      </div>
      <ProductoDeGregal className="mx-auto mt-8" />
    </main>
  );
}
