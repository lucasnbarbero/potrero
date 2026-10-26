'use client';
import { Icono } from '@potrero/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Campo, MensajeError, Selector, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';
import { pesos } from '@/lib/formato';
import type { ExpedienteVista, ResumenTribunal } from '@/lib/tipos';

/** Informe del árbitro, descargo del capitán y resolución del tribunal, todo en la tarjeta del expediente. */
export function AccionesExpediente({ e }: { e: ExpedienteVista }) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const [panel, setPanel] = useState<'' | 'descargo' | 'informe' | 'resolver'>('');
  const texto = (campo: string) => (f: FormData) => (f.get(campo) as string) ?? '';
  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-2">
        <button className="btn-glass btn-sm" onClick={() => setPanel(panel === 'resolver' ? '' : 'resolver')}>
          <Icono nombre="check" />
          Resolver
        </button>
        <button className="btn-glass btn-sm" onClick={() => setPanel(panel === 'descargo' ? '' : 'descargo')}>
          {e.descargo ? 'Editar descargo' : 'Cargar descargo'}
        </button>
        <button className="btn-glass btn-sm" onClick={() => setPanel(panel === 'informe' ? '' : 'informe')}>
          {e.informeArbitro ? 'Editar informe' : 'Cargar informe'}
        </button>
      </div>
      {panel === 'resolver' && (
        <form
          className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] sm:items-end"
          onSubmit={(ev) => {
            ev.preventDefault();
            const f = new FormData(ev.currentTarget);
            enviar(async () => {
              await api('POST', `/expedientes/${e.id}/resolver`, {
                partidos: Number(f.get('partidos')),
                multa: f.get('multa') ? Number(f.get('multa')) : 0,
                resolucion: texto('resolucion')(f),
              });
              setPanel('');
              router.refresh();
            });
          }}
        >
          <Campo
            etiqueta="Partidos de suspensión"
            name="partidos"
            type="number"
            min={0}
            max={20}
            required
            defaultValue={e.sugeridos}
            ayuda={`El reglamento sugiere ${e.sugeridos}. Podés ampliar o reducir.`}
          />
          <Campo etiqueta="Multa al equipo ($)" name="multa" type="number" min={0} placeholder="0" />
          <Campo etiqueta="Fundamento" name="resolucion" required minLength={3} />
          <button className="btn" disabled={enviando}>
            Confirmar resolución
          </button>
        </form>
      )}
      {(panel === 'descargo' || panel === 'informe') && (
        <form
          className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
          onSubmit={(ev) => {
            ev.preventDefault();
            const f = new FormData(ev.currentTarget);
            enviar(async () => {
              if (panel === 'descargo')
                await api('POST', `/expedientes/${e.id}/descargo`, { descargo: texto('texto')(f) });
              else await api('POST', `/expedientes/${e.id}/informe`, { informeArbitro: texto('texto')(f) });
              setPanel('');
              router.refresh();
            });
          }}
        >
          <Campo
            etiqueta={panel === 'descargo' ? 'Descargo del capitán' : 'Informe del árbitro'}
            name="texto"
            required
            minLength={3}
            defaultValue={(panel === 'descargo' ? e.descargo : e.informeArbitro) ?? ''}
          />
          <button className="btn" disabled={enviando}>
            Guardar
          </button>
        </form>
      )}
      <MensajeError error={error} />
    </div>
  );
}

const TIPOS = [
  ['AGRESION', 'Agresión'],
  ['INCIDENTE_HINCHADA', 'Incidente de la hinchada'],
  ['ROJA_DIRECTA', 'Roja directa'],
  ['OTRO', 'Otro'],
] as const;

