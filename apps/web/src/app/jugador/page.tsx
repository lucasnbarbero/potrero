import { Icono, type NombreIcono } from '@potrero/ui';
import Link from 'next/link';
import { Escudo } from '@/componentes/ui';
import { apiServidor } from '@/lib/api';
import { fechaCorta, hora, iniciales, pesos } from '@/lib/formato';
import type { PanelJugador } from '@/lib/tipos-jugador';
import { Asistencia, Privacidad, SubirDocumento } from './Jugador';

export const metadata = { title: 'Mi perfil' };

const d = (n: number) => ({ '--d': n }) as React.CSSProperties;
const fechas = (n: number) => `${n} fecha${n === 1 ? '' : 's'}`;
const decimal = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESTADO_DOC: Record<string, [string, string]> = {
  VIGENTE: ['pill-volt', 'Aprobado'],
  POR_VENCER: ['pill-amber', 'Por vencer'],
  PENDIENTE: ['pill-amber', 'En revisión'],
  VENCIDO: ['pill-red', 'Vencido'],
  RECHAZADO: ['pill-red', 'Rechazado'],
  FALTA: ['pill-red', 'Falta'],
};
const ICONO_AVISO: Record<string, NombreIcono> = {
  PARTIDO: 'ball',
  CONVOCATORIA: 'bell',
  SANCION: 'card',
  DOCUMENTACION: 'id',
  DEUDA: 'wallet',
};

