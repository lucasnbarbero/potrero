'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';

/** Un movimiento mal cargado no se borra: se anula con otro asiento y el original queda a la vista. */
export function AnularMovimiento({ id }: { id: string }) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const [confirmar, setConfirmar] = useState(false);
  if (!confirmar)
    return (
      <button
        className="text-xs font-semibold text-mute underline hover:text-red-600"
        onClick={() => setConfirmar(true)}
      >
        Anular
      </button>
    );
  return (
    <span className="flex flex-wrap items-center gap-1 text-xs">
      {error ? <span className="text-red-600">{error}</span> : <span className="text-mute">¿Anular?</span>}
      <button
        className="font-bold text-red-600 underline"
        disabled={enviando}
        onClick={() =>
          enviar(async () => {
            await api('POST', `/caja/movimientos/${id}/anular`, {});
            router.refresh();
          })
        }
      >
        Sí
      </button>
      <button className="text-mute underline" onClick={() => setConfirmar(false)}>
        No
      </button>
    </span>
  );
}
