import { Icono } from '@potrero/ui';
import Link from 'next/link';
import { Encabezado } from '@/componentes/ui';
import { apiServidor } from '@/lib/api';
import { fechaCorta, pesos } from '@/lib/formato';
import type { MovimientoCaja, ResumenCaja, Torneo } from '@/lib/tipos';
import { AnularMovimiento } from './Anular';
import { AutomatizacionesCaja } from './AutomatizacionesCaja';
import { FormularioMovimiento, Retiro } from './Formularios';

export const metadata = { title: 'Caja' };

const FILTROS = [
  ['', 'Todos'],
  ['INGRESOS', 'Ingresos'],
  ['EGRESOS', 'Egresos'],
] as const;

const signo = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '');

export default async function Caja({ searchParams }: PageProps<'/panel/caja'>) {
  const sp = await searchParams;
  const torneoId = typeof sp.torneo === 'string' ? sp.torneo : '';
  const tipo = typeof sp.tipo === 'string' ? sp.tipo : '';
  const q = (extra: Record<string, string>) => {
    const p = new URLSearchParams({
      ...(torneoId ? { torneo: torneoId } : {}),
      ...(tipo ? { tipo } : {}),
      ...extra,
    });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    return p.size ? `?${p}` : '?';
  };
  const [caja, movs, torneos] = await Promise.all([
    apiServidor<ResumenCaja>(`/caja${torneoId ? `?torneoId=${torneoId}` : ''}`),
    apiServidor<{ total: number; movimientos: MovimientoCaja[] }>(
      `/caja/movimientos?limite=30${torneoId ? `&torneoId=${torneoId}` : ''}${tipo ? `&tipo=${tipo}` : ''}`,
    ),
    apiServidor<Torneo[]>('/torneos'),
  ]);
  const { resultado: r, disponible } = caja;
  const comisionTexto = `${String(caja.plan.comisionPct).replace('.', ',')}%`;

  return (
    <div className="space-y-6">
      <Encabezado eyebrow="Finanzas del torneo" titulo="Caja">
        <a
          href={`/api/caja/movimientos.csv${torneoId ? `?torneoId=${torneoId}` : ''}`}
          download
          className="btn-glass btn-sm"
          data-testid="exportar-csv"
        >
          <Icono nombre="download" />
          Exportar
        </a>
      </Encabezado>
      <p className="-mt-3 max-w-xl text-mute">
        Sabés cuánto entra, cuánto tenés que pagar y cuánto te queda, sin Excel.
      </p>

      <nav className="flex flex-wrap gap-2" aria-label="Torneo">
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

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="tile-ink rise" data-testid="disponible">
          <div className="field-pattern pointer-events-none absolute inset-0 opacity-60" />
          <div className="relative">
            <span className="eyebrow !text-white/60">Disponible para retirar · Mercado Pago</span>
            <b className="num mt-2 block text-5xl tracking-tighter" data-testid="disponible-mp">
              {pesos(disponible.MP)}
            </b>
            <p className="mt-2 text-sm text-white/60">
              Ya descontada la comisión de Potrero: {pesos(caja.comisionTotal)} (plan {caja.plan.nombre},{' '}
              {comisionTexto}).
            </p>
            <p className="mt-1 text-xs text-white/50">
              Efectivo {pesos(disponible.EFECTIVO)} · Banco {pesos(disponible.BANCO)}
            </p>
            <div className="mt-4">
              <Retiro disponible={disponible.MP} />
            </div>
          </div>
        </section>

        <section
          className="tile-volt rise"
          style={{ '--d': 1 } as React.CSSProperties}
          data-testid="resultado"
        >
          <span className="eyebrow !text-ink/60">Resultado {torneoId ? 'del torneo' : 'de la liga'}</span>
          <b className="num mt-2 block text-5xl tracking-tighter">
            {signo(r.resultado)}
            {pesos(Math.abs(r.resultado))}
          </b>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <div>
              <dt className="text-xs text-ink/60">Ingresos</dt>
              <dd className="num font-bold">{pesos(r.ingresos)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink/60">Egresos</dt>
              <dd className="num font-bold">{pesos(r.egresos)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink/60">Comisión</dt>
              <dd className="num font-bold">{pesos(r.comision)}</dd>
            </div>
          </dl>
        </section>

        <section className="tile rise" style={{ '--d': 2 } as React.CSSProperties}>
          <span className="eyebrow">Por cobrar</span>
          <b className="num mt-2 block text-5xl tracking-tighter">{pesos(caja.porCobrar.monto)}</b>
          <p className="mt-2 text-sm text-mute">
            {caja.porCobrar.equipos} {caja.porCobrar.equipos === 1 ? 'equipo' : 'equipos'} · cobralos con un
            recordatorio automático.
          </p>
          <Link href="/panel/comunicacion" className="btn-glass btn-sm mt-3">
            <Icono nombre="bolt" />
            Activar cobro automático
          </Link>
        </section>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[1.4fr_1fr]">
        <section className="tile rise" style={{ '--d': 3 } as React.CSSProperties}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="eyebrow">Movimientos</span>
            <div className="tabs">
              {FILTROS.map(([k, t]) => (
                <Link key={k} href={q({ tipo: k })} className={tipo === k ? 'on' : ''}>
                  {t}
                </Link>
              ))}
            </div>
          </div>
          <ul className="mt-2" data-testid="movimientos">
            {movs.movimientos.map((m) => (
              <li key={m.id} className="list-row text-sm">
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-xl ${m.efecto > 0 ? 'bg-volt' : m.efecto < 0 ? 'bg-black/10' : 'bg-sky-100'}`}
                >
                  <Icono nombre={m.tipo === 'RETIRO' ? 'swap' : m.efecto >= 0 ? 'plus' : 'sub'} />
                </span>
                <span className="min-w-0 flex-1">
                  <b className={`block truncate ${m.anulado ? 'line-through opacity-50' : ''}`}>
                    {m.descripcion}
                  </b>
                  <span className="text-xs text-mute">
                    {m.detalle} · {fechaCorta(m.fecha)}
                    {m.anulado ? ' · anulado' : ''}
                    {m.comprobante ? ` · ${m.comprobante}` : ''}
                  </span>
                </span>
                <b
                  className={`num ${m.efecto > 0 ? 'text-ink' : 'text-mute'} ${m.anulado ? 'line-through opacity-50' : ''}`}
                >
                  {m.efecto === 0 ? pesos(m.monto) : `${signo(m.efecto)}${pesos(Math.abs(m.efecto))}`}
                </b>
                {!m.anulado && ['EGRESO', 'INGRESO', 'RETIRO'].includes(m.tipo) && (
                  <AnularMovimiento id={m.id} />
                )}
              </li>
            ))}
            {movs.movimientos.length === 0 && (
              <li className="py-4 text-sm text-mute">
                Todavía no hay movimientos. Se arman solos con los cobros.
              </li>
            )}
          </ul>
          {movs.total > movs.movimientos.length && (
            <p className="mt-2 text-xs text-mute">
              Mostrando los últimos {movs.movimientos.length} de {movs.total}. Exportá para ver todos.
            </p>
          )}
        </section>

        <div className="space-y-4">
          <section className="tile rise" style={{ '--d': 4 } as React.CSSProperties} data-testid="rubros">
            <span className="eyebrow">Egresos por rubro</span>
            <ul className="mt-3 space-y-3">
              {caja.porRubro.map((x) => (
                <li key={x.rubro} className="text-sm">
                  <div className="flex justify-between">
                    <b>{x.nombre}</b>
                    <span className="num">
                      {pesos(x.monto)} · {x.pct}%
                    </span>
                  </div>
                  <div className="bar mt-1">
                    <i style={{ width: `${x.pct}%` }} />
                  </div>
                </li>
              ))}
              {caja.porRubro.length === 0 && (
                <li className="text-sm text-mute">Todavía no cargaste egresos.</li>
              )}
            </ul>
          </section>

          <AutomatizacionesCaja inicial={caja.automatizaciones} />

          <section className="tile rise" style={{ '--d': 6 } as React.CSSProperties}>
            <FormularioMovimiento
              torneos={torneos
                .filter((t) => t.estado !== 'BORRADOR')
                .map((t) => ({ id: t.id, nombre: t.nombre }))}
              torneoActual={torneoId}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
