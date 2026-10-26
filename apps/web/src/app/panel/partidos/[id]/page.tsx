import { apiServidor } from '@/lib/api';
import { pesos } from '@/lib/formato';
import type { Acta, DeudaDelPartido } from '@/lib/tipos';
import { ActaDigital } from './ActaDigital';

export const metadata = { title: 'Acta digital' };

export default async function PaginaActa({ params }: PageProps<'/panel/partidos/[id]'>) {
  const { id } = await params;
  const [acta, deuda] = [
    await apiServidor<Acta>(`/partidos/${id}`),
    await apiServidor<DeudaDelPartido>(`/partidos/${id}/deuda`).catch(() => null),
  ];
  const deudores = deuda ? [deuda.local, deuda.visitante].filter((e) => e.monto > 0) : [];
  return (
    <>
      {deudores.length > 0 && (
        // Cuota por fecha (E06-20): alerta de deuda. Con el bloqueo encendido, el deudor con cuotas vencidas no está
        // habilitado; por ahora el acta avisa pero no impide cargarlo.
        <div className="mx-auto mb-4 max-w-3xl space-y-2" data-testid="deuda-acta">
          {deudores.map((e) => (
            <p
              key={e.equipoId}
              role="alert"
              className={`rounded-2xl px-4 py-3 text-sm font-medium ${e.habilitado ? 'bg-amber-50 text-amber-900' : 'bg-red-50 text-red-700'}`}
            >
              <b>{e.nombre}</b> debe {pesos(e.monto)} ({e.cargos.map((c) => c.concepto).join(', ')}).
              {!e.habilitado && ' No está habilitado para jugar hasta pagar las cuotas vencidas.'}
            </p>
          ))}
        </div>
      )}
      <ActaDigital inicial={acta} />
    </>
  );
}
