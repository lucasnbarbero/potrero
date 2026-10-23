// Envío de la cola del acta al servidor (E11-06). Traduce cada operación a su llamada y clasifica la respuesta:
// confirmada, sin conexión (se reintenta) o rechazada (se informa al delegado).
import type { OperacionActa, ResultadoEnvio } from '@potrero/shared';
import { api, ErrorCliente } from './cliente';
import type { Acta } from './tipos';

/**
 * Un 409 al iniciar o cerrar puede significar "ya estaba hecho" (un reintento, o el mismo dispositivo antes de perder
 * la señal) o "otro dispositivo tiene el acta". Se distingue mirando cómo quedó el partido en el servidor.
 */
async function yaEstabaHecho(partidoId: string, op: OperacionActa, dispositivo: string) {
  const acta = await api<Acta>('GET', `/partidos/${partidoId}`);
  const esMia = !acta.dueno || acta.dueno.dispositivoId === dispositivo;
  if (!esMia) return false;
  return op.tipo === 'iniciar' ? acta.estado !== 'PROGRAMADO' : acta.estado === 'FINALIZADO';
}

export async function enviarOperacion(
  partidoId: string,
  op: OperacionActa,
  dispositivoId: string,
): Promise<ResultadoEnvio> {
  try {
    switch (op.tipo) {
      case 'iniciar':
        await api('POST', `/partidos/${partidoId}/iniciar`, { dispositivoId });
        break;
      case 'evento':
        await api('POST', `/partidos/${partidoId}/eventos`, {
          ...op.evento,
          clientUuid: op.id,
          dispositivoId,
        });
        break;
      case 'anular':
        await api('POST', `/partidos/${partidoId}/eventos/${op.objetivoId}/anular`, {
          clientUuid: op.id,
          dispositivoId,
        });
        break;
      case 'cerrar':
        await api('POST', `/partidos/${partidoId}/cerrar`, { ...op.cierre, dispositivoId });
        break;
    }
    return { tipo: 'ok' };
  } catch (e) {
    // Sin respuesta del servidor (no hay conexión) o servidor caído: se conserva todo y se reintenta.
    if (!(e instanceof ErrorCliente) || (e.estado ?? 0) >= 500) return { tipo: 'sin-red' };
    if (e.estado === 409 && (op.tipo === 'iniciar' || op.tipo === 'cerrar')) {
      try {
        if (await yaEstabaHecho(partidoId, op, dispositivoId)) return { tipo: 'ok' };
      } catch {
        return { tipo: 'sin-red' };
      }
    }
    return { tipo: 'rechazada', motivo: e.message };
  }
}

/** ¿Es un error de conexión (el pedido ni llegó)? */
export const esErrorDeRed = (e: unknown) => !(e instanceof ErrorCliente) || (e.estado ?? 0) >= 500;
