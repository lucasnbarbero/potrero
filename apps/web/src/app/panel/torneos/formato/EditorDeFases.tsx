'use client';
import {
  describirEntrada,
  type EntradaDeFase,
  type FaseDeFormato,
  type FormatoFlexible,
  idaYVueltaDeRonda,
  nuevaFase,
  type Simulacion,
  TIPOS_DE_FASE,
} from '@potrero/shared';
import { Icono } from '@potrero/ui';
import { colorDeFase, NOMBRE_DE_TIPO, tintaDeFase } from './comun';

/** Editor de fases: agregar, quitar, reordenar, tipo, grupos, ruedas, quiénes entran y ida y vuelta por ronda. */
export function EditorDeFases({
  formato,
  sim,
  equipos,
  onCambio,
}: {
  formato: FormatoFlexible;
  sim: Simulacion;
  equipos: number;
  onCambio: (f: FormatoFlexible) => void;
}) {
  const fases = formato.fases;
  const cambiarFase = (i: number, cambios: Partial<FaseDeFormato>) =>
    onCambio({ fases: fases.map((f, k) => (k === i ? { ...f, ...cambios } : f)) });
  const mover = (i: number, d: -1 | 1) => {
    const otra = [...fases];
    [otra[i], otra[i + d]] = [otra[i + d]!, otra[i]!];
    onCambio({ fases: otra });
  };
  const quitar = (i: number) => {
    const id = fases[i]!.id;
    onCambio({
      fases: fases
        .filter((_, k) => k !== i)
        .map((f) => ({ ...f, entradas: f.entradas.filter((e) => e.tipo === 'INSCRIPTOS' || e.fase !== id) })),
    });
  };
  const agregar = () => {
    const usados = new Set(fases.map((f) => f.id));
    let n = fases.length + 1;
    while (usados.has(`f${n}`)) n++;
    const previa = fases.at(-1);
    const entradas: EntradaDeFase[] = !previa
      ? [{ tipo: 'INSCRIPTOS' }]
      : previa.tipo === 'ELIMINACION'
        ? [{ tipo: 'PERDEDORES', fase: previa.id, ronda: 1 }]
        : [{ tipo: 'PUESTOS', fase: previa.id, desde: 1, hasta: 2 }];
    onCambio({
      fases: [
        ...fases,
        nuevaFase({
          id: `f${n}`,
          nombre: `Fase ${fases.length + 1}`,
          tipo: previa ? 'ELIMINACION' : 'TODOS_CONTRA_TODOS',
          entradas,
        }),
      ],
    });
  };

  return (
    <section aria-label="Fases" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="text-lg">3 · Fases</b>
        <button type="button" className="btn-glass btn-sm" onClick={agregar} disabled={fases.length >= 12}>
          <Icono nombre="plus" />
          Agregar fase
        </button>
      </div>
      {fases.map((fase, i) => (
        <EditorDeFase
          key={fase.id}
          i={i}
          fase={fase}
          formato={formato}
          sim={sim}
          equipos={equipos}
          onCambio={(c) => cambiarFase(i, c)}
          onSubir={i > 0 ? () => mover(i, -1) : undefined}
          onBajar={i < fases.length - 1 ? () => mover(i, 1) : undefined}
          onQuitar={fases.length > 1 ? () => quitar(i) : undefined}
        />
      ))}
    </section>
  );
}

