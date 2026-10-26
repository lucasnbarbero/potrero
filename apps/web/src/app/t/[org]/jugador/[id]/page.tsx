import type { Logro } from '@potrero/shared';
import { Icono, type NombreIcono } from '@potrero/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { MarcoPublico } from '@/componentes/MarcoPublico';
import { Escudo } from '@/componentes/ui';
import { apiPublica } from '@/lib/api';
import { fechaCorta } from '@/lib/formato';
import type { JugadorPerfil } from '@/lib/tipos-publico';

type Props = PageProps<'/t/[org]/jugador/[id]'>;

const decimal = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const modalidad = (m: string | null) => (m ? m.replace('F', 'Fútbol ') : null);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { org, id } = await params;
  const s = await apiPublica<JugadorPerfil>(`/publico/${org}/jugadores/${id}`);
  const t = s.totales;
  return {
    title: `${s.jugador.nombre} · ${s.organizacion.nombre}`,
    description: `${t.goles} goles en ${t.pj} partidos${s.equipoActual ? ` · ${s.equipoActual.nombre}` : ''}.`,
  };
}

function textoLogro(l: Logro): { icono: NombreIcono; texto: string; clase: string } {
  switch (l.tipo) {
    case 'GOLEADOR':
      return { icono: 'trophy', texto: `Goleador ${l.torneo}`, clase: 'pill-volt' };
    case 'HAT_TRICK':
      return { icono: 'ball', texto: 'Hat-trick', clase: 'pill-ink' };
    case 'DOBLETE':
      return { icono: 'ball', texto: 'Doblete', clase: 'pill-ink' };
    case 'SIN_ROJAS':
      return { icono: 'shield', texto: 'Sin rojas', clase: 'pill' };
  }
}

