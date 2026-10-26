import {
  DIAS_SEMANA,
  FRANJAS_HORARIAS,
  type Metricas as DatosMetricas,
  type MetodoPago,
  type ParDeRetencion,
  type PeriodoMetricas,
} from '@potrero/shared';
import { Icono } from '@potrero/ui';
import Link from 'next/link';
import { Encabezado, Vacio } from '@/componentes/ui';
import { apiServidor } from '@/lib/api';
import { pesos } from '@/lib/formato';
import type { Torneo } from '@/lib/tipos';
import { Reporte } from './Reporte';
import './metricas.css';

export const metadata = { title: 'Métricas' };

const PERIODOS: [PeriodoMetricas, string][] = [
  ['30D', '30 días'],
  ['TEMPORADA', 'Temporada'],
  ['HISTORICO', 'Histórico'],
];

/** Medios de pago en el orden en que se muestran, con su color (efectivo primero: es lo que más se usa hoy). */
const MEDIOS: [MetodoPago, string, string][] = [
  ['EFECTIVO', 'Efectivo', 'bg-ink'],
  ['TRANSFERENCIA', 'Transferencia', 'bg-black/25'],
  ['MERCADO_PAGO', 'Online (MP)', 'bg-volt'],
];

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);
const conSigno = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(Math.round(x * 100))}%`;

/** "Apertura 2025" → "Ap 25" para que entre debajo de la columna. */
const abreviar = (nombre: string) => {
  const m = /^(Apertura|Clausura|Invierno|Verano)\s+(?:\d{2})?(\d{2})$/.exec(nombre);
  return m ? `${m[1]!.slice(0, 2)} ${m[2]}` : nombre.length > 10 ? `${nombre.slice(0, 9)}…` : nombre;
};

/** Intensidad de la celda del mapa de calor, de gris (poco) a volt (lo más pedido). */
const calor = (n: number, max: number) => {
  if (n === 0 || max === 0) return 'bg-black/5';
  const r = n / max;
  if (r < 0.34) return 'bg-black/10';
  if (r < 0.67) return 'bg-volt/40';
  if (r < 1) return 'bg-volt/70';
  return 'bg-volt';
};

const d = (n: number) => ({ '--d': n }) as React.CSSProperties;

export default async function Metricas({ searchParams }: PageProps<'/panel/metricas'>) {
  const sp = await searchParams;
  const periodo = PERIODOS.some(([k]) => k === sp.periodo) ? (sp.periodo as PeriodoMetricas) : 'TEMPORADA';
  const torneoId = typeof sp.torneo === 'string' ? sp.torneo : '';
  const q = (extra: { periodo?: string; torneo?: string }) => {
    const p = new URLSearchParams({ periodo, ...(torneoId ? { torneo: torneoId } : {}), ...extra });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    return `?${p}`;
  };
  const [m, torneos] = await Promise.all([
    apiServidor<DatosMetricas>(`/metricas?periodo=${periodo}${torneoId ? `&torneoId=${torneoId}` : ''}`),
    apiServidor<Torneo[]>('/torneos'),
  ]);
  const elegido = torneos.find((t) => t.id === torneoId);
  const eyebrow = elegido
    ? elegido.nombre
    : periodo === 'TEMPORADA'
      ? `Temporada ${new Date().getFullYear()}`
      : periodo === '30D'
        ? 'Últimos 30 días'
        : 'Histórico de la liga';

  const { cobranza: cob, canchas, horarios, asistencia, retencion, inscriptos } = m;
  const maxEquipos = Math.max(1, ...inscriptos.serie.map((s) => s.equipos));
  const ultimoCerrado = inscriptos.serie.filter((s) => !s.abierto).at(-1);
  const totalCobrado = MEDIOS.reduce((s, [k]) => s + cob.porMedio[k].monto, 0);
  const par = retencion.pares.filter((p) => !p.abierto).at(-1) ?? retencion.pares.at(-1);
  const abierto = retencion.pares.find((p) => p.abierto);
  const pico = horarios.pico;

  return (
    <div className="space-y-4">
      <Encabezado eyebrow={eyebrow} titulo="Métricas">
        <div className="seg no-imprimir" role="tablist" aria-label="Período">
          {PERIODOS.map(([k, t]) => (
            <Link
              key={k}
              href={q({ periodo: k, torneo: '' })}
              className={!torneoId && periodo === k ? 'on' : ''}
              aria-current={!torneoId && periodo === k ? 'page' : undefined}
            >
              {t}
            </Link>
          ))}
        </div>
        <Reporte />
      </Encabezado>

      <nav className="no-imprimir flex flex-wrap gap-2 pb-2" aria-label="Torneo">
        <Link href={q({ torneo: '' })} className={!torneoId ? 'pill-ink' : 'pill'}>
          Todos los torneos
        </Link>
        {torneos
          .filter((t) => t.estado !== 'BORRADOR')
          .map((t) => (
            <Link key={t.id} href={q({ torneo: t.id })} className={torneoId === t.id ? 'pill-ink' : 'pill'}>
              {t.nombre}
            </Link>
          ))}
      </nav>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="kpis">
        <section className="tile-volt rise" style={d(1)}>
          <span className="eyebrow !text-ink/60">Retención de equipos</span>
          <div className="num mt-2 text-5xl font-bold tracking-tighter" data-testid="kpi-retencion">
            {pct(retencion.tasa)}
          </div>
          <p className="text-sm text-ink/70">se reinscribe en el siguiente torneo</p>
        </section>
        <section className="tile rise" style={d(2)}>
          <span className="eyebrow">Tasa de cobro</span>
          <div className="num mt-2 text-5xl font-bold tracking-tighter" data-testid="kpi-cobro">
            {pct(cob.tasa)}
          </div>
          <p className="text-sm text-mute">
            {pct(cob.inscripcion.tasa)} de las inscripciones, pagado antes del inicio
          </p>
        </section>
        <section className="tile rise" style={d(3)}>
          <span className="eyebrow">Ocupación de canchas</span>
          <div className="num mt-2 text-5xl font-bold tracking-tighter" data-testid="kpi-ocupacion">
            {pct(canchas.promedio)}
          </div>
          <p className="text-sm text-mute">
            promedio por jornada · {canchas.jornadas} {canchas.jornadas === 1 ? 'jornada' : 'jornadas'}
          </p>
        </section>
        <section className="tile-ink rise" style={d(4)}>
          <span className="eyebrow !text-white/50">Asistencia a partidos</span>
          <div className="num mt-2 text-5xl font-bold tracking-tighter">{pct(asistencia.tasa)}</div>
          <p className="text-sm text-white/50">
            {asistencia.wo} con equipo ausente en {asistencia.jugados} {asistencia.jugados === 1 ? 'partido' : 'partidos'}
          </p>
        </section>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[1.4fr_1fr]">
        <section className="tile rise" style={d(5)} data-testid="inscriptos">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-bold">Equipos inscriptos por torneo</h2>
            {inscriptos.variacion !== null && ultimoCerrado && (
              <span className={inscriptos.variacion >= 0 ? 'pill-volt' : 'pill'}>
                <Icono nombre="trend" />
                {conSigno(inscriptos.variacion)} vs. torneo anterior
              </span>
            )}
          </div>
          {inscriptos.serie.length === 0 ? (
            <p className="text-sm text-mute">Todavía no hay torneos de temporada.</p>
          ) : (
            <>
              <div className="metricas-cols" role="img" aria-label="Equipos inscriptos por torneo">
                {inscriptos.serie.map((s, i) => (
                  <div
                    key={s.id}
                    title={`${s.nombre}: ${s.equipos} equipos${s.abierto ? ' (inscripción abierta)' : ''}`}
                    className={
                      s.abierto ? 'ab' : s.id === ultimoCerrado?.id ? 'hi' : s.enFiltro ? 'dk' : ''
                    }
                  >
                    <b className="num text-sm text-ink">{s.equipos}</b>
                    <i style={{ height: `${(s.equipos / maxEquipos) * 80}%`, animationDelay: `${i * 70}ms` }} />
                    <span className="w-full truncate">{abreviar(s.nombre)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-sm text-mute">
                Las copas relámpago no cuentan: se juegan en paralelo con los mismos equipos.
                {inscriptos.serie.some((s) => s.abierto) && ' Rayado: inscripción abierta.'}
              </p>
            </>
          )}
        </section>

        <section className="tile rise" style={d(6)} data-testid="horarios">
          <h2 className="mb-3 text-xl font-bold">Horarios más pedidos</h2>
          <div className="metricas-heat" role="img" aria-label="Mapa de calor por día y hora">
            <b />
            {DIAS_SEMANA.map((x, i) => (
              <b key={i} className="text-center text-mute">
                {x.corto}
              </b>
            ))}
            {FRANJAS_HORARIAS.map((f, fi) => [
              <b key={`f${fi}`} className="pt-1.5 font-medium text-mute">
                {f.etiqueta}
              </b>,
              ...DIAS_SEMANA.map((x, di) => {
                const n = horarios.celdas[fi]![di]!;
                return (
                  <span
                    key={`${fi}-${di}`}
                    className={calor(n, horarios.maximo)}
                    title={`${x.plural} de ${f.etiqueta}: ${n} ${n === 1 ? 'partido' : 'partidos'}`}
                  />
                );
              }),
            ])}
          </div>
          <p className="mt-3 text-sm text-mute" data-testid="insight-horarios">
            {pico ? (
              <>
                <b className="text-ink">Insight:</b> {DIAS_SEMANA[pico.dia]!.plural} de{' '}
                {FRANJAS_HORARIAS[pico.franja]!.etiqueta} se llenan primero ({pico.partidos} partidos).
                {(canchas.promedio ?? 0) >= 0.9 && ' Con las canchas casi llenas, conviene sumar una cancha en esa franja.'}
              </>
            ) : (
              'Todavía no hay partidos programados en este período.'
            )}
          </p>
        </section>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[1fr_1fr]">
        <section className="tile rise" style={d(7)} data-testid="medios">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-bold">Cómo te pagan</h2>
            <span className="text-sm text-mute">
              Cobrado <b className="num text-ink">{pesos(cob.cobrado)}</b> de {pesos(cob.facturado)}
            </span>
          </div>
          {totalCobrado === 0 ? (
            <p className="mt-3 text-sm text-mute">Todavía no hay cobros en este período.</p>
          ) : (
            <>
              <div className="mt-4 flex h-4 overflow-hidden rounded-full bg-black/5" aria-hidden>
                {MEDIOS.map(([k, , color]) =>
                  cob.porMedio[k].monto > 0 ? (
                    <i
                      key={k}
                      className={`${color} block h-full origin-left animate-grow`}
                      style={{ width: `${(cob.porMedio[k].monto / totalCobrado) * 100}%` }}
                    />
                  ) : null,
                )}
              </div>
              <ul className="mt-4 grid gap-3 sm:grid-cols-3">
                {MEDIOS.map(([k, texto, color]) => (
                  <li key={k} data-testid={`medio-${k}`}>
                    <span className="flex items-center gap-2 text-sm text-mute">
                      <i className={`${color} inline-block size-3 rounded-full`} />
                      {texto}
                    </span>
                    <b className="num mt-1 block text-3xl tracking-tighter">{pct(cob.mezcla[k])}</b>
                    <span className="num text-xs text-mute">
                      {pesos(cob.porMedio[k].monto)} · {cob.porMedio[k].cantidad}{' '}
                      {cob.porMedio[k].cantidad === 1 ? 'pago' : 'pagos'}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-mute">
                {(cob.mezcla.EFECTIVO ?? 0) + (cob.mezcla.TRANSFERENCIA ?? 0) > 0.5
                  ? 'La mayor parte entra por fuera de la plataforma. Con el link de pago, el equipo paga solo y la inscripción se confirma sin que tengas que anotarla.'
                  : 'La mayor parte ya entra online: se concilia sola y queda en la caja al instante.'}
              </p>
            </>
          )}
        </section>

        <section className="tile rise" style={d(8)} data-testid="retencion">
          <h2 className="text-xl font-bold">Quién vuelve</h2>
          {!par ? (
            <p className="mt-3 text-sm text-mute">
              Hace falta más de un torneo de temporada para medir la retención.
            </p>
          ) : (
            <>
              <DetalleRetencion par={par} />
              {abierto && abierto !== par && (
                <p className="mt-4 text-sm text-mute">
                  {abierto.hacia.nombre} tiene la inscripción abierta: ya volvieron{' '}
                  <b className="text-ink">
                    {abierto.repiten.length} de {abierto.base}
                  </b>{' '}
                  equipos de {abierto.desde.nombre}.
                </p>
              )}
            </>
          )}
        </section>
      </div>

      <div className="grid items-start gap-4 min-[1600px]:grid-cols-[2fr_1fr]">
        <section className="tile rise min-w-0" style={d(9)} data-testid="cobro-por-torneo">
          <h2 className="mb-3 text-xl font-bold">Cobro por torneo</h2>
          {m.cobranzaPorTorneo.length === 0 ? (
            <p className="text-sm text-mute">No hay torneos en este período.</p>
          ) : (
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[500px] text-sm">
                <thead>
                  <tr>
                    <th className="th">Torneo</th>
                    <th className="th text-right">Facturado</th>
                    <th className="th text-right">Cobrado</th>
                    <th className="th whitespace-nowrap text-right">Antes del inicio</th>
                    <th className="th">Medios</th>
                  </tr>
                </thead>
                <tbody>
                  {m.cobranzaPorTorneo.map((t) => {
                    const total = MEDIOS.reduce((s, [k]) => s + t.porMedio[k].monto, 0);
                    return (
                      <tr key={t.id}>
                        <td className="td whitespace-nowrap font-semibold">{t.nombre}</td>
                        <td className="td num whitespace-nowrap text-right">{pesos(t.facturado)}</td>
                        <td className="td num whitespace-nowrap text-right">
                          {pesos(t.cobrado)} <span className="text-mute">({pct(t.tasa)})</span>
                        </td>
                        <td className="td num text-right">{pct(t.inscripcion.tasa)}</td>
                        <td className="td">
                          <div className="flex h-2.5 w-20 overflow-hidden rounded-full bg-black/5">
                            {total > 0 &&
                              MEDIOS.map(([k, , color]) => (
                                <i
                                  key={k}
                                  className={`${color} block h-full`}
                                  style={{ width: `${(t.porMedio[k].monto / total) * 100}%` }}
                                  title={`${k}: ${pesos(t.porMedio[k].monto)}`}
                                />
                              ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-mute">
            &quot;Antes del inicio&quot;: parte de las inscripciones que se pagó antes del primer partido.
          </p>
        </section>

        <section className="tile rise" style={d(10)} data-testid="canchas">
          <h2 className="mb-3 text-xl font-bold">Uso de cada cancha</h2>
          {canchas.porCancha.length === 0 ? (
            <Vacio titulo="Sin canchas" texto="Cargá tus canchas para medir la ocupación.">
              <Link href="/panel/canchas" className="btn-volt btn-sm">
                Ir a canchas
              </Link>
            </Vacio>
          ) : (
            <ul className="space-y-4">
              {canchas.porCancha.map((c) => (
                <li key={c.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                    <b>{c.nombre}</b>
                    <span className="num text-mute">
                      {c.partidos} {c.partidos === 1 ? 'partido' : 'partidos'} · <b className="text-ink">{pct(c.ocupacion)}</b>
                    </span>
                  </div>
                  <div className="bar volt">
                    <i style={{ width: `${Math.round((c.ocupacion ?? 0) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-mute">
            Ocupación: partidos sobre los lugares disponibles (canchas × horarios usados en cada jornada).
          </p>
        </section>
      </div>
    </div>
  );
}

function DetalleRetencion({ par }: { par: ParDeRetencion }) {
  const grupos: [string, { id: string; nombre: string }[], string][] = [
    ['Repiten', par.repiten, 'pill-volt'],
    ['Se fueron', par.seFueron, 'pill'],
    ['Nuevos', par.nuevos, 'pill-ink'],
  ];
  return (
    <>
      <p className="mt-1 text-sm text-mute">
        De {par.desde.nombre} a {par.hacia.nombre}:{' '}
        <b className="text-ink">
          {par.repiten.length} de {par.base}
        </b>{' '}
        equipos se reinscribieron ({pct(par.tasa)}).
      </p>
      <div className="mt-4 space-y-3">
        {grupos.map(([titulo, equipos, clase]) => (
          <div key={titulo}>
            <span className="eyebrow">
              {titulo} · {equipos.length}
            </span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {equipos.length === 0 ? (
                <span className="text-sm text-mute">Ninguno</span>
              ) : (
                equipos.map((e) => (
                  <span key={e.id} className={`${clase} text-xs`}>
                    {e.nombre}
                  </span>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
