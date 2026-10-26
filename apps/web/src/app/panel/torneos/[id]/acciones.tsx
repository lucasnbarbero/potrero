'use client';
// Acciones del detalle del torneo (componentes de cliente que llaman a la API y refrescan la página).
import { Icono } from '@potrero/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Campo, MensajeError, Selector, useEnvio } from '@/componentes/formulario';
import { usePermiso } from '@/componentes/Permisos';
import { api } from '@/lib/cliente';
import { pesos } from '@/lib/formato';
import type { Sede } from '@/lib/tipos';

/** Canchas disponibles, con las elegidas marcadas. */
function useCanchas(sedes: Sede[]) {
  const canchas = sedes.flatMap((s) => s.canchas.map((c) => ({ ...c, sede: s.nombre })));
  const [elegidas, setElegidas] = useState(canchas.map((c) => c.id));
  return { canchas, elegidas, setElegidas };
}

function SelectorCanchas({
  sedes,
  canchas,
  elegidas,
  setElegidas,
}: ReturnType<typeof useCanchas> & { sedes: Sede[] }) {
  void sedes;
  return (
    <div>
      <span className="field-label">Canchas</span>
      <div className="flex flex-wrap gap-2">
        {canchas.map((c) => {
          const on = elegidas.includes(c.id);
          return (
            <button
              type="button"
              key={c.id}
              onClick={() => setElegidas(on ? elegidas.filter((x) => x !== c.id) : [...elegidas, c.id])}
              className={on ? 'pill-ink' : 'pill'}
            >
              {c.sede} · {c.nombre}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const partirHorarios = (v: FormDataEntryValue | null) =>
  String(v)
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);

/** Fecha límite de pago de la inscripción: de ahí salen los recordatorios de cobro escalonados. */
export function VencimientoInscripcion({ torneoId, inicial }: { torneoId: string; inicial: string | null }) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const [guardado, setGuardado] = useState(false);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const vence = (new FormData(e.currentTarget).get('vence') as string) || null;
        enviar(async () => {
          await api('PATCH', `/torneos/${torneoId}/vencimiento`, { vence });
          setGuardado(true);
          router.refresh();
        });
      }}
    >
      <div className="min-w-56 flex-1">
        <Campo
          etiqueta="Vence el pago de la inscripción"
          name="vence"
          type="date"
          defaultValue={inicial?.slice(0, 10) ?? ''}
          ayuda="Con la automatización de cobro encendida, avisamos 3 días antes, el día y 2 días después."
        />
      </div>
      <button className="btn" disabled={enviando}>
        Guardar vencimiento
      </button>
      <div className="w-full">
        <MensajeError error={error} />
        {guardado && !error && <p className="text-xs font-semibold">Guardado.</p>}
      </div>
    </form>
  );
}

export function InscribirEquipo({
  torneoId,
  equipos,
}: {
  torneoId: string;
  equipos: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  if (equipos.length === 0)
    return <p className="text-sm text-mute">Todos los equipos de la liga ya están inscriptos.</p>;
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const equipoId = new FormData(e.currentTarget).get('equipoId');
        enviar(async () => {
          await api('POST', `/torneos/${torneoId}/inscripciones`, { equipoId });
          router.refresh();
        });
      }}
    >
      <div className="min-w-56 flex-1">
        <Selector etiqueta="Inscribir un equipo de la liga" name="equipoId">
          {equipos.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </Selector>
      </div>
      <button className="btn" disabled={enviando}>
        <Icono nombre="plus" />
        Inscribir
      </button>
      <div className="w-full">
        <MensajeError error={error} />
      </div>
    </form>
  );
}

