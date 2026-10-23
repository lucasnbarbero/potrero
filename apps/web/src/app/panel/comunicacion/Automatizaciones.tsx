'use client';
import { useState } from 'react';
import { MensajeError, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';
import type { Automatizacion, CanalMensaje } from '@/lib/tipos';

/** Avisos automáticos que el organizador enciende o apaga, cada uno con su canal. */
export function Automatizaciones({ inicial }: { inicial: Automatizacion[] }) {
  const [lista, setLista] = useState(inicial);
  const { error, enviar } = useEnvio();

  const cambiar = (clave: string, cambio: { activa?: boolean; canal?: CanalMensaje }) =>
    enviar(async () => {
      const actual = lista.find((a) => a.clave === clave)!;
      const nuevo = { activa: cambio.activa ?? actual.activa, canal: cambio.canal ?? actual.canal };
      await api('PATCH', `/comunicacion/automatizaciones/${clave}`, nuevo);
      setLista((l) => l.map((a) => (a.clave === clave ? { ...a, ...nuevo } : a)));
    });

  return (
    <section className="tile rise" style={{ '--d': 2 } as React.CSSProperties}>
      <span className="eyebrow">Automatizaciones</span>
      <p className="mt-1 text-sm text-mute">Dejá que Potrero avise por vos.</p>
      <ul className="mt-2" data-testid="automatizaciones">
        {lista.map((a) => (
          <li key={a.clave} className="list-row items-center text-sm">
            <span className="min-w-0 flex-1">
              <b className="block">{a.nombre}</b>
              <span className="text-xs text-mute">{a.detalle}</span>
              <select
                aria-label={`Canal de ${a.nombre}`}
                className="mt-1 block rounded-full border border-black/10 bg-white px-2 py-0.5 text-xs"
                value={a.canal}
                onChange={(e) => cambiar(a.clave, { canal: e.target.value as CanalMensaje })}
              >
                <option value="WHATSAPP">WhatsApp</option>
                <option value="EMAIL">Email</option>
              </select>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={a.activa}
              aria-label={a.nombre}
              onClick={() => cambiar(a.clave, { activa: !a.activa })}
              className={`relative h-7 w-12 shrink-0 rounded-full transition ${a.activa ? 'bg-ink' : 'bg-black/15'}`}
            >
              <span
                className={`absolute top-0.5 size-6 rounded-full transition-all ${a.activa ? 'left-[1.4rem] bg-volt' : 'left-0.5 bg-white'}`}
              />
            </button>
          </li>
        ))}
      </ul>
      <MensajeError error={error} />
    </section>
  );
}
