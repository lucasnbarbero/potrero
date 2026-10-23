// Libro de caja (E07): funciones sobre la base para crear asientos de partida doble. Sin inyección de dependencias a
// propósito: las usan el cobro, el cierre del acta y la propia caja sin ciclos entre módulos.
import { asientosDePago, type CategoriaIngreso, type Linea, validarAsiento } from '@potrero/shared';
import { ErrorNegocio } from '../comun/http.js';
import type { Tx } from '../db/db.service.js';
import type { Asiento } from '../generated/prisma/client.js';

export interface NuevoAsiento {
  descripcion: string;
  /** COBRO, COMISION, EGRESO, INGRESO, RETIRO o REVERSA. */
  tipo: string;
  lineas: Linea[];
  fecha?: Date;
  torneoId?: string | null;
  referenciaTipo?: string;
  referenciaId?: string;
  arbitroId?: string | null;
  canchaId?: string | null;
  comprobante?: string | null;
  /** Con clave, el asiento es idempotente: si ya existe, no se crea de nuevo y se devuelve null. */
  clave?: string;
  revierteAId?: string;
  creadoPorId?: string;
}

export async function crearAsiento(tx: Tx, organizacionId: string, a: NuevoAsiento): Promise<Asiento | null> {
  try {
    validarAsiento(a.lineas);
  } catch (e) {
    throw new ErrorNegocio((e as Error).message);
  }
  if (a.clave && (await tx.asiento.findFirst({ where: { clave: a.clave } }))) return null;
  return tx.asiento.create({
    data: {
      organizacionId,
      descripcion: a.descripcion,
      tipo: a.tipo,
      fecha: a.fecha ?? new Date(),
      torneoId: a.torneoId ?? null,
      referenciaTipo: a.referenciaTipo ?? null,
      referenciaId: a.referenciaId ?? null,
      arbitroId: a.arbitroId ?? null,
      canchaId: a.canchaId ?? null,
      comprobante: a.comprobante ?? null,
      clave: a.clave ?? null,
      revierteAId: a.revierteAId ?? null,
      creadoPorId: a.creadoPorId ?? null,
      lineas: { create: a.lineas.map((l) => ({ organizacionId, ...l })) },
    },
  });
}

/**
 * Asienta un pago aprobado: la plata entra por el medio con el que se pagó y, si cobró Mercado Pago, sale la comisión de
 * la plataforma. Idempotente por pago, así que se puede llamar al aprobarlo y de nuevo al conciliar.
 */
export async function registrarPago(tx: Tx, organizacionId: string, pagoId: string) {
  const pago = await tx.pago.findUniqueOrThrow({
    where: { id: pagoId },
    include: { cargo: { include: { inscripcion: { include: { equipo: true } } } } },
  });
  if (pago.estado !== 'APROBADO') return;
  const { cobro, comision } = asientosDePago({
    metodo: pago.metodo,
    monto: pago.monto,
    comision: pago.comisionPlataforma,
    categoria: (pago.cargo.categoria as CategoriaIngreso) ?? 'INSCRIPCIONES',
  });
  const comun = {
    fecha: pago.acreditadoEn ?? pago.creadoEn,
    torneoId: pago.cargo.inscripcion.torneoId,
    referenciaTipo: 'PAGO',
    referenciaId: pago.id,
  };
  await crearAsiento(tx, organizacionId, {
    ...comun,
    tipo: 'COBRO',
    descripcion: `${pago.cargo.concepto} · ${pago.cargo.inscripcion.equipo.nombre}`,
    lineas: cobro,
    clave: `pago:${pago.id}`,
    comprobante: pago.comprobante,
  });
  if (comision)
    await crearAsiento(tx, organizacionId, {
      ...comun,
      tipo: 'COMISION',
      descripcion: `Comisión de Potrero · ${pago.cargo.inscripcion.equipo.nombre}`,
      lineas: comision,
      clave: `comision:${pago.id}`,
    });
}

/** Asienta los pagos aprobados que todavía no tienen asiento (por ejemplo, los anteriores a la caja). Devuelve cuántos. */
export async function conciliarPagos(tx: Tx, organizacionId: string): Promise<number> {
  const asentados = new Set(
    (await tx.asiento.findMany({ where: { clave: { startsWith: 'pago:' } }, select: { clave: true } })).map(
      (a) => a.clave,
    ),
  );
  const pagos = await tx.pago.findMany({ where: { estado: 'APROBADO' }, select: { id: true } });
  const faltan = pagos.filter((p) => !asentados.has(`pago:${p.id}`));
  for (const p of faltan) await registrarPago(tx, organizacionId, p.id);
  return faltan.length;
}
