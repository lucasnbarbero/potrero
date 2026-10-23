import { Icono } from '@potrero/ui';
import Link from 'next/link';
import { Encabezado } from '@/componentes/ui';
import { apiServidor } from '@/lib/api';
import { fechaCorta } from '@/lib/formato';
import type { AlertaClima, ContingenciaResumen, Sede, Torneo } from '@/lib/tipos';
import { Reprogramador } from './Reprogramador';

export const metadata = { title: 'Reprogramaciones' };

export default async function Reprogramaciones() {
  const [alerta, recientes, torneos, sedes] = await Promise.all([
    apiServidor<AlertaClima | null>('/contingencias/clima'),
    apiServidor<ContingenciaResumen[]>('/contingencias'),
    apiServidor<Torneo[]>('/torneos'),
    apiServidor<Sede[]>('/canchas'),
  ]);
  return (
    <div className="space-y-6">
      <Encabezado eyebrow="Centro de contingencias" titulo="Reprogramar sin dramas" />
      <p className="-mt-3 max-w-xl text-mute">
        Lluvia, cancha caída o equipos que no llegan: lo resolvés en un clic y avisamos a todos. Siempre ves
        cómo queda antes de aplicar nada.
      </p>

      <Reprogramador
        alerta={alerta}
        torneos={torneos.filter((t) => t.estado === 'EN_CURSO').map((t) => ({ id: t.id, nombre: t.nombre }))}
        canchas={sedes.flatMap((s) =>
          s.canchas.map((c) => ({ id: c.id, nombre: `${s.nombre} · ${c.nombre}` })),
        )}
      />

      <section className="tile rise" data-testid="reprogramaciones-recientes">
        <span className="eyebrow">Reprogramaciones anteriores</span>
        <ul className="mt-2">
          {recientes.map((r) => (
            <li key={r.id} className="list-row text-sm">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-volt">
                <Icono nombre="cloud" />
              </span>
              <span className="min-w-0 flex-1">
                <Link
                  href={`/panel/reprogramaciones/${r.id}`}
                  className="block truncate font-bold hover:underline"
                >
                  {r.motivo}
                </Link>
                <span className="text-xs text-mute">
                  {r.partidos} partidos · {fechaCorta(r.creadoEn)}
                </span>
              </span>
              <span className="pill-volt">{r.confirmados} confirmaron</span>
              {r.noPuedo > 0 && <span className="pill-red">{r.noPuedo} no pueden</span>}
              {r.sinResponder > 0 && <span className="pill">{r.sinResponder} sin responder</span>}
            </li>
          ))}
          {recientes.length === 0 && (
            <li className="py-3 text-sm text-mute">Todavía no reprogramaste nada.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
