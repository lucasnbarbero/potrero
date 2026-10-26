// Pagos manuales (efectivo o transferencia) que registra el organizador, completos o parciales, y edición y estado del
// torneo. Reglas puras: el servicio de la API solo guarda lo que deciden estas funciones.

export interface CargoParaImputar {
  id: string;
  concepto: string;
  monto: number;
  /** PENDIENTE, PAGADO o ANULADO. */
  estado: string;
  /** Lo que ya cubren los pagos aprobados. */
  pagado: number;
}

/** Lo que falta pagar de un cargo. Un cargo anulado o pagado no debe nada. */
export function saldoDelCargo(c: Pick<CargoParaImputar, 'monto' | 'estado' | 'pagado'>): number {
  if (c.estado !== 'PENDIENTE') return 0;
  return Math.max(0, c.monto - c.pagado);
}

/** Lo que debe un equipo: la suma de los saldos de sus cargos. */
export function saldoDeCargos(
  cargos: readonly Pick<CargoParaImputar, 'monto' | 'estado' | 'pagado'>[],
): number {
  return cargos.reduce((s, c) => s + saldoDelCargo(c), 0);
}

export interface Imputacion {
  cargoId: string;
  monto: number;
  /** El pago cubre lo que faltaba: el cargo queda PAGADO. */
  cancela: boolean;
}

/**
 * Reparte un pago entre los cargos de un equipo. Con `cargoId`, todo va a ese cargo. Sin él, cubre los cargos pendientes
 * en el orden recibido (por vencimiento): primero cancela el más viejo y lo que sobra pasa al siguiente. Un monto menor
 * al saldo es un pago parcial; mayor al saldo se rechaza (no se guarda plata a cuenta).
 */
export function imputarPago(
  cargos: readonly CargoParaImputar[],
  monto: number,
  cargoId?: string | null,
): Imputacion[] {
  if (!Number.isInteger(monto) || monto <= 0)
    throw new Error('El monto tiene que ser un entero positivo en pesos.');
  const candidatos = cargoId ? cargos.filter((c) => c.id === cargoId) : cargos;
  if (cargoId && candidatos.length === 0) throw new Error('Ese cargo no es de este equipo.');
  const pendientes = candidatos.filter((c) => saldoDelCargo(c) > 0);
  const saldo = saldoDeCargos(pendientes);
  if (saldo === 0)
    throw new Error(cargoId ? 'Ese cargo ya está pagado.' : 'El equipo no tiene cargos pendientes.');
  if (monto > saldo)
    throw new Error(
      `El monto supera lo que se debe ($ ${saldo.toLocaleString('es-AR')}). Registrá como máximo el saldo.`,
    );
  const r: Imputacion[] = [];
  let resta = monto;
  for (const c of pendientes) {
    if (resta === 0) break;
    const falta = saldoDelCargo(c);
    const va = Math.min(falta, resta);
    r.push({ cargoId: c.id, monto: va, cancela: va === falta });
    resta -= va;
  }
  return r;
}

/** La fecha de un pago manual no puede ser futura ni de hace más de un año (un error de tipeo en el año). */
export function validarFechaDePago(fecha: string, hoy: string): string | null {
  if (fecha > hoy) return 'La fecha del pago no puede ser futura.';
  const haceUnAnio = `${Number(hoy.slice(0, 4)) - 1}${hoy.slice(4)}`;
  if (fecha < haceUnAnio) return 'La fecha del pago es de hace más de un año: revisala.';
  return null;
}

/** Solo se anula un pago manual aprobado; los de Mercado Pago se devuelven desde Mercado Pago (reembolso). */
export function motivoParaNoAnular(p: { metodo: string; estado: string }): string | null {
  if (p.metodo === 'MERCADO_PAGO')
    return 'Los pagos con Mercado Pago no se anulan acá: se devuelven con un reembolso desde Mercado Pago.';
  if (p.estado === 'ANULADO') return 'Este pago ya está anulado.';
  if (p.estado !== 'APROBADO') return 'Solo se anula un pago registrado.';
  return null;
}

