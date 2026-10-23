'use client';
import { useState } from 'react';
import { MensajeError, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';
import type { ResumenCaja } from '@/lib/tipos';

/** Cargos que se asientan solos al cerrar el acta de cada partido. */
export function AutomatizacionesCaja({ inicial }: { inicial: ResumenCaja['automatizaciones'] }) {
  const [lista, setLista] = useState(inicial);
  const { error, enviar } = useEnvio();
  return (
    <section className="tile rise" style={{ '--d': 5 } as React.CSSProperties}>
      <span className="eyebrow">Cargos automáticos</span>
      <p className="mt-1 text-sm text-mute">
        Al cerrar el acta de cada partido, la caja registra el gasto sola.
      </p>
      <ul className="mt-2" data-testid="automatizaciones-caja">
        {lista.map((a) => (
          <li key={a.clave} className="list-row items-center text-sm">
            <span className="min-w-0 flex-1">
              <b className="block">{a.nombre}</b>
              <span className="text-xs text-mute">{a.detalle}</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={a.activa}
              aria-label={a.nombre}
              onClick={() =>
                enviar(async () => {
                  await api('PATCH', `/caja/automatizaciones/${a.clave}`, { activa: !a.activa });
                  setLista((l) => l.map((x) => (x.clave === a.clave ? { ...x, activa: !x.activa } : x)));
                })
              }
              className={`relative h-7 w-12 shrink-0 rounded-full transition ${a.activa ? 'bg-ink' : 'bg-black/15'}`}
            >
              <span
                className={`absolute top-0.5 size-6 rounded-full transition-all ${a.activa ? 'left-[1.4rem] bg-volt' : 'left-0.5 bg-white'}`}
              />
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-mute">
        El árbitro cobra su tarifa y la cancha su costo por partido (se cargan en Árbitros). El árbitro se
        paga en efectivo y la cancha por transferencia.
      </p>
      <MensajeError error={error} />
    </section>
  );
}
