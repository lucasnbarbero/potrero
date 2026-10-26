'use client';
// Grilla del fixture por cancha y horario (mock 04) con el armado a mano (E09-07): arrastrá un partido a una franja libre
// para moverlo o sobre otro para intercambiarlos; en el celular, tocá un partido y después la franja o el otro partido.
// Cada cambio muestra sus conflictos con la causa antes de aplicarlo: nunca se bloquea, se confirma que se vieron.
import { momentoLocal } from '@potrero/shared';
import { Icono } from '@potrero/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MensajeError, Selector, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';
import { fechaCorta, hora } from '@/lib/formato';
import type { CanalMensaje, ProgramacionTorneo, PropuestaCambioFixture } from '@/lib/tipos';

type PartidoGrilla = ProgramacionTorneo['partidos'][number];
type Cambio =
  | { tipo: 'MOVER'; dia: string; hora: string; canchaId: string }
  | { tipo: 'INTERCAMBIAR'; conPartidoId: string };

const lugar = (p: PartidoGrilla) => (p.inicio ? momentoLocal(p.inicio) : null);
const franjaDe = (dia: string, h: string) => `${dia}|${h}`;
const marcador = (p: PartidoGrilla) =>
  p.estado === 'FINALIZADO' ? `${p.golesLocal}-${p.golesVisitante}` : p.estado === 'WO' ? `${p.golesLocal}-${p.golesVisitante} · ausente` : null;

