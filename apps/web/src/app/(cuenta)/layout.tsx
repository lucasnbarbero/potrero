import { Logo, ProductoDeGregal } from '@potrero/ui';
import Link from 'next/link';

export default function LayoutCuenta({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="mx-auto">
        <Logo />
      </Link>
      <div className="tile rise mt-8 !p-7">{children}</div>
      <ProductoDeGregal className="mx-auto mt-8" />
    </main>
  );
}