/** Panel del jugador (E20-01, E20-05): sus partidos, su asistencia, sus números, sanciones, documentos y avisos. */
export default async function MiPerfil() {
  const r = await apiServidor<PanelJugador>('/jugador');
  const t = r.estadisticas?.totales;
  const nombre = `${r.jugador.nombre} ${r.jugador.apellido}`;
  const principal = r.equipos[0];
  const sanciones = r.equipos.flatMap((e) => e.sanciones.map((s) => ({ ...s, equipo: e.equipo.nombre })));
  const activas = sanciones.filter((s) => s.activa);
  const deuda = r.equipos.reduce((a, e) => a + e.deuda.total, 0);
  const tarjetas = t
    ? ([
        ['Goles', t.goles, 'tile-volt'],
        ['Partidos', t.pj, 'tile'],
        ['Goles / partido', decimal(t.golesPorPartido), 'tile'],
        ['Tarjetas', t.amarillas + t.rojas, 'tile'],
      ] as const)
    : [];

  return (
    <>
      <div className="rise flex items-center gap-4 px-1">
        <span className="grid size-20 shrink-0 place-items-center rounded-[1.6rem] bg-ink text-2xl font-bold text-volt">
          {iniciales(nombre)}
        </span>
        <div className="min-w-0">
          <p className="eyebrow">Jugador{principal?.numero != null ? ` · #${principal.numero}` : ''}</p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{nombre}</h1>
          <p className="text-sm text-mute">
            {r.equipos.map((e) => e.equipo.nombre).join(' · ') || 'Sin equipo'}
            {principal?.torneo ? ` · ${principal.torneo.nombre}` : ''}
            {principal?.posicion ? ` · ${principal.posicion.posicion}° puesto` : ''}
          </p>
        </div>
        {activas.length > 0 ? (
          <span className="pill-red ml-auto hidden sm:inline-flex">Suspendido</span>
        ) : principal && !principal.habilitado ? (
          <span className="pill-amber ml-auto hidden sm:inline-flex">No habilitado</span>
        ) : (
          <span className="pill-volt ml-auto hidden sm:inline-flex">Habilitado</span>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-6 lg:grid-cols-12">
        {r.equipos.map((e, i) => {
          const p = e.proximo;
          return (
            <section
              key={e.equipo.id}
              className="tile-ink rise md:col-span-6 lg:col-span-8"
              style={d(1 + i)}
              data-testid="proximo-jugador"
            >
              <div className="field-pattern pointer-events-none absolute inset-0 opacity-90" />
              <div className="relative">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="pill-volt">Próximo partido</span>
                  <span className="pill border-transparent bg-white/15 text-white">{e.equipo.nombre}</span>
                </div>
                {p ? (
                  <>
                    <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
                      <div>
                        <h2 className="text-4xl font-bold tracking-tighter sm:text-5xl">vs {p.rival}</h2>
                        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/60">
                          <span className="inline-flex items-center gap-1.5">
                            <Icono nombre="clock" />
                            Fecha {p.fecha}
                            {p.inicio ? ` · ${fechaCorta(p.inicio)} ${hora(p.inicio)}` : ''}
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
                      <div className="text-right">
                        <div className="num text-6xl font-bold tracking-tighter">
                          {p.confirmados}
                          <span className="text-2xl text-white/40">/{p.convocables}</span>
                        </div>
                        <div className="text-xs text-white/50">confirmaron</div>
                      </div>
                    </div>
                    <Asistencia partidoId={p.id} respuesta={p.respuesta} suspendido={p.suspendido} />
                  </>
                ) : (
                  <p className="mt-4 text-white/60">No hay partidos programados por ahora.</p>
                )}
                {e.ultimos.length > 0 && (
                  <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 pt-4 text-xs text-white/60">
                    <span>Últimos</span>
                    {e.ultimos.map((u) => (
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
          );
        })}

        <section
          className="tile rise md:col-span-6 lg:col-span-4 lg:row-span-2"
          style={d(2)}
          data-testid="avisos"
        >
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xl font-bold">Mis avisos</h2>
            {r.avisos.some((a) => a.urgencia === 'ALTA') && (
              <span className="pill-amber">
                {r.avisos.filter((a) => a.urgencia === 'ALTA').length} para hacer
              </span>
            )}
          </div>
          {r.avisos.length === 0 && <p className="py-2 text-sm text-mute">No tenés avisos nuevos.</p>}
          {r.avisos.map((a, i) => (
            <div key={i} className="list-row items-start" data-testid="aviso">
              <span
                className={`grid size-10 shrink-0 place-items-center rounded-full ${a.tipo === 'SANCION' ? 'bg-red-100 text-red-600' : a.urgencia === 'ALTA' ? 'bg-ink text-volt' : 'bg-black/10'}`}
              >
                <Icono nombre={ICONO_AVISO[a.tipo] ?? 'bell'} />
              </span>
              <div className="min-w-0 flex-1">
                <b className="block">{a.titulo}</b>
                <span className="text-xs text-mute">
                  {a.detalle}
                  {a.fecha ? ` · ${fechaCorta(a.fecha)} ${hora(a.fecha)}` : ''}
                </span>
              </div>
            </div>
          ))}
          <p className="mt-3 text-xs text-mute">
            Por ahora los avisos se ven acá; pronto también por notificación.
          </p>
        </section>

        {tarjetas.map(([titulo, valor, clase], i) => (
          <section key={titulo} className={`${clase} rise md:col-span-3 lg:col-span-2`} style={d(3 + i)}>
            <span className={`eyebrow ${clase === 'tile-volt' ? '!text-ink/60' : ''}`}>{titulo}</span>
            <div className="num mt-2 text-5xl font-bold tracking-tighter" data-testid={`mi-${titulo}`}>
              {valor}
            </div>
          </section>
        ))}

        <section className="tile rise md:col-span-6 lg:col-span-5" style={d(7)} data-testid="mis-sanciones">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xl font-bold">Mis sanciones</h2>
            {activas.length > 0 ? (
              <span className="pill-red">Suspendido</span>
            ) : (
              <span className="pill-volt">Sin suspensión</span>
            )}
          </div>
          {sanciones.length === 0 && (
            <p className="py-2 text-sm text-mute">No tenés sanciones. ¡Seguí así!</p>
          )}
          {sanciones.map((s) => (
            <div key={s.id} className="list-row">
              <span
                className={`grid size-11 shrink-0 place-items-center rounded-full ${s.activa ? 'bg-red-100 text-red-600' : 'bg-black/10'}`}
              >
                <Icono nombre="card" />
              </span>
              <div className="min-w-0 flex-1">
                <b className="block truncate">{s.causa}</b>
                <span className={`text-xs ${s.activa ? 'font-medium text-red-600' : 'text-mute'}`}>
                  {s.equipo} · {fechas(s.partidos)}
                  {s.activa ? ` · te faltan ${fechas(s.restantes)}` : ' · cumplida'}
                </span>
              </div>
            </div>
          ))}
        </section>

        <section
          className="tile rise md:col-span-6 lg:col-span-7"
          style={d(8)}
          data-testid="mi-documentacion"
        >
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xl font-bold">Mi documentación</h2>
            {r.documentacion.faltan > 0 ? (
              <span className="pill-red">Faltan {r.documentacion.faltan}</span>
            ) : (
              <span className="pill-volt">Al día</span>
            )}
          </div>
          {r.documentacion.items.length === 0 && (
            <p className="py-2 text-sm text-mute">Tus torneos no exigen documentación.</p>
          )}
          {r.documentacion.items.map((doc) => {
            const [clase, texto] = ESTADO_DOC[doc.estado] ?? ['pill', doc.estado];
            return (
              <div key={doc.tipo} className="list-row flex-wrap" data-testid="mi-documento">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-black/10">
                  <Icono nombre="id" />
                </span>
                <div className="min-w-0 flex-1">
                  <b className="block">{doc.nombre}</b>
                  <span className="text-xs text-mute">
                    {doc.requerido ? 'Lo pide tu torneo' : 'Cargado'}
                    {doc.tipo === 'AUTORIZACION_MENOR' && !doc.ok
                      ? ' · la firma tu tutor con el link de la liga'
                      : ''}
                  </span>
                </div>
                <span className={clase}>{texto}</span>
                {doc.puedeSubir && <SubirDocumento tipo={doc.tipo} nombre={doc.nombre} />}
              </div>
            );
          })}
        </section>

        <section className="tile rise md:col-span-6 lg:col-span-7" style={d(9)} data-testid="mi-trayectoria">
          <h2 className="mb-1 text-xl font-bold">Trayectoria</h2>
          {r.estadisticas ? (
            <div className="timeline mt-3">
              {r.estadisticas.trayectoria.map((x) => (
                <div key={`${x.torneo.slug}-${x.equipo}`} className="ev">
                  <Link
                    href={`/t/${r.organizacion.slug}/${x.torneo.slug}`}
                    className="flex items-center gap-3"
                  >
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
                        {x.torneo.nombre}
                        {x.torneo.estado === 'EN_CURSO' ? ' · En curso' : ''}
                      </span>
                    </div>
                    <div className="text-right">
                      <b className="num">{x.estadisticas.goles} G</b>
                      <div className="text-xs text-mute">{x.estadisticas.pj} PJ</div>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-mute">Tu perfil público no está activo todavía.</p>
          )}
          {r.jugador.perfilPublico && (
            <Link
              href={`/t/${r.organizacion.slug}/jugador/${r.jugador.id}`}
              className="btn-glass btn-sm mt-4"
            >
              <Icono nombre="globe" />
              Ver mi perfil público
            </Link>
          )}
        </section>

        <div className="space-y-4 md:col-span-6 lg:col-span-5">
          <section className="tile rise" style={d(10)}>
            <h2 className="mb-2 text-xl font-bold">Cómo aparezco</h2>
            <Privacidad p={r.privacidad} menor={r.jugador.menor} />
          </section>

          <section className="tile rise" style={d(11)} data-testid="deuda-equipo">
            <div className="flex items-center justify-between">
              <span className="eyebrow">Deuda de tu equipo</span>
              {deuda > 0 ? (
                <span className="pill-amber">Pendiente</span>
              ) : (
                <span className="pill-volt">Al día</span>
              )}
            </div>
            <div className="num mt-3 text-4xl font-bold tracking-tighter">{pesos(deuda)}</div>
            <p className="mt-2 text-xs text-mute">
              {deuda > 0
                ? 'La deuda es del equipo: la paga tu capitán con el link de la liga.'
                : 'Tu equipo no le debe nada a la liga.'}
            </p>
          </section>

          {r.terminos && (
            <p className="px-2 text-xs text-mute">
              Aceptaste los términos (versión {r.terminos.version}) el {fechaCorta(r.terminos.aceptadosEn)}.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