/** Registrar un pago en efectivo o transferencia (sin cargo por servicio) o copiar el link de pago online. */
export function AccionesCobro({ cargoId, debe }: { cargoId: string; debe: number }) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const [link, setLink] = useState<string | null>(null);
  const puedeCobrar = usePermiso('cobro.registrar');
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button
        className="btn-glass btn-sm"
        disabled={enviando}
        onClick={() =>
          enviar(async () => {
            const r = await api<{ urlPago: string }>('POST', `/cargos/${cargoId}/link`);
            setLink(r.urlPago);
            await navigator.clipboard?.writeText(r.urlPago).catch(() => undefined);
          })
        }
      >
        <Icono nombre="link" />
        Link de pago
      </button>
      {puedeCobrar && (
        <button
          className="btn btn-sm"
          disabled={enviando}
          onClick={() =>
            enviar(async () => {
              await api('POST', `/cargos/${cargoId}/pagos`, {
                metodo: 'EFECTIVO',
                monto: debe,
                comprobante: 'Registrado desde el panel',
              });
              router.refresh();
            })
          }
        >
          Cobré {pesos(debe)} en efectivo
        </button>
      )}
      {link && (
        <a
          href={link}
          target="_blank"
          className="w-full truncate text-right text-xs font-semibold text-ink underline"
        >
          Copiado: {link}
        </a>
      )}
      {error && <span className="w-full text-right text-xs text-red-600">{error}</span>}
    </div>
  );
}

export function GenerarFixture({
  torneoId,
  sedes,
  confirmados,
  conGrupos = false,
}: {
  torneoId: string;
  sedes: Sede[];
  confirmados: number;
  conGrupos?: boolean;
}) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const canchas = sedes.flatMap((s) => s.canchas.map((c) => ({ ...c, sede: s.nombre })));
  const [elegidas, setElegidas] = useState(canchas.map((c) => c.id));
  if (canchas.length === 0)
    return (
      <p className="text-sm text-mute">
        Primero cargá al menos una cancha en{' '}
        <a href="/panel/canchas" className="font-semibold text-ink underline">
          Canchas
        </a>
        .
      </p>
    );
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        enviar(async () => {
          await api('POST', `/torneos/${torneoId}/fixture`, {
            primerDia: f.get('primerDia'),
            diasEntreFechas: Number(f.get('diasEntreFechas')),
            horarios: String(f.get('horarios'))
              .split(',')
              .map((h) => h.trim())
              .filter(Boolean),
            canchaIds: elegidas,
            ...(conGrupos ? { grupos: Number(f.get('grupos')) } : {}),
          });
          router.refresh();
        });
      }}
    >
      <Campo etiqueta="Primer día de juego" name="primerDia" type="date" required />
      <Campo etiqueta="Días entre fechas" name="diasEntreFechas" type="number" defaultValue={7} min={1} />
      {conGrupos && (
        <Campo
          etiqueta="Cantidad de grupos"
          name="grupos"
          type="number"
          defaultValue={2}
          min={2}
          max={16}
          ayuda="Los equipos se reparten en serpentina. Hacen falta al menos 3 por grupo."
        />
      )}
      <Campo
        etiqueta="Horarios"
        name="horarios"
        defaultValue="19:00, 20:00, 21:00"
        ayuda="Separados por coma (HH:MM)."
      />
      <div>
        <span className="field-label">Canchas</span>
        <div className="flex flex-wrap gap-2">
          {canchas.map((c) => {
            const on = elegidas.includes(c.id);
            return (
              <button
                type="button"
                key={c.id}
                onClick={() => setElegidas(on ? elegidas.filter((x) => x !== c.id) : [...elegidas, c.id])}
                className={on ? 'pill-ink' : 'pill'}
              >
                {c.sede} · {c.nombre}
              </button>
            );
          })}
        </div>
      </div>
      <div className="sm:col-span-2">
        <MensajeError error={error} />
      </div>
      <button className="btn-volt sm:col-span-2" disabled={enviando || confirmados < 2}>
        <Icono nombre="bolt" />
        {enviando ? 'Armando…' : `Generar fixture con ${confirmados} equipos confirmados`}
      </button>
    </form>
  );
}

