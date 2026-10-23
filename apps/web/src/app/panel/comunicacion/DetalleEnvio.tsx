'use client';
import { useState } from 'react';
import { TextoConLinks } from '@/componentes/TextoConLinks';
import { api } from '@/lib/cliente';

interface Detalle {
  mensajes: {
    id: string;
    destinatario: string;
    canal: string;
    estado: string;
    costoUsd: number;
    error: string | null;
    cuerpo: string;
  }[];
}

const ESTADO: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  ENVIADO: 'Enviado',
  ENTREGADO: 'Entregado',
  LEIDO: 'Leído',
  FALLIDO: 'Falló',
};

/** Qué recibió cada destinatario de un envío. Hoy los canales son simulados: acá se ve lo que habría llegado. */
export function DetalleEnvio({ id }: { id: string }) {
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  return (
    <details
      className="mt-1 text-xs"
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open && !detalle)
          api<Detalle>('GET', `/comunicacion/envios/${id}`).then(setDetalle);
      }}
    >
      <summary className="cursor-pointer font-semibold text-ink underline">Ver mensajes</summary>
      {detalle ? (
        <ul className="mt-2 space-y-2">
          {detalle.mensajes.map((m) => (
            <li key={m.id} className="rounded-2xl bg-[#e7f7d9] p-3 leading-relaxed">
              <span className="block text-[11px] font-bold uppercase tracking-wide text-ink/50">
                {m.destinatario} ·{' '}
                {m.canal === 'WHATSAPP' ? 'WhatsApp' : m.canal === 'EMAIL' ? 'Email' : 'Push'} ·{' '}
                {ESTADO[m.estado]}
              </span>
              <TextoConLinks texto={m.cuerpo} />
              {m.error && <span className="mt-1 block font-semibold text-red-700">{m.error}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-mute">Cargando…</p>
      )}
    </details>
  );
}
