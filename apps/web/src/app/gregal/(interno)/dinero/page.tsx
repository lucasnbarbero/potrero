import { DATOS } from '@potrero/shared';
import Link from 'next/link';
import { Encabezado } from '@/componentes/ui';
import { pesos } from '@/lib/formato';
import { apiGregal, type DineroGregal, nombreMes, porcentaje } from '@/lib/gregal';

export const metadata = { title: 'Dinero' };

const d = (n: number) => ({ '--d': n }) as React.CSSProperties;

export default async function Dinero() {
  const m = await apiGregal<DineroGregal>('/dinero');
  const meses = [...m.porMes].reverse();
  return (
    <div className="space-y-4">
      <Encabezado eyebrow="Cobros y comisiones de todas las ligas · solo lectura" titulo="Dinero" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <section className="tile rise" style={d(1)}>
          <span className="eyebrow">Cobrado (GMV)</span>
          <div className="num mt-2 text-4xl font-bold tracking-tighter">{pesos(m.total.total)}</div>
          <p className="text-sm text-mute">{m.total.pagos} pagos aprobados</p>
        </section>
        <section className="tile rise" style={d(2)}>
          <span className="eyebrow">Online (Mercado Pago)</span>
          <div className="num mt-2 text-4xl font-bold tracking-tighter">{pesos(m.total.online)}</div>
          <p className="text-sm text-mute">
            {porcentaje(m.total.total ? m.total.online / m.total.total : 0)} del total
          </p>
        </section>
        <section className="tile-ink rise" style={d(3)}>
          <span className="eyebrow !text-white/50">Comisión de Gregal</span>
          <div className="num text-gregal mt-2 text-4xl font-bold tracking-tighter">
            {pesos(m.total.comision)}
          </div>
          <p className="text-sm text-white/50">
            take rate {porcentaje(m.tasa.sobreOnline, 1)} sobre lo online
          </p>
        </section>
        <section className="tile rise" style={d(4)}>
          <span className="eyebrow">Manual (sin comisión)</span>
          <div className="num mt-2 text-4xl font-bold tracking-tighter">
            {pesos(m.total.efectivo + m.total.transferencia)}
          </div>
          <p className="text-sm text-mute">efectivo y transferencia</p>
        </section>
      </div>

      <section className="tile rise !p-0 overflow-x-auto" style={d(5)} data-testid="dinero-por-mes">
        <h2 className="px-6 pt-6 text-xl font-bold">Por mes · últimos 6 meses</h2>
        <table className="mt-2 w-full min-w-[620px] text-sm">
          <thead>
            <tr>
              <th className="th">Mes</th>
              <th className="th text-right">Efectivo</th>
              <th className="th text-right">Transferencia</th>
              <th className="th text-right">Online</th>
              <th className="th text-right">Total</th>
              <th className="th text-right">Comisión</th>
            </tr>
          </thead>
          <tbody>
            {meses.map((x) => (
              <tr key={x.mes} className="border-t border-black/5">
                <td className="td whitespace-nowrap font-semibold capitalize">{nombreMes(x.mes)}</td>
                <td className="td num text-right">{pesos(x.efectivo)}</td>
                <td className="td num text-right">{pesos(x.transferencia)}</td>
                <td className="td num text-right">{pesos(x.online)}</td>
                <td className="td num text-right font-semibold">{pesos(x.total)}</td>
                <td className="td num text-right font-semibold">{pesos(x.comision)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="tile rise !p-0 overflow-x-auto" style={d(7)}>
        <h2 className="px-6 pt-6 text-xl font-bold">Por liga</h2>
        <table className="mt-2 w-full min-w-[720px] text-sm">
          <thead>
            <tr>
              <th className="th">Organización</th>
              <th className="th">Plan</th>
              <th className="th text-right">Manual</th>
              <th className="th text-right">Online</th>
              <th className="th text-right">Total</th>
              <th className="th text-right">Comisión</th>
            </tr>
          </thead>
          <tbody>
            {m.porLiga.map((l) => (
              <tr key={l.id} className="border-t border-black/5">
                <td className="td">
                  <Link href={`/gregal/organizaciones/${l.id}`} className="font-semibold hover:underline">
                    {l.nombre}
                  </Link>
                </td>
                <td className="td">
                  <span className={l.plan === 'FUNDADORA' ? 'pill-gregal' : 'pill'}>
                    {DATOS.planes[l.plan].nombre}
                  </span>
                </td>
                <td className="td num text-right">{pesos(l.efectivo + l.transferencia)}</td>
                <td className="td num text-right">{pesos(l.online)}</td>
                <td className="td num text-right font-semibold">{pesos(l.total)}</td>
                <td className="td num text-right font-semibold">{pesos(l.comision)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
