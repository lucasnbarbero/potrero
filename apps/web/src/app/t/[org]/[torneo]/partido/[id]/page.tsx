import { Icono } from '@potrero/ui';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { MarcoPublico } from '@/componentes/MarcoPublico';
import { Escudo } from '@/componentes/ui';
import { apiPublica } from '@/lib/api';
import { fechaCorta, hora } from '@/lib/formato';
import type { JugadorRef, PartidoPublico } from '@/lib/tipos-publico';
import { Compartir } from './Compartir';

type Props = PageProps<'/t/[org]/[torneo]/partido/[id]'>;

const ruta = (org: string, torneo: string, id: string) => `/t/${org}/${torneo}/partido/${id}`;

/** Origen absoluto (para las etiquetas Open Graph, que no aceptan rutas relativas). */
async function origen() {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  return `${h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')}://${host}`;
}

const jugado = (p: PartidoPublico['partido']) => p.estado === 'FINALIZADO' || p.estado === 'WO';

/** "Ganó X: Y no se presentó" (equipo ausente; el resultado lo define el reglamento). */
function textoAusente(p: Pick<PartidoPublico['partido'], 'local' | 'visitante' | 'ganadorWO'>) {
  const [ganador, ausente] = p.ganadorWO === 'LOCAL' ? [p.local, p.visitante] : [p.visitante, p.local];
  return `Ganó ${ganador}: ${ausente} no se presentó`;
}

