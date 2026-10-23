'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MensajeError, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';
import type { TipoDocumento } from '@/lib/tipos';

const OPCIONES: [TipoDocumento, string, string][] = [
  ['DNI', 'DNI', 'foto del frente'],
  ['APTO_FISICO', 'Apto físico', 'con fecha de vencimiento'],
  ['AUTORIZACION_MENOR', 'Autorización de menores', 'del padre, madre o tutor'],
];

/** Qué documentos exige este torneo para habilitar a un jugador. */
export function Requisitos({ torneoId, inicial }: { torneoId: string; inicial: TipoDocumento[] }) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const [elegidos, setElegidos] = useState<TipoDocumento[]>(inicial);
  const [guardado, setGuardado] = useState(false);
  const cambia = (t: TipoDocumento) => {
    setGuardado(false);
    setElegidos((l) => (l.includes(t) ? l.filter((x) => x !== t) : [...l, t]));
  };
  return (
    <section className="tile rise" style={{ '--d': 4 } as React.CSSProperties}>
      <span className="eyebrow">Qué se exige en este torneo</span>
      <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2" data-testid="requisitos">
        {OPCIONES.map(([tipo, nombre, ayuda]) => (
          <label key={tipo} className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              className="size-4"
              checked={elegidos.includes(tipo)}
              onChange={() => cambia(tipo)}
            />
            <span>
              {nombre} <span className="font-normal text-mute">· {ayuda}</span>
            </span>
          </label>
        ))}
        <button
          className="btn btn-sm"
          disabled={enviando}
          onClick={() =>
            enviar(async () => {
              await api('PATCH', `/torneos/${torneoId}/documentacion`, { documentos: elegidos });
              setGuardado(true);
              router.refresh();
            })
          }
        >
          Guardar
        </button>
        {guardado && !error && <span className="text-xs font-semibold">Guardado.</span>}
      </div>
      <p className="mt-2 text-xs text-mute">
        Sin nada tildado, el torneo no exige documentación. Quien no cumple queda marcado en el acta.
      </p>
      <MensajeError error={error} />
    </section>
  );
}
