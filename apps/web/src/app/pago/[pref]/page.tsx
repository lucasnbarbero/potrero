'use client';
// Checkout simulado de Mercado Pago (solo en modo demo). Genera la misma notificación que la pasarela real
// y la API la procesa por el mismo camino que un webhook.
import { Icono, ProductoDeGregal } from '@potrero/ui';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MensajeError, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';
import { pesos } from '@/lib/formato';

interface Checkout {
  estado: string;
  concepto: string;
  /** Arancel que fijó la liga. */
  monto: number;
  /** Cargo por servicio (cero si lo absorbe la liga). */
  cargoServicio: number;
  total: number;
  equipo: string;
  organizacion: string;
  volverA: string;
}

export default function PagoSimulado() {
  const { pref } = useParams<{ pref: string }>();
  const [c, setC] = useState<Checkout | null>(null);
  const { enviando, error, enviar } = useEnvio();
  useEffect(() => {
    api<Checkout>('GET', `/pagos/simulado/${pref}`).then(setC, () => setC(null));
  }, [pref]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-4 rounded-2xl bg-amber-100 px-4 py-3 text-center text-xs font-semibold text-amber-900">
        Modo demo: este checkout simula Mercado Pago. No se cobra dinero real.
      </div>
      <div className="tile space-y-5 !p-7">
        {!c ? (
          <p className="text-sm text-mute">Cargando…</p>
        ) : (
          <>
            <div>
              <p className="eyebrow">{c.organizacion}</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight">{c.concepto}</h1>
              <p className="text-sm text-mute">Equipo: {c.equipo}</p>
            </div>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-mute">Arancel</dt>
                <dd className="num font-semibold">{pesos(c.monto)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-mute">Cargo por servicio</dt>
                <dd className="num font-semibold" data-testid="cargo-servicio">
                  {c.cargoServicio ? pesos(c.cargoServicio) : 'Sin cargo'}
                </dd>
              </div>
            </dl>
            <div>
              <p className="eyebrow">Total</p>
              <div className="num text-5xl font-bold tracking-tighter" data-testid="total">
                {pesos(c.total)}
              </div>
            </div>
            {c.estado === 'PENDIENTE' ? (
              <div className="space-y-2">
                <button
                  className="btn-volt btn-lg w-full"
                  disabled={enviando}
                  onClick={() =>
                    enviar(async () => {
                      await api('POST', `/pagos/simulado/${pref}/aprobar`);
                      setC({ ...c, estado: 'APROBADO' });
                    })
                  }
                >
                  <Icono nombre="check" />
                  Pagar (aprobar)
                </button>
                <button
                  className="btn-glass w-full"
                  disabled={enviando}
                  onClick={() =>
                    enviar(async () => {
                      await api('POST', `/pagos/simulado/${pref}/rechazar`);
                      setC({ ...c, estado: 'RECHAZADO' });
                    })
                  }
                >
                  Simular pago rechazado
                </button>
              </div>
            ) : (
              <div
                className={`rounded-2xl p-4 text-center font-semibold ${c.estado === 'APROBADO' ? 'bg-volt' : 'bg-red-100 text-red-800'}`}
              >
                {c.estado === 'APROBADO'
                  ? // Solo la inscripción se confirma con el pago; multas, levantamientos y cuotas solo se acreditan.
                    c.concepto.startsWith('Inscripción')
                    ? '¡Pago aprobado! Tu inscripción quedó confirmada.'
                    : '¡Listo! Pago acreditado.'
                  : 'El pago fue rechazado.'}
              </div>
            )}
            {c.estado === 'RECHAZADO' && (
              // Falla conocida 7: un rechazo no deja al equipo sin salida; pide un link nuevo para el mismo cargo.
              <button
                className="btn-volt btn-lg w-full"
                disabled={enviando}
                onClick={() =>
                  enviar(async () => {
                    const r = await api<{ urlPago: string }>('POST', `/pagos/simulado/${pref}/reintentar`);
                    window.location.assign(r.urlPago);
                  })
                }
              >
                Intentar de nuevo
              </button>
            )}
            <MensajeError error={error} />
            <a href={c.volverA} className="block text-center text-sm font-semibold underline">
              Volver al torneo
            </a>
          </>
        )}
      </div>
      <ProductoDeGregal className="mx-auto mt-8" />
    </main>
  );
}
