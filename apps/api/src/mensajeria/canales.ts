// Canales de mensajería (E16-01). Mismo patrón que la pasarela de pagos (ADR-007): una interfaz y una implementación
// simulada para desarrollar y mostrar la demo. Los canales reales (email, WhatsApp por BSP, Web Push) son otra implementación.
// Con un proveedor real, el despacho sale de la transacción y pasa a un worker que toma los mensajes PENDIENTES (E02-07).
import { randomUUID } from 'node:crypto';
import type { CanalMensaje } from '@potrero/shared';
import { config } from '../config.js';

export interface MensajeSaliente {
  canal: CanalMensaje;
  /** Email, teléfono o "push". */
  destino: string;
  asunto: string;
  cuerpo: string;
}

export interface ResultadoDespacho {
  proveedorId: string;
  /** El simulado confirma la entrega al instante; un proveedor real avisa después por webhook. */
  estado: 'ENVIADO' | 'ENTREGADO';
}

export interface CanalDespacho {
  despachar(m: MensajeSaliente): Promise<ResultadoDespacho>;
}

/** No sale nada a ningún lado: sirve para desarrollar, probar y la demo pública. */
export class CanalSimulado implements CanalDespacho {
  async despachar(m: MensajeSaliente): Promise<ResultadoDespacho> {
    return { proveedorId: `SIM-${m.canal}-${randomUUID()}`, estado: 'ENTREGADO' };
  }
}

export function crearCanales(): Record<CanalMensaje, CanalDespacho> {
  if (config.MENSAJERIA === 'real')
    throw new Error(
      'Los canales reales (email, WhatsApp por BSP y push) todavía no están integrados (backlog E16-02/03/04). Usá MENSAJERIA=simulada.',
    );
  const simulado = new CanalSimulado();
  return { EMAIL: simulado, WHATSAPP: simulado, PUSH: simulado };
}
