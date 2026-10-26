'use client';
// Cobro de un equipo en "Inscripciones y pagos": link de pago, atajo en efectivo, pago manual completo o parcial
// (efectivo o transferencia, sin comisión) y la lista de pagos con la anulación de un pago manual mal cargado.
import { saldoDelCargo } from '@potrero/shared';
import { Icono } from '@potrero/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Campo, MensajeError, Selector, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';
import { fechaCorta, pesos } from '@/lib/formato';
import type { InscripcionConPagos, PagoDeInscripcion } from '@/lib/tipos';
import { Dialogo, hoyEnArgentina } from './Dialogo';

const MEDIO: Record<string, string> = {
  MERCADO_PAGO: 'Mercado Pago',
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
};

export function CobroEquipo({ inscripcion: i }: { inscripcion: InscripcionConPagos }) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const [link, setLink] = useState<string | null>(null);
  const [registrar, setRegistrar] = useState(false);
  const [verPagos, setVerPagos] = useState(false);
  const pendientes = i.cargos.map((c) => ({ ...c, saldo: saldoDelCargo(c) })).filter((c) => c.saldo > 0);
  // El próximo cargo a cobrar (vienen ordenados por vencimiento), con lo que falta de ese cargo.
  const proximo = pendientes[0];
  const pagos = i.pagos.filter((p) => p.estado === 'APROBADO' || p.estado === 'ANULADO');
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {proximo ? (
        <>
          {pendientes.length > 1 && (
            <span className="w-full text-right text-xs text-mute">Próximo: {proximo.concepto}</span>
          )}
          <button
            className="btn-glass btn-sm"
            disabled={enviando}
            onClick={() =>
              enviar(async () => {
                const r = await api<{ urlPago: string }>('POST', `/cargos/${proximo.id}/link`);
                setLink(r.urlPago);
                await navigator.clipboard?.writeText(r.urlPago).catch(() => undefined);
              })
            }
          >
            <Icono nombre="link" />
            Link de pago
          </button>
          <button
            className="btn-glass btn-sm"
            disabled={enviando}
            onClick={() =>
              enviar(async () => {
                await api('POST', `/cargos/${proximo.id}/pagos`, {
                  metodo: 'EFECTIVO',
                  monto: proximo.saldo,
                  comprobante: 'Registrado desde el panel',
                });
                router.refresh();
              })
            }
          >
            Cobré {pesos(proximo.saldo)} en efectivo
          </button>
          <button className="btn btn-sm" disabled={enviando} onClick={() => setRegistrar(true)}>
            <Icono nombre="plus" />
            Registrar pago
          </button>
        </>
      ) : (
        <span className="text-mute">Al día</span>
      )}
      {pagos.length > 0 && (
        <button className="text-xs font-semibold text-ink underline" onClick={() => setVerPagos(true)}>
          Ver pagos ({pagos.length})
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
      {registrar && (
        <Dialogo titulo={`Registrar pago · ${i.equipo.nombre}`} cerrar={() => setRegistrar(false)}>
          <FormularioPago
            inscripcionId={i.id}
            pendientes={pendientes}
            listo={() => {
              setRegistrar(false);
              router.refresh();
            }}
          />
        </Dialogo>
      )}
      {verPagos && (
        <Dialogo titulo={`Pagos · ${i.equipo.nombre}`} cerrar={() => setVerPagos(false)}>
          <ListaPagos pagos={pagos} total={i.total} pagado={i.pagado} />
        </Dialogo>
      )}
    </div>
  );
}

