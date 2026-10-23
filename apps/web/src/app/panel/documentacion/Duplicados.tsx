'use client';
import { useRouter } from 'next/navigation';
import { MensajeError, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';
import type { DuplicadoJugador } from '@/lib/tipos';

/** Dos jugadores con el mismo DNI: se resuelve sacando a uno del plantel repetido o descartando el DNI mal cargado. */
export function Duplicados({ lista }: { lista: DuplicadoJugador[] }) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const resolver = (id: string, accion: 'QUITAR_DEL_PLANTEL' | 'DESCARTAR', jugadorId: string) =>
    enviar(async () => {
      await api('POST', `/documentacion/duplicados/${id}/resolver`, { accion, jugadorId });
      router.refresh();
    });
  return (
    <section className="tile rise !border-red-200 bg-red-50/60" data-testid="duplicados">
      <span className="pill-red">Posibles duplicados</span>
      <p className="mt-2 text-sm text-mute">
        Mientras no se resuelvan, los dos jugadores quedan sin habilitar. Fijate en la ficha cuál es el
        correcto.
      </p>
      <ul className="mt-2 space-y-3">
        {lista.map((d) => (
          <li key={d.id} className="rounded-2xl bg-white/70 p-3 text-sm">
            <p className="mb-2 font-semibold">DNI {d.jugadores[0]?.dni ?? '—'} cargado dos veces</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {d.jugadores.map((j) => (
                <div key={j.id} className="rounded-xl border border-black/10 p-3">
                  <b className="block">{j.nombre}</b>
                  <span className="text-xs text-mute">
                    {j.equipos.map((e) => e.nombre).join(' / ') || 'sin equipo'}
                  </span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      className="btn-glass btn-sm"
                      disabled={enviando}
                      onClick={() => resolver(d.id, 'QUITAR_DEL_PLANTEL', j.id)}
                    >
                      Sacarlo del plantel
                    </button>
                    <button
                      className="btn-glass btn-sm"
                      disabled={enviando}
                      onClick={() => resolver(d.id, 'DESCARTAR', j.id)}
                    >
                      Su DNI está mal cargado
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <MensajeError error={error} />
    </section>
  );
}
