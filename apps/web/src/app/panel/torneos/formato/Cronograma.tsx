'use client';
import type { FormatoFlexible, Simulacion } from '@potrero/shared';
import { pesos } from '@/lib/formato';
import { colorDeFase, diaDelSabado } from './comun';

/** Cronograma de sábados: barra por sábado con los equipos que juegan (por fase) y los libres. */
export function Cronograma({
  formato,
  sim,
  equipos,
  primerSabado,
}: {
  formato: FormatoFlexible;
  sim: Simulacion;
  equipos: number;
  primerSabado: Date | null;
}) {
  const indice = new Map(formato.fases.map((f, i) => [f.id, i]));
  const total = Math.max(1, equipos);
  return (
    <section aria-label="Cronograma de sábados" className="tile order-first h-fit space-y-4 xl:sticky xl:top-24 xl:order-none">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <b className="text-lg">Cronograma de sábados</b>
        <span className="text-xs text-mute">Equipos que juegan cada sábado, de {equipos}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {formato.fases.map((f, i) => (
          <span key={f.id} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: colorDeFase(i) }} />
            {f.nombre}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-mute">
          <span className="libres size-2.5 rounded-full" />
          Libres
        </span>
      </div>
      {sim.sabados.length === 0 ? (
        <p className="rounded-2xl bg-black/5 p-4 text-sm text-mute">
          Sin sábados para mostrar: revisá los datos y las fases.
        </p>
      ) : (
        <ol className="space-y-1.5" data-testid="cronograma">
          {sim.sabados.map((s) => {
            const todos = s.equiposLibres === 0;
            return (
              <li
                key={s.numero}
                className="grid grid-cols-[3.25rem_minmax(0,1fr)_3rem] items-center gap-2 text-xs"
                title={`${s.porFase
                  .map(
                    (p) =>
                      `${formato.fases[indice.get(p.faseId) ?? 0]?.nombre}: ${p.etiqueta} (${p.partidos} partidos)`,
                  )
                  .join(' · ')} · ${pesos(s.recaudacion)} en cuotas`}
              >
                <span className="leading-tight">
                  <b className="num block">Sáb {s.numero}</b>
                  <span className="num text-[10px] text-mute">{diaDelSabado(primerSabado, s.numero)}</span>
                </span>
                <span className="libres flex h-6 overflow-hidden rounded-lg">
                  {s.porFase.map((p) => {
                    const i = indice.get(p.faseId) ?? 0;
                    return (
                      <span
                        key={p.faseId}
                        className="h-full border-r border-white/70 last:border-r-0"
                        style={{ width: `${(p.equipos / total) * 100}%`, background: colorDeFase(i) }}
                      />
                    );
                  })}
                </span>
                <span className={`num text-right font-bold ${todos ? '' : 'text-mute'}`}>
                  {todos ? (
                    <span className="pill-volt !px-1.5">{s.equiposJugando}</span>
                  ) : (
                    `${s.equiposJugando}/${equipos}`
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <style>{`.libres{background:repeating-linear-gradient(135deg,rgb(0 0 0/.06) 0 6px,rgb(0 0 0/.12) 6px 12px)}`}</style>
    </section>
  );
}
