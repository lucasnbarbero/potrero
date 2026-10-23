'use client';
import { useState } from 'react';
import { api } from '@/lib/cliente';

/** Descarta la sandbox del visitante y le arma una nueva con los datos originales. */
export function BotonReiniciarDemo() {
  const [enviando, setEnviando] = useState(false);
  return (
    <button
      type="button"
      disabled={enviando}
      className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-volt disabled:opacity-60"
      onClick={async () => {
        setEnviando(true);
        try {
          await api('POST', '/demo/reiniciar');
          window.location.href = '/panel';
        } catch (e) {
          setEnviando(false);
          window.alert((e as Error).message);
        }
      }}
    >
      {enviando ? 'Reiniciando…' : 'Reiniciar demo'}
    </button>
  );
}
