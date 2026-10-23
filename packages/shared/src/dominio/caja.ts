// Caja del torneo (E07): libro de partida doble. Cada movimiento de plata es un asiento con líneas de debe y haber que
// suman lo mismo; los asientos no se editan, se corrigen con otro asiento que los revierte (como el acta, ADR-004).
// Convención de saldo: debe − haber. Los activos (MP, efectivo, banco) dan saldo positivo; los ingresos, negativo.
import type { MetodoPago } from './tipos.js';

export const RUBROS_EGRESO = ['CANCHAS', 'ARBITROS', 'PREMIOS', 'OTROS'] as const;
export type RubroEgreso = (typeof RUBROS_EGRESO)[number];

export const CATEGORIAS_INGRESO = ['INSCRIPCIONES', 'MULTAS', 'SPONSORS', 'OTROS'] as const;
export type CategoriaIngreso = (typeof CATEGORIAS_INGRESO)[number];

/** Dónde está la plata: Mercado Pago, efectivo en mano o cuenta bancaria. */
export const CUENTAS_DE_PLATA = ['MP', 'EFECTIVO', 'BANCO'] as const;
export type CuentaDePlata = (typeof CUENTAS_DE_PLATA)[number];

export const COMISION = 'COMISION_PLATAFORMA';

export const NOMBRE_RUBRO: Record<RubroEgreso, string> = {
  CANCHAS: 'Canchas',
  ARBITROS: 'Árbitros',
  PREMIOS: 'Premios y trofeos',
  OTROS: 'Otros',
};

export const NOMBRE_CATEGORIA: Record<CategoriaIngreso, string> = {
  INSCRIPCIONES: 'Inscripciones',
  MULTAS: 'Multas',
  SPONSORS: 'Sponsors',
  OTROS: 'Otros ingresos',
};

export interface Linea {
  cuenta: string;
  debe: number;
  haber: number;
}

/** Un asiento tiene que tener plata, líneas bien formadas y cerrar en cero. Si no, no se guarda. */
export function validarAsiento(lineas: readonly Linea[]): void {
  if (lineas.length < 2) throw new Error('Un asiento necesita al menos dos líneas.');
  let debe = 0;
  let haber = 0;
  for (const l of lineas) {
    if (!Number.isInteger(l.debe) || !Number.isInteger(l.haber) || l.debe < 0 || l.haber < 0)
      throw new Error('Los montos son enteros en pesos y no pueden ser negativos.');
    if (l.debe > 0 === l.haber > 0)
      throw new Error('Cada línea va al debe o al haber, no a las dos ni a ninguna.');
    debe += l.debe;
    haber += l.haber;
  }
  if (debe !== haber) throw new Error(`El asiento no cierra: debe ${debe}, haber ${haber}.`);
}

export function cuentaDeMetodo(metodo: MetodoPago): CuentaDePlata {
  return metodo === 'MERCADO_PAGO' ? 'MP' : metodo === 'EFECTIVO' ? 'EFECTIVO' : 'BANCO';
}

const monto = (n: number) => {
  if (!Number.isInteger(n) || n <= 0) throw new Error('El monto tiene que ser un entero positivo en pesos.');
  return n;
};

/** Un pago aprobado: entra la plata y, si cobró Mercado Pago, sale la comisión de la plataforma. */
export function asientosDePago(p: {
  metodo: MetodoPago;
  monto: number;
  comision: number;
  categoria?: CategoriaIngreso;
}): { cobro: Linea[]; comision: Linea[] | null } {
  const cuenta = cuentaDeMetodo(p.metodo);
  const cobro = [
    { cuenta, debe: monto(p.monto), haber: 0 },
    { cuenta: `INGRESOS:${p.categoria ?? 'INSCRIPCIONES'}`, debe: 0, haber: p.monto },
  ];
  const comision =
    p.comision > 0
      ? [
          { cuenta: COMISION, debe: p.comision, haber: 0 },
          { cuenta: 'MP', debe: 0, haber: p.comision },
        ]
      : null;
  return { cobro, comision };
}

