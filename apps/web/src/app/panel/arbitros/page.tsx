import { Icono } from '@potrero/ui';
import { Encabezado, Escudo } from '@/componentes/ui';
import { apiServidor } from '@/lib/api';
import { hora } from '@/lib/formato';
import type { Arbitro, Designaciones } from '@/lib/tipos';
import { FormularioArbitro, FilaArbitro } from './Arbitros';
import { DesignarAutomatico, SelectorArbitro } from './Designaciones';
import { FilaCancha } from './FilaCancha';

export const metadata = { title: 'Árbitros y canchas' };

const hoyAR = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const nombreDelDia = (dia: string) =>
  new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${dia}T12:00:00-03:00`));

const ESTADO_PARTIDO: Record<string, string> = {
  FINALIZADO: 'Jugado',
  EN_JUEGO: 'En juego',
  SUSPENDIDO: 'Suspendido',
  WO: 'Equipo ausente',
};

export default async function ArbitrosYCanchas({ searchParams }: PageProps<'/panel/arbitros'>) {
  const sp = await searchParams;
  let dia = typeof sp.dia === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.dia) ? sp.dia : '';
  if (!dia) {
    // Sin día elegido, se muestra el del próximo partido (o hoy).
    const r = await apiServidor<{ proximos: { inicio: string }[] }>('/panel/resumen');
    dia = r.proximos[0]
      ? new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Argentina/Buenos_Aires',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date(r.proximos[0].inicio))
      : hoyAR();
  }
  const [d, arbitros] = await Promise.all([
    apiServidor<Designaciones>(`/designaciones?dia=${dia}`),
    apiServidor<Arbitro[]>('/arbitros'),
  ]);
  const programados = d.partidos.filter((p) => p.estado === 'PROGRAMADO');

  return (
    <div className="space-y-6">
      <Encabezado eyebrow="Recursos del torneo" titulo="Árbitros y canchas">
        <DesignarAutomatico dia={dia} pendientes={d.sinArbitro} />
      </Encabezado>

      <form className="flex flex-wrap items-end gap-2" method="get">
        <label className="block">
          <span className="field-label">Día</span>
          <input type="date" name="dia" defaultValue={dia} className="input !w-auto" aria-label="Día" />
        </label>
        <button className="btn-glass btn-sm">Ver</button>
      </form>

      <div className="grid items-start gap-4 xl:grid-cols-[1.4fr_1fr]">
        <section className="tile rise" data-testid="designaciones">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="eyebrow">Designaciones · {nombreDelDia(dia)}</span>
            {d.sinArbitro > 0 ? (
              <span className="pill-amber">{d.sinArbitro} sin árbitro</span>
            ) : programados.length > 0 ? (
              <span className="pill-volt">Todos cubiertos</span>
            ) : null}
          </div>
          <ul className="mt-2">
            {d.partidos.map((p) => (
              <li key={p.id} className="list-row flex-wrap text-sm">
                <span className="w-12 shrink-0 font-semibold">{hora(p.inicio)}</span>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <Escudo nombre={p.local} className="!size-7 !text-[9px]" />
                  <span className="min-w-0">
                    <b className="block">
                      {p.local} vs {p.visitante}
                    </b>
                    <span className="text-xs text-mute">
                      {p.torneo} · {p.cancha ?? 'sin cancha'}
                    </span>
                  </span>
                </span>
                {p.estado === 'PROGRAMADO' ? (
                  <div className="flex w-full justify-end pl-12">
                    <SelectorArbitro partido={p} />
                  </div>
                ) : (
                  <span className="pill">
                    {ESTADO_PARTIDO[p.estado] ?? p.estado}
                    {p.arbitro ? ` · ${p.arbitro}` : ''}
                  </span>
                )}
              </li>
            ))}
            {d.partidos.length === 0 && (
              <li className="py-4 text-sm text-mute">
                No hay partidos ese día. Elegí otro día en el selector.
              </li>
            )}
          </ul>
        </section>

        <div className="space-y-4">
          <section className="tile rise" style={{ '--d': 2 } as React.CSSProperties} data-testid="arbitros">
            <span className="eyebrow">Árbitros</span>
            <ul className="mt-2">
              {arbitros.map((a) => (
                <FilaArbitro
                  key={a.id}
                  a={a}
                  partidosDelDia={d.arbitros.find((x) => x.id === a.id)?.partidosDelDia ?? 0}
                  cuando={dia === hoyAR() ? 'hoy' : 'ese día'}
                />
              ))}
              {arbitros.length === 0 && (
                <li className="py-3 text-sm text-mute">Cargá tu primer árbitro más abajo.</li>
              )}
            </ul>
            <div className="mt-4 border-t border-black/5 pt-4">
              <FormularioArbitro />
            </div>
          </section>

          <section className="tile rise" style={{ '--d': 3 } as React.CSSProperties} data-testid="canchas">
            <span className="eyebrow">Canchas · ocupación del día</span>
            <ul className="mt-2">
              {d.canchas.map((c) => (
                <FilaCancha key={c.id} c={c} />
              ))}
              {d.canchas.length === 0 && (
                <li className="py-3 text-sm text-mute">Todavía no cargaste canchas.</li>
              )}
            </ul>
            <p className="mt-2 flex items-start gap-1 text-xs text-mute">
              <Icono nombre="bolt" className="mt-0.5" />
              Con el costo por partido cargado y el cargo automático encendido en Caja, el alquiler se
              registra solo al cerrar cada acta.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
