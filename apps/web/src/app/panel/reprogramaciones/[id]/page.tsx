import { Icono } from '@potrero/ui';
import Link from 'next/link';
import { Encabezado } from '@/componentes/ui';
import { TextoConLinks } from '@/componentes/TextoConLinks';
import { apiServidor } from '@/lib/api';
import { fechaCorta, hora } from '@/lib/formato';
import type { ContingenciaDetalle } from '@/lib/tipos';

export const metadata = { title: 'Reprogramación' };

const CANAL = { WHATSAPP: 'WhatsApp', EMAIL: 'Email', PUSH: 'Push' } as const;

export default async function DetalleReprogramacion({ params }: PageProps<'/panel/reprogramaciones/[id]'>) {
  const { id } = await params;
  const d = await apiServidor<ContingenciaDetalle>(`/contingencias/${id}`);
  const { resumen } = d;
  return (
    <div className="space-y-6">
      <Link
        href="/panel/reprogramaciones"
        className="inline-flex items-center gap-1 text-sm font-semibold text-mute hover:text-ink"
      >
        <Icono nombre="back" />
        Reprogramaciones
      </Link>
      <Encabezado eyebrow={`Aplicada el ${fechaCorta(d.creadoEn)}`} titulo={d.motivo} />

      <div className="grid gap-4 sm:grid-cols-3" data-testid="resumen-respuestas">
        <div className="tile-volt">
          <span className="eyebrow !text-ink/60">Confirmaron</span>
          <b className="num mt-2 block text-4xl tracking-tighter">{resumen.confirmados}</b>
        </div>
        <div className={resumen.noPuedo > 0 ? 'tile ring-2 ring-red-400' : 'tile'}>
          <span className="eyebrow">No pueden</span>
          <b className="num mt-2 block text-4xl tracking-tighter">{resumen.noPuedo}</b>
        </div>
        <div className="tile">
          <span className="eyebrow">Sin responder</span>
          <b className="num mt-2 block text-4xl tracking-tighter">{resumen.sinResponder}</b>
        </div>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <section className="tile">
          <span className="eyebrow">Capitanes</span>
          <ul className="mt-2">
            {d.respuestas.map((r, i) => (
              <li key={i} className="list-row text-sm">
                <span className="min-w-0 flex-1">
                  <b className="block truncate">{r.equipo}</b>
                  <span className="text-xs text-mute">
                    {r.capitan} · {CANAL[r.canal]}
                  </span>
                  <details className="mt-1 text-xs">
                    <summary className="cursor-pointer font-semibold text-ink underline">
                      Ver el mensaje que recibió
                    </summary>
                    <p className="mt-1 rounded-2xl bg-[#e7f7d9] p-3 leading-relaxed">
                      <TextoConLinks texto={r.cuerpo} />
                    </p>
                  </details>
                </span>
                {r.respuesta === 'CONFIRMO' ? (
                  <span className="pill-volt">Confirmó</span>
                ) : r.respuesta === 'NO_PUEDO' ? (
                  <span className="pill-red">No puede</span>
                ) : r.estado === 'LEIDO' ? (
                  <span className="pill">Lo leyó</span>
                ) : (
                  <span className="pill-amber">Sin responder</span>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="tile">
          <span className="eyebrow">Partidos movidos</span>
          <ul className="mt-2">
            {d.movimientos.map((m) => (
              <li key={m.partidoId} className="list-row text-sm">
                <span className="w-36 shrink-0 text-xs text-mute">
                  {fechaCorta(m.de.inicio)} → <b className="text-ink">{fechaCorta(m.a.inicio)}</b>{' '}
                  {hora(m.a.inicio)}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <b>
                    {m.local} vs {m.visitante}
                  </b>
                  <span className="block text-xs text-mute">{m.a.cancha}</span>
                </span>
              </li>
            ))}
          </ul>
          {d.sinResolver.length > 0 && (
            <p className="mt-3 text-xs text-amber-900">
              Quedaron {d.sinResolver.length} partidos sin resolver con esta opción.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