// ───────────── Edición del torneo ─────────────

export interface CargoDeInscripcion {
  id: string;
  estado: string;
  categoria: string;
  fecha: number | null;
  /** Pagos aprobados o en curso (un link de pago ya generado cuenta: se cobraría con el monto viejo). */
  pagos: number;
}

/**
 * Cambiar el monto de inscripción solo toca los cargos de inscripción pendientes y sin pagos: los que ya tienen un pago
 * (aunque sea parcial) conservan el monto con el que se cobraron. Con monto 0, esos cargos se anulan.
 */
export function cambiosPorMontoDeInscripcion(
  cargos: readonly CargoDeInscripcion[],
  nuevoMonto: number,
): { actualizar: string[]; anular: string[]; conservan: number } {
  const deInscripcion = cargos.filter(
    (c) => c.categoria === 'INSCRIPCIONES' && c.fecha === null && c.estado === 'PENDIENTE',
  );
  const libres = deInscripcion.filter((c) => c.pagos === 0).map((c) => c.id);
  return {
    actualizar: nuevoMonto > 0 ? libres : [],
    anular: nuevoMonto > 0 ? [] : libres,
    conservan: deInscripcion.length - libres.length,
  };
}

/** El cupo no puede quedar por debajo de los equipos ya inscriptos. */
export function validarCupo(cupo: number, inscriptos: number): string | null {
  return cupo < inscriptos ? `Ya hay ${inscriptos} equipos inscriptos: el cupo no puede ser menor.` : null;
}

// ───────────── Estado del torneo ─────────────

export type EstadoDeTorneo = 'BORRADOR' | 'INSCRIPCION' | 'EN_CURSO' | 'FINALIZADO';

export interface PartidosParaEstado {
  /** Partidos creados (fixture o llave). */
  total: number;
  /** Programados, en juego o suspendidos: los que faltan jugar. */
  sinJugar: number;
}

export interface Transicion {
  ok: boolean;
  motivo?: string;
  /** Para finalizar con partidos sin jugar hay que confirmarlo. */
  requiereConfirmacion?: boolean;
  aviso?: string;
}

/**
 * Transiciones válidas a mano:
 * - BORRADOR → INSCRIPCION (abrir).
 * - INSCRIPCION → EN_CURSO (cerrar inscripción; el fixture después lo deja igual).
 * - EN_CURSO → INSCRIPCION (reabrir), solo si todavía no hay fixture ni llave.
 * - INSCRIPCION o EN_CURSO → FINALIZADO; con partidos sin jugar, pide confirmación.
 * - FINALIZADO → EN_CURSO (reabrir un torneo finalizado por error).
 */
export function transicionDeTorneo(
  desde: EstadoDeTorneo,
  hacia: EstadoDeTorneo,
  partidos: PartidosParaEstado,
): Transicion {
  if (desde === hacia) return { ok: false, motivo: 'El torneo ya está en ese estado.' };
  if (hacia === 'BORRADOR') return { ok: false, motivo: 'Un torneo no vuelve a borrador.' };
  if (hacia === 'INSCRIPCION') {
    if (desde === 'FINALIZADO')
      return { ok: false, motivo: 'Un torneo finalizado no vuelve a abrir la inscripción.' };
    if (partidos.total > 0)
      return {
        ok: false,
        motivo: 'El torneo ya tiene fixture: no se puede reabrir la inscripción.',
      };
    return { ok: true };
  }
  if (hacia === 'EN_CURSO') {
    if (desde === 'BORRADOR') return { ok: false, motivo: 'Primero abrí la inscripción.' };
    return { ok: true };
  }
  // FINALIZADO
  if (desde === 'BORRADOR') return { ok: false, motivo: 'Un torneo en borrador no se puede finalizar.' };
  if (partidos.sinJugar > 0) {
    const n = partidos.sinJugar;
    return {
      ok: true,
      requiereConfirmacion: true,
      aviso: `${n > 1 ? `Quedan ${n} partidos` : 'Queda 1 partido'} sin jugar. Si finalizás, la tabla queda como está.`,
    };
  }
  return { ok: true };
}