function EditorDeFase({
  i,
  fase,
  formato,
  sim,
  equipos,
  onCambio,
  onSubir,
  onBajar,
  onQuitar,
}: {
  i: number;
  fase: FaseDeFormato;
  formato: FormatoFlexible;
  sim: Simulacion;
  equipos: number;
  onCambio: (c: Partial<FaseDeFormato>) => void;
  onSubir?: () => void;
  onBajar?: () => void;
  onQuitar?: () => void;
}) {
  const s = sim.fases[i]!;
  const problemas = sim.problemas.filter((p) => p.faseId === fase.id);
  const previas = formato.fases.slice(0, i);
  const cambiarEntrada = (k: number, e: EntradaDeFase | null) =>
    onCambio({
      entradas: e ? fase.entradas.map((x, j) => (j === k ? e : x)) : fase.entradas.filter((_, j) => j !== k),
    });

  return (
    <article
      aria-label={fase.nombre}
      data-testid={`fase-${fase.id}`}
      className="tile relative space-y-4 overflow-hidden"
    >
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: colorDeFase(i) }} />
      <div className="flex items-center gap-2">
        <span
          className="grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold"
          style={{ background: colorDeFase(i), color: tintaDeFase(i) }}
        >
          {i + 1}
        </span>
        <input
          aria-label="Nombre de la fase"
          className="min-w-0 flex-1 rounded-xl border border-transparent bg-transparent px-2 py-1 text-lg font-bold tracking-tight outline-none hover:border-black/10 focus:border-ink"
          value={fase.nombre}
          maxLength={60}
          onChange={(e) => onCambio({ nombre: e.target.value })}
        />
        <div className="flex shrink-0 gap-1">
          <BotonIcono etiqueta="Subir fase" onClick={onSubir} icono="chev" girar="-rotate-90" />
          <BotonIcono etiqueta="Bajar fase" onClick={onBajar} icono="chev" girar="rotate-90" />
          <BotonIcono etiqueta="Quitar fase" onClick={onQuitar} icono="x" />
        </div>
      </div>

      <p className="num -mt-2 text-xs text-mute">
        <b className="text-ink">{s.equipos}</b> equipos · <b className="text-ink">{s.partidos}</b> partidos ·{' '}
        <b className="text-ink">{s.fechas}</b> fechas
      </p>

      <div role="radiogroup" aria-label="Tipo de fase" className="seg grid w-full grid-cols-3">
        {TIPOS_DE_FASE.map((t) => (
          <button
            type="button"
            role="radio"
            aria-checked={fase.tipo === t}
            key={t}
            className={`!px-2 text-center !text-xs leading-tight sm:!text-sm ${fase.tipo === t ? 'on' : ''}`}
            onClick={() => onCambio({ tipo: t })}
          >
            {NOMBRE_DE_TIPO[t]}
          </button>
        ))}
      </div>

      {fase.tipo !== 'ELIMINACION' && (
        <div className="grid grid-cols-2 gap-3">
          {fase.tipo === 'GRUPOS' && (
            <>
              <label className="block min-w-0">
                <span className="field-label">Armar por</span>
                <select
                  className="input"
                  value={fase.grupos.modo}
                  onChange={(e) =>
                    onCambio({ grupos: { ...fase.grupos, modo: e.target.value as 'CANTIDAD' | 'TAMANO' } })
                  }
                >
                  <option value="CANTIDAD">Cantidad de grupos</option>
                  <option value="TAMANO">Equipos por grupo</option>
                </select>
              </label>
              <label className="block min-w-0">
                <span className="field-label">
                  {fase.grupos.modo === 'CANTIDAD' ? 'Grupos' : 'Equipos por grupo'}
                </span>
                <input
                  className="input num"
                  type="number"
                  min={1}
                  max={32}
                  value={fase.grupos.valor}
                  onChange={(e) =>
                    onCambio({
                      grupos: {
                        ...fase.grupos,
                        valor: Math.max(1, Math.min(32, Number(e.target.value) || 1)),
                      },
                    })
                  }
                />
              </label>
            </>
          )}
          <label className="block min-w-0">
            <span className="field-label">Ruedas</span>
            <select
              className="input"
              value={fase.ruedas}
              onChange={(e) => onCambio({ ruedas: Number(e.target.value) })}
            >
              <option value={1}>Una (solo ida)</option>
              <option value={2}>Dos (ida y vuelta)</option>
              <option value={3}>Tres</option>
              <option value={4}>Cuatro</option>
            </select>
          </label>
          {fase.tipo === 'GRUPOS' && s.grupos.length > 0 && (
            <p className="self-end pb-3 text-xs text-mute">
              Reparto en serpentina: {s.grupos.length} grupo{s.grupos.length === 1 ? '' : 's'} de{' '}
              {[...new Set(s.grupos)].join(' y ')}.
            </p>
          )}
        </div>
      )}

      {fase.tipo === 'ELIMINACION' && (
        <div className="space-y-3">
          {s.rondas.length > 0 && (
            <div>
              <span className="field-label">Rondas</span>
              <ul className="divide-y divide-black/5 rounded-2xl bg-black/5 px-3">
                {s.rondas.map((r) => {
                  const restantes = s.rondas.length - r.numero;
                  const on = idaYVueltaDeRonda(fase, restantes);
                  return (
                    <li key={r.numero} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="min-w-0">
                        <b>{r.nombre}</b>{' '}
                        <span className="text-xs text-mute">
                          {r.partidos} cruce{r.partidos === 1 ? '' : 's'}
                          {r.pasesLibres ? ` · ${r.pasesLibres} pasan libres` : ''}
                        </span>
                      </span>
                      <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-semibold">
                        {on ? 'Ida y vuelta' : 'Partido único'}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          aria-label={`${r.nombre} ida y vuelta`}
                          className={`toggle ${on ? 'on' : ''}`}
                          onClick={() => {
                            const arr = s.rondas.map((_, k) => idaYVueltaDeRonda(fase, k));
                            arr[restantes] = !on;
                            onCambio({ idaYVuelta: arr });
                          }}
                        />
                      </label>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-1 text-xs text-mute">
                Si la serie ida y vuelta queda empatada, se define por penales.
              </p>
            </div>
          )}
          <label className="block">
            <span className="field-label">Cruces</span>
            <select
              className="input"
              value={fase.cruces}
              onChange={(e) => onCambio({ cruces: e.target.value as FaseDeFormato['cruces'] })}
            >
              <option value="SIEMBRA">Siembra estándar (1º vs último)</option>
              <option value="CRUZADO_ENTRE_GRUPOS">Cruzado entre grupos (1º A vs 8º B)</option>
            </select>
          </label>
        </div>
      )}

      <div className="space-y-2">
        <span className="field-label">Quiénes entran</span>
        {fase.entradas.map((e, k) => (
          <SelectorDeEntrada
            key={k}
            entrada={e}
            previas={previas}
            sim={sim}
            formato={formato}
            equipos={equipos}
            onCambio={(x) => cambiarEntrada(k, x)}
          />
        ))}
        <button
          type="button"
          className="btn-glass btn-sm"
          onClick={() =>
            onCambio({
              entradas: [
                ...fase.entradas,
                previas.length
                  ? { tipo: 'NO_CLASIFICADOS', fase: previas.at(-1)!.id }
                  : { tipo: 'INSCRIPTOS' },
              ],
            })
          }
          disabled={fase.entradas.length >= 8}
        >
          <Icono nombre="plus" />
          Sumar equipos de otra fase
        </button>
      </div>

      {i > 0 && (
        <div>
          <span className="field-label">Cuándo se juega</span>
          <div role="radiogroup" aria-label="Cuándo se juega" className="seg grid w-full grid-cols-2">
            {(
              [
                ['DESPUES', 'Después de la anterior'],
                ['EN_PARALELO', 'En paralelo'],
              ] as const
            ).map(([v, t]) => (
              <button
                type="button"
                role="radio"
                aria-checked={fase.inicio === v}
                key={v}
                className={`!px-2 text-center !text-xs leading-tight sm:!text-sm ${fase.inicio === v ? 'on' : ''}`}
                onClick={() => onCambio({ inicio: v })}
              >
                {t}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-mute">
            {fase.inicio === 'EN_PARALELO'
              ? 'Arranca apenas tiene sus equipos y comparte los sábados con las otras fases.'
              : `Arranca cuando termina ${formato.fases[i - 1]!.nombre}.`}
          </p>
        </div>
      )}

      {problemas.length > 0 && (
        <ul className="space-y-1">
          {problemas.map((p, k) => (
            <li
              key={k}
              className={`rounded-xl px-3 py-2 text-xs font-medium ${p.nivel === 'ERROR' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-900'}`}
            >
              {p.mensaje}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function BotonIcono({
  etiqueta,
  onClick,
  icono,
  girar,
}: {
  etiqueta: string;
  onClick?: () => void;
  icono: 'chev' | 'x';
  girar?: string;
}) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      title={etiqueta}
      onClick={onClick}
      disabled={!onClick}
      className="grid size-8 place-items-center rounded-full bg-black/5 transition hover:bg-black/10 disabled:opacity-30"
    >
      <Icono nombre={icono} className={girar ?? ''} />
    </button>
  );
}

/** Codifica una entrada como opción del selector (sin los números que se editan aparte). */
const clave = (e: EntradaDeFase) =>
  e.tipo === 'INSCRIPTOS'
    ? 'INSCRIPTOS'
    : e.tipo === 'GANADORES' || e.tipo === 'PERDEDORES'
      ? `${e.tipo}|${e.fase}|${e.ronda}`
      : `${e.tipo}|${e.fase}`;

function SelectorDeEntrada({
  entrada,
  previas,
  sim,
  formato,
  equipos,
  onCambio,
}: {
  entrada: EntradaDeFase;
  previas: FaseDeFormato[];
  sim: Simulacion;
  formato: FormatoFlexible;
  equipos: number;
  onCambio: (e: EntradaDeFase | null) => void;
}) {
  const opciones: [string, string][] = [['INSCRIPTOS', 'Todos los inscriptos']];
  previas.forEach((f, j) => {
    if (f.tipo === 'ELIMINACION') {
      const rondas = sim.fases[j]?.rondas.length ? sim.fases[j]!.rondas : [{ numero: 1, nombre: 'Ronda 1' }];
      for (const r of rondas) {
        opciones.push([`GANADORES|${f.id}|${r.numero}`, `Ganadores de ${r.nombre} · ${f.nombre}`]);
        opciones.push([`PERDEDORES|${f.id}|${r.numero}`, `Perdedores de ${r.nombre} · ${f.nombre}`]);
      }
    } else {
      opciones.push([
        `PUESTOS|${f.id}`,
        f.tipo === 'GRUPOS' ? `Puestos de cada grupo · ${f.nombre}` : `Puestos de la tabla · ${f.nombre}`,
      ]);
      if (f.tipo === 'GRUPOS') opciones.push([`MEJORES|${f.id}`, `Mejores de un puesto · ${f.nombre}`]);
      opciones.push([`NO_CLASIFICADOS|${f.id}`, `Los que no clasificaron · ${f.nombre}`]);
    }
  });
  const actual = clave(entrada);
  if (!opciones.some(([v]) => v === actual)) opciones.push([actual, 'Una fase que viene después (reordená)']);

  const elegir = (v: string) => {
    const [tipo, fase = '', ronda] = v.split('|');
    if (tipo === 'INSCRIPTOS') return onCambio({ tipo: 'INSCRIPTOS' });
    if (tipo === 'PUESTOS') {
      const previo = entrada.tipo === 'PUESTOS' ? entrada : { desde: 1, hasta: 2 };
      return onCambio({ tipo: 'PUESTOS', fase, desde: previo.desde, hasta: previo.hasta });
    }
    if (tipo === 'MEJORES') return onCambio({ tipo: 'MEJORES', fase, puesto: 2, cantidad: 1 });
    if (tipo === 'NO_CLASIFICADOS') return onCambio({ tipo: 'NO_CLASIFICADOS', fase });
    onCambio({ tipo: tipo as 'GANADORES' | 'PERDEDORES', fase, ronda: Number(ronda) });
  };
  const numero = (valor: number, etiqueta: string, cambiar: (n: number) => void) => (
    <input
      aria-label={etiqueta}
      className="input num !w-16 !px-2 !py-2 text-center"
      type="number"
      min={1}
      max={64}
      value={valor}
      onChange={(e) => cambiar(Math.max(1, Math.min(64, Number(e.target.value) || 1)))}
    />
  );

  return (
    <div className="rounded-2xl border border-black/5 bg-white/70 p-3">
      <div className="flex items-center gap-2">
        <select
          aria-label="De dónde vienen"
          className="input min-w-0 flex-1 !py-2"
          value={actual}
          onChange={(e) => elegir(e.target.value)}
        >
          {opciones.map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Quitar"
          onClick={() => onCambio(null)}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-black/5 hover:bg-black/10"
        >
          <Icono nombre="x" />
        </button>
      </div>
      {entrada.tipo === 'PUESTOS' && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          Del {numero(entrada.desde, 'Desde el puesto', (n) => onCambio({ ...entrada, desde: n }))} al{' '}
          {numero(entrada.hasta, 'Hasta el puesto', (n) => onCambio({ ...entrada, hasta: n }))}
        </div>
      )}
      {entrada.tipo === 'MEJORES' && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          Los {numero(entrada.cantidad, 'Cuántos', (n) => onCambio({ ...entrada, cantidad: n }))} mejores que
          salieron {numero(entrada.puesto, 'Puesto', (n) => onCambio({ ...entrada, puesto: n }))}º
        </div>
      )}
      <p className="mt-2 text-sm font-semibold">→ {describirEntrada(entrada, formato, equipos)}</p>
    </div>
  );
}