function FormularioPago({
  inscripcionId,
  pendientes,
  listo,
}: {
  inscripcionId: string;
  pendientes: { id: string; concepto: string; saldo: number }[];
  listo: () => void;
}) {
  const { enviando, error, campos, enviar } = useEnvio();
  const total = pendientes.reduce((s, c) => s + c.saldo, 0);
  const [cargoId, setCargoId] = useState(pendientes.length === 1 ? pendientes[0]!.id : '');
  const saldo = cargoId ? (pendientes.find((c) => c.id === cargoId)?.saldo ?? 0) : total;
  const [monto, setMonto] = useState(String(saldo));
  const n = Number(monto);
  const parcial = n > 0 && n < saldo;
  const hoy = hoyEnArgentina();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        enviar(async () => {
          await api('POST', `/inscripciones/${inscripcionId}/pagos`, {
            monto: n,
            metodo: f.get('metodo'),
            fecha: f.get('fecha') || undefined,
            comprobante: String(f.get('comprobante') ?? '').trim() || undefined,
            ...(cargoId ? { cargoId } : {}),
          });
          listo();
        });
      }}
    >
      {pendientes.length > 1 && (
        <Selector
          etiqueta="Concepto"
          value={cargoId}
          onChange={(e) => {
            setCargoId(e.target.value);
            const s = e.target.value ? pendientes.find((c) => c.id === e.target.value)!.saldo : total;
            setMonto(String(s));
          }}
        >
          <option value="">Todo lo que debe, del más viejo al más nuevo ({pesos(total)})</option>
          {pendientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.concepto} · debe {pesos(c.saldo)}
            </option>
          ))}
        </Selector>
      )}
      {pendientes.length === 1 && (
        <p className="text-sm">
          <span className="text-mute">Concepto:</span> <b>{pendientes[0]!.concepto}</b>
        </p>
      )}
      <Campo
        etiqueta="Monto ($)"
        name="monto"
        type="number"
        inputMode="numeric"
        min={1}
        max={saldo}
        step={1}
        required
        value={monto}
        onChange={(e) => setMonto(e.target.value)}
        error={campos.monto}
        ayuda={
          parcial
            ? `Pago parcial: queda debiendo ${pesos(saldo - n)}.`
            : `Saldo: ${pesos(saldo)}. Si cobraste menos, poné lo que te dieron: queda como pago parcial.`
        }
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Selector etiqueta="Medio" name="metodo" defaultValue="EFECTIVO">
          <option value="EFECTIVO">Efectivo</option>
          <option value="TRANSFERENCIA">Transferencia</option>
        </Selector>
        <Campo etiqueta="Fecha" name="fecha" type="date" defaultValue={hoy} max={hoy} required />
      </div>
      <Campo
        etiqueta="Comprobante (opcional)"
        name="comprobante"
        maxLength={200}
        placeholder="N° de operación o de recibo"
      />
      <p className="text-xs text-mute">
        Sin comisión. El efectivo entra a la caja en Efectivo y la transferencia en Banco.
      </p>
      <MensajeError error={error} />
      <button className="btn-volt w-full" disabled={enviando || !(n > 0)}>
        {enviando
          ? 'Registrando…'
          : `Registrar ${parcial ? 'pago parcial de' : 'pago de'} ${pesos(n > 0 ? n : 0)}`}
      </button>
    </form>
  );
}

function ListaPagos({ pagos, total, pagado }: { pagos: PagoDeInscripcion[]; total: number; pagado: number }) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const [anulando, setAnulando] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <p className="text-sm">
        Pagado <b className="num">{pesos(pagado)}</b> de <span className="num">{pesos(total)}</span>
      </p>
      <ul>
        {pagos.map((p) => (
          <li key={p.id} className="list-row text-sm">
            <span className="min-w-0 flex-1">
              <b className={`block ${p.estado === 'ANULADO' ? 'text-mute line-through' : ''}`}>
                {pesos(p.monto)} · {MEDIO[p.metodo] ?? p.metodo}
              </b>
              <span className="block text-xs text-mute">
                {fechaCorta(p.fecha)} · {p.concepto}
                {p.comprobante ? ` · ${p.comprobante}` : ''}
                {p.comision ? ` · comisión ${pesos(p.comision)}` : ''}
              </span>
            </span>
            {p.estado === 'ANULADO' ? (
              <span className="pill">Anulado</span>
            ) : p.metodo === 'MERCADO_PAGO' ? null : anulando === p.id ? (
              <span className="flex gap-1">
                <button
                  className="btn btn-sm !bg-red-600 !text-white"
                  disabled={enviando}
                  onClick={() =>
                    enviar(async () => {
                      await api('POST', `/pagos/${p.id}/anular`, { motivo: 'Mal cargado' });
                      setAnulando(null);
                      router.refresh();
                    })
                  }
                >
                  Sí, anular
                </button>
                <button className="btn-glass btn-sm" onClick={() => setAnulando(null)}>
                  No
                </button>
              </span>
            ) : (
              <button className="btn-glass btn-sm" onClick={() => setAnulando(p.id)}>
                Anular
              </button>
            )}
          </li>
        ))}
      </ul>
      <MensajeError error={error} />
      <p className="text-xs text-mute">
        Anular un pago mal cargado no lo borra: la caja registra un movimiento que lo revierte y el equipo
        vuelve a deber ese monto. Los pagos con Mercado Pago se devuelven desde Mercado Pago.
      </p>
    </div>
  );
}