/** Abrir un expediente a mano: un caso que no salió del acta (agresión, hinchada). */
export function AbrirExpediente({
  torneoId,
  equipos,
}: {
  torneoId: string;
  equipos: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const [abierto, setAbierto] = useState(false);
  if (!abierto)
    return (
      <button className="btn-volt" onClick={() => setAbierto(true)}>
        <Icono nombre="plus" />
        Abrir expediente
      </button>
    );
  return (
    <form
      data-testid="form-expediente"
      className="tile grid w-full gap-3 sm:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] sm:items-end"
      onSubmit={(ev) => {
        ev.preventDefault();
        const f = new FormData(ev.currentTarget);
        enviar(async () => {
          await api('POST', '/expedientes', {
            tipo: f.get('tipo'),
            torneoId,
            equipoId: f.get('equipoId'),
            motivo: f.get('motivo'),
            informeArbitro: (f.get('informeArbitro') as string) || undefined,
          });
          setAbierto(false);
          router.refresh();
        });
      }}
    >
      <Selector etiqueta="Tipo" name="tipo">
        {TIPOS.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </Selector>
      <Selector etiqueta="Equipo" name="equipoId">
        {equipos.map((q) => (
          <option key={q.id} value={q.id}>
            {q.nombre}
          </option>
        ))}
      </Selector>
      <Campo etiqueta="Motivo" name="motivo" required minLength={3} />
      <Campo etiqueta="Informe del árbitro" name="informeArbitro" />
      <button className="btn" disabled={enviando}>
        Abrir
      </button>
      <div className="sm:col-span-full">
        <MensajeError error={error} />
      </div>
    </form>
  );
}

// ───────────── Levantar una suspensión pagando (E14-08) ─────────────

type Suspendido = ResumenTribunal['suspendidos'][number];

/**
 * Pedido de levantar un partido de suspensión: genera un cargo al equipo (rubro Multas). El jugador queda habilitado
 * recién cuando el pago está acreditado.
 */
export function LevantarPagando({ s }: { s: Suspendido }) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const [confirmar, setConfirmar] = useState(false);
  const accion = (fn: () => Promise<unknown>) =>
    enviar(async () => {
      await fn();
      setConfirmar(false);
      router.refresh();
    });
  if (!s.levantar.ok && !s.pendientes.length) return null;
  return (
    <div className="mt-2 space-y-2" data-testid="levantar">
      {s.pendientes.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center gap-2">
          <span className="pill-amber">Pago pendiente · {pesos(p.monto)}</span>
          <button
            className="btn btn-sm"
            disabled={enviando}
            onClick={() =>
              accion(() => api('POST', `/cargos/${p.cargoId}/pagos`, { metodo: 'EFECTIVO', monto: p.monto }))
            }
          >
            Registrar pago en efectivo
          </button>
          <button
            className="btn-glass btn-sm"
            disabled={enviando}
            onClick={() => accion(() => api('POST', `/levantamientos/${p.id}/anular`))}
          >
            Anular
          </button>
        </div>
      ))}
      {s.levantar.ok &&
        (confirmar ? (
          <div className="rounded-2xl bg-black/5 px-4 py-3 text-sm">
            <p>
              Se le genera al equipo un cargo de <b>{pesos(s.levantar.monto)}</b> (rubro Multas) por 1
              partido. El jugador queda habilitado cuando se acredite el pago.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                className="btn btn-sm"
                disabled={enviando}
                onClick={() => accion(() => api('POST', `/sanciones/${s.sancionId}/levantar`))}
              >
                Confirmar
              </button>
              <button className="btn-glass btn-sm" onClick={() => setConfirmar(false)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button className="btn-glass btn-sm" onClick={() => setConfirmar(true)}>
            <Icono nombre="check" />
            Levantar pagando · {pesos(s.levantar.monto)}
          </button>
        ))}
      <MensajeError error={error} />
    </div>
  );
}

const LEVANTABLES = [
  ['ACUMULACION', 'Amarillas acumuladas'],
  ['DOBLE_AMARILLA', 'Doble amarilla'],
] as const;

/** Opción del reglamento del torneo: levantar una suspensión pagando una multa (apagada por defecto). */
export function ReglamentoLevantar({ torneoId, r }: { torneoId: string; r: ResumenTribunal['reglamento'] }) {
  const router = useRouter();
  const { enviando, error, campos, enviar } = useEnvio();
  const [abierto, setAbierto] = useState(false);
  const [encendido, setEncendido] = useState(r.levantarSancionPagando);
  const [tipos, setTipos] = useState<string[]>(r.levantarSancionTipos);
  const nombres = LEVANTABLES.filter(([t]) => r.levantarSancionTipos.includes(t)).map(([, n]) =>
    n.toLowerCase(),
  );
  return (
    <div className="mt-3 border-t border-black/5 pt-3 text-sm" data-testid="reglamento-levantar">
      <div className="flex items-start justify-between gap-2">
        <span>
          Levantar pagando{' '}
          {r.levantarSancionPagando && r.levantarSancionMonto > 0 ? (
            <b>
              {pesos(r.levantarSancionMonto)} por partido
              {nombres.length ? ` · ${nombres.join(' y ')}` : ''}
            </b>
          ) : (
            <b>Apagado</b>
          )}
        </span>
        {!abierto && (
          <button className="btn-glass btn-sm" onClick={() => setAbierto(true)}>
            Editar
          </button>
        )}
      </div>
      {abierto && (
        <form
          className="mt-3 space-y-3"
          onSubmit={(ev) => {
            ev.preventDefault();
            const f = new FormData(ev.currentTarget);
            enviar(async () => {
              await api('PATCH', `/torneos/${torneoId}/reglamento/levantar-sancion`, {
                levantarSancionPagando: encendido,
                levantarSancionTipos: tipos,
                levantarSancionMonto: Number(f.get('monto') || 0),
              });
              setAbierto(false);
              router.refresh();
            });
          }}
        >
          <label className="flex items-center gap-2 font-semibold">
            <input
              type="checkbox"
              className="size-4"
              checked={encendido}
              onChange={(e) => setEncendido(e.target.checked)}
            />
            Permitir levantar una suspensión pagando
          </label>
          <fieldset className="space-y-1">
            <legend className="field-label">Qué sanciones se pueden levantar</legend>
            {LEVANTABLES.map(([t, nombre]) => (
              <label key={t} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={tipos.includes(t)}
                  onChange={() => setTipos((l) => (l.includes(t) ? l.filter((x) => x !== t) : [...l, t]))}
                />
                {nombre}
              </label>
            ))}
            <p className="text-xs text-mute">
              La roja directa y lo que resuelve el tribunal no se levantan nunca.
            </p>
          </fieldset>
          <Campo
            etiqueta="Monto por partido ($)"
            name="monto"
            type="number"
            min={0}
            step={1}
            defaultValue={r.levantarSancionMonto || ''}
            error={campos.levantarSancionMonto}
            ayuda="Cada pago levanta un partido de suspensión."
          />
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-sm" disabled={enviando}>
              Guardar
            </button>
            <button type="button" className="btn-glass btn-sm" onClick={() => setAbierto(false)}>
              Cancelar
            </button>
          </div>
          <MensajeError error={error} />
        </form>
      )}
    </div>
  );
}
