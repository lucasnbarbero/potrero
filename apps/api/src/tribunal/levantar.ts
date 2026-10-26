// Levantar una suspensión pagando una multa (E14-08). Cada pedido es un cargo al equipo en el rubro MULTAS y levanta un
// partido recién cuando ese cargo queda PAGADO: se lee del cargo, así el flujo de cobros no cambia. Si el cargo o el
// pedido se anulan, no levanta nada. Las reglas puras están en @potrero/shared (cumplimientoSancion, levantarSancion).
import { cumplimientoSancion } from '@potrero/shared';
import type { Tx } from '../db/db.service.js';

/** Lo mínimo de un partido para contar el cumplimiento de una sanción. */
export interface PartidoParaSancion {
  id: string;
  fecha: number;
  estado: string;
  localId: string;
  visitanteId: string;
  inicio: Date | null;
  cerradoEn: Date | null;
}

export const SELECT_PARTIDO_SANCION = {
  id: true,
  fecha: true,
  estado: true,
  localId: true,
  visitanteId: true,
  inicio: true,
  cerradoEn: true,
} as const;

/**
 * Momento en que se acreditó cada pedido de levantar ya pagado, por sanción. El momento es el del último pago aprobado
 * del cargo (el que lo terminó de cubrir).
 */
export async function acreditadosPorSancion(tx: Tx, torneoId: string) {
  const pedidos = await tx.levantamientoSancion.findMany({
    where: { anuladoEn: null, sancion: { torneoId } },
  });
  const cargos = pedidos.length
    ? await tx.cargo.findMany({
        where: { id: { in: pedidos.map((p) => p.cargoId) }, estado: 'PAGADO' },
        include: { pagos: { where: { estado: 'APROBADO' } } },
      })
    : [];
  const acreditado = new Map(
    cargos.map((c) => [
      c.id,
      new Date(
        Math.max(...c.pagos.map((p) => (p.acreditadoEn ?? p.creadoEn).getTime()), c.creadoEn.getTime()),
      ),
    ]),
  );
  const porSancion = new Map<string, Date[]>();
  for (const p of pedidos) {
    const en = acreditado.get(p.cargoId);
    if (en) porSancion.set(p.sancionId, [...(porSancion.get(p.sancionId) ?? []), en]);
  }
  return porSancion;
}

/**
 * Cumplimiento de una sanción: partidos oficiales del equipo jugados después del de origen (W.O. y suspendidos no
 * descuentan) y partidos levantados pagando.
 * @param antesDeFecha si se indica, solo cuentan los partidos de fechas anteriores (el acta de esa fecha).
 * @param acreditadosHasta si se indica, solo cuentan los pagos acreditados antes (un acta ya cerrada).
 */
export function cumplimiento(
  s: { id: string; partidos: number; equipoId: string; partidoOrigenId: string },
  partidos: readonly PartidoParaSancion[],
  acreditados: ReadonlyMap<string, Date[]>,
  opciones: { antesDeFecha?: number; acreditadosHasta?: Date | null } = {},
) {
  const origen = partidos.find((p) => p.id === s.partidoOrigenId)?.fecha ?? 0;
  const jugados = partidos
    .filter(
      (p) =>
        p.estado === 'FINALIZADO' &&
        p.fecha > origen &&
        (opciones.antesDeFecha === undefined || p.fecha < opciones.antesDeFecha) &&
        (p.localId === s.equipoId || p.visitanteId === s.equipoId),
    )
    .map((p) => p.cerradoEn ?? p.inicio);
  const hasta = opciones.acreditadosHasta;
  const pagos = (acreditados.get(s.id) ?? []).filter((d) => !hasta || d < hasta);
  return cumplimientoSancion(s.partidos, jugados, pagos);
}
