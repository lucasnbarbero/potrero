// Torneos por fases (ADR-026): pestañas por fase, tablas por grupo, llave con series de ida y vuelta y partidos.
// Lo usan el panel (con links al acta) y el sitio público.
import { Icono } from '@potrero/ui';
import Link from 'next/link';
import { fechaCorta, hora } from '@/lib/formato';
import type { FaseVista, PartidoDeFase } from '@/lib/tipos-fases';
import { Llave } from './Llave';
import { Escudo } from './ui';

const ESTADO_DE_FASE: Record<FaseVista['estado'], [string, string]> = {
  PENDIENTE: ['pill', 'Por armar'],
  EN_CURSO: ['pill-volt', 'En juego'],
  FINALIZADA: ['pill-ink', 'Terminada'],
};

export function EstadoDeFase({ estado }: { estado: FaseVista['estado'] }) {
  const [clase, texto] = ESTADO_DE_FASE[estado];
  return <span className={clase}>{texto}</span>;
}

/** Una pestaña por fase, en orden, con su estado. */
export function PestanasDeFases({
  fases,
  actual,
  href,
}: {
  fases: FaseVista[];
  actual: string;
  href: (clave: string) => string;
}) {
  return (
    <nav aria-label="Fases" className="tabs rise w-fit max-w-full">
      {fases.map((f, i) => (
        <Link key={f.id} href={href(f.clave)} className={actual === f.clave ? 'on' : ''}>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="num opacity-60">{i + 1}</span>
            {f.nombre}
            {f.estado === 'FINALIZADA' ? (
              <Icono nombre="check" />
            ) : f.estado === 'EN_CURSO' ? (
              <span className="size-2 rounded-full bg-volt ring-2 ring-ink/20" aria-label="en juego" />
            ) : null}
          </span>
        </Link>
      ))}
    </nav>
  );
}