/** Arma el cuadro de playoffs. Los campos cambian según el formato del torneo. */
export function GenerarLlaves({
  torneoId,
  formato,
  sedes,
  equipos,
}: {
  torneoId: string;
  formato: string;
  sedes: Sede[];
  equipos: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const c = useCanchas(sedes);
  const [cabezas, setCabezas] = useState<string[]>([]);
  if (c.canchas.length === 0)
    return (
      <p className="text-sm text-mute">
        Primero cargá al menos una cancha en{' '}
        <a href="/panel/canchas" className="font-semibold text-ink underline">
          Canchas
        </a>
        .
      </p>
    );
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        enviar(async () => {
          await api('POST', `/torneos/${torneoId}/llaves`, {
            primerDia: f.get('primerDia'),
            diasEntreRondas: Number(f.get('diasEntreRondas')),
            horarios: partirHorarios(f.get('horarios')),
            canchaIds: c.elegidas,
            ...(formato === 'COPA' ? { cabezasDeSerie: cabezas } : {}),
            ...(formato === 'COPA' && f.get('semilla') ? { semilla: Number(f.get('semilla')) } : {}),
            ...(formato === 'LIGA_PLAYOFFS' && f.get('clasificados')
              ? { clasificados: Number(f.get('clasificados')) }
              : {}),
            ...(formato === 'GRUPOS_PLAYOFFS' ? { porGrupo: Number(f.get('porGrupo')) } : {}),
          });
          router.refresh();
        });
      }}
    >
      <Campo etiqueta="Primer día de juego" name="primerDia" type="date" required />
      <Campo etiqueta="Días entre rondas" name="diasEntreRondas" type="number" defaultValue={7} min={1} />
      <Campo
        etiqueta="Horarios"
        name="horarios"
        defaultValue="19:00, 20:00, 21:00"
        ayuda="Separados por coma (HH:MM)."
      />
      <SelectorCanchas sedes={sedes} {...c} />
      {formato === 'LIGA_PLAYOFFS' && (
        <Selector etiqueta="Clasifican a playoffs" name="clasificados">
          <option value="">Según la cantidad de equipos</option>
          {[2, 4, 8, 16].map((n) => (
            <option key={n} value={n}>
              Los primeros {n}
            </option>
          ))}
        </Selector>
      )}
      {formato === 'GRUPOS_PLAYOFFS' && (
        <Selector etiqueta="Avanzan por grupo" name="porGrupo" defaultValue="2">
          <option value="2">Los 2 primeros de cada grupo</option>
          <option value="1">Solo el primero de cada grupo</option>
        </Selector>
      )}
      {formato === 'COPA' && (
        <>
          <div className="sm:col-span-2">
            <span className="field-label">Cabezas de serie (en orden, opcional)</span>
            <div className="flex flex-wrap gap-2">
              {equipos.map((e) => {
                const pos = cabezas.indexOf(e.id);
                return (
                  <button
                    type="button"
                    key={e.id}
                    onClick={() =>
                      setCabezas(pos >= 0 ? cabezas.filter((x) => x !== e.id) : [...cabezas, e.id])
                    }
                    className={pos >= 0 ? 'pill-ink' : 'pill'}
                  >
                    {pos >= 0 ? `${pos + 1}º · ` : ''}
                    {e.nombre}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-mute">
              Las cabezas de serie no se cruzan entre sí en las primeras rondas. El resto se sortea.
            </p>
          </div>
          <Campo
            etiqueta="Número de sorteo (opcional)"
            name="semilla"
            type="number"
            ayuda="Si repetís el número, el sorteo sale igual: sirve para mostrarlo en vivo y auditarlo."
          />
        </>
      )}
      <div className="sm:col-span-2">
        <MensajeError error={error} />
      </div>
      <button className="btn-volt sm:col-span-2" disabled={enviando}>
        <Icono nombre="bolt" />
        {enviando ? 'Armando…' : formato === 'COPA' ? 'Sortear y armar la llave' : 'Armar la llave'}
      </button>
    </form>
  );
}
