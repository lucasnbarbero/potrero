import { Icono } from '@potrero/ui';
import Link from 'next/link';
import { apiServidor } from '@/lib/api';
import { fechaCorta, pesos } from '@/lib/formato';
import { LogoSponsor } from '@/componentes/LogoSponsor';
import { compacto, dia, porcentaje, type ReporteSponsor } from '../tipos';
import { Imprimir } from './Imprimir';

export const metadata = { title: 'Reporte del sponsor' };

/** Al imprimir, solo el reporte: sin la barra lateral ni la cabecera del panel. */
const ESTILO_IMPRESION = `@media print {
  aside, header.glass { display: none !important; }
  main { margin-left: 0 !important; padding: 0 !important; }
  .tile, .tile-ink, .tile-volt { break-inside: avoid; box-shadow: none !important; }
}`;

export default async function ReporteDelSponsor({ params, searchParams }: PageProps<'/panel/sponsors/[id]'>) {
  const { id } = await params;
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const k of ['desde', 'hasta'] as const) if (typeof sp[k] === 'string' && sp[k]) q.set(k, sp[k]);
  const r = await apiServidor<ReporteSponsor>(`/sponsors/${id}/reporte${q.size ? `?${q}` : ''}`);
  const max = Math.max(1, ...r.serie.map((d) => d.impresiones));

  return (
    <div className="space-y-6" data-testid="reporte-sponsor">
      <style>{ESTILO_IMPRESION}</style>
      <Link
        href="/panel/sponsors"
        className="inline-flex items-center gap-1 text-sm font-semibold text-mute print:hidden"
      >
        <Icono nombre="back" />
        Sponsors
      </Link>

      <div className="rise flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <LogoSponsor
            nombre={r.sponsor.nombre}
            iniciales={r.sponsor.iniciales}
            logoUrl={r.sponsor.logoUrl}
            className="size-16 text-2xl"
          />
          <div className="min-w-0">
            <p className="eyebrow">Reporte de alcance · {r.organizacion}</p>
            <h1 className="mt-1 text-4xl font-bold tracking-tighter sm:text-5xl">{r.sponsor.nombre}</h1>
            <p className="text-sm text-mute">
              {r.sponsor.descripcion ? `${r.sponsor.descripcion} · ` : ''}
              {r.sponsor.categoria}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Imprimir />
          <a
            href={`/api/sponsors/${id}/reporte.csv${q.size ? `?${q}` : ''}`}
            download
            className="btn btn-sm"
            data-testid="descargar-csv"
          >
            <Icono nombre="download" />
            Descargar CSV
          </a>
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-3 print:hidden" aria-label="Período del reporte">
        <label className="block">
          <span className="field-label">Desde</span>
          <input type="date" name="desde" defaultValue={r.desde} className="input !py-2" />
        </label>
        <label className="block">
          <span className="field-label">Hasta</span>
          <input type="date" name="hasta" defaultValue={r.hasta} className="input !py-2" />
        </label>
        <button className="btn-glass btn-sm mb-1">Ver período</button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <section className="tile-volt rise">
          <span className="eyebrow !text-ink/60">Impresiones</span>
          <b className="num mt-2 block text-5xl tracking-tighter" data-testid="reporte-impresiones">
            {r.impresiones.toLocaleString('es-AR')}
          </b>
          <p className="mt-1 text-sm text-ink/70">veces que se vio tu marca</p>
        </section>
        <section className="tile rise" style={{ '--d': 1 } as React.CSSProperties}>
          <span className="eyebrow">Clics</span>
          <b className="num mt-2 block text-5xl tracking-tighter">{r.clics.toLocaleString('es-AR')}</b>
          <p className="mt-1 text-sm text-mute">visitas a tu link</p>
        </section>
        <section className="tile rise" style={{ '--d': 2 } as React.CSSProperties}>
          <span className="eyebrow">CTR</span>
          <b className="num mt-2 block text-5xl tracking-tighter">{porcentaje(r.ctr)}</b>
          <p className="mt-1 text-sm text-mute">clics cada 100 impresiones</p>
        </section>
        <section className="tile-ink rise" style={{ '--d': 3 } as React.CSSProperties}>
          <div className="field-pattern pointer-events-none absolute inset-0 opacity-60" />
          <div className="relative">
            <span className="eyebrow !text-white/50">Período</span>
            <b className="mt-2 block text-2xl tracking-tight">
              {dia(r.desde)} al {dia(r.hasta)}
            </b>
            <p className="mt-1 text-sm text-white/60">{r.serie.length} días medidos</p>
          </div>
        </section>
      </div>

      <section className="tile rise" style={{ '--d': 4 } as React.CSSProperties}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold">Impresiones por día</h2>
          <span className="text-xs text-mute">Pico: {compacto(max)} en un día</span>
        </div>
        <div
          className="mt-4 flex h-40 items-end gap-[2px]"
          role="img"
          aria-label={`Impresiones diarias del ${dia(r.desde)} al ${dia(r.hasta)}: ${r.impresiones} en total.`}
        >
          {r.serie.map((d) => (
            <div
              key={d.dia}
              className="min-w-0 flex-1 rounded-t-md bg-ink transition-colors hover:bg-volt-deep"
              style={{ height: `${Math.max(2, (d.impresiones / max) * 100)}%` }}
              title={`${dia(d.dia)}: ${d.impresiones.toLocaleString('es-AR')} impresiones · ${d.clics} clics`}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-mute">
          <span>{dia(r.desde)}</span>
          <span>{dia(r.hasta)}</span>
        </div>
      </section>

      <div className="grid items-start gap-4">
        <section className="tile !p-0 rise" style={{ '--d': 5 } as React.CSSProperties}>
          <h2 className="px-5 pt-5 text-xl font-bold">Espacios</h2>
          <div className="scrollx">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr>
                  {['Espacio', 'Torneo', 'Período', 'Impresiones', 'Clics', 'CTR'].map((h) => (
                    <th key={h} className="th">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="[&>tr]:border-t [&>tr]:border-black/5">
                {r.espacios.map((e) => (
                  <tr key={e.id}>
                    <td className="td font-semibold">{e.espacio}</td>
                    <td className="td">{e.torneo}</td>
                    <td className="td text-mute">
                      {dia(e.desde)} al {dia(e.hasta)}
                    </td>
                    <td className="td num">{e.impresiones.toLocaleString('es-AR')}</td>
                    <td className="td num">{e.clics.toLocaleString('es-AR')}</td>
                    <td className="td num font-bold">{porcentaje(e.ctr)}</td>
                  </tr>
                ))}
                {r.espacios.length === 0 && (
                  <tr>
                    <td className="td text-mute" colSpan={6}>
                      Este sponsor todavía no tiene espacios.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="tile rise print:hidden" style={{ '--d': 6 } as React.CSSProperties}>
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-bold">Cobros</h2>
            <b className="num">{pesos(r.cobrado)}</b>
          </div>
          <ul className="mt-1">
            {r.cobros.map((c) => (
              <li key={c.id} className="list-row text-sm">
                <span className="flex-1">
                  <b className={c.anulado ? 'line-through' : ''}>{fechaCorta(c.fecha)}</b>
                  <span className="block text-xs text-mute">
                    {c.comprobante ?? 'Sin comprobante'}
                    {c.anulado ? ' · anulado' : ''}
                  </span>
                </span>
                <b className={`num ${c.anulado ? 'text-mute line-through' : ''}`}>{pesos(c.monto)}</b>
              </li>
            ))}
            {r.cobros.length === 0 && (
              <li className="py-2 text-sm text-mute">Todavía no registraste cobros.</li>
            )}
          </ul>
          <Link href="/panel/caja" className="mt-2 inline-block text-xs font-semibold underline">
            Ver en la caja
          </Link>
        </section>
      </div>

      <p className="text-xs text-mute">
        Medición agregada por día en el sitio público del torneo: cada vez que se muestra el espacio suma una
        impresión y cada clic pasa por un link que lo cuenta. No usamos cookies ni guardamos datos de quien
        mira.
      </p>
    </div>
  );
}
