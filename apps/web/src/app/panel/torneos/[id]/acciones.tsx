'use client';
// Acciones del detalle del torneo (componentes de cliente que llaman a la API y refrescan la página).
import { Icono } from '@potrero/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Campo, MensajeError, Selector, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';
import { pesos } from '@/lib/formato';
import type { Sede } from '@/lib/tipos';

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

/** Registrar un pago en efectivo o transferencia (sin comisión) o copiar el link de pago online. */
export function AccionesCobro({ cargoId, debe }: { cargoId: string; debe: number }) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const [link, setLink] = useState<string | null>(null);
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
}: {
  torneoId: string;
  sedes: Sede[];
  confirmados: number;
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
          });
          router.refresh();
        });
      }}
    >
      <Campo etiqueta="Primer día de juego" name="primerDia" type="date" required />
      <Campo etiqueta="Días entre fechas" name="diasEntreFechas" type="number" defaultValue={7} min={1} />
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
