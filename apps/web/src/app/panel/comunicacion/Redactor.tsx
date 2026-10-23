'use client';
import { Icono } from '@potrero/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MensajeError, Selector, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';
import type { CanalMensaje, PlantillaMensaje, VistaPreviaEnvio } from '@/lib/tipos';

type Destino = 'TODOS' | 'TORNEO' | 'MOROSOS' | 'EQUIPO';

const DESTINOS: [Destino, string][] = [
  ['TODOS', 'Todos los capitanes'],
  ['TORNEO', 'Un torneo'],
  ['MOROSOS', 'Solo morosos'],
  ['EQUIPO', 'Un equipo'],
];
const CANALES: [CanalMensaje, string][] = [
  ['WHATSAPP', 'WhatsApp'],
  ['EMAIL', 'Email'],
  ['PUSH', 'Push'],
];

const usd = (n: number) => `US$ ${n.toFixed(3).replace(/0$/, '').replace('.', ',')}`;

/** Redacta y envía un mensaje: elige a quién, la plantilla y el canal, y muestra en vivo cómo llega y cuánto cuesta. */
export function Redactor({
  plantillas,
  torneos,
  equipos,
}: {
  plantillas: PlantillaMensaje[];
  torneos: { id: string; nombre: string }[];
  equipos: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const [destino, setDestino] = useState<Destino>('TODOS');
  const [torneoId, setTorneoId] = useState(torneos[0]?.id ?? '');
  const [equipoId, setEquipoId] = useState(equipos[0]?.id ?? '');
  const [clave, setClave] = useState('LIBRE');
  const [texto, setTexto] = useState('Hola {capitán}! ');
  const [canal, setCanal] = useState<CanalMensaje>('WHATSAPP');
  const [programar, setProgramar] = useState(false);
  const [cuando, setCuando] = useState('');
  const [previa, setPrevia] = useState<VistaPreviaEnvio | null>(null);
  const [errorPrevia, setErrorPrevia] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  // "Solo morosos" arranca en todos los torneos; "Un torneo" necesita uno elegido.
  const elegirDestino = (k: Destino) => {
    setDestino(k);
    if (k === 'MOROSOS') setTorneoId('');
    if (k === 'TORNEO' && !torneoId) setTorneoId(torneos[0]?.id ?? '');
  };

  const plantilla = plantillas.find((p) => p.clave === clave)!;
  const esLibre = clave === 'LIBRE';

  const cuerpoEnvio = () => ({
    plantilla: clave,
    canal,
    segmento:
      destino === 'TODOS'
        ? { tipo: 'TODOS' }
        : destino === 'TORNEO'
          ? { tipo: 'TORNEO', torneoId }
          : destino === 'MOROSOS'
            ? { tipo: 'MOROSOS', ...(torneoId ? { torneoId } : {}) }
            : { tipo: 'EQUIPOS', equipoIds: [equipoId] },
    ...(esLibre ? { texto } : {}),
    ...(programar && cuando ? { programadaPara: new Date(cuando).toISOString() } : {}),
  });

  // La vista previa se actualiza sola, un instante después de cada cambio.
  useEffect(() => {
    let vigente = true;
    const t = setTimeout(async () => {
      try {
        const p = await api<VistaPreviaEnvio>('POST', '/comunicacion/vista-previa', cuerpoEnvio());
        if (vigente) {
          setPrevia(p);
          setErrorPrevia(null);
        }
      } catch (e) {
        if (vigente) {
          setPrevia(null);
          setErrorPrevia((e as Error).message);
        }
      }
    }, 300);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [destino, torneoId, equipoId, clave, texto, canal]);

  const puedeEnviar =
    !!previa &&
    previa.entregas > 0 &&
    previa.problemas.length === 0 &&
    previa.tope.excedente === 0 &&
    (!programar || !!cuando);

  return (
    <div className="space-y-4">
      <section className="tile rise" style={{ '--d': 1 } as React.CSSProperties}>
        <h2 className="mb-4 text-xl font-bold">Nuevo mensaje</h2>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            enviar(async () => {
              const r = await api<{ programada: boolean; enviados?: number; entregas?: number }>(
                'POST',
                '/comunicacion/enviar',
                cuerpoEnvio(),
              );
              setResultado(
                r.programada
                  ? `Quedó programado: ${r.entregas} mensajes saldrán a la hora indicada.`
                  : `Listo: enviamos ${r.enviados} ${r.enviados === 1 ? 'mensaje' : 'mensajes'}.`,
              );
              router.refresh();
            });
          }}
        >
          <div>
            <span className="field-label">Destinatarios</span>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Destinatarios">
              {DESTINOS.map(([k, t]) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => elegirDestino(k)}
                  className={destino === k ? 'pill-ink' : 'pill'}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {(destino === 'TORNEO' || destino === 'MOROSOS') && (
            <Selector etiqueta="Torneo" value={torneoId} onChange={(e) => setTorneoId(e.target.value)}>
              {destino === 'MOROSOS' && <option value="">Todos los torneos</option>}
              {torneos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </Selector>
          )}
          {destino === 'EQUIPO' && (
            <Selector etiqueta="Equipo" value={equipoId} onChange={(e) => setEquipoId(e.target.value)}>
              {equipos.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.nombre}
                </option>
              ))}
            </Selector>
          )}

          <Selector etiqueta="Plantilla" value={clave} onChange={(e) => setClave(e.target.value)}>
            {plantillas.map((p) => (
              <option key={p.clave} value={p.clave}>
                {p.nombre}
              </option>
            ))}
          </Selector>

          <label className="block">
            <span className="field-label">Mensaje</span>
            <textarea
              className="input min-h-28"
              value={esLibre ? texto : plantilla.cuerpo}
              readOnly={!esLibre}
              onChange={(e) => setTexto(e.target.value)}
              aria-label="Mensaje"
            />
            <span className="mt-1 block text-xs text-mute">
              Las variables entre llaves se completan solas para cada destinatario
              {esLibre ? ': {capitán}, {equipo}, {liga} y {torneo}.' : '.'}
              {!esLibre && ` Versión ${plantilla.version} de la plantilla.`}
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="field-label">Canal</span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Canal">
                {CANALES.map(([k, t]) => (
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
            </div>
            <div>
              <span className="field-label">Cuándo</span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setProgramar(false)}
                  className={!programar ? 'pill-ink' : 'pill'}
                >
                  Ahora
                </button>
                <button
                  type="button"
                  onClick={() => setProgramar(true)}
                  className={programar ? 'pill-ink' : 'pill'}
                >
                  Programar
                </button>
                {programar && (
                  <input
                    type="datetime-local"
                    className="input !w-auto !py-1.5"
                    value={cuando}
                    onChange={(e) => setCuando(e.target.value)}
                    aria-label="Fecha y hora del envío"
                  />
                )}
              </div>
            </div>
          </div>

          <MensajeError error={error} />
          {resultado && (
            <p role="status" className="rounded-2xl bg-volt/40 px-4 py-3 text-sm font-semibold">
              {resultado}
            </p>
          )}
          <button className="btn-volt btn-lg w-full" disabled={enviando || !puedeEnviar}>
            <Icono nombre="send" />
            {enviando
              ? 'Enviando…'
              : previa
                ? `${programar ? 'Programar para' : 'Enviar a'} ${previa.entregas} ${previa.entregas === 1 ? 'equipo' : 'equipos'}`
                : 'Enviar'}
          </button>
        </form>
      </section>

      <section className="tile rise" style={{ '--d': 2 } as React.CSSProperties} data-testid="vista-previa">
        <div className="flex items-center justify-between">
          <span className="eyebrow">Vista previa</span>
          {previa && (
            <span className="text-xs font-semibold text-mute">
              {previa.destinatarios} {previa.destinatarios === 1 ? 'equipo' : 'equipos'} · plan {previa.plan}
            </span>
          )}
        </div>
        {errorPrevia && <p className="mt-3 text-sm text-mute">{errorPrevia}</p>}
        {previa?.ejemplo && (
          <div className="mt-3 rounded-3xl bg-[#e7f7d9] p-4 text-sm leading-relaxed shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink/50">
              Para {previa.ejemplo.para} · {previa.ejemplo.equipo}
            </p>
            <p className="mt-1" data-testid="ejemplo-mensaje">
              {previa.ejemplo.cuerpo}
            </p>
          </div>
        )}
        {previa && (
          <dl className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
            {CANALES.map(([k, t]) => (
              <div key={k} className="rounded-2xl bg-black/5 p-3">
                <dt className="text-xs text-mute">{t}</dt>
                <dd className="num text-xl font-bold">{previa.porCanal[k]}</dd>
              </div>
            ))}
          </dl>
        )}
        {previa && (
          <p className="mt-3 text-sm" data-testid="costo-envio">
            <b>Costo estimado:</b>{' '}
            {previa.costoUsd === 0
              ? 'sin costo'
              : `${usd(previa.costoUsd)} (≈ $ ${previa.costoArs.toLocaleString('es-AR')})`}
          </p>
        )}
        {previa && previa.cambiosDeCanal > 0 && (
          <p className="mt-2 text-xs text-mute">
            {previa.cambiosDeCanal}{' '}
            {previa.cambiosDeCanal === 1 ? 'capitán no aceptó' : 'capitanes no aceptaron'} WhatsApp: le llega
            por email.
          </p>
        )}
        {previa && previa.omitidos.length > 0 && (
          <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs text-amber-900">
            <b>No le llega a {previa.omitidos.length}:</b>
            <ul className="mt-1 space-y-0.5">
              {previa.omitidos.slice(0, 5).map((o) => (
                <li key={o.equipo}>
                  {o.equipo}: {o.motivo}
                </li>
              ))}
            </ul>
          </div>
        )}
        {previa && previa.problemas.length > 0 && (
          <p role="alert" className="mt-3 rounded-2xl bg-red-50 p-3 text-xs font-medium text-red-700">
            {previa.problemas[0]}
          </p>
        )}
        {previa && previa.tope.excedente > 0 && (
          <p role="alert" className="mt-3 rounded-2xl bg-red-50 p-3 text-xs font-medium text-red-700">
            Este envío se pasa de los {previa.tope.tope} WhatsApp del mes de tu plan (te quedan{' '}
            {previa.tope.restantes}). Elegí email o achicá los destinatarios.
          </p>
        )}
      </section>
    </div>
  );
}
