// Panel del organizador (E18, mock 01-dashboard): lo que pasa hoy en la liga y qué conviene hacer.
import { type AlertaPanel, DATOS } from '@potrero/shared';
import { Icono, type NombreIcono } from '@potrero/ui';
import Link from 'next/link';
import { Escudo, Vacio } from '@/componentes/ui';
import { apiServidor } from '@/lib/api';
import { hora, pesos } from '@/lib/formato';
import type { Tablero } from '@/lib/tipos-panel';
import { AccionSugerencia, RecordarDeudores } from './Acciones';
import { EnVivo } from './EnVivo';

export const metadata = { title: 'Panel' };

const ZONA = 'America/Argentina/Buenos_Aires';

const ICONO_ALERTA: Record<AlertaPanel['tipo'], NombreIcono> = {
  SUSPENDIDO_JUGO: 'shield',
  ACTA_SIN_CARGAR: 'flag',
  SIN_ARBITRO: 'whistle',
  DOCUMENTO_VENCIDO: 'id',
  PAGO_SIN_CONCILIAR: 'wallet',
  NO_PUEDO: 'cal',
  MENSAJES_FALLIDOS: 'whatsapp',
};
const COLOR_GRAVEDAD: Record<AlertaPanel['gravedad'], string> = {
  ALTA: 'bg-red-100 text-red-600',
  MEDIA: 'bg-amber-100 text-amber-700',
  BAJA: 'bg-black/5 text-ink',
};

