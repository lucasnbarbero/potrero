'use client';
import { Icono } from '@potrero/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Campo, MensajeError, Selector, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';
import { pesos } from '@/lib/formato';

/** Registrar el retiro de Mercado Pago a la cuenta bancaria. Es un registro: el dinero lo movés vos desde Mercado Pago. */
export function Retiro({ disponible }: { disponible: number }) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const [abierto, setAbierto] = useState(false);
  const [hecho, setHecho] = useState<string | null>(null);
  if (!abierto)
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-volt btn-sm" onClick={() => setAbierto(true)} disabled={disponible <= 0}>
          <Icono nombre="send" />
          Retirar a mi cuenta
        </button>
        {hecho && (
          <span role="status" className="text-sm font-semibold text-volt">
            {hecho}
          </span>
        )}
      </div>
    );
  return (
    <form
      className="space-y-2 rounded-2xl bg-white/10 p-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        enviar(async () => {
          const monto = Number(f.get('monto'));
          await api('POST', '/caja/retiros', { monto, destino: (f.get('destino') as string) || undefined });
          setHecho(`Retiro de ${pesos(monto)} registrado.`);
          setAbierto(false);
          router.refresh();
        });
      }}
    >
      <label className="block">
        <span className="text-xs font-semibold text-white/70">
          Monto a retirar (máximo {pesos(disponible)})
        </span>
        <input
          name="monto"
          type="number"
          min={1}
          max={disponible}
          required
          className="input mt-1 !bg-white !text-ink"
        />
      </label>
      <label className="block">
        <span className="text-xs font-semibold text-white/70">
          A qué cuenta (alias o últimos dígitos, opcional)
        </span>
        <input name="destino" className="input mt-1 !bg-white !text-ink" />
      </label>
      <MensajeError error={error} />
      <div className="flex gap-2">
        <button className="btn-volt btn-sm" disabled={enviando}>
          Registrar retiro
        </button>
        <button
          type="button"
          className="text-xs font-semibold text-white/70 underline"
          onClick={() => setAbierto(false)}
        >
          Cancelar
        </button>
      </div>
      <p className="text-xs text-white/50">
        Solo queda registrado: la transferencia la hacés desde tu cuenta de Mercado Pago.
      </p>
    </form>
  );
}

const RUBROS = [
  ['CANCHAS', 'Canchas'],
  ['ARBITROS', 'Árbitros'],
  ['PREMIOS', 'Premios y trofeos'],
  ['OTROS', 'Otros'],
] as const;
const CUENTAS = [
  ['EFECTIVO', 'Efectivo'],
  ['BANCO', 'Transferencia / banco'],
  ['MP', 'Mercado Pago'],
] as const;

/** Cargar a mano un egreso (por rubro) o un ingreso que no viene de un cobro (sponsors, otros). */
export function FormularioMovimiento({
  torneos,
  torneoActual,
}: {
  torneos: { id: string; nombre: string }[];
  torneoActual: string;
}) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const [tipo, setTipo] = useState<'EGRESO' | 'INGRESO'>('EGRESO');
  const [hecho, setHecho] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        enviar(async () => {
          const comun = {
            monto: Number(f.get('monto')),
            descripcion: f.get('descripcion'),
            ...(f.get('fecha') ? { fecha: f.get('fecha') } : {}),
            ...(f.get('comprobante') ? { comprobante: f.get('comprobante') } : {}),
            ...(f.get('torneoId') ? { torneoId: f.get('torneoId') } : {}),
          };
          if (tipo === 'EGRESO')
            await api('POST', '/caja/egresos', {
              ...comun,
              rubro: f.get('rubro'),
              pagadoCon: f.get('cuenta'),
            });
          else
            await api('POST', '/caja/ingresos', {
              ...comun,
              categoria: f.get('rubro'),
              cobradoEn: f.get('cuenta'),
            });
          form.reset();
          setHecho(true);
          router.refresh();
        });
      }}
    >
      <div className="flex items-center justify-between">
        <span className="eyebrow">Cargar un movimiento</span>
        <div className="seg">
          <button type="button" className={tipo === 'EGRESO' ? 'on' : ''} onClick={() => setTipo('EGRESO')}>
            Egreso
          </button>
          <button type="button" className={tipo === 'INGRESO' ? 'on' : ''} onClick={() => setTipo('INGRESO')}>
            Ingreso
          </button>
        </div>
      </div>
      <Selector etiqueta={tipo === 'EGRESO' ? 'Rubro' : 'Tipo de ingreso'} name="rubro" key={tipo}>
        {tipo === 'EGRESO' ? (
          RUBROS.map(([k, t]) => (
            <option key={k} value={k}>
              {t}
            </option>
          ))
        ) : (
          <>
            <option value="SPONSORS">Sponsor</option>
            <option value="OTROS">Otros ingresos</option>
          </>
        )}
      </Selector>
      <Campo
        etiqueta="Descripción"
        name="descripcion"
        required
        placeholder={tipo === 'EGRESO' ? 'Alquiler fecha 7' : 'Kiosco Don Pepe · cuota'}
      />
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Monto ($)" name="monto" type="number" min={1} required />
        <Selector etiqueta={tipo === 'EGRESO' ? 'Pagado con' : 'Cobrado en'} name="cuenta">
          {CUENTAS.map(([k, t]) => (
            <option key={k} value={k}>
              {t}
            </option>
          ))}
        </Selector>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Fecha" name="fecha" type="date" />
        <Campo etiqueta="Comprobante" name="comprobante" placeholder="Recibo 0021" />
      </div>
      <Selector etiqueta="Torneo" name="torneoId" defaultValue={torneoActual}>
        <option value="">Ninguno en particular</option>
        {torneos.map((t) => (
          <option key={t.id} value={t.id}>
            {t.nombre}
          </option>
        ))}
      </Selector>
      <MensajeError error={error} />
      {hecho && !error && <p className="text-xs font-semibold">Movimiento registrado.</p>}
      <button className="btn btn-sm" disabled={enviando}>
        <Icono nombre="plus" />
        Registrar {tipo === 'EGRESO' ? 'egreso' : 'ingreso'}
      </button>
    </form>
  );
}
