'use client';
import Link from 'next/link';
import { Vacio } from '@/componentes/ui';

/** Error inesperado dentro del panel: un aviso en lugar de la pantalla de error de Next. */
export default function ErrorDelPanel({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Vacio
      titulo="No pudimos mostrar esta sección"
      texto="Probá de nuevo en un rato. Si sigue pasando, avisanos."
    >
      <div className="mt-2 flex gap-2">
        <button onClick={reset} className="btn btn-sm">
          Reintentar
        </button>
        <Link href="/panel" className="btn-glass btn-sm">
          Volver al panel
        </Link>
      </div>
    </Vacio>
  );
}
