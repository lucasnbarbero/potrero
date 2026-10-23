import { enlaceCrearLiga } from '@/lib/entornos';
import { BotonReiniciarDemo } from './BotonReiniciarDemo';

/** Aviso fijo del entorno de demo pública (ADR-019). Solo se muestra con NEXT_PUBLIC_DEMO_MODE=true. */
export const MODO_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

export function BannerDemo() {
  if (!MODO_DEMO) return null;
  return (
    <div
      role="status"
      className="fixed bottom-3 left-1/2 z-[60] flex w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 lg:left-auto lg:right-4 lg:translate-x-0 flex-wrap items-center justify-center gap-x-4 gap-y-1.5 rounded-3xl bg-volt px-5 py-2.5 text-center text-sm font-medium text-ink shadow-xl"
    >
      <span>Estás en la demo de Potrero: los pagos son de prueba y los datos se borran solos.</span>
      <span className="flex items-center gap-3">
        <BotonReiniciarDemo />
        <a href={enlaceCrearLiga} className="font-bold underline">
          Crear mi liga de verdad →
        </a>
      </span>
    </div>
  );
}
