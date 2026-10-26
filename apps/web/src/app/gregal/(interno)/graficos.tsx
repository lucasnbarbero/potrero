// Gráficos simples del backoffice (una serie por gráfico): columnas con el valor arriba y la mezcla de medios de pago.
import type { CobrosPorMedio } from '@potrero/shared';
import { pesos } from '@/lib/formato';
import { porcentaje } from '@/lib/gregal';

export function Columnas({
  datos,
  etiqueta,
}: {
  datos: { clave: string; valor: number; texto: string; titulo: string }[];
  etiqueta: string;
}) {
  const max = Math.max(1, ...datos.map((x) => x.valor));
  return (
    <div className="gregal-cols" role="img" aria-label={etiqueta}>
      {datos.map((x, i) => (
        <div key={x.clave} title={x.titulo}>
          <b className="num text-sm text-ink">{x.valor}</b>
          <i style={{ height: `${(x.valor / max) * 78}%`, animationDelay: `${i * 60}ms` }} />
          <span className="w-full truncate text-center">{x.texto}</span>
        </div>
      ))}
    </div>
  );
}

/** Medios en el mismo orden y color que las métricas del panel: efectivo, transferencia, online. */
const MEDIOS: [keyof CobrosPorMedio, string, string][] = [
  ['efectivo', 'Efectivo', 'bg-ink'],
  ['transferencia', 'Transferencia', 'bg-black/25'],
  ['online', 'Online (Mercado Pago)', 'bg-[#12c28a]'],
];

export function MezclaDeMedios({ cobros }: { cobros: CobrosPorMedio }) {
  const total = cobros.total || 1;
  return (
    <div data-testid="mezcla-medios">
      <div className="gregal-mezcla" role="img" aria-label="Cobrado por medio de pago">
        {MEDIOS.map(([k, t, c]) =>
          cobros[k] ? (
            <i
              key={k}
              className={c}
              style={{ width: `${(cobros[k] / total) * 100}%` }}
              title={`${t}: ${pesos(cobros[k])}`}
            />
          ) : null,
        )}
      </div>
      <ul className="mt-4 space-y-2.5">
        {MEDIOS.map(([k, t, c]) => (
          <li key={k} className="flex items-center gap-3 text-sm">
            <span className={`size-3 shrink-0 rounded-sm ${c}`} />
            <span className="flex-1">{t}</span>
            <b className="num">{pesos(cobros[k])}</b>
            <span className="num w-14 text-right text-mute">{porcentaje(cobros[k] / total)}</span>
          </li>
        ))}
        <li className="flex items-center gap-3 border-t border-black/5 pt-2.5 text-sm">
          <span className="size-3 shrink-0" />
          <span className="flex-1 font-semibold">Cargos por servicio (Gregal)</span>
          <b className="num">{pesos(cobros.cargoServicio)}</b>
          <span className="w-14" />
        </li>
      </ul>
    </div>
  );
}