export function GrillaFixture({ datos }: { datos: ProgramacionTorneo }) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const fechas = useMemo(
    () => [...new Set(datos.partidos.map((p) => p.fecha))].sort((a, b) => a - b),
    [datos],
  );
  const primeraPendiente = datos.partidos.find((p) => p.estado === 'PROGRAMADO')?.fecha ?? fechas[0] ?? 1;
  const [fecha, setFecha] = useState(primeraPendiente);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [cambio, setCambio] = useState<Cambio | null>(null);
  const [propuesta, setPropuesta] = useState<PropuestaCambioFixture | null>(null);
  const [errorPropuesta, setErrorPropuesta] = useState<string | null>(null);
  const [acepto, setAcepto] = useState(false);
  const [avisar, setAvisar] = useState(false);
  const [canal, setCanal] = useState<CanalMensaje>('WHATSAPP');
  const [motivo, setMotivo] = useState('');
  const [hecho, setHecho] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const panel = useRef<HTMLElement>(null);

  const delaFecha = datos.partidos.filter((p) => p.fecha === fecha);
  const elegido = datos.partidos.find((p) => p.id === seleccion) ?? null;
  // Columnas: las canchas que usa el torneo (y la del cambio en curso, si es otra). Filas: las franjas de la fecha.
  const canchasUsadas = new Set(datos.partidos.flatMap((p) => (p.canchaId ? [p.canchaId] : [])));
  if (cambio?.tipo === 'MOVER') canchasUsadas.add(cambio.canchaId);
  const columnas = datos.canchas.filter((c) => canchasUsadas.has(c.id));
  const franjas = [
    ...new Set(
      delaFecha.flatMap((p) => {
        const l = lugar(p);
        return l ? [franjaDe(l.fecha, l.hora)] : [];
      }),
    ),
  ].sort();
  const variosDias = new Set(franjas.map((f) => f.split('|')[0])).size > 1;
  // Normalmente un partido por celda; dos si se aceptó a propósito un choque de cancha.
  const enCelda = (franja: string, canchaId: string) =>
    delaFecha.filter((p) => {
      const l = lugar(p);
      return l && p.canchaId === canchaId && franjaDe(l.fecha, l.hora) === franja;
    });

  function elegir(p: PartidoGrilla) {
    setHecho(null);
    if (seleccion && seleccion !== p.id && !p.noMovible) {
      setCambio({ tipo: 'INTERCAMBIAR', conPartidoId: p.id });
      return;
    }
    setSeleccion(p.id === seleccion ? null : p.id);
    setCambio(null);
  }
  function soltarEn(franja: string, canchaId: string) {
    if (!seleccion) return;
    const [dia, h] = franja.split('|') as [string, string];
    setCambio({ tipo: 'MOVER', dia, hora: h, canchaId });
  }

  useEffect(() => {
    if (seleccion && window.innerWidth < 1280)
      panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [seleccion]);

  const cuerpo = (extra: Record<string, unknown> = {}) => ({
    cambio,
    canal,
    ...(motivo ? { motivo } : {}),
    ...extra,
  });
  const completo =
    cambio?.tipo === 'INTERCAMBIAR' ||
    (cambio?.tipo === 'MOVER' && !!cambio.dia && !!cambio.hora && !!cambio.canchaId);
  const claveCambio = JSON.stringify(cambio);
  useEffect(() => {
    if (!seleccion || !completo) {
      setPropuesta(null);
      setErrorPropuesta(null);
      return;
    }
    let vigente = true;
    const t = setTimeout(async () => {
      try {
        const p = await api<PropuestaCambioFixture>(
          'POST',
          `/partidos/${seleccion}/programacion/propuesta`,
          cuerpo(),
        );
        if (vigente) {
          setPropuesta(p);
          setErrorPropuesta(null);
          setAcepto(false);
        }
      } catch (e) {
        if (vigente) {
          setPropuesta(null);
          setErrorPropuesta((e as Error).message);
        }
      }
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [seleccion, claveCambio, canal]);

  const aplicar = () =>
    enviar(async () => {
      const r = await api<{ movidos: number; avisados: number; conflictos: number }>(
        'POST',
        `/partidos/${seleccion}/programacion`,
        cuerpo({ aceptarConflictos: acepto, avisar }),
      );
      setHecho(
        `Listo: ${r.movidos === 2 ? 'se intercambiaron los dos partidos' : 'se movió el partido'}` +
          (avisar ? `. Avisamos a ${r.avisados} capitán${r.avisados === 1 ? '' : 'es'}.` : '.'),
      );
      setSeleccion(null);
      setCambio(null);
      setPropuesta(null);
      setAvisar(false);
      router.refresh();
    });

  const conflictos = propuesta?.conflictos.length ?? 0;
  const actual = elegido ? lugar(elegido) : null;
  const mover = cambio?.tipo === 'MOVER' ? cambio : null;
  const intercambiables = delaFecha.filter((p) => p.id !== seleccion && !p.noMovible);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="seg max-w-full overflow-x-auto" role="tablist" aria-label="Fechas">
          {fechas.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={f === fecha}
              className={`whitespace-nowrap ${f === fecha ? 'on' : ''}`}
              onClick={() => {
                setFecha(f);
                setSeleccion(null);
                setCambio(null);
              }}
            >
              Fecha {f}
            </button>
          ))}
        </div>
        <span className="ml-auto text-sm text-mute">
          {delaFecha[0]?.inicio ? fechaCorta(delaFecha[0].inicio) : 'Sin horario'}
        </span>
      </div>
      {hecho && (
        <p role="status" className="rounded-2xl bg-volt/40 px-4 py-3 text-sm font-semibold">
          {hecho}
        </p>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[1fr_340px]">
        <section className="tile !p-3 sm:!p-5" aria-label={`Grilla de la fecha ${fecha}`}>
          <div className="scrollx">
            <div
              className="grid gap-2.5 text-xs"
              style={{
                gridTemplateColumns: `64px repeat(${Math.max(columnas.length, 1)}, minmax(150px, 1fr))`,
                minWidth: `${64 + Math.max(columnas.length, 1) * 160}px`,
              }}
            >
              <div />
              {columnas.map((c) => (
                <div key={c.id} className="eyebrow truncate px-1" title={c.nombre}>
                  {/* El nombre completo (sede · cancha) queda en el título; en la columna, la cancha. */}
                  {c.nombre.split(' · ').at(-1)}
                  {c.superficie ? ` · ${c.superficie}` : ''}
                </div>
              ))}
              {franjas.map((f) => {
                const [dia, h] = f.split('|') as [string, string];
                return (
                  <div key={f} className="contents">
                    <div className="num pt-3 text-sm font-bold">
                      {h}
                      {variosDias && (
                        <span className="block text-[10px] font-normal text-mute">
                          {fechaCorta(`${dia}T12:00:00-03:00`)}
                        </span>
                      )}
                    </div>
                    {columnas.map((c) => {
                      const ps = enCelda(f, c.id);
                      const clave = `${f}|${c.id}`;
                      if (ps.length === 0) {
                        const destino =
                          mover && franjaDe(mover.dia, mover.hora) === f && mover.canchaId === c.id;
                        if (c.bloqueada && !seleccion)
                          return (
                            <div
                              key={clave}
                              className="rounded-2xl border border-dashed border-black/15 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgb(0_0_0/.04)_6px,rgb(0_0_0/.04)_12px)] p-3 text-mute"
                            >
                              <b className="block text-sm">Bloqueada</b>
                              {c.motivoBloqueo ?? 'No disponible'}
                            </div>
                          );
                        return (
                          <button
                            key={clave}
                            type="button"
                            disabled={!seleccion}
                            aria-label={`Mover a las ${h} en ${c.nombre}`}
                            onClick={() => soltarEn(f, c.id)}
                            onDragOver={(e) => {
                              e.preventDefault();
                              setSobre(clave);
                            }}
                            onDragLeave={() => setSobre(null)}
                            onDrop={(e) => {
                              e.preventDefault();
                              setSobre(null);
                              soltarEn(f, c.id);
                            }}
                            className={`min-h-16 rounded-2xl border-2 border-dashed p-3 text-center font-semibold transition ${
                              destino || sobre === clave
                                ? 'border-volt-deep/60 bg-volt/30 text-ink'
                                : seleccion
                                  ? 'border-black/15 text-mute hover:border-volt-deep/60 hover:bg-volt/20'
                                  : 'border-transparent text-transparent'
                            }`}
                          >
                            {destino ? 'Va acá' : seleccion ? 'Mover acá' : ''}
                          </button>
                        );
                      }
                      return (
                        <div
                          key={clave}
                          data-franja={f}
                          data-cancha={c.id}
                          className={`grid gap-2 ${ps.length > 1 ? 'rounded-2xl p-1 ring-2 ring-amber-300' : ''}`}
                        >
                          {ps.map((p) => {
                            const esElegido = p.id === seleccion;
                            const esOtro = cambio?.tipo === 'INTERCAMBIAR' && cambio.conPartidoId === p.id;
                            const res = marcador(p);
                            return (
                              <button
                                key={p.id}
                                type="button"
                                draggable={!p.noMovible}
                                onDragStart={(e) => {
                                  e.dataTransfer.effectAllowed = 'move';
                                  setSeleccion(p.id);
                                  setCambio(null);
                                  setHecho(null);
                                }}
                                onDragOver={(e) => {
                                  if (seleccion && seleccion !== p.id && !p.noMovible) {
                                    e.preventDefault();
                                    setSobre(p.id);
                                  }
                                }}
                                onDragLeave={() => setSobre(null)}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  setSobre(null);
                                  if (seleccion && seleccion !== p.id && !p.noMovible)
                                    setCambio({ tipo: 'INTERCAMBIAR', conPartidoId: p.id });
                                }}
                                onClick={() => elegir(p)}
                                aria-pressed={esElegido}
                                data-partido={p.id}
                                className={`slot rounded-2xl p-3 text-left transition ${
                                  esElegido
                                    ? 'bg-ink text-white shadow-lg'
                                    : esOtro || sobre === p.id
                                      ? 'border-2 border-volt-deep bg-volt/30'
                                      : 'border border-black/5 bg-white shadow-sm hover:border-black/20'
                                } ${p.noMovible ? 'cursor-default' : 'cursor-grab'}`}
                              >
                                <b className="block text-sm">
                                  {p.local} · {p.visitante}
                                  {res && <span className="num ml-1">({res})</span>}
                                </b>
                                <span className={esElegido ? 'text-white/60' : 'text-mute'}>
                                  {p.grupo ? `Grupo ${p.grupo} · ` : ''}
                                  {p.arbitro ?? (
                                    <span className="font-semibold text-red-600">sin árbitro</span>
                                  )}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
          {franjas.length === 0 && (
            <p className="p-4 text-sm text-mute">Esta fecha todavía no tiene horarios.</p>
          )}
          <p className="mt-3 px-1 text-xs text-mute">
            Arrastrá un partido a una franja libre para moverlo, o sobre otro para intercambiar sus horarios.
            En el celular: tocá un partido y después la franja o el otro partido.
          </p>
        </section>

        <aside ref={panel} className="space-y-4 scroll-mt-24" aria-label="Mover partido">
          {!elegido ? (
            <section className="tile-ink">
              <div className="field-pattern pointer-events-none absolute inset-0 opacity-70" />
              <div className="relative">
                <span className="pill border-transparent bg-white/15 text-white">
                  <Icono nombre="swap" />
                  Armado a mano
                </span>
                <p className="mt-4 text-xl font-semibold leading-snug">
                  {delaFecha.length} partido{delaFecha.length === 1 ? '' : 's'} en la fecha {fecha}. Elegí uno
                  para moverlo o cambiarle el horario.
                </p>
              </div>
            </section>
          ) : (
            <section className="tile space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="eyebrow">Mover partido</span>
                  <b className="block text-lg leading-tight">
                    {elegido.local} vs {elegido.visitante}
                  </b>
                  <span className="text-xs text-mute">
                    Ahora:{' '}
                    {elegido.inicio ? `${fechaCorta(elegido.inicio)} ${hora(elegido.inicio)}` : 'sin horario'}
                    {elegido.canchaId
                      ? ` · ${datos.canchas.find((c) => c.id === elegido.canchaId)?.nombre ?? ''}`
                      : ''}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-glass btn-sm"
                  aria-label="Cerrar"
                  onClick={() => {
                    setSeleccion(null);
                    setCambio(null);
                  }}
                >
                  <Icono nombre="x" />
                </button>
              </div>

              {elegido.noMovible ? (
                <p className="rounded-2xl bg-black/5 p-3 text-sm text-mute">
                  {elegido.noMovible} No se puede mover.
                </p>
              ) : (
                <>
                  <div className="seg" role="tablist" aria-label="Qué querés hacer">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={cambio?.tipo !== 'INTERCAMBIAR'}
                      className={cambio?.tipo !== 'INTERCAMBIAR' ? 'on' : ''}
                      onClick={() =>
                        setCambio({
                          tipo: 'MOVER',
                          dia: actual?.fecha ?? '',
                          hora: actual?.hora ?? '',
                          canchaId: elegido.canchaId ?? '',
                        })
                      }
                    >
                      Mover
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={cambio?.tipo === 'INTERCAMBIAR'}
                      className={cambio?.tipo === 'INTERCAMBIAR' ? 'on' : ''}
                      onClick={() =>
                        setCambio({ tipo: 'INTERCAMBIAR', conPartidoId: intercambiables[0]?.id ?? '' })
                      }
                    >
                      Intercambiar
                    </button>
                  </div>

                  {cambio?.tipo === 'INTERCAMBIAR' ? (
                    <Selector
                      etiqueta="Intercambiar el horario con"
                      value={cambio.conPartidoId}
                      onChange={(e) => setCambio({ tipo: 'INTERCAMBIAR', conPartidoId: e.target.value })}
                    >
                      {intercambiables.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.inicio ? hora(p.inicio) : '—'} · {p.local} vs {p.visitante}
                        </option>
                      ))}
                    </Selector>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="field-label">Día</span>
                        <input
                          type="date"
                          className="input"
                          value={mover?.dia ?? actual?.fecha ?? ''}
                          onChange={(e) =>
                            setCambio({
                              tipo: 'MOVER',
                              dia: e.target.value,
                              hora: mover?.hora ?? actual?.hora ?? '',
                              canchaId: mover?.canchaId ?? elegido.canchaId ?? '',
                            })
                          }
                        />
                      </label>
                      <label className="block">
                        <span className="field-label">Horario</span>
                        <input
                          type="time"
                          className="input"
                          value={mover?.hora ?? actual?.hora ?? ''}
                          onChange={(e) =>
                            setCambio({
                              tipo: 'MOVER',
                              dia: mover?.dia ?? actual?.fecha ?? '',
                              hora: e.target.value,
                              canchaId: mover?.canchaId ?? elegido.canchaId ?? '',
                            })
                          }
                        />
                      </label>
                      <div className="col-span-2">
                        <Selector
                          etiqueta="Cancha"
                          value={mover?.canchaId ?? elegido.canchaId ?? ''}
                          onChange={(e) =>
                            setCambio({
                              tipo: 'MOVER',
                              dia: mover?.dia ?? actual?.fecha ?? '',
                              hora: mover?.hora ?? actual?.hora ?? '',
                              canchaId: e.target.value,
                            })
                          }
                        >
                          {datos.canchas.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nombre}
                              {c.bloqueada ? ' (bloqueada)' : ''}
                            </option>
                          ))}
                        </Selector>
                      </div>
                    </div>
                  )}

                  {errorPropuesta && <p className="text-sm text-mute">{errorPropuesta}</p>}
                  {propuesta && (
                    <div className="space-y-3" data-testid="propuesta-fixture">
                      <div className="flex items-center justify-between gap-2">
                        <span className="eyebrow">Cómo queda</span>
                        {conflictos === 0 ? (
                          <span className="pill-volt">
                            <Icono nombre="check" />
                            Sin conflictos
                          </span>
                        ) : (
                          <span className="pill-amber">
                            {conflictos} {conflictos === 1 ? 'conflicto' : 'conflictos'}
                          </span>
                        )}
                      </div>
                      <ul>
                        {propuesta.movimientos.map((m) => (
                          <li key={m.partidoId} className="list-row text-sm">
                            <span className="min-w-0 flex-1">
                              <b className="block truncate">
                                {m.local} vs {m.visitante}
                              </b>
                              <span className="text-xs text-mute">
                                {fechaCorta(m.de.inicio)} {hora(m.de.inicio)}{' '}
                                <Icono nombre="arrow" className="mx-0.5 inline" />{' '}
                                <b className="text-ink">
                                  {fechaCorta(m.a.inicio)} {hora(m.a.inicio)}
                                </b>
                                {m.a.cancha ? ` · ${m.a.cancha}` : ''}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                      {conflictos > 0 && (
                        <div className="rounded-2xl bg-amber-50 p-3 text-xs text-amber-900" role="alert">
                          <b className="flex items-center gap-1.5">
                            <Icono nombre="bolt" />
                            Conflictos
                          </b>
                          <ul className="mt-1 space-y-1">
                            {propuesta.conflictos.map((c, i) => (
                              <li key={i}>
                                <b>{c.partido}</b>
                                {c.con ? ` con ${c.con}` : ''}: {c.mensaje}
                              </li>
                            ))}
                          </ul>
                          <label className="mt-2 flex items-center gap-2 font-semibold">
                            <input
                              type="checkbox"
                              className="size-4"
                              checked={acepto}
                              onChange={(e) => setAcepto(e.target.checked)}
                            />
                            Los vi y quiero seguir igual
                          </label>
                        </div>
                      )}
                      <div className="rounded-2xl bg-black/5 p-3 text-sm">
                        <label className="flex items-center gap-2 font-semibold">
                          <input
                            type="checkbox"
                            className="size-4"
                            checked={avisar}
                            onChange={(e) => setAvisar(e.target.checked)}
                          />
                          Avisar a los capitanes
                        </label>
                        {avisar && (
                          <div className="mt-2 grid gap-2">
                            <label className="block">
                              <span className="field-label">Motivo</span>
                              <input
                                className="input"
                                placeholder="Cambio de horario"
                                maxLength={120}
                                value={motivo}
                                onChange={(e) => setMotivo(e.target.value)}
                              />
                            </label>
                            <Selector
                              etiqueta="Canal"
                              value={canal}
                              onChange={(e) => setCanal(e.target.value as CanalMensaje)}
                            >
                              <option value="WHATSAPP">WhatsApp (o email si no hay)</option>
                              <option value="EMAIL">Email</option>
                            </Selector>
                            <span className="text-xs text-mute">
                              {propuesta.aviso.mensajes} mensaje{propuesta.aviso.mensajes === 1 ? '' : 's'}{' '}
                              con &quot;Confirmo&quot; / &quot;No puedo&quot;
                              {propuesta.aviso.omitidos
                                ? ` · ${propuesta.aviso.omitidos} capitanes sin contacto`
                                : ''}
                              . Queda en Reprogramaciones.
                            </span>
                          </div>
                        )}
                      </div>
                      <MensajeError error={error} />
                      <button
                        type="button"
                        className="btn-volt w-full"
                        disabled={enviando || (conflictos > 0 && !acepto)}
                        onClick={aplicar}
                      >
                        {enviando ? 'Guardando…' : 'Confirmar cambio'}
                      </button>
                    </div>
                  )}
                </>
              )}
              <Link href={`/panel/partidos/${elegido.id}`} className="btn-glass btn-sm w-fit">
                Ver acta
              </Link>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
