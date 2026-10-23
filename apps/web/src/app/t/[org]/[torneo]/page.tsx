import { Icono } from '@potrero/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { MarcoPublico } from '@/componentes/MarcoPublico';
import { Escudo, Estado } from '@/componentes/ui';
import { apiPublica } from '@/lib/api';
import { fechaCorta, hora, pesos } from '@/lib/formato';
import type { Estadisticas, Partido } from '@/lib/tipos';

interface SitioTorneo {
  organizacion: { nombre: string; slug: string };
  torneo: {
    nombre: string;
    slug: string;
    modalidad: string;
    estado: string;
    cupo: number;
    inscripcion: number;
    inscriptos: number;
  };
  partidos: Partido[];
  tabla: Estadisticas['tabla'];
  goleadores: Estadisticas['goleadores'];
  suspendidos: { jugador: string; equipo: string; restantes: number }[];
}

export async function generateMetadata({ params }: PageProps<'/t/[org]/[torneo]'>): Promise<Metadata> {
  const { org, torneo } = await params;
  const s = await apiPublica<SitioTorneo>(`/publico/${org}/${torneo}`);
  return {
    title: `${s.torneo.nombre} · ${s.organizacion.nombre}`,
    description: `Tabla, fixture y goleadores de ${s.torneo.nombre}.`,
  };
}

export default async function SitioDelTorneo({ params }: PageProps<'/t/[org]/[torneo]'>) {
  const { org, torneo } = await params;
  const s = await apiPublica<SitioTorneo>(`/publico/${org}/${torneo}`);
  const fechas = [...Map.groupBy(s.partidos, (p) => p.fecha)];
  // Próxima fecha a jugar: la primera con partidos sin cerrar.
  const proxima = fechas.find(([, ps]) =>
    ps.some((p) => p.estado === 'PROGRAMADO' || p.estado === 'EN_JUEGO'),
  );
  const ultima = [...fechas]
    .reverse()
    .find(([, ps]) => ps.some((p) => p.estado === 'FINALIZADO' || p.estado === 'WO'));

  return (
    <MarcoPublico liga={s.organizacion} etiqueta={s.torneo.modalidad.replace('F', 'Fútbol ')}>
      <div className="rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{s.organizacion.nombre}</p>
          <h1 className="mt-1 text-5xl font-bold tracking-tighter sm:text-6xl">{s.torneo.nombre}</h1>
        </div>
        <Estado estado={s.torneo.estado} />
      </div>

      {s.torneo.estado === 'INSCRIPCION' && (
        <section className="tile-volt rise mt-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <b className="text-2xl tracking-tight">Inscripción abierta</b>
            <p className="text-sm text-ink/70">
              {s.torneo.inscriptos} de {s.torneo.cupo} equipos · {pesos(s.torneo.inscripcion)} por equipo
            </p>
          </div>
          <Link href={`/t/${org}/${torneo}/inscripcion`} className="btn btn-lg">
            Inscribir mi equipo
            <Icono nombre="arrow" />
          </Link>
        </section>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_22rem]">
        <section className="tile !p-0">
          <div className="flex items-center justify-between px-5 pt-5">
            <b className="text-lg">Tabla de posiciones</b>
          </div>
          <div className="scrollx">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr>
                  {['#', 'Equipo', 'PJ', 'G', 'E', 'P', 'DG', 'Pts'].map((h) => (
                    <th key={h} className="th">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="[&>tr]:border-t [&>tr]:border-black/5">
                {s.tabla.map((f) => (
                  <tr key={f.equipoId} className={f.posicion === 1 ? 'bg-volt/30' : ''}>
                    <td className="td font-bold">{f.posicion}</td>
                    <td className="td">
                      <span className="flex items-center gap-2 font-semibold">
                        <Escudo nombre={f.equipo} className="!size-7 !text-[9px]" />
                        {f.equipo}
                      </span>
                    </td>
                    {[f.pj, f.pg, f.pe, f.pp, f.dg].map((v, i) => (
                      <td key={i} className="td num">
                        {v}
                      </td>
                    ))}
                    <td className="td num font-bold">{f.pts}</td>
                  </tr>
                ))}
                {s.tabla.length === 0 && (
                  <tr>
                    <td className="td text-mute" colSpan={8}>
                      La tabla aparece cuando arranque el torneo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-4">
          <section className="tile-ink">
            <div className="field-pattern pointer-events-none absolute inset-0 opacity-60" />
            <div className="relative">
              <span className="eyebrow !text-white/50">Goleadores</span>
              <ol className="mt-2">
                {s.goleadores.slice(0, 5).map((g, i) => (
                  <li
                    key={g.jugadorId}
                    className="flex items-center gap-3 border-t border-white/10 py-2.5 text-sm first:border-0"
                  >
                    <span
                      className={`grid size-7 place-items-center rounded-full text-xs font-bold ${i === 0 ? 'bg-volt text-ink' : 'bg-white/10'}`}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate">{g.jugador}</b>
                      <span className="text-xs text-white/50">{g.equipo}</span>
                    </span>
                    <b className="num text-lg text-volt">{g.goles}</b>
                  </li>
                ))}
                {s.goleadores.length === 0 && (
                  <li className="py-2 text-sm text-white/60">Todavía no hay goles.</li>
                )}
              </ol>
            </div>
          </section>
          {s.suspendidos.length > 0 && (
            <section className="tile">
              <span className="eyebrow">Suspendidos</span>
              <ul className="mt-2">
                {s.suspendidos.map((x) => (
                  <li key={x.jugador + x.equipo} className="list-row text-sm">
                    <span className="h-6 w-4 rounded bg-red-500" />
                    <span className="flex-1">
                      <b>{x.jugador}</b> <span className="text-mute">· {x.equipo}</span>
                    </span>
                    <span className="text-xs text-mute">{x.restantes} fecha(s)</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {[
          proxima && (['Próxima fecha', proxima] as const),
          ultima && (['Últimos resultados', ultima] as const),
        ]
          .filter(Boolean)
          .map((x) => {
            const [titulo, [fecha, ps]] = x as readonly [string, [number, Partido[]]];
            return (
              <section key={titulo} className="tile">
                <div className="flex items-center justify-between">
                  <b className="text-lg">{titulo}</b>
                  <span className="text-sm text-mute">
                    Fecha {fecha} · {fechaCorta(ps[0]!.inicio)}
                  </span>
                </div>
                <ul className="mt-2">
                  {ps.map((p) => (
                    <li key={p.id} className="list-row text-sm">
                      <span className="w-12 shrink-0 text-mute">{hora(p.inicio)}</span>
                      <span className="flex-1 truncate text-right font-semibold">{p.local}</span>
                      <span className="num w-14 shrink-0 rounded-full bg-black/5 py-1 text-center font-bold">
                        {p.estado === 'FINALIZADO'
                          ? `${p.golesLocal}-${p.golesVisitante}`
                          : p.estado === 'WO'
                            ? 'W.O.'
                            : 'vs'}
                      </span>
                      <span className="flex-1 truncate font-semibold">{p.visitante}</span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
      </div>
    </MarcoPublico>
  );
}
