// Panel del capitán (E19): convocatoria con confirmación (E19-02) y qué documentación falta y de quién (E19-04).
import { type EstadoVigencia, NOMBRE_DOCUMENTO, type TipoDocumento } from './documentacion.js';

export const RESPUESTAS_CONVOCATORIA = ['VA', 'NO_VA', 'PENDIENTE'] as const;
export type RespuestaConvocatoria = (typeof RESPUESTAS_CONVOCATORIA)[number];
export type EstadoConvocado = RespuestaConvocatoria | 'SUSPENDIDO';

export interface ConvocadoEntrada {
  jugadorId: string;
  /** Con una sanción activa: no puede jugar, se muestra aparte y no cuenta para confirmar. */
  suspendido: boolean;
  respuesta?: 'VA' | 'NO_VA' | null;
}

/**
 * Estado de la convocatoria a un partido. El suspendido queda como SUSPENDIDO aunque haya dicho que va; el que no
 * respondió, PENDIENTE. `convocables` es el plantel que puede jugar (sin suspendidos): contra eso se mide quién confirmó.
 */
export function resumenConvocatoria(plantel: readonly ConvocadoEntrada[]) {
  const jugadores = plantel.map((p) => ({
    jugadorId: p.jugadorId,
    estado: (p.suspendido ? 'SUSPENDIDO' : (p.respuesta ?? 'PENDIENTE')) as EstadoConvocado,
  }));
  const cuenta = (e: EstadoConvocado) => jugadores.filter((j) => j.estado === e).length;
  return {
    jugadores,
    va: cuenta('VA'),
    noVa: cuenta('NO_VA'),
    pendientes: cuenta('PENDIENTE'),
    suspendidos: cuenta('SUSPENDIDO'),
    convocables: jugadores.length - cuenta('SUSPENDIDO'),
  };
}

export interface FilaDocumentacionEquipo {
  nombre: string;
  menor: boolean;
  estados: Record<TipoDocumento, EstadoVigencia>;
}

const vigente = (e: EstadoVigencia) => e === 'VIGENTE' || e === 'POR_VENCER';

/**
 * Qué documentación le falta al equipo y de quién, por cada documento que exige el torneo. La autorización del tutor
 * solo cuenta para los menores. "Falta" incluye lo no cargado, lo rechazado, lo vencido y lo que todavía no se revisó
 * (pendiente): todo eso impide jugar. Ordena primero los documentos con más faltantes.
 */
export function faltantesDelEquipo(
  filas: readonly FilaDocumentacionEquipo[],
  requeridos: readonly TipoDocumento[],
) {
  return requeridos
    .map((tipo) => {
      const alcanzados = tipo === 'AUTORIZACION_MENOR' ? filas.filter((f) => f.menor) : filas;
      const faltan = alcanzados
        .filter((f) => !vigente(f.estados[tipo]))
        .map((f) => ({ nombre: f.nombre, estado: f.estados[tipo] }));
      return {
        tipo,
        nombre: NOMBRE_DOCUMENTO[tipo],
        total: alcanzados.length,
        completos: alcanzados.length - faltan.length,
        faltan,
      };
    })
    .filter((d) => d.total > 0)
    .sort((a, b) => b.faltan.length - a.faltan.length);
}

/** Texto para pedir los faltantes por WhatsApp (el capitán lo comparte en el grupo del equipo). */
export function textoPedidoDeFaltantes(equipo: string, faltantes: ReturnType<typeof faltantesDelEquipo>) {
  const lineas = faltantes
    .filter((d) => d.faltan.length)
    .map((d) => `• ${d.nombre}: ${d.faltan.map((f) => f.nombre).join(', ')}`);
  if (!lineas.length) return `${equipo}: tenemos toda la documentación al día. ¡Gracias!`;
  return `${equipo}: para poder jugar nos falta documentación.\n${lineas.join('\n')}\nMandámela así la cargo.`;
}

/**
 * Si el capitán puede dar de baja a un jugador del plantel (E19-01). No se puede si ya tiene goles o tarjetas en un
 * torneo que sigue en juego: el acta y las sanciones se apoyan en el plantel. Esa baja la hace el organizador.
 */
export function puedeDarDeBaja(e: {
  eventosEnTorneoEnCurso: number;
}): { ok: true } | { ok: false; motivo: string } {
  if (e.eventosEnTorneoEnCurso > 0)
    return {
      ok: false,
      motivo: 'Ya tiene goles o tarjetas en el torneo en curso: pedile la baja al organizador.',
    };
  return { ok: true };
}
