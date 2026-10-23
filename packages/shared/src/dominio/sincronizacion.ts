// Acta sin conexión (E11-06). El dispositivo guarda lo que el delegado carga en una cola y la envía en orden cuando
// vuelve la señal. El servidor ya es idempotente por `clientUuid` (ADR-004), así que reenviar nunca duplica.
// Todo acá es lógica pura: el almacenamiento (IndexedDB) y la red viven en la web.
import { marcador } from './acta.js';
import type { EventoPartido, TipoEvento } from './tipos.js';

export type TipoEventoCargable = Exclude<TipoEvento, 'ANULACION'>;

/** Una acción del delegado, tal como se guarda en el dispositivo hasta que el servidor la confirma. */
export type OperacionActa =
  | { tipo: 'iniciar'; id: string; creadoEn: number }
  | {
      tipo: 'evento';
      /** Es el `clientUuid` del evento: con él el servidor reconoce un reenvío. */
      id: string;
      creadoEn: number;
      evento: { tipo: TipoEventoCargable; equipoId: string; jugadorId?: string; minuto?: number };
    }
  | {
      tipo: 'anular';
      /** `clientUuid` de la anulación. */
      id: string;
      creadoEn: number;
      /** Id del evento a anular, o su `clientUuid` si todavía no llegó al servidor. */
      objetivoId: string;
    }
  | {
      tipo: 'cerrar';
      id: string;
      creadoEn: number;
      cierre: {
        firmaLocal: boolean;
        firmaVisitante: boolean;
        justificacion?: string;
        penalesLocal?: number;
        penalesVisitante?: number;
      };
    };

export interface EventoVista {
  id: string;
  tipo: TipoEvento;
  equipoId: string;
  jugadorId: string | null;
  minuto: number | null;
  /** Para reconocer un evento propio que el servidor ya confirmó. */
  clientUuid?: string;
  /** Todavía no llegó al servidor. */
  pendiente?: boolean;
}

export interface ActaBase {
  estado: string;
  local: { id: string };
  visitante: { id: string };
  eventos: EventoVista[];
}

/**
 * El acta como la ve el delegado: lo último que confirmó el servidor más lo que cargó y todavía no se envió.
 * El marcador sale de esa vista, así el partido sigue vivo aunque no haya señal.
 */
export function vistaLocal<T extends ActaBase>(
  base: T,
  operaciones: readonly OperacionActa[],
): T & { marcador: { local: number; visitante: number }; pendientes: number } {
  let estado = base.estado;
  let eventos: EventoVista[] = [...base.eventos];
  const yaEnServidor = new Set(base.eventos.flatMap((e) => (e.clientUuid ? [e.clientUuid] : [])));
  let pendientes = 0;
  for (const op of operaciones) {
    pendientes++;
    if (op.tipo === 'iniciar') {
      if (estado === 'PROGRAMADO') estado = 'EN_JUEGO';
    } else if (op.tipo === 'evento') {
      if (yaEnServidor.has(op.id)) {
        pendientes--; // el servidor ya lo tiene: queda solo por limpiar de la cola
        continue;
      }
      eventos.push({
        id: op.id,
        clientUuid: op.id,
        tipo: op.evento.tipo,
        equipoId: op.evento.equipoId,
        jugadorId: op.evento.jugadorId ?? null,
        minuto: op.evento.minuto ?? null,
        pendiente: true,
      });
    } else if (op.tipo === 'anular') {
      eventos = eventos.filter((e) => e.id !== op.objetivoId && e.clientUuid !== op.objetivoId);
    } else if (op.tipo === 'cerrar') {
      if (estado === 'EN_JUEGO') estado = 'FINALIZADO';
    }
  }
  const eventosParaMarcador: EventoPartido[] = eventos.map((e) => ({
    id: e.id,
    tipo: e.tipo,
    equipoId: e.equipoId,
    jugadorId: e.jugadorId,
    minuto: e.minuto,
  }));
  return {
    ...base,
    estado,
    eventos,
    marcador: marcador(eventosParaMarcador, base.local.id, base.visitante.id),
    pendientes,
  };
}

export type ResultadoEnvio =
  | { tipo: 'ok' }
  /** No hay conexión o el servidor no respondió: se reintenta más tarde y se conserva el orden. */
  | { tipo: 'sin-red' }
  /** El servidor respondió que no: reintentar no sirve. Se informa al delegado. */
  | { tipo: 'rechazada'; motivo: string };

export interface ResumenSincronizacion {
  enviadas: OperacionActa[];
  rechazadas: { operacion: OperacionActa; motivo: string }[];
  pendientes: OperacionActa[];
}

/**
 * Envía la cola en orden. Si se cae la conexión, corta ahí y deja el resto pendiente (el orden importa: no se puede
 * cargar un gol antes de iniciar el partido). Una operación rechazada no frena a las demás.
 */
export async function procesarCola(
  cola: readonly OperacionActa[],
  enviar: (operacion: OperacionActa) => Promise<ResultadoEnvio>,
): Promise<ResumenSincronizacion> {
  const resumen: ResumenSincronizacion = { enviadas: [], rechazadas: [], pendientes: [] };
  let cortada = false;
  for (const operacion of cola) {
    if (cortada) {
      resumen.pendientes.push(operacion);
      continue;
    }
    const r = await enviar(operacion);
    if (r.tipo === 'ok') resumen.enviadas.push(operacion);
    else if (r.tipo === 'rechazada') resumen.rechazadas.push({ operacion, motivo: r.motivo });
    else {
      cortada = true;
      resumen.pendientes.push(operacion);
    }
  }
  return resumen;
}
