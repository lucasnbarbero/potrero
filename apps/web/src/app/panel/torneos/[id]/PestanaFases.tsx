// Pestaña "Fases" de un torneo por fases (ADR-026): una sub-pestaña por fase y el botón para generar la que sigue.
import { DetalleDeFase, PestanasDeFases } from '@/componentes/FasesDelTorneo';
import { apiServidor } from '@/lib/api';
import type { Sede } from '@/lib/tipos';
import type { VistaFases } from '@/lib/tipos-fases';
import { GenerarFase } from './GenerarFase';

/** El sábado siguiente al último partido programado (o el próximo sábado), para sugerir el arranque de la fase. */
function sabadoSugerido(fechas: (string | null)[]) {
  const ultimo = fechas
    .filter((x): x is string => !!x)
    .sort()
    .at(-1);
  const d = ultimo ? new Date(ultimo) : new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function PestanaFases({ torneoId, fase }: { torneoId: string; fase: string | null }) {
  const [v, sedes] = [
    await apiServidor<VistaFases>(`/torneos/${torneoId}/fases`),
    await apiServidor<Sede[]>('/canchas'),
  ];
  if (v.fases.length === 0) return null;
  // Por defecto, la primera fase que se puede generar o la última en juego.
  const elegida =
    v.fases.find((f) => f.clave === fase) ??
    v.fases.find((f) => f.puedeGenerar) ??
    [...v.fases].reverse().find((f) => f.estado !== 'PENDIENTE') ??
    v.fases[0]!;
  const sugerido = sabadoSugerido(v.fases.flatMap((f) => f.partidos.map((p) => p.inicio)));
  return (
    <div className="space-y-4">
      <PestanasDeFases fases={v.fases} actual={elegida.clave} href={(c) => `?tab=fases&fase=${c}`} />
      {elegida.estado === 'PENDIENTE' && (
        <div className={elegida.puedeGenerar ? 'tile-volt space-y-3' : 'tile space-y-1'}>
          <b className="text-lg">
            {elegida.puedeGenerar
              ? `Generar ${elegida.nombre}`
              : `${elegida.nombre} todavía no se puede armar`}
          </b>
          <p className="text-sm text-ink/70">
            {elegida.puedeGenerar
              ? `Ya están los ${elegida.equipos} equipos: ${elegida.entradas.join(' + ').toLowerCase()}.`
              : elegida.motivo}
          </p>
          {elegida.puedeGenerar && (
            <GenerarFase torneoId={torneoId} fase={elegida} sedes={sedes} primerDiaSugerido={sugerido} />
          )}
        </div>
      )}
      <DetalleDeFase fase={elegida} enlazarActa hrefPartido={(id) => `/panel/partidos/${id}`} />
    </div>
  );
}
