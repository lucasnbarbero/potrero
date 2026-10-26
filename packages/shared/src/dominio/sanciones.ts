import { eventosVigentes } from './acta.js';
import type { CausaSancion, EventoPartido, Reglamento } from './tipos.js';

export interface SancionNueva {
  jugadorId: string;
  equipoId: string;
  causa: CausaSancion;
  partidos: number;
}

/**
 * Sanciones que genera un partido al cerrarse.
 * - Roja directa: `suspensionRojaDirecta` partidos.
 * - Doble amarilla (dos amarillas en el partido, con o sin la roja cargada): `suspensionDobleAmarilla`.
 *   Esas amarillas no suman a la acumulación.
 * - Acumulación: cada vez que el total de amarillas del torneo alcanza un múltiplo de `umbralAmarillas`.
 * @param amarillasPrevias amarillas acumuladas por jugador antes de este partido (sin contar dobles amarillas).
 */
export function sancionesDelPartido(
  eventos: readonly EventoPartido[],
  amarillasPrevias: ReadonlyMap<string, number>,
  r: Reglamento,
): SancionNueva[] {
  const porJugador = new Map<string, { equipoId: string; amarillas: number; rojas: number }>();
  for (const e of eventosVigentes(eventos)) {
    if ((e.tipo !== 'AMARILLA' && e.tipo !== 'ROJA') || !e.jugadorId) continue;
    const j = porJugador.get(e.jugadorId) ?? { equipoId: e.equipoId, amarillas: 0, rojas: 0 };
    if (e.tipo === 'AMARILLA') j.amarillas++;
    else j.rojas++;
    porJugador.set(e.jugadorId, j);
  }
  const sanciones: SancionNueva[] = [];
  for (const [jugadorId, j] of porJugador) {
    if (j.amarillas >= 2) {
      sanciones.push({
        jugadorId,
        equipoId: j.equipoId,
        causa: 'DOBLE_AMARILLA',
        partidos: r.suspensionDobleAmarilla,
      });
    } else if (j.rojas > 0) {
      sanciones.push({
        jugadorId,
        equipoId: j.equipoId,
        causa: 'ROJA_DIRECTA',
        partidos: r.suspensionRojaDirecta,
      });
    }
    if (j.amarillas === 1 && r.umbralAmarillas > 0) {
      const antes = amarillasPrevias.get(jugadorId) ?? 0;
      if (Math.floor((antes + 1) / r.umbralAmarillas) > Math.floor(antes / r.umbralAmarillas))
        sanciones.push({
          jugadorId,
          equipoId: j.equipoId,
          causa: 'ACUMULACION',
          partidos: r.suspensionAcumulacion,
        });
    }
  }
  return sanciones;
}

/** Amarillas que cuentan para la acumulación en un partido (una sola amarilla; la doble amarilla no suma). */
export function amarillasQueAcumulan(eventos: readonly EventoPartido[]): Map<string, number> {
  const conteo = new Map<string, number>();
  for (const e of eventosVigentes(eventos))
    if (e.tipo === 'AMARILLA' && e.jugadorId) conteo.set(e.jugadorId, (conteo.get(e.jugadorId) ?? 0) + 1);
  for (const [id, n] of conteo) conteo.set(id, n === 1 ? 1 : 0);
  return conteo;
}

/**
 * Estado de cumplimiento. La suspensión se cuenta en partidos oficiales del equipo jugados después
 * del partido que la originó; un partido suspendido o un W.O. no descuenta.
 */
export function estadoSancion(partidos: number, partidosOficialesJugadosDespues: number) {
  const cumplidos = Math.min(partidos, partidosOficialesJugadosDespues);
  return { cumplidos, restantes: partidos - cumplidos, activa: cumplidos < partidos };
}

// ───────────── Levantar una suspensión pagando (E14-08) ─────────────

/** Tipos de sanción que el reglamento puede dejar levantar pagando. La roja directa y las del tribunal, nunca. */
export const CAUSAS_LEVANTABLES = [
  'ACUMULACION',
  'DOBLE_AMARILLA',
] as const satisfies readonly CausaSancion[];