function resultado(p: PartidoPublico['partido']) {
  return `${p.local} ${p.golesLocal ?? 0} - ${p.golesVisitante ?? 0} ${p.visitante}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { org, torneo, id } = await params;
  const s = await apiPublica<PartidoPublico>(`/publico/${org}/${torneo}/partidos/${id}`);
  const base = await origen();
  const titulo = jugado(s.partido) ? resultado(s.partido) : `${s.partido.local} vs ${s.partido.visitante}`;
  const descripcion = s.cronica[0] ?? `${s.torneo.nombre} · ${s.organizacion.nombre}`;
  const imagen = `${base}${ruta(org, torneo, id)}/tarjeta`;
  return {
    title: `${titulo} · ${s.torneo.nombre}`,
    description: descripcion,
    openGraph: {
      title: titulo,
      description: descripcion,
      url: `${base}${ruta(org, torneo, id)}`,
      siteName: s.organizacion.nombre,
      type: 'article',
      images: [{ url: imagen, width: 1200, height: 630, alt: titulo }],
    },
    twitter: { card: 'summary_large_image', title: titulo, description: descripcion, images: [imagen] },
  };
}

function NombreJugador({
  j,
  org,
  className = '',
}: {
  j: JugadorRef | null;
  org: string;
  className?: string;
}) {
  if (!j) return <span className={className}>Sin dato</span>;
  return j.id ? (
    <Link href={`/t/${org}/jugador/${j.id}`} className={`underline-offset-2 hover:underline ${className}`}>
      {j.nombre}
    </Link>
  ) : (
    <span className={className}>{j.nombre}</span>
  );
}

const ETIQUETA: Record<PartidoPublico['lineaDeTiempo'][number]['tipo'], string> = {
  GOL: 'Gol',
  GOL_EN_CONTRA: 'Gol en contra',
  AMARILLA: 'Amarilla',
  ROJA: 'Roja',
  CAMBIO: 'Cambio',
};

export default async function PaginaDelPartido({ params }: Props) {
  const { org, torneo, id } = await params;
  const s = await apiPublica<PartidoPublico>(`/publico/${org}/${torneo}/partidos/${id}`);
  const p = s.partido;
  const instancia =
    p.fase === 'LLAVE' ? (p.ronda ?? 'Playoffs') : `Fecha ${p.fecha}${p.grupo ? ` · Grupo ${p.grupo}` : ''}`;
  const estado =
    p.estado === 'FINALIZADO'
      ? 'Finalizado'
      : p.estado === 'WO'
        ? 'Equipo ausente'
        : p.estado === 'EN_JUEGO'
          ? 'En juego'
          : p.estado === 'SUSPENDIDO'
            ? 'Suspendido'
            : 'Por jugar';
  const cuando = p.inicio ? `${fechaCorta(p.inicio)} ${hora(p.inicio)}` : 'A programar';
  const base = await origen();
  const tarjeta = `${ruta(org, torneo, id)}/tarjeta`;

  return (
    <MarcoPublico liga={s.organizacion} etiqueta="Partido">
      <Link
        href={`/t/${org}/${torneo}`}
        className="mb-3 inline-flex items-center gap-1 text-sm text-mute hover:text-ink"
      >
        <Icono nombre="back" />
        {s.torneo.nombre}
      </Link>
      <section className="tile-ink rise text-center !p-6 sm:!p-9">
        <div className="field-pattern pointer-events-none absolute inset-0 opacity-90" />
        <div className="relative">
          <p className="text-sm text-white/50">
            {s.torneo.nombre} · {instancia}
          </p>
          <div className="my-6 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
            {[p.local, p.visitante].map((nombre, i) => (
              <div key={nombre} className={`flex flex-col items-center gap-3 ${i === 1 ? 'order-3' : ''}`}>
                <Escudo nombre={nombre} className="!size-20 !text-xl sm:!size-28 sm:!text-3xl" />
                <b className="sm:text-xl">{nombre}</b>
              </div>
            ))}
            <div className="order-2">
              {jugado(p) ? (
                <div className="num text-7xl font-bold tracking-tighter sm:text-9xl" data-testid="marcador">
                  {p.golesLocal}
                  <span className="mx-1 text-white/25">-</span>
                  {p.golesVisitante}
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <span className="text-4xl font-bold tracking-tighter text-white/40 sm:text-6xl">vs</span>
                  {p.inicio && (
                    <span className="num mt-1 text-2xl font-bold text-volt sm:text-3xl">
                      {hora(p.inicio)}
                    </span>
                  )}
                </div>
              )}
              {p.penalesLocal !== null && p.penalesVisitante !== null && (
                <p className="num mt-1 text-sm text-white/60">
                  Penales {p.penalesLocal}-{p.penalesVisitante}
                </p>
              )}
              {p.estado === 'WO' && p.ganadorWO && (
                <p className="mt-1 text-sm font-semibold text-white/70" data-testid="resultado-ausente">
                  {textoAusente(p)}
                </p>
              )}
            </div>
          </div>
          <span className="pill border-transparent bg-white/15 text-white">
            {estado} · {p.cancha ?? 'Cancha a confirmar'} · {cuando}
          </span>
        </div>
      </section>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="min-w-0 space-y-4">
          {s.cronica.length > 0 && (
            <section className="tile rise" style={{ '--d': 1 } as React.CSSProperties}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-bold">Crónica</h2>
                <span className="pill">
                  <Icono nombre="spark" />
                  Generada automáticamente
                </span>
              </div>
              <p className="text-lg leading-relaxed">{s.cronica[0]}</p>
              {s.cronica.slice(1).map((x) => (
                <p key={x} className="mt-3 text-mute">
                  {x}
                </p>
              ))}
            </section>
          )}

          {p.estado === 'FINALIZADO' && (
            <section className="tile rise" style={{ '--d': 2 } as React.CSSProperties}>
              <h2 className="mb-2 text-xl font-bold">Línea de tiempo</h2>
              {s.lineaDeTiempo.length === 0 ? (
                <p className="text-sm text-mute">El acta no registró goles ni tarjetas.</p>
              ) : (
                <div className="timeline" data-testid="linea-de-tiempo">
                  {s.lineaDeTiempo.map((e) => (
                    <div
                      key={e.id}
                      className={`ev ${e.tipo === 'AMARILLA' && !e.segundaAmarilla ? 'y' : ''} ${e.tipo === 'ROJA' || e.segundaAmarilla ? 'rd' : ''}`}
                    >
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <b className="num w-9">{e.minuto !== null ? `${e.minuto}'` : '—'}</b>
                        <span>
                          {e.segundaAmarilla ? 'Doble amarilla' : ETIQUETA[e.tipo]} ·{' '}
                          <NombreJugador j={e.jugador} org={org} className="font-semibold" />
                        </span>
                        <span className="text-xs text-mute">
                          {e.lado === 'LOCAL' ? p.local : p.visitante}
                        </span>
                        {(e.tipo === 'GOL' || e.tipo === 'GOL_EN_CONTRA') && (
                          <span className="num ml-auto rounded-full bg-black/5 px-2 py-0.5 text-xs font-bold">
                            {e.marcador.local}-{e.marcador.visitante}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {!jugado(p) && (
            <section className="tile rise" style={{ '--d': 1 } as React.CSSProperties}>
              <h2 className="mb-3 text-xl font-bold">Cuándo y dónde</h2>
              <ul>
                <li className="list-row text-sm">
                  <Icono nombre="cal" />
                  <span className="flex-1">Día y hora</span>
                  <b>{cuando}</b>
                </li>
                <li className="list-row text-sm">
                  <Icono nombre="pin" />
                  <span className="flex-1">Cancha</span>
                  <b>{p.cancha ?? 'A confirmar'}</b>
                </li>
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          {s.figura?.jugador && (
            <section className="tile-volt rise" style={{ '--d': 2 } as React.CSSProperties}>
              <span className="eyebrow !text-ink/60">Goleador del partido</span>
              <div className="mt-4 flex items-center gap-4">
                <span className="grid size-16 shrink-0 place-items-center rounded-3xl bg-ink text-2xl font-bold text-volt animate-float">
                  {s.figura.jugador.iniciales}
                </span>
                <div>
                  <NombreJugador j={s.figura.jugador} org={org} className="text-xl font-bold leading-tight" />
                  <div className="text-sm text-ink/70">
                    {s.figura.goles === 1 ? '1 gol' : `${s.figura.goles} goles`} ·{' '}
                    {s.figura.lado === 'LOCAL' ? p.local : p.visitante}
                  </div>
                </div>
              </div>
            </section>
          )}

          <section className="tile rise" style={{ '--d': 3 } as React.CSSProperties}>
            <h2 className="mb-3 text-xl font-bold">Compartir</h2>
            <div className="relative overflow-hidden rounded-3xl bg-ink p-6 text-center text-white">
              <div className="field-pattern pointer-events-none absolute inset-0 opacity-90" />
              <div className="relative">
                <p className="text-xs uppercase text-white/50">
                  {s.torneo.nombre} · {s.torneo.modalidad}
                </p>
                <div className="num my-2 text-5xl font-bold tracking-tighter">
                  {jugado(p) ? `${p.golesLocal} - ${p.golesVisitante}` : 'vs'}
                </div>
                <p className="text-sm font-semibold">
                  {p.local} · {p.visitante}
                </p>
                <p className="mt-3 text-xs text-volt">{s.organizacion.nombre}</p>
              </div>
            </div>
            <Compartir
              url={`${base}${ruta(org, torneo, id)}`}
              texto={
                jugado(p)
                  ? `${resultado(p)} · ${s.torneo.nombre}`
                  : `${p.local} vs ${p.visitante} · ${cuando} · ${s.torneo.nombre}`
              }
              imagen={`${tarjeta}?formato=historia`}
              archivo={`${p.local}-${p.visitante}.png`.replace(/\s+/g, '-').toLowerCase()}
            />
          </section>
        </aside>
      </div>

      <section className="tile rise mt-4" style={{ '--d': 3 } as React.CSSProperties}>
        <h2 className="mb-3 text-xl font-bold">Planteles</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              [p.local, s.planteles.local],
              [p.visitante, s.planteles.visitante],
            ] as const
          ).map(([equipo, jugadores]) => (
            <div key={equipo}>
              <span className="flex items-center gap-2 font-semibold">
                <Escudo nombre={equipo} className="!size-7 !text-[9px]" />
                {equipo}
              </span>
              <ul className="mt-2">
                {jugadores.map((j, i) => (
                  <li key={`${j.id ?? i}-${j.numero}`} className="list-row !py-1.5 text-sm">
                    <span className="num w-6 text-mute">{j.numero ?? '—'}</span>
                    <NombreJugador j={j} org={org} />
                  </li>
                ))}
                {jugadores.length === 0 && <li className="text-sm text-mute">Sin plantel cargado.</li>}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </MarcoPublico>
  );
}