const saludo = () => {
  const h = Number(
    new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, hour: 'numeric', hourCycle: 'h23' }).format(
      new Date(),
    ),
  );
  return h < 13 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
};
const hoyLargo = () => {
  const t = new Intl.DateTimeFormat('es-AR', {
    timeZone: ZONA,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
  return t.charAt(0).toUpperCase() + t.slice(1).replace(',', '');
};
/** Las fechas de vencimiento son días (sin hora): se muestran tal cual, sin pasar por la zona horaria. */
const diaDeVencimiento = (iso: string) =>
  new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', weekday: 'short', day: 'numeric' })
    .format(new Date(iso))
    .replace('.', '')
    .replace(',', '');

/** Línea del cobrado acumulado: una sola serie, sin ejes (el número grande es el dato); cada día tiene su tooltip. */
function Linea({ serie }: { serie: Tablero['dinero']['serie'] }) {
  if (serie.length < 2) return null;
  const max = Math.max(...serie.map((p) => p.cobrado));
  const min = Math.min(...serie.map((p) => p.cobrado));
  const x = (i: number) => (i / (serie.length - 1)) * 300;
  const y = (v: number) => 64 - ((v - min) / Math.max(1, max - min)) * 56;
  const d = serie.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.cobrado).toFixed(1)}`).join(' ');
  return (
    <svg
      viewBox="0 0 300 70"
      className="mt-5 w-full"
      fill="none"
      role="img"
      aria-label={`Cobrado acumulado en los últimos ${serie.length} días: de ${pesos(serie[0]!.cobrado)} a ${pesos(serie.at(-1)!.cobrado)}`}
    >
      <path d={`${d} V70 H0z`} fill="#0a0a0a" fillOpacity=".08" />
      <path d={d} stroke="#0a0a0a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {serie.map((p, i) => (
        <rect key={p.dia} x={x(i) - 5} y={0} width={10} height={70} fill="transparent">
          <title>{`${p.dia.slice(8)}/${p.dia.slice(5, 7)} · ${pesos(p.cobrado)}`}</title>
        </rect>
      ))}
    </svg>
  );
}

export default async function Panel() {
  const [t, yo] = await Promise.all([
    apiServidor<Tablero>('/panel/tablero'),
    apiServidor<{ usuario: { nombre: string } }>('/auth/yo'),
  ]);
  const enInscripcion = t.torneos.find((x) => x.estado === 'INSCRIPCION');
  const primerNombre = yo.usuario.nombre.split(/\s+/)[0];
  const [sugerencia, ...otras] = t.sugerencias;

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="rise mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{hoyLargo()}</p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight sm:text-5xl">
            {saludo()}, {primerNombre}.
          </h1>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {enInscripcion && (
            <Link href={`/panel/torneos/${enInscripcion.id}`} className="btn-glass flex-1 sm:flex-none">
              <Icono nombre="share" />
              Compartir inscripción
            </Link>
          )}
          <Link href="/panel/torneos/nuevo" className="btn-volt flex-1 sm:flex-none">
            <Icono nombre="plus" />
            Nuevo torneo
          </Link>
        </div>
      </div>

      {/* Título de la grilla para lectores de pantalla (y el ancla de los recorridos E2E). */}
      <h2 className="sr-only">Hoy en tu liga</h2>
      {t.torneos.length === 0 && t.vivo.length === 0 ? (
        <Vacio
          titulo="Todavía no hay torneos"
          texto="Creá tu primer torneo: elegís modalidad y formato y abrís la inscripción con un link."
        >
          <Link href="/panel/torneos/nuevo" className="btn-volt mt-3">
            Crear torneo
          </Link>
        </Vacio>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-6 xl:grid-cols-12">
          {/* Partido en vivo */}
          <section
            className="tile-ink rise md:col-span-6 xl:col-span-8"
            style={{ '--d': 1 } as React.CSSProperties}
            aria-label="Partido en vivo"
          >
            <div className="field-pattern pointer-events-none absolute inset-0 opacity-90" />
            <div className="relative">
              <EnVivo inicial={t.vivo} proximo={t.proximos[0] ?? null} />
            </div>
          </section>

          {/* Cobrado */}
          <section
            className="tile-volt rise md:col-span-3 xl:col-span-4"
            style={{ '--d': 2 } as React.CSSProperties}
          >
            <div className="flex items-center justify-between">
              <span className="eyebrow !text-ink/60">Cobrado en total</span>
              <span className="grid size-9 place-items-center rounded-full bg-ink text-volt">
                <Icono nombre="wallet" />
              </span>
            </div>
            <div className="num mt-6 text-5xl font-bold tracking-tighter">{pesos(t.dinero.cobrado)}</div>
            <p className="mt-1 text-sm text-ink/70">
              Neto tras comisión: <b>{pesos(t.dinero.neto)}</b>
            </p>
            <Linea serie={t.dinero.serie} />
            <p className="mt-1 text-xs text-ink/60">
              Evolución en los últimos {DATOS.panel.serieCobradoDias} días · Online {pesos(t.dinero.online)}
            </p>
          </section>

          {/* Equipos */}
          <section
            className="tile rise md:col-span-3 xl:col-span-3"
            style={{ '--d': 3 } as React.CSSProperties}
          >
            <div className="flex items-center justify-between">
              <span className="eyebrow">Equipos</span>
              {t.equipos.nuevos > 0 && (
                <span className="pill-volt" title="Inscriptos en la última semana">
                  +{t.equipos.nuevos}
                </span>
              )}
            </div>
            <div className="num mt-4 text-5xl font-bold tracking-tighter">{t.equipos.total}</div>
            <p className="mt-1 text-sm text-mute">
              en {t.equipos.torneos} {t.equipos.torneos === 1 ? 'torneo activo' : 'torneos activos'}
            </p>
            <div className="mt-4 flex -space-x-2">
              {t.equipos.muestra.map((n) => (
                <Escudo key={n} nombre={n} className="!size-8" />
              ))}
              {t.equipos.total > t.equipos.muestra.length && (
                <span className="grid size-8 place-items-center rounded-full bg-ink text-[11px] font-bold text-white ring-2 ring-white">
                  +{t.equipos.total - t.equipos.muestra.length}
                </span>
              )}
            </div>
          </section>

          {/* Partidos de hoy */}
          <section
            className="tile rise md:col-span-3 xl:col-span-3"
            style={{ '--d': 4 } as React.CSSProperties}
          >
            <div className="flex items-center justify-between">
              <span className="eyebrow">Partidos de hoy</span>
              <span className="pill">{t.hoyPartidos.total}</span>
            </div>
            <div className="num mt-4 text-5xl font-bold tracking-tighter">{t.hoyPartidos.total}</div>
            <p className="mt-1 text-sm text-mute">
              {t.hoyPartidos.total === 0
                ? 'Hoy no se juega'
                : [
                    `${t.hoyPartidos.enJuego} en juego`,
                    ...(t.hoyPartidos.sinArbitro ? [`${t.hoyPartidos.sinArbitro} sin árbitro`] : []),
                  ].join(' · ')}
            </p>
            <div className="mt-4 space-y-2 text-sm">
              {t.hoyPartidos.lista.map((p) => (
                <Link
                  key={p.id}
                  href={`/panel/partidos/${p.id}`}
                  className="flex justify-between gap-2 hover:underline"
                >
                  <span className="text-mute">{hora(p.inicio)}</span>
                  <b className="truncate">
                    {p.local} vs {p.visitante}
                  </b>
                </Link>
              ))}
            </div>
          </section>

          {/* Pendiente */}
          <section
            className="tile rise md:col-span-6 xl:col-span-6"
            style={{ '--d': 5 } as React.CSSProperties}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className="eyebrow">Pendiente</span>
                <div className="num mt-2 whitespace-nowrap text-3xl font-bold tracking-tighter sm:text-4xl">
                  {pesos(t.dinero.pendiente)}
                </div>
              </div>
              <RecordarDeudores cantidad={t.deudores.length} />
            </div>
            <div className="bar mt-5">
              <i style={{ width: `${t.dinero.porcentajeCobrado}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-xs text-mute">
              <span>{t.dinero.porcentajeCobrado}% cobrado</span>
              {t.dinero.proximoVence && <span>vence el {diaDeVencimiento(t.dinero.proximoVence)}</span>}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {t.deudores.slice(0, 3).map((d) => (
                <Link
                  key={`${d.torneoId}-${d.equipo}`}
                  href={`/panel/torneos/${d.torneoId}?tab=inscripciones`}
                  className={d.vencido ? 'pill-red' : 'pill-amber'}
                >
                  {d.equipo} · {pesos(d.debe)}
                </Link>
              ))}
              {t.deudores.length > 3 && <span className="pill">+{t.deudores.length - 3} más</span>}
              {t.deudores.length === 0 && <span className="text-sm text-mute">Nadie debe nada.</span>}
            </div>
          </section>

          {/* Requiere atención */}
          <section
            className="tile rise md:col-span-3 xl:col-span-5"
            style={{ '--d': 6 } as React.CSSProperties}
            aria-label="Requiere atención"
          >
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-lg font-bold">Requiere atención</h2>
              <span className="pill-ink">{t.alertas.length}</span>
            </div>
            {t.alertas.map((a) => (
              <div key={a.tipo} className="list-row" data-alerta={a.tipo}>
                <span
                  className={`grid size-10 shrink-0 place-items-center rounded-2xl ${COLOR_GRAVEDAD[a.gravedad]}`}
                >
                  <Icono nombre={ICONO_ALERTA[a.tipo]} />
                </span>
                <div className="min-w-0 flex-1">
                  <b className="block text-sm">{a.titulo}</b>
                  <span className="block truncate text-xs text-mute">{a.detalle}</span>
                </div>
                <Link href={a.href} className="btn-glass btn-sm shrink-0">
                  {a.accion}
                </Link>
              </div>
            ))}
            {t.alertas.length === 0 && (
              <p className="flex items-center gap-2 py-4 text-sm text-mute">
                <Icono nombre="check" />
                Todo en orden: no hay nada para resolver.
              </p>
            )}
          </section>

          {/* Torneos */}
          <section
            className="tile rise md:col-span-3 xl:col-span-4"
            style={{ '--d': 7 } as React.CSSProperties}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold">Tus torneos</h2>
              <Link href="/panel/torneos" className="text-sm font-semibold text-mute hover:text-ink">
                Ver todos →
              </Link>
            </div>
            <div className="space-y-4">
              {t.torneos.map((x) => {
                const inscripcion = x.estado === 'INSCRIPCION';
                const pct = inscripcion
                  ? (x.inscriptos / Math.max(1, x.cupo)) * 100
                  : (x.fechaActual / Math.max(1, x.fechas)) * 100;
                return (
                  <Link key={x.id} href={`/panel/torneos/${x.id}`} className="block">
                    <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                      <b className="truncate">
                        {x.nombre} · {x.modalidad}
                      </b>
                      {inscripcion ? (
                        <span className="pill-volt shrink-0">
                          Inscripción {x.inscriptos}/{x.cupo}
                        </span>
                      ) : (
                        <span className="shrink-0 text-mute">
                          {x.formato === 'COPA' ? 'Ronda' : 'Fecha'} {x.fechaActual}/{x.fechas}
                        </span>
                      )}
                    </div>
                    <div className={`bar ${inscripcion ? 'volt' : ''}`}>
                      <i style={{ width: `${Math.min(100, Math.round(pct))}%` }} />
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* Sugerencia del próximo paso */}
          <section
            className="tile-ink rise md:col-span-6 xl:col-span-3"
            style={{ '--d': 8 } as React.CSSProperties}
            data-testid="sugerencia"
          >
            <div className="field-pattern pointer-events-none absolute inset-0 opacity-70" />
            <div className="relative">
              <span className="pill border-transparent bg-white/15 text-white">
                <Icono nombre="spark" />
                Sugerencia
              </span>
              {sugerencia ? (
                <>
                  <p className="mt-4 text-lg font-semibold leading-snug">{sugerencia.texto}</p>
                  <AccionSugerencia s={sugerencia} className="btn-volt mt-5 w-full" />
                  {otras.length > 0 && (
                    <ul className="mt-5 space-y-3 border-t border-white/10 pt-4 text-sm">
                      {otras.map((o) => (
                        <li key={o.clave} className="text-white/70">
                          {o.texto}{' '}
                          <Link
                            href={o.href}
                            className="whitespace-nowrap font-semibold text-volt hover:underline"
                          >
                            {o.accion} →
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="mt-4 text-xl font-semibold leading-snug">
                  La liga está al día. Aprovechá para compartir el sitio público con los equipos.
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
