'use client';
import { Icono } from '@potrero/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MensajeError, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';
import { fechaCorta, hora } from '@/lib/formato';
import type { AlertaClima, CanalMensaje, PropuestaReprogramacion } from '@/lib/tipos';

type Opcion = 'DIA_SIGUIENTE' | 'TECHADA' | 'SEMANA';

const ETIQUETA_DIA = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  weekday: 'long',
  day: 'numeric',
  month: 'numeric',
});
const nombreDelDia = (dia: string) => ETIQUETA_DIA.format(new Date(`${dia}T12:00:00-03:00`));

/** Centro de contingencias: elegís qué hacer, ves cómo queda el calendario y, si te sirve, aplicás y avisás. */
export function Reprogramador({
  alerta,
  torneos,
  canchas,
}: {
  alerta: AlertaClima | null;
  torneos: { id: string; nombre: string }[];
  canchas: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const [dia, setDia] = useState(alerta?.dia ?? '');
  const [torneoId, setTorneoId] = useState('');
  const [opcion, setOpcion] = useState<Opcion>('DIA_SIGUIENTE');
  const [techadas, setTechadas] = useState<string[]>([]);
  const [motivo, setMotivo] = useState(alerta ? 'Por pronóstico de lluvia' : '');
  const [canal, setCanal] = useState<CanalMensaje>('WHATSAPP');
  const [propuesta, setPropuesta] = useState<PropuestaReprogramacion | null>(null);
  const [errorPropuesta, setErrorPropuesta] = useState<string | null>(null);
  const [acepto, setAcepto] = useState(false);
  const [resultado, setResultado] = useState<{ id: string; movidos: number; avisados: number } | null>(null);

  const cuerpo = () => ({
    motivo: motivo || 'Reprogramación',
    alcance: { tipo: 'DIA', dia, ...(torneoId ? { torneoId } : {}) },
    accion:
      opcion === 'TECHADA'
        ? { tipo: 'CAMBIAR_CANCHA', canchaIds: techadas }
        : { tipo: 'MOVER', dias: opcion === 'SEMANA' ? 7 : 1 },
    canal,
    aceptarConflictos: acepto,
  });

  const lista = opcion !== 'TECHADA' || techadas.length > 0;
  useEffect(() => {
    if (!dia || !lista) {
      setPropuesta(null);
      setErrorPropuesta(null);
      return;
    }
    let vigente = true;
    const t = setTimeout(async () => {
      try {
        const p = await api<PropuestaReprogramacion>('POST', '/contingencias/propuesta', cuerpo());
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
    }, 300);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [dia, torneoId, opcion, techadas, canal, motivo]);

  const conflictos = propuesta?.conflictos.length ?? 0;
  const puedeAplicar = !!propuesta && propuesta.movimientos.length > 0 && (conflictos === 0 || acepto);

  return (
    <div className="space-y-4">
      {alerta ? (
        <section className="tile-ink rise" data-testid="alerta-clima">
          <div className="field-pattern pointer-events-none absolute inset-0 opacity-60" />
          <div className="relative">
            <div className="flex items-center justify-between text-xs text-white/60">
              <span className="eyebrow !text-white/60">Alerta de clima</span>
              <span>Actualizado hace {alerta.actualizadoHaceMin} min</span>
            </div>
            <p className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              {alerta.titulo} el {nombreDelDia(alerta.dia)} de {alerta.desdeHora} a {alerta.hastaHora} hs.
            </p>
            <p className="mt-2 max-w-2xl text-white/70">
              Probabilidad {alerta.probabilidad}% en tu zona. Afecta{' '}
              <b className="text-volt">{alerta.partidos} partidos</b> de {alerta.torneos}{' '}
              {alerta.torneos === 1 ? 'torneo' : 'torneos'} y a{' '}
              <b className="text-volt">{alerta.jugadores} jugadores</b>.
            </p>
          </div>
        </section>
      ) : (
        <section className="tile rise">
          <span className="eyebrow">Día a reprogramar</span>
          <p className="mt-1 text-sm text-mute">No hay alertas de clima. Elegí el día que querés mover.</p>
          <input
            type="date"
            className="input mt-3 !w-auto"
            value={dia}
            onChange={(e) => setDia(e.target.value)}
            aria-label="Día a reprogramar"
          />
        </section>
      )}

      <section className="grid gap-3 md:grid-cols-3" aria-label="Qué hacer">
        {(
          [
            ['DIA_SIGUIENTE', 'Mover al día siguiente', 'Mismos horarios y canchas, un día después.'],
            ['TECHADA', 'Cancha techada', 'Pasa a otras canchas en el mismo horario, los que entren.'],
            ['SEMANA', 'Suspender fecha', 'Se corre una semana entera.'],
          ] as [Opcion, string, string][]
        ).map(([k, t, d]) => (
          <button
            key={k}
            type="button"
            onClick={() => setOpcion(k)}
            aria-pressed={opcion === k}
            className={`tile text-left transition ${opcion === k ? '!bg-volt ring-4 ring-volt/40' : 'hover:bg-white'}`}
          >
            <b className="text-lg">{t}</b>
            <span className="mt-1 block text-sm text-ink/70">{d}</span>
          </button>
        ))}
      </section>

      {opcion === 'TECHADA' && (
        <section className="tile">
          <span className="field-label">Canchas de destino (techadas)</span>
          <div className="flex flex-wrap gap-2">
            {canchas.map((c) => {
              const on = techadas.includes(c.id);
              return (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setTechadas(on ? techadas.filter((x) => x !== c.id) : [...techadas, c.id])}
                  className={on ? 'pill-ink' : 'pill'}
                >
                  {c.nombre}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="tile grid gap-3 sm:grid-cols-3">
        <label className="block sm:col-span-2">
          <span className="field-label">Motivo (se lo contamos a los capitanes)</span>
          <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </label>
        <label className="block">
          <span className="field-label">Torneo</span>
          <select className="input" value={torneoId} onChange={(e) => setTorneoId(e.target.value)}>
            <option value="">Todos los de ese día</option>
            {torneos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </label>
      </section>

      {errorPropuesta && <p className="tile text-sm text-mute">{errorPropuesta}</p>}

      {propuesta && (
        <div className="grid items-start gap-4 xl:grid-cols-[1.3fr_1fr]" data-testid="propuesta">
          <section className="tile">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="eyebrow">Vista previa</span>
              {conflictos === 0 && propuesta.sinResolver.length === 0 ? (
                <span className="pill-volt">Sin conflictos</span>
              ) : (
                <span className="pill-amber">
                  {conflictos} {conflictos === 1 ? 'conflicto' : 'conflictos'}
                  {propuesta.sinResolver.length > 0 ? ` · ${propuesta.sinResolver.length} sin resolver` : ''}
                </span>
              )}
            </div>
            <ul className="mt-2">
              {propuesta.movimientos.map((m) => (
                <li key={m.partidoId} className="list-row flex-wrap text-sm">
                  <span className="w-44 shrink-0 text-xs text-mute">
                    {fechaCorta(m.de.inicio)} {hora(m.de.inicio)}{' '}
                    <Icono nombre="arrow" className="mx-1 inline" />
                    <b className="text-ink">
                      {fechaCorta(m.a.inicio)} {hora(m.a.inicio)}
                    </b>
                  </span>
                  <span className="min-w-0 flex-1">
                    <b>
                      {m.local} vs {m.visitante}
                    </b>
                    <span className="block text-xs text-mute">
                      {m.torneo} · {m.a.cancha ?? 'sin cancha'}
                      {m.a.cancha !== m.de.cancha && m.de.cancha ? ` (antes ${m.de.cancha})` : ''}
                    </span>
                  </span>
                </li>
              ))}
              {propuesta.movimientos.length === 0 && (
                <li className="py-3 text-sm text-mute">Con esta opción no se puede mover ningún partido.</li>
              )}
            </ul>
            {propuesta.sinResolver.length > 0 && (
              <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs text-amber-900">
                <b>Quedan sin resolver:</b>
                <ul className="mt-1 space-y-0.5">
                  {propuesta.sinResolver.map((s) => (
                    <li key={s.partido}>
                      {s.partido}: {s.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {conflictos > 0 && (
              <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs text-amber-900" role="alert">
                <b>Conflictos:</b>
                <ul className="mt-1 space-y-0.5">
                  {propuesta.conflictos.map((c, i) => (
                    <li key={i}>
                      {c.partido} con {c.con}: {c.mensaje}
                    </li>
                  ))}
                </ul>
                <label className="mt-2 flex items-center gap-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={acepto}
                    onChange={(e) => setAcepto(e.target.checked)}
                    className="size-4"
                  />
                  Los vi y quiero seguir igual
                </label>
              </div>
            )}
          </section>

          <section className="tile space-y-3">
            <span className="eyebrow">Mensaje que recibirán</span>
            {propuesta.aviso.ejemplo && (
              <div className="rounded-3xl bg-[#e7f7d9] p-4 text-sm leading-relaxed">
                {propuesta.aviso.ejemplo}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['WHATSAPP', 'WhatsApp'],
                  ['EMAIL', 'Email'],
                ] as [CanalMensaje, string][]
              ).map(([k, t]) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => setCanal(k)}
                  className={canal === k ? 'pill-ink' : 'pill'}
                >
                  {t}
                </button>
              ))}
            </div>
            <dl className="grid grid-cols-2 gap-2 text-center text-sm">
              {[
                ['Capitanes', propuesta.resumen.equipos],
                ['Jugadores', propuesta.resumen.jugadores],
                ['Partidos', propuesta.resumen.mueve],
                ['Canchas', propuesta.resumen.canchas],
              ].map(([t, n]) => (
                <div key={t} className="rounded-2xl bg-black/5 p-2">
                  <dt className="text-xs text-mute">{t}</dt>
                  <dd className="num text-lg font-bold">{n}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-mute" data-testid="aviso-costo">
              Se avisa a {propuesta.aviso.mensajes} capitanes
              {propuesta.aviso.omitidos > 0 ? ` (${propuesta.aviso.omitidos} sin forma de contactarlos)` : ''}
              .{' '}
              {propuesta.aviso.costoUsd > 0
                ? `Costo estimado: US$ ${propuesta.aviso.costoUsd.toFixed(3).replace('.', ',')}.`
                : 'Sin costo.'}
            </p>
            {propuesta.aviso.tope.excedente > 0 && (
              <p role="alert" className="rounded-2xl bg-red-50 p-3 text-xs font-medium text-red-700">
                El aviso se pasa de tu tope de WhatsApp del mes. Avisá por email.
              </p>
            )}
            <MensajeError error={error} />
            <button
              className="btn-volt btn-lg w-full"
              disabled={enviando || !puedeAplicar || propuesta.aviso.tope.excedente > 0}
              onClick={() =>
                enviar(async () => {
                  const r = await api<{ contingenciaId: string; movidos: number; avisados: number }>(
                    'POST',
                    '/contingencias/aplicar',
                    cuerpo(),
                  );
                  setResultado({ id: r.contingenciaId, movidos: r.movidos, avisados: r.avisados });
                  setPropuesta(null);
                  router.refresh();
                })
              }
            >
              <Icono nombre="send" />
              {enviando ? 'Aplicando…' : 'Confirmar y avisar'}
            </button>
          </section>
        </div>
      )}

      {resultado && (
        <section role="status" className="tile-volt" data-testid="resultado-reprogramacion">
          <b className="text-xl">
            Listo: movimos {resultado.movidos} {resultado.movidos === 1 ? 'partido' : 'partidos'} y avisamos a{' '}
            {resultado.avisados} {resultado.avisados === 1 ? 'capitán' : 'capitanes'}.
          </b>
          <p className="mt-1 text-sm text-ink/70">
            A medida que confirmen vas a verlo acá.{' '}
            <Link href={`/panel/reprogramaciones/${resultado.id}`} className="font-bold underline">
              Ver quién respondió
            </Link>
          </p>
        </section>
      )}
    </div>
  );
}
