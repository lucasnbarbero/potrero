import { PASOS_CONFIGURACION, type PasoConfiguracion } from '@potrero/shared';
import { apiServidor } from '@/lib/api';
import type { EstadoConfiguracion } from '@/lib/tipos';
import { Asistente } from './Asistente';

export const metadata = { title: 'Configuración inicial' };

export default async function Configuracion({ searchParams }: PageProps<'/panel/configuracion'>) {
  const { paso } = await searchParams;
  const estado = await apiServidor<EstadoConfiguracion>('/configuracion');
  const pedido = PASOS_CONFIGURACION.find((p) => p === paso) as PasoConfiguracion | undefined;
  return (
    <div className="space-y-6">
      <div className="rise">
        <p className="eyebrow">Configuración inicial</p>
        <h1 className="mt-1 text-4xl font-bold tracking-tight sm:text-5xl">
          Tu liga lista en menos de 30 minutos.
        </h1>
      </div>
      <Asistente estado={estado} inicial={pedido ?? estado.progreso.siguiente} />
    </div>
  );
}
