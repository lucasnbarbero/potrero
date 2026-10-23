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
