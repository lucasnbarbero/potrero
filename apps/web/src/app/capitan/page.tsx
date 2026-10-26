import { Icono } from '@potrero/ui';
import Link from 'next/link';
import { Escudo, Vacio } from '@/componentes/ui';
import { apiServidor } from '@/lib/api';
import { fechaCorta, hora, pesos } from '@/lib/formato';
import type { PanelCapitan } from '@/lib/tipos-capitan';
import { AltaJugador, BajaJugador, Convocatoria, Descargo } from './Capitan';

export const metadata = { title: 'Mi equipo' };

const CAUSA: Record<string, string> = {
  ROJA_DIRECTA: 'Roja directa',
  DOBLE_AMARILLA: 'Doble amarilla',
  ACUMULACION: 'Amarillas acumuladas',
  TRIBUNAL: 'Tribunal',
};
const fechas = (n: number) => `${n} fecha${n === 1 ? '' : 's'}`;
const d = (n: number) => ({ '--d': n }) as React.CSSProperties;
const whatsapp = (texto: string) => `https://wa.me/?text=${encodeURIComponent(texto)}`;
const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : /[aeiou]$/.test(s) ? 's' : 'es'}`;

/** Panel del capitán (E19, mock 07): su equipo y nada más. */
export default async function MiEquipo({ searchParams }: PageProps<'/capitan'>) {
  const { torneoId } = await searchParams;
  const r = await apiServidor<PanelCapitan>(
    typeof torneoId === 'string' ? `/capitan?torneoId=${encodeURIComponent(torneoId)}` : '/capitan',
  );
  const p = r.proximo;
  const conv = r.convocatoria;
  const pendientes = r.plantel.filter((j) => j.convocatoria === 'PENDIENTE');
  const avisoPendientes = p
    ? `¡Hola! Jugamos vs ${p.rival} el ${fechaCorta(p.inicio)} a las ${hora(p.inicio)}${p.cancha ? ` en ${p.cancha}` : ''}. Falta que confirmen: ${pendientes.map((j) => j.nombre).join(', ')}. ¿Vienen?`
    : '';
  const suspendidas = r.sanciones.filter((s) => s.activa);
  const abiertos = r.expedientes.filter((e) => e.estado === 'ABIERTO');
  return (
    <>
      <div className="rise flex items-center gap-4 px-1">
        <Escudo nombre={r.equipo.nombre} className="size-20 text-2xl" />
        <div className="min-w-0">
          <p className="eyebrow">Capitán · {r.capitan}</p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{r.equipo.nombre}</h1>
          <p className="text-sm text-mute">
            {r.torneo ? r.torneo.nombre : 'Sin torneo activo'}
            {r.posicion?.grupo ? ` · Grupo ${r.posicion.grupo}` : ''}
            {r.posicion ? ` · ${r.posicion.posicion}° puesto · ${r.posicion.pts} pts` : ''}
          </p>
        </div>
      </div>
      {r.torneos.length > 1 && (
        <nav className="seg" aria-label="Torneos del equipo">
          {r.torneos.map((t) => (
            <Link key={t.id} href={`/capitan?torneoId=${t.id}`} className={t.id === r.torneo?.id ? 'on' : ''}>
              {t.nombre}
            </Link>
          ))}
        </nav>
      )}

      <div className="grid gap-4 md:grid-cols-6 lg:grid-cols-12">
        <section className="tile-ink rise md:col-span-6 lg:col-span-8" style={d(1)} data-testid="proximo">
          <div className="field-pattern pointer-events-none absolute inset-0 opacity-90" />
          <div className="relative">
            <span className="pill-volt">Próximo partido</span>
            {p ? (
              <>
                <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <h2 className="text-4xl font-bold tracking-tighter sm:text-5xl">vs {p.rival}</h2>
                    <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/60">
                      <span className="inline-flex items-center gap-1.5">
                        <Icono nombre="clock" />
                        Fecha {p.fecha} · {fechaCorta(p.inicio)} {hora(p.inicio)}
                      </span>
                      {p.cancha && (
                        <span className="inline-flex items-center gap-1.5">
                          <Icono nombre="pin" />
                          {p.cancha}
                        </span>
                      )}
                      <span>{p.local ? 'Local' : 'Visitante'}</span>
                    </p>
                  </div>
                  {conv && (
                    <div className="text-right">
                      <div className="num text-6xl font-bold tracking-tighter">
                        {conv.va}
                        <span className="text-2xl text-white/40">/{conv.convocables}</span>
                      </div>
                      <div className="text-xs text-white/50">confirmaron</div>
                    </div>
                  )}
                </div>
                {conv && (
                  <div className="bar mt-5 !bg-white/15">
                    <i
                      style={{
                        width: `${conv.convocables ? Math.round((conv.va / conv.convocables) * 100) : 0}%`,
                        background: '#d6ff3d',
                      }}
                    />
                  </div>
                )}
                <div className="mt-5 flex flex-wrap gap-2">
                  {pendientes.length > 0 && (
                    <a className="btn-volt" href={whatsapp(avisoPendientes)} target="_blank" rel="noreferrer">
                      <Icono nombre="whatsapp" />
                      Avisar a los pendientes
                    </a>
                  )}
                  {conv && conv.suspendidos > 0 && (
                    <span className="pill-red self-center">{plural(conv.suspendidos, 'suspendido')}</span>
                  )}
                </div>
              </>
            ) : (
              <p className="mt-4 text-white/60">No hay partidos programados por ahora.</p>
            )}
            {r.ultimos.length > 0 && (
              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 pt-4 text-xs text-white/60">
                <span>Últimos</span>
                {r.ultimos.map((u) => (
                  <span key={u.id} className="inline-flex items-center gap-1.5">
                    <b
                      className={`grid size-5 place-items-center rounded-full text-[10px] ${u.resultado === 'G' ? 'bg-volt text-ink' : u.resultado === 'E' ? 'bg-white/20 text-white' : 'bg-red-500 text-white'}`}
                    >
                      {u.resultado}
                    </b>
                    {u.gf}-{u.gc} vs {u.rival}
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="tile rise md:col-span-3 lg:col-span-4" style={d(2)} data-testid="deudas">
          <div className="flex items-center justify-between">
            <span className="eyebrow">Deuda del equipo</span>
            {r.deudas.total > 0 ? (
              <span className="pill-amber">{plural(r.deudas.cargos.length, 'pendiente')}</span>
            ) : (
              <span className="pill-volt">Al día</span>
            )}
          </div>
          <div className="num mt-3 text-5xl font-bold tracking-tighter">{pesos(r.deudas.total)}</div>
          {r.deudas.cargos.length > 0 ? (
            <ul className="mt-3 space-y-1.5 text-sm">
              {r.deudas.cargos.slice(0, 4).map((c) => (
                <li key={c.id} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {c.concepto}
                    {c.vence && <span className="text-xs text-mute"> · vence {fechaCorta(c.vence)}</span>}
                  </span>
                  <b className="num">{pesos(c.saldo)}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-mute">El equipo no le debe nada a la liga.</p>
          )}
          <p className="mt-4 text-xs text-mute">Se paga con el link que manda la liga o en la cancha.</p>
        </section>

        <section className="tile rise md:col-span-6 lg:col-span-8" style={d(3)}>
          {p && conv ? (
            <Convocatoria partidoId={p.id} plantel={r.plantel} />
          ) : (
            <>
              <h2 className="text-xl font-bold">Convocatoria</h2>
              <p className="mt-2 text-sm text-mute">Se arma cuando haya un próximo partido programado.</p>
            </>
          )}
        </section>

        <section className="tile rise md:col-span-6 lg:col-span-4" style={d(4)} data-testid="documentacion">
          <h2 className="mb-3 text-xl font-bold">Documentación</h2>
          {r.documentacion.faltantes.length === 0 ? (
            <p className="text-sm text-mute">
              {r.documentacion.requeridos.length
                ? 'Toda la documentación está al día.'
                : 'El torneo no exige documentación.'}
            </p>
          ) : (
            <div className="space-y-4">
              {r.documentacion.faltantes.map((f) => (
                <div key={f.tipo}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <b>{f.nombre}</b>
                    <span className="num text-mute">
                      {f.completos}/{f.total}
                    </span>
                  </div>
                  <div className="bar">
                    <i style={{ width: `${f.total ? Math.round((f.completos / f.total) * 100) : 0}%` }} />
                  </div>
                  {f.faltan.length > 0 && (
                    <p className="mt-1.5 text-xs text-mute">
                      Falta: {f.faltan.map((x) => x.nombre).join(', ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 text-xs text-mute">
            {r.documentacion.habilitados} de {r.documentacion.total} habilitados para jugar.
          </p>
          {r.documentacion.faltantes.some((f) => f.faltan.length) && (
            <a
              className="btn-glass mt-4 w-full"
              href={whatsapp(r.documentacion.textoWhatsapp)}
              target="_blank"
              rel="noreferrer"
            >
              <Icono nombre="whatsapp" />
              Pedir faltantes por WhatsApp
            </a>
          )}
        </section>

        <section className="tile rise md:col-span-6 lg:col-span-7" style={d(5)} data-testid="sanciones">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xl font-bold">Sanciones y descargos</h2>
            {abiertos.length > 0 && <span className="pill-red">{plural(abiertos.length, 'abierto')}</span>}
          </div>
          {suspendidas.length === 0 && r.expedientes.length === 0 && (
            <p className="py-2 text-sm text-mute">Sin sanciones ni expedientes.</p>
          )}
          {suspendidas.map((s) => (
            <div key={s.id} className="list-row">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-red-100 font-bold text-red-600">
                <Icono nombre="card" />
              </span>
              <div className="min-w-0 flex-1">
                <b className="block truncate">{s.jugador}</b>
                <span className="text-xs font-medium text-red-600">
                  {CAUSA[s.causa] ?? s.causa} · le quedan {fechas(s.restantes)}
                </span>
              </div>
              <span className="pill-red">Suspendido</span>
            </div>
          ))}
          {r.expedientes.map((e) => (
            <div key={e.id} className="list-row block" data-testid="expediente-capitan">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <b className="block">
                    {e.jugador ? `${e.jugador} · ` : ''}
                    {e.tipoNombre}
                  </b>
                  <span className="text-sm text-mute">{e.motivo}</span>
                </div>
                {e.estado === 'ABIERTO' ? (
                  <span className={e.descargo ? 'pill-amber' : 'pill-red'}>
                    {e.descargo ? 'Descargo enviado' : 'Esperando tu descargo'}
                  </span>
                ) : (
                  <span className="pill-ink">Resuelto</span>
                )}
              </div>
              {e.informeArbitro && (
                <p className="mt-2 rounded-2xl bg-black/5 px-4 py-3 text-sm">
                  <b>Informe del árbitro:</b> “{e.informeArbitro}”
                </p>
              )}
              {e.estado === 'ABIERTO' ? (
                <Descargo id={e.id} actual={e.descargo} />
              ) : (
                <>
                  {e.descargo && (
                    <p className="mt-2 rounded-2xl bg-black/5 px-4 py-3 text-sm">
                      <b>Descargo:</b> “{e.descargo}”
                    </p>
                  )}
                  <p className="mt-2 text-sm">
                    <b>Resolución:</b> {fechas(e.partidosResueltos ?? 0)}
                    {e.multa > 0 && <> · Multa {pesos(e.multa)}</>}
                    {e.resolucion && <span className="text-mute"> · {e.resolucion}</span>}
                  </p>
                </>
              )}
            </div>
          ))}
        </section>

        <section className="tile rise md:col-span-6 lg:col-span-5" style={d(6)} data-testid="tabla">
          <h2 className="mb-2 text-xl font-bold">
            Tabla{r.posicion?.grupo ? ` · Grupo ${r.posicion.grupo}` : ''}
          </h2>
          {r.tabla.length === 0 ? (
            <p className="text-sm text-mute">Todavía no hay tabla.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="th">#</th>
                  <th className="th">Equipo</th>
                  <th className="th text-right">PJ</th>
                  <th className="th text-right">DG</th>
                  <th className="th text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {r.tabla.map((f) => (
                  <tr key={f.equipo} className={f.propio ? 'bg-volt/40 font-bold' : ''}>
                    <td className="td num">{f.posicion}</td>
                    <td className="td">{f.equipo}</td>
                    <td className="td num text-right">{f.pj}</td>
                    <td className="td num text-right">{f.dg > 0 ? `+${f.dg}` : f.dg}</td>
                    <td className="td num text-right">{f.pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="tile rise md:col-span-6 lg:col-span-12" style={d(7)} data-testid="plantel">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-bold">Plantel</h2>
            <span className="pill">{plural(r.plantel.length, 'jugador')}</span>
          </div>
          {r.plantel.length === 0 ? (
            <Vacio titulo="Sin jugadores" texto="Sumá a tus jugadores para poder jugar." />
          ) : (
            <ul className="grid gap-x-6 md:grid-cols-2">
              {r.plantel.map((j) => (
                <li key={j.jugadorId} className="list-row" data-testid="jugador-plantel">
                  <span className="num grid size-11 shrink-0 place-items-center rounded-full bg-black/10 font-bold">
                    {j.numero ?? '—'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <b className="block truncate">{j.nombre}</b>
                    <span
                      className={`block truncate text-xs ${j.habilitado ? 'text-mute' : 'font-medium text-red-600'}`}
                    >
                      {j.habilitado ? 'Habilitado' : j.motivos.join(' · ')}
                      {j.goles > 0 && ` · ${plural(j.goles, 'gol')}`}
                    </span>
                  </div>
                  {!j.habilitado && <span className="pill-red hidden sm:inline-flex">No habilitado</span>}
                  <BajaJugador jugadorId={j.jugadorId} nombre={j.nombre} baja={j.baja} />
                </li>
              ))}
            </ul>
          )}
          <AltaJugador />
        </section>
      </div>
    </>
  );
}
