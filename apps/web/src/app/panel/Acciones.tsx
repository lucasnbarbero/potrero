'use client';
// Acciones de un toque del panel: recordar el pago a los deudores y avisar el fixture a los capitanes.
// Usan la mensajería existente (POST /comunicacion/enviar), que respeta los canales y el opt-in de cada capitán.
import type { Sugerencia } from '@potrero/shared';
import { Icono } from '@potrero/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';

export function RecordarDeudores({ cantidad }: { cantidad: number }) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const [listo, setListo] = useState(false);
  if (!cantidad) return null;
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        className="btn btn-sm"
        disabled={enviando || listo}
        onClick={() =>
          enviar(async () => {
            await api('POST', '/comunicacion/enviar', {
              plantilla: 'RECORDATORIO_PAGO',
              canal: 'WHATSAPP',
              segmento: { tipo: 'MOROSOS' },
            });
            setListo(true);
            router.refresh();
          })
        }
      >
        <Icono nombre={listo ? 'check' : 'whatsapp'} />
        {listo
          ? 'Recordatorio enviado'
          : enviando
            ? 'Enviando…'
            : cantidad === 1
              ? 'Recordarle al que debe'
              : `Recordar a los ${cantidad}`}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

/** Botón de la sugerencia: si se resuelve en un toque, manda el aviso; si no, lleva a la pantalla. */
export function AccionSugerencia({ s, className = '' }: { s: Sugerencia; className?: string }) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  if (!s.envio)
    return (
      <Link href={s.href} className={className}>
        {s.accion}
        <Icono nombre="arrow" />
      </Link>
    );
  const envio = s.envio;
  return (
    <>
      <button
        className={className}
        disabled={enviando}
        onClick={() =>
          enviar(async () => {
            await api('POST', '/comunicacion/enviar', {
              plantilla: envio.plantilla,
              canal: 'WHATSAPP',
              segmento: { tipo: 'TORNEO', torneoId: envio.torneoId },
            });
            router.refresh();
          })
        }
      >
        <Icono nombre="whatsapp" />
        {enviando ? 'Enviando…' : s.accion}
      </button>
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </>
  );
}