export function asientoDeEgreso(e: { rubro: RubroEgreso; monto: number; pagadoCon: CuentaDePlata }): Linea[] {
  return [
    { cuenta: `EGRESOS:${e.rubro}`, debe: monto(e.monto), haber: 0 },
    { cuenta: e.pagadoCon, debe: 0, haber: e.monto },
  ];
}

export function asientoDeIngreso(i: {
  categoria: CategoriaIngreso;
  monto: number;
  cobradoEn: CuentaDePlata;
}): Linea[] {
  return [
    { cuenta: i.cobradoEn, debe: monto(i.monto), haber: 0 },
    { cuenta: `INGRESOS:${i.categoria}`, debe: 0, haber: i.monto },
  ];
}

/** Retirar de Mercado Pago a la cuenta bancaria: la plata cambia de lugar, no es ganancia ni gasto. */
export function asientoDeRetiro(montoRetirado: number): Linea[] {
  return [
    { cuenta: 'BANCO', debe: monto(montoRetirado), haber: 0 },
    { cuenta: 'MP', debe: 0, haber: montoRetirado },
  ];
}

/** El asiento que anula a otro: mismas cuentas, debe y haber cambiados. */
export function invertir(lineas: readonly Linea[]): Linea[] {
  return lineas.map((l) => ({ cuenta: l.cuenta, debe: l.haber, haber: l.debe }));
}

/** Saldo por cuenta (debe − haber). */
export function saldos(lineas: readonly Linea[]): Record<string, number> {
  const s: Record<string, number> = {};
  for (const l of lineas) s[l.cuenta] = (s[l.cuenta] ?? 0) + l.debe - l.haber;
  return s;
}

const suma = (s: Record<string, number>, prefijo: string) =>
  Object.entries(s)
    .filter(([c]) => c.startsWith(prefijo))
    .reduce((t, [, v]) => t + v, 0);

export interface ResultadoCaja {
  ingresos: number;
  /** Comisión de Potrero por los cobros con Mercado Pago. */
  comision: number;
  egresos: number;
  /** Ingresos − comisión − egresos. */
  resultado: number;
}

export function resultadoDeCaja(s: Record<string, number>): ResultadoCaja {
  const ingresos = 0 - suma(s, 'INGRESOS:');
  const comision = s[COMISION] ?? 0;
  const egresos = suma(s, 'EGRESOS:');
  return { ingresos, comision, egresos, resultado: ingresos - comision - egresos };
}

export function egresosPorRubro(
  s: Record<string, number>,
): { rubro: RubroEgreso; monto: number; pct: number }[] {
  const total = suma(s, 'EGRESOS:');
  return RUBROS_EGRESO.map((rubro) => {
    const m = s[`EGRESOS:${rubro}`] ?? 0;
    return { rubro, monto: m, pct: total > 0 ? Math.round((m / total) * 100) : 0 };
  }).filter((r) => r.monto > 0);
}

/** Cuánto hay disponible en cada lugar donde está la plata. */
export function disponible(s: Record<string, number>): Record<CuentaDePlata, number> {
  return { MP: s.MP ?? 0, EFECTIVO: s.EFECTIVO ?? 0, BANCO: s.BANCO ?? 0 };
}

// ───────────── Cargos automáticos ─────────────

export const AUTOMATIZACIONES_CAJA = {
  CAJA_PAGO_ARBITROS: {
    nombre: 'Pago automático a árbitros',
    detalle: 'Al cerrar el acta, según la tarifa del árbitro designado',
  },
  CAJA_ALQUILER_CANCHAS: {
    nombre: 'Alquiler de canchas',
    detalle: 'Al cerrar el acta, según el costo por partido de la cancha',
  },
} as const;
export type ClaveAutomatizacionCaja = keyof typeof AUTOMATIZACIONES_CAJA;

// ───────────── Exportación ─────────────

/**
 * Arma un CSV para abrir en Excel de Argentina: separado por punto y coma, con BOM para que respete las tildes y
 * celdas entre comillas cuando hace falta.
 */
export function aCsv(filas: readonly (readonly (string | number | boolean | null | undefined)[])[]): string {
  const celda = (v: string | number | boolean | null | undefined) => {
    if (v === null || v === undefined) return '';
    const t = String(v);
    return /[";\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n') + '\r\n';
}
