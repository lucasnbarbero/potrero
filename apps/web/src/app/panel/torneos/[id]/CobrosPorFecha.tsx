// Cuota por fecha y seguro por jugador (E06-20, E06-21): configuración, totales y cargos de cada fecha.
import { Estado } from '@/componentes/ui';
import { apiServidor } from '@/lib/api';
import { fechaCorta, pesos } from '@/lib/formato';
import type { CobrosPorFechaTorneo } from '@/lib/tipos';
import { AccionesCobro } from './acciones';
import { ConfigCobrosPorFecha } from './ConfigCobrosPorFecha';

/** "AAAA-MM-DD" a mediodía de Argentina, para que no se corra de día al formatear. */
const dia = (d: string | null) => (d ? fechaCorta(`${d}T12:00:00-03:00`) : '—');

export async function CobrosPorFecha({ torneoId }: { torneoId: string }) {
  const r = await apiServidor<CobrosPorFechaTorneo>(`/torneos/${torneoId}/cobros-por-fecha`);
  const activo = r.config.cuotaPorFecha > 0 || r.config.seguroPorJugadorPorFecha > 0;
  // Dentro de cada fecha, por equipo y con la cuota antes del seguro.
  const ordenados = r.cargos.toSorted(
    (a, b) =>
      a.fecha - b.fecha || a.equipo.nombre.localeCompare(b.equipo.nombre) || a.tipo.localeCompare(b.tipo),
  );
  const fechas = [...Map.groupBy(ordenados, (c) => c.fecha)];
  return (
    <section className="tile space-y-5" data-testid="cobros-por-fecha">
      <div>
        <b className="text-lg">Cuota por fecha y seguro</b>
        <p className="text-sm text-mute">
          Cada equipo paga un monto fijo en cada fecha que juega, con o sin inscripción. El cargo vence el día
          del partido y se genera solo {r.anticipacionDias} días antes, así los recordatorios de cobro lo
          encuentran.
        </p>
      </div>
      <ConfigCobrosPorFecha torneoId={torneoId} inicial={r.config} />

      {(activo || r.cargos.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ['Cuotas por fecha', r.totales.cuotas],
              ['Seguros', r.totales.seguros],
            ] as const
          ).map(([titulo, t]) => (
            <div key={titulo} className="rounded-3xl bg-black/5 p-4">
              <span className="eyebrow">{titulo}</span>
              <b className="num mt-1 block text-2xl tracking-tighter">
                {pesos(t.cobrado)} <span className="text-base text-mute">/ {pesos(t.total)}</span>
              </b>
              <span className="text-xs text-mute">Pendiente {pesos(t.pendiente)}</span>
            </div>
          ))}
        </div>
      )}

      {r.cargos.length === 0 ? (
        activo && (
          <p className="text-sm text-mute">
            Todavía no hay cargos: aparecen cuando el fixture tiene una fecha dentro de los próximos{' '}
            {r.anticipacionDias} días.
          </p>
        )
      ) : (
        <div className="space-y-4">
          {fechas.map(([fecha, cargos], i) => (
            // Solo la última fecha generada queda abierta: las anteriores se despliegan a pedido.
            <details key={fecha} open={i === fechas.length - 1} className="group">
              <summary className="flex cursor-pointer list-none items-baseline justify-between gap-2">
                <b>Fecha {fecha}</b>
                <span className="text-xs text-mute">
                  {cargos.filter((c) => c.estado === 'PENDIENTE').length} pendiente(s) · vence{' '}
                  {dia(cargos[0]!.vence)}
                </span>
              </summary>
              <ul>
                {cargos.map((c) => (
                  <li key={c.id} className="list-row flex-wrap text-sm">
                    <span className="min-w-0 flex-1">
                      <b className="block truncate">{c.equipo.nombre}</b>
                      <span className="text-xs text-mute">{c.concepto}</span>
                    </span>
                    <b className={`num ${c.estado === 'ANULADO' ? 'line-through opacity-50' : ''}`}>
                      {pesos(c.monto)}
                    </b>
                    <Estado estado={c.estado} />
                    {c.estado === 'PENDIENTE' && (
                      <AccionesCobro cargoId={c.id} debe={Math.max(0, c.monto - c.pagado)} />
                    )}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