function TablaDeGrupo({ titulo, filas }: { titulo: string; filas: FaseVista['grupos'][number]['tabla'] }) {
  return (
    <section className="tile !p-0">
      <b className="block px-5 pt-4 text-lg">{titulo}</b>
      <div className="scrollx">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr>
              {['#', 'Equipo', 'PJ', 'G', 'E', 'P', 'GF', 'GC', 'DG', 'Pts'].map((h) => (
                <th key={h} className="th">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="[&>tr]:border-t [&>tr]:border-black/5">
            {filas.map((f) => (
              <tr key={f.equipoId}>
                <td className="td font-bold">{f.posicion}</td>
                <td className="td">
                  <span className="flex items-center gap-2 font-semibold">
                    <Escudo nombre={f.equipo} className="!size-7 !text-[9px]" />
                    {f.equipo}
                  </span>
                </td>
                {[f.pj, f.pg, f.pe, f.pp, f.gf, f.gc, f.dg].map((v, i) => (
                  <td key={i} className="td num">
                    {v}
                  </td>
                ))}
                <td className="td num font-bold">{f.pts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const jugado = (estado: string) => estado === 'FINALIZADO' || estado === 'WO';

function FilaPartido({ p, href }: { p: PartidoDeFase; href: string | null }) {
  const contenido = (
    <>
      <span className="min-w-0 flex-1 truncate text-right font-semibold">{p.local}</span>
      <span className="num w-20 shrink-0 text-center font-bold">
        {jugado(p.estado) ? (
          <>
            {p.golesLocal}-{p.golesVisitante}
            {p.penalesLocal !== null && (
              <span className="block text-[10px] font-semibold text-mute">
                pen. {p.penalesLocal}-{p.penalesVisitante}
              </span>
            )}
          </>
        ) : (
          <span className="text-xs font-semibold text-mute">{p.inicio ? hora(p.inicio) : 'vs'}</span>
        )}
      </span>
      <span className="min-w-0 flex-1 truncate font-semibold">{p.visitante}</span>
    </>
  );
  return (
    <li className="border-t border-black/5 first:border-0">
      {href ? (
        <Link href={href} className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm hover:bg-black/5">
          {contenido}
        </Link>
      ) : (
        <div className="flex items-center gap-3 px-2 py-2 text-sm">{contenido}</div>
      )}
    </li>
  );
}

/** Todo lo de una fase: de dónde salen sus equipos, tablas o llave, y sus partidos por fecha. */
export function DetalleDeFase({
  fase,
  hrefPartido,
  enlazarActa = false,
  angosto = false,
}: {
  fase: FaseVista;
  hrefPartido: (id: string) => string | null;
  enlazarActa?: boolean;
  /** En una columna angosta (sitio público): las tablas de los grupos van una debajo de la otra. */
  angosto?: boolean;
}) {
  const porFecha = [...Map.groupBy(fase.partidos, (p) => p.fecha)];
  const series = fase.llave?.rondas.flatMap((r) =>
    r.partidos.filter((s) => s.piernas.length > 1).map((s) => ({ ...s, ronda: r.nombre })),
  );
  return (
    <div className="space-y-4" data-testid={`detalle-${fase.clave}`}>
      <div className="tile flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-xl tracking-tight">{fase.nombre}</b>
            <EstadoDeFase estado={fase.estado} />
            {fase.inicio === 'EN_PARALELO' && <span className="pill">En paralelo</span>}
          </div>
          <p className="mt-1 text-sm text-mute">
            {fase.entradas.join(' + ')}
            {fase.equipos || fase.previstos ? ` · ${fase.equipos || fase.previstos} equipos` : ''}
          </p>
          {fase.estado === 'PENDIENTE' && fase.rondasPrevistas.length > 0 && (
            <ol className="mt-3 flex flex-wrap gap-2 text-xs" aria-label="Rondas">
              {fase.rondasPrevistas.map((r) => (
                <li key={r.nombre} className="rounded-full bg-black/5 px-3 py-1">
                  <b>{r.nombre}</b> · {r.partidos} {r.partidos === 1 ? 'cruce' : 'cruces'} ·{' '}
                  {r.idaYVuelta ? 'ida y vuelta' : 'partido único'}
                </li>
              ))}
            </ol>
          )}
        </div>
        {fase.partidos.length > 0 && (
          <span className="text-sm text-mute">
            <b className="num text-ink">{fase.jugados}</b> de {fase.partidos.length} partidos jugados
          </span>
        )}
      </div>

      {fase.llave && (
        <section>
          <Llave llave={fase.llave} enlazarActa={enlazarActa} />
          <p className="mt-2 text-xs text-mute">
            {fase.llave.rondas.some((r) => r.idaYVuelta)
              ? `Ida y vuelta: ${fase.llave.rondas
                  .filter((r) => r.idaYVuelta)
                  .map((r) => r.nombre.toLowerCase())
                  .join(', ')}. En el cuadro se ve el global; si empata, penales en la vuelta.`
              : 'Partido único: si empata, penales.'}
          </p>
        </section>
      )}

      {series && series.length > 0 && (
        <section className="tile">
          <span className="eyebrow">Series de ida y vuelta</span>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {series.map((s) => (
              <li key={s.clave} className="rounded-2xl bg-black/5 p-3 text-sm">
                <b className="block">
                  {s.ronda}: {s.local} vs {s.visitante}
                </b>
                {s.piernas.map((p) => (
                  <span key={p.id} className="mt-1 flex justify-between gap-2 text-xs">
                    <span className="text-mute">{p.pierna === 1 ? 'Ida' : 'Vuelta'}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {p.local} {jugado(p.estado) ? `${p.golesLocal}-${p.golesVisitante}` : 'vs'}{' '}
                      {p.visitante}
                      {p.penalesLocal !== null ? ` (pen. ${p.penalesLocal}-${p.penalesVisitante})` : ''}
                    </span>
                    {!jugado(p.estado) && p.inicio && (
                      <span className="text-mute">{fechaCorta(p.inicio)}</span>
                    )}
                  </span>
                ))}
                {s.golesLocal !== null && (
                  <span className="mt-1 block text-xs font-semibold">
                    Global {s.golesLocal}-{s.golesVisitante}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {fase.grupos.length > 0 && (
        <div className={`grid gap-4 ${fase.grupos.length > 1 && !angosto ? 'xl:grid-cols-2' : ''}`}>
          {fase.grupos.map((g) => (
            <TablaDeGrupo
              key={g.grupo ?? 'tabla'}
              titulo={g.grupo ? `Grupo ${g.grupo}` : 'Tabla'}
              filas={g.tabla}
            />
          ))}
        </div>
      )}

      {porFecha.length > 0 && !fase.llave && (
        <section className="tile">
          <span className="eyebrow">Partidos</span>
          <div className="mt-2 grid gap-4 md:grid-cols-2">
            {porFecha.map(([fecha, ps]) => (
              <div key={fecha}>
                <b className="text-sm">
                  Fecha {fecha}
                  {ps[0]?.inicio ? ` · ${fechaCorta(ps[0].inicio)}` : ''}
                </b>
                <ul className="mt-1">
                  {ps.map((p) => (
                    <FilaPartido key={p.id} p={p} href={hrefPartido(p.id)} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