/**
 * Cumplimiento de una sanción con partidos levantados pagando. Cada pago acreditado levanta un partido: el primer partido
 * oficial del equipo que se juega después de la acreditación, mientras la sanción siga activa. Ese partido no cuenta como
 * cumplido. Un pago acreditado que todavía no se usó levanta el próximo partido (el jugador ya figura habilitado).
 * @param jugados momento de cada partido oficial del equipo jugado después del de origen (null si no se sabe: se toma
 *   como anterior a cualquier pago).
 * @param acreditados momento en que se acreditó cada pago para levantar un partido.
 */
export function cumplimientoSancion(
  partidos: number,
  jugados: readonly (Date | null)[],
  acreditados: readonly Date[] = [],
) {
  const t = (d: Date | null) => d?.getTime() ?? Number.NEGATIVE_INFINITY;
  const orden = [...jugados].sort((a, b) => t(a) - t(b));
  const pagos = [...acreditados].sort((a, b) => a.getTime() - b.getTime());
  let cumplidos = 0;
  let levantados = 0;
  let usados = 0;
  for (const j of orden) {
    if (cumplidos + levantados >= partidos) break;
    if (usados < pagos.length && pagos[usados]!.getTime() < t(j)) {
      usados++;
      levantados++;
    } else cumplidos++;
  }
  // Los pagos acreditados que sobran levantan los partidos que vienen (sin pasarse de lo que falta).
  levantados += Math.min(pagos.length - usados, partidos - cumplidos - levantados);
  const restantes = partidos - cumplidos - levantados;
  return { cumplidos, levantados, restantes, activa: restantes > 0 };
}

export type MotivoSinLevantar =
  'APAGADO' | 'SIN_MONTO' | 'TIPO_NO_PERMITIDO' | 'TRIBUNAL' | 'CUMPLIDA' | 'PAGOS_PENDIENTES';

const MENSAJE_SIN_LEVANTAR: Record<MotivoSinLevantar, string> = {
  APAGADO: 'El reglamento de este torneo no permite levantar suspensiones pagando.',
  SIN_MONTO: 'Falta definir en el reglamento el monto por partido para levantar una suspensión.',
  TIPO_NO_PERMITIDO: 'El reglamento no permite levantar pagando este tipo de sanción.',
  TRIBUNAL: 'La sanción la revisó el tribunal: no se puede levantar pagando.',
  CUMPLIDA: 'La suspensión ya está cumplida.',
  PAGOS_PENDIENTES: 'Ya hay pagos pendientes que cubren los partidos que le faltan.',
};

/**
 * Si una sanción se puede levantar pagando un partido más. Nunca una roja directa ni una sanción creada o modificada por
 * el tribunal en un expediente, aunque el reglamento la incluya.
 * @param restantes partidos que le faltan (ya descontados los levantados con pago acreditado).
 * @param pendientes pedidos de levantar con el cargo todavía sin pagar (no anulados).
 */
export function levantarSancion(
  s: { causa: string; revisadaPorTribunal: boolean; restantes: number; pendientes: number },
  r: Reglamento,
): { ok: true; monto: number } | { ok: false; motivo: MotivoSinLevantar; mensaje: string } {
  const no = (motivo: MotivoSinLevantar) => ({
    ok: false as const,
    motivo,
    mensaje: MENSAJE_SIN_LEVANTAR[motivo],
  });
  if (!r.levantarSancionPagando) return no('APAGADO');
  if (!(r.levantarSancionMonto > 0)) return no('SIN_MONTO');
  const levantable =
    (CAUSAS_LEVANTABLES as readonly string[]).includes(s.causa) &&
    (r.levantarSancionTipos as readonly string[]).includes(s.causa);
  if (!levantable) return no('TIPO_NO_PERMITIDO');
  if (s.revisadaPorTribunal) return no('TRIBUNAL');
  if (s.restantes <= 0) return no('CUMPLIDA');
  if (s.pendientes >= s.restantes) return no('PAGOS_PENDIENTES');
  return { ok: true, monto: r.levantarSancionMonto };
}
