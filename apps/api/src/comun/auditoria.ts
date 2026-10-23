import type { Contexto } from './http.js';
import type { Tx } from '../db/db.service.js';

/** Registra una acción sensible (cambios de dinero, resultados, cierres de acta). Es inmutable. */
export function auditar(
  tx: Tx,
  c: Pick<Contexto, 'organizacionId'> & { usuarioId?: string | null },
  accion: string,
  entidad: string,
  entidadId: string,
  cambios: { antes?: unknown; despues?: unknown } = {},
) {
  return tx.auditoria.create({
    data: {
      organizacionId: c.organizacionId,
      usuarioId: c.usuarioId ?? null,
      accion,
      entidad,
      entidadId,
      antes: (cambios.antes ?? undefined) as never,
      despues: (cambios.despues ?? undefined) as never,
    },
  });
}