export default async function PerfilDelJugador({ params }: Props) {
  const { org, id } = await params;
  const s = await apiPublica<JugadorPerfil>(`/publico/${org}/jugadores/${id}`);
  const t = s.totales;
  const actual = s.equipoActual;
  const tarjetas = [
    ['Goles', t.goles, 'tile-volt'],
    ['Partidos', t.pj, 'tile'],
    ['Goles / partido', decimal(t.golesPorPartido), 'tile'],
    ['Tarjetas', t.amarillas + t.rojas, 'tile'],
  ] as const;

  return (
    <MarcoPublico liga={s.organizacion} etiqueta="Jugador">
      <section className="tile-ink rise !p-6 sm:!p-8">
        <div className="field-pattern pointer-events-none absolute inset-0 opacity-90" />
        <div className="pointer-events-none absolute -right-16 -top-16 size-72 rounded-full bg-volt/30 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-6">
          <span className="grid size-28 shrink-0 place-items-center rounded-[2rem] bg-volt text-4xl font-bold text-ink animate-float">
            {s.jugador.iniciales}
          </span>
          <div className="min-w-0 flex-1">
            {actual?.modalidad && (
              <span className="pill border-transparent bg-white/15 text-white">
                {actual.numero !== null ? `#${actual.numero} · ` : ''}
                {modalidad(actual.modalidad)}
              </span>
            )}
            <h1 className="mt-3 text-5xl font-bold tracking-tighter sm:text-6xl">{s.jugador.nombre}</h1>
            <p className="mt-1 text-white/60">
              {actual ? actual.nombre : 'Sin equipo'} · {s.organizacion.nombre}
            </p>
          </div>
          {actual?.torneo && actual.torneoSlug && (
            <Link
              href={`/t/${org}/${actual.torneoSlug}`}
              className="rounded-3xl bg-white/10 px-6 py-4 text-center backdrop-blur hover:bg-white/15"
            >
              <div className="text-xs text-white/50">Juega</div>
              <div className="font-bold text-volt">{actual.torneo}</div>
            </Link>
          )}
        </div>
      </section>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tarjetas.map(([titulo, valor, clase], i) => (
          <section key={titulo} className={`${clase} rise`} style={{ '--d': i + 1 } as React.CSSProperties}>
            <span className={`eyebrow ${clase === 'tile-volt' ? '!text-ink/60' : ''}`}>{titulo}</span>
            <div className="num mt-2 text-6xl font-bold tracking-tighter" data-testid={`dato-${titulo}`}>
              {valor}
            </div>
            {titulo === 'Tarjetas' && (
              <div className="mt-1 flex items-center gap-3 text-sm text-mute">
                <span className="flex items-center gap-1">
                  <span className="h-4 w-3 rounded-sm bg-amber-400" />
                  {t.amarillas} amarilla{t.amarillas === 1 ? '' : 's'}
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-4 w-3 rounded-sm bg-red-500" />
                  {t.rojas} roja{t.rojas === 1 ? '' : 's'}
                </span>
              </div>
            )}
          </section>
        ))}
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="tile rise" style={{ '--d': 5 } as React.CSSProperties}>
          <h2 className="mb-1 text-xl font-bold">Trayectoria</h2>
          <div className="timeline mt-3" data-testid="trayectoria">
            {s.trayectoria.map((x) => (
              <div key={`${x.torneo.slug}-${x.equipo}`} className="ev">
                <Link href={`/t/${org}/${x.torneo.slug}`} className="flex items-center gap-3">
                  <Escudo nombre={x.equipo} />
                  <div className="min-w-0 flex-1">
                    <b className="block">
                      {x.equipo}
                      {x.goleador && (
                        <span className="pill-volt ml-1">
                          <Icono nombre="trophy" />
                          Goleador
                        </span>
                      )}
                    </b>
                    <span className="text-xs text-mute">
                      {x.torneo.nombre} · {modalidad(x.torneo.modalidad)}
                      {x.torneo.estado === 'INSCRIPCION'
                        ? ' · Inscripto'
                        : x.torneo.estado === 'EN_CURSO'
                          ? ' · En curso'
                          : ''}
                    </span>
                  </div>
                  <div className="text-right">
                    <b className="num">{x.estadisticas.goles} G</b>
                    <div className="text-xs text-mute">{x.estadisticas.pj} PJ</div>
                  </div>
                </Link>
              </div>
            ))}
            {s.trayectoria.length === 0 && <p className="text-sm text-mute">Todavía no jugó torneos.</p>}
          </div>
        </section>

        <div className="space-y-4">
          <section className="tile rise" style={{ '--d': 6 } as React.CSSProperties}>
            <h2 className="mb-3 text-xl font-bold">Logros</h2>
            <div className="flex flex-wrap gap-2">
              {s.logros.map((l) => {
                const x = textoLogro(l);
                return (
                  <span key={x.texto} className={x.clase}>
                    <Icono nombre={x.icono} />
                    {x.texto}
                  </span>
                );
              })}
              {s.logros.length === 0 && (
                <span className="text-sm text-mute">Los logros aparecen jugando.</span>
              )}
            </div>
          </section>

          <section className="tile rise" style={{ '--d': 7 } as React.CSSProperties}>
            <h2 className="mb-2 text-xl font-bold">Últimos partidos</h2>
            <ul>
              {s.ultimos.map((u) => (
                <li key={u.id}>
                  <Link
                    href={`/t/${org}/${u.torneoSlug}/partido/${u.id}`}
                    className="list-row text-sm hover:bg-black/[0.02]"
                  >
                    <span
                      className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                        u.resultado === 'G'
                          ? 'bg-volt text-ink'
                          : u.resultado === 'P'
                            ? 'bg-red-500 text-white'
                            : 'bg-black/10'
                      }`}
                    >
                      {u.resultado}
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate">vs {u.rival}</b>
                      <span className="text-xs text-mute">{fechaCorta(u.inicio)}</span>
                    </span>
                    {u.goles > 0 && (
                      <span className="flex items-center gap-0.5 text-xs font-bold">
                        <Icono nombre="ball" />
                        {u.goles > 1 ? `x${u.goles}` : ''}
                      </span>
                    )}
                    {u.amarillas > 0 && <span className="h-4 w-3 rounded-sm bg-amber-400" title="Amarilla" />}
                    {u.rojas > 0 && <span className="h-4 w-3 rounded-sm bg-red-500" title="Roja" />}
                    <span className="num w-12 shrink-0 rounded-full bg-black/5 py-1 text-center font-bold">
                      {u.marcador}
                    </span>
                  </Link>
                </li>
              ))}
              {s.ultimos.length === 0 && (
                <li className="text-sm text-mute">Todavía no hay partidos jugados.</li>
              )}
            </ul>
          </section>
        </div>
      </div>
      <p className="mt-6 text-center text-xs text-mute">
        Perfil público con el nombre que eligió el jugador. Nunca mostramos documento, fecha de nacimiento ni
        contacto.
      </p>
    </MarcoPublico>
  );
}
