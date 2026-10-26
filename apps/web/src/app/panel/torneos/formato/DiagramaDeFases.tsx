'use client';
import { describirEntrada, type FormatoFlexible, type Simulacion } from '@potrero/shared';
import { useLayoutEffect, useRef, useState } from 'react';
import { colorDeFase, diaDelSabado, NOMBRE_DE_TIPO, tintaDeFase } from './comun';

interface Arista {
  de: string;
  a: string;
  color: string;
  /** Columnas que saltea (más de 1: se dibuja por debajo de las fases del medio). */
  salto: number;
}

/** Diagrama de fases conectadas: de dónde viene cada equipo. En columnas en pantallas anchas, en lista en el celular. */
export function DiagramaDeFases({
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
  // Profundidad: 0 = inscriptos; cada fase va una columna después de la más profunda de la que toma equipos.
  const profundidad = new Map<string, number>();
  formato.fases.forEach((f) => {
    const d = Math.max(
      1,
      ...f.entradas.map((e) => (e.tipo === 'INSCRIPTOS' ? 1 : (profundidad.get(e.fase) ?? 0) + 1)),
    );
    profundidad.set(f.id, d);
  });
  const columnas = Math.max(1, ...profundidad.values()) + 1;
  const aristas: Arista[] = formato.fases.flatMap((f) =>
    f.entradas.map((e) => {
      const de = e.tipo === 'INSCRIPTOS' ? 'inscriptos' : e.fase;
      const i = indice.get(de);
      const salto = (profundidad.get(f.id) ?? 1) - (de === 'inscriptos' ? 0 : (profundidad.get(de) ?? 0));
      return { de, a: f.id, color: i === undefined ? '#0a0a0a' : colorDeFase(i), salto };
    }),
  );

  const caja = useRef<HTMLDivElement>(null);
  const [trazos, setTrazos] = useState<{ d: string; color: string }[]>([]);
  const [alto, setAlto] = useState(0);
  const firma = JSON.stringify([formato, equipos]);

  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return;
    const medir = () => {
      const base = el.getBoundingClientRect();
      const rect = (id: string) => {
        const n = el.querySelector<HTMLElement>(`[data-nodo="${id}"]`);
        if (!n) return null;
        const r = n.getBoundingClientRect();
        return { l: r.left - base.left, r: r.right - base.left, t: r.top - base.top, b: r.bottom - base.top };
      };
      const nuevos: { d: string; color: string }[] = [];
      let carril = 0;
      let abajo = 0;
      const piso = Math.max(
        ...[...el.querySelectorAll<HTMLElement>('[data-nodo]')].map(
          (x) => x.getBoundingClientRect().bottom - base.top,
        ),
      );
      for (const a of aristas) {
        const s = rect(a.de);
        const t = rect(a.a);
        if (!s || !t) continue;
        const sy = (s.t + s.b) / 2;
        const ty = (t.t + t.b) / 2;
        if (t.l >= s.r - 2 && a.salto > 1) {
          // Saltea columnas: por debajo de las fases del medio.
          const y = piso + 10 + (abajo++ % 3) * 6;
          const sx = (s.l + s.r) / 2;
          const tx = t.l + 24;
          nuevos.push({
            d: `M${sx},${s.b} V${y - 8} Q${sx},${y} ${sx + 8},${y} H${tx - 8} Q${tx},${y} ${tx},${y - 8} V${t.b}`,
            color: a.color,
          });
        } else if (t.l >= s.r - 2) {
          // Columnas: curva de izquierda a derecha.
          const m = (s.r + t.l) / 2;
          nuevos.push({ d: `M${s.r},${sy} C${m},${sy} ${m},${ty} ${t.l},${ty}`, color: a.color });
        } else {
          // Lista: corchete por el margen izquierdo, un carril por conexión.
          const x = Math.max(2, s.l - 8 - (carril++ % 3) * 6);
          const y1 = s.t + 22;
          const y2 = t.t + 22;
          nuevos.push({
            d: `M${s.l},${y1} H${x + 6} Q${x},${y1} ${x},${y1 + 6} V${y2 - 6} Q${x},${y2} ${x + 6},${y2} H${t.l}`,
            color: a.color,
          });
        }
      }
      setTrazos(nuevos);
      setAlto(el.scrollHeight);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [firma]);

  const porColumna = Array.from({ length: columnas }, (_, c) =>
    c === 0 ? ['inscriptos'] : formato.fases.filter((f) => profundidad.get(f.id) === c).map((f) => f.id),
  );

  return (
    <section
      aria-label="Diagrama de fases"
      className="tile rise space-y-4"
      style={{ '--d': 5 } as React.CSSProperties}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <b className="text-lg">Cómo se mueven los equipos</b>
        <span className="text-xs text-mute">Cada línea es un pase de equipos de una fase a otra.</span>
      </div>
      <div ref={caja} className="relative pl-6 md:pb-8 md:pl-0">
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          style={{ height: alto || undefined }}
          aria-hidden="true"
        >
          {trazos.map((t, i) => (
            <path
              key={i}
              d={t.d}
              fill="none"
              stroke={t.color === '#d6ff3d' ? '#a3c400' : t.color}
              strokeWidth={2.5}
              strokeLinecap="round"
              opacity={0.85}
            />
          ))}
        </svg>
        <div
          className="relative grid gap-4 md:gap-8 md:[grid-template-columns:var(--cols)]"
          style={
            { '--cols': `minmax(0, 0.6fr) repeat(${columnas - 1}, minmax(0, 1fr))` } as React.CSSProperties
          }
        >
          {porColumna.map((ids, c) => (
            <div key={c} className="contents md:flex md:flex-col md:justify-center md:gap-4">
              {ids.map((id) =>
                id === 'inscriptos' ? (
                  <div
                    key={id}
                    data-nodo={id}
                    className="relative rounded-3xl bg-ink p-4 text-white md:self-stretch"
                  >
                    <span className="eyebrow !text-white/50">Arranque</span>
                    <b className="num mt-1 block text-3xl tracking-tighter text-volt">{equipos}</b>
                    <span className="text-sm text-white/70">equipos inscriptos</span>
                  </div>
                ) : (
                  <NodoDeFase
                    key={id}
                    formato={formato}
                    sim={sim}
                    equipos={equipos}
                    indice={indice.get(id)!}
                    primerSabado={primerSabado}
                  />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function NodoDeFase({
  formato,
  sim,
  equipos,
  indice,
  primerSabado,
}: {
  formato: FormatoFlexible;
  sim: Simulacion;
  equipos: number;
  indice: number;
  primerSabado: Date | null;
}) {
  const fase = formato.fases[indice]!;
  const s = sim.fases[indice]!;
  const conError = sim.problemas.some((p) => p.nivel === 'ERROR' && p.faseId === fase.id);
  const detalle =
    fase.tipo === 'GRUPOS'
      ? `${s.grupos.length} grupos de ${[...new Set(s.grupos)].join(' y ')}`
      : fase.tipo === 'TODOS_CONTRA_TODOS'
        ? fase.ruedas > 1
          ? `${fase.ruedas} ruedas`
          : 'Una rueda'
        : s.rondas.map((r) => `${r.nombre}${r.idaYVuelta ? ' (i/v)' : ''}`).join(' · ');
  return (
    <div
      data-nodo={fase.id}
      data-testid={`nodo-${fase.id}`}
      className={`relative overflow-hidden rounded-3xl border bg-white p-4 shadow-sm ${conError ? 'border-red-400 ring-2 ring-red-200' : 'border-black/5'}`}
    >
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: colorDeFase(indice) }} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <b className="block leading-tight">{fase.nombre}</b>
          <span className="text-xs text-mute">
            {NOMBRE_DE_TIPO[fase.tipo]}
            {fase.inicio === 'EN_PARALELO' && indice > 0 ? ' · en paralelo' : ''}
          </span>
        </div>
        <span
          className="num shrink-0 rounded-full px-2 py-0.5 text-xs font-bold"
          style={{ background: colorDeFase(indice), color: tintaDeFase(indice) }}
        >
          {s.equipos} eq.
        </span>
      </div>
      <p className="mt-2 text-xs text-mute">{detalle}</p>
      <div className="mt-3 grid grid-cols-3 gap-1 text-center">
        {[
          ['partidos', s.partidos],
          ['fechas', s.fechas],
          ['sábados', s.primerSabado ? `${s.primerSabado}–${s.ultimoSabado}` : '—'],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-black/5 px-1 py-1.5">
            <b className="num block text-sm">{v}</b>
            <span className="block truncate text-[10px] text-mute">{k}</span>
          </div>
        ))}
      </div>
      {s.primerSabado && primerSabado && (
        <p className="mt-2 text-[11px] text-mute">
          Del sáb {diaDelSabado(primerSabado, s.primerSabado)} al{' '}
          {diaDelSabado(primerSabado, s.ultimoSabado!)}
        </p>
      )}
      {fase.entradas.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-black/5 pt-2 text-xs">
          {fase.entradas.map((e, k) => {
            const j = e.tipo === 'INSCRIPTOS' ? -1 : formato.fases.findIndex((f) => f.id === e.fase);
            return (
              <li key={k} className="flex items-start gap-1.5">
                <span
                  className="mt-1 size-2 shrink-0 rounded-full"
                  style={{ background: j < 0 ? '#0a0a0a' : colorDeFase(j) }}
                />
                <span>{describirEntrada(e, formato, equipos)}</span>
              </li>
            );
          })}
        </ul>
      )}
      {s.cruces.length > 0 && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer font-semibold">
            Cruces de {s.rondas[0]?.nombre.toLowerCase()}
          </summary>
          <ul className="mt-1 grid gap-0.5 text-mute">
            {s.cruces.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
