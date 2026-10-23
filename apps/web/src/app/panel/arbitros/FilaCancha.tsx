'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MensajeError, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';
import { pesos } from '@/lib/formato';
import type { Designaciones } from '@/lib/tipos';

/** Una cancha con su ocupación del día, su costo por partido y la opción de bloquearla (mantenimiento, clima). */
export function FilaCancha({ c }: { c: Designaciones['canchas'][number] }) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const [editando, setEditando] = useState(false);
  return (
    <li className="list-row flex-wrap text-sm">
      <span className="min-w-0 flex-1">
        <b className="block truncate">
          {c.nombre}
          {c.superficie ? ` · ${c.superficie}` : ''}
        </b>
        <span className="text-xs text-mute">
          {c.sede} · {c.costoPorPartido > 0 ? `${pesos(c.costoPorPartido)} por partido` : 'sin costo cargado'}
        </span>
      </span>
      {c.bloqueada ? (
        <span className="pill-red" title={c.motivoBloqueo ?? undefined}>
          Bloqueada{c.motivoBloqueo ? ` · ${c.motivoBloqueo}` : ''}
        </span>
      ) : (
        <span className="pill">Ocupación {c.pct}%</span>
      )}
      <button
        className="text-xs font-semibold text-mute underline hover:text-ink"
        onClick={() => setEditando((v) => !v)}
      >
        {editando ? 'Cerrar' : 'Editar'}
      </button>
      {editando && (
        <form
          className="mt-2 grid w-full gap-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            enviar(async () => {
              const bloqueada = f.get('bloqueada') === 'on';
              await api('PATCH', `/canchas/${c.id}`, {
                costoPorPartido: Number(f.get('costo') || 0),
                superficie: (f.get('superficie') as string) || undefined,
                bloqueada,
                ...(bloqueada ? { motivoBloqueo: (f.get('motivo') as string) || 'Bloqueada' } : {}),
              });
              setEditando(false);
              router.refresh();
            });
          }}
        >
          <label className="block">
            <span className="field-label">Costo por partido ($)</span>
            <input name="costo" type="number" min={0} defaultValue={c.costoPorPartido} className="input" />
          </label>
          <label className="block">
            <span className="field-label">Superficie</span>
            <input
              name="superficie"
              defaultValue={c.superficie ?? ''}
              className="input"
              placeholder="césped, sintético…"
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
            <input type="checkbox" name="bloqueada" defaultChecked={c.bloqueada} className="size-4" />
            Bloqueada (no se ofrece para armar fixtures)
          </label>
          <label className="block sm:col-span-2">
            <span className="field-label">Motivo del bloqueo</span>
            <input
              name="motivo"
              defaultValue={c.motivoBloqueo ?? ''}
              className="input"
              placeholder="Mantenimiento del césped"
            />
          </label>
          <div className="sm:col-span-2">
            <MensajeError error={error} />
          </div>
          <button className="btn btn-sm sm:col-span-2" disabled={enviando}>
            Guardar cancha
          </button>
        </form>
      )}
    </li>
  );
}
