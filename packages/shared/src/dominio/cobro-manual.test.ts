import { describe, expect, it } from 'vitest';
import {
  cambiosPorMontoDeInscripcion,
  imputarPago,
  motivoParaNoAnular,
  saldoDeCargos,
  saldoDelCargo,
  transicionDeTorneo,
  validarCupo,
  validarFechaDePago,
} from './cobro-manual.js';

const cargo = (id: string, monto: number, pagado = 0, estado = 'PENDIENTE') => ({
  id,
  concepto: id,
  monto,
  pagado,
  estado,
});

describe('pago manual: saldo e imputación', () => {
  it('el saldo es lo que falta de los cargos pendientes', () => {
    expect(saldoDelCargo(cargo('a', 60_000, 30_000))).toBe(30_000);
    expect(saldoDelCargo(cargo('a', 60_000, 0, 'ANULADO'))).toBe(0);
    expect(saldoDelCargo(cargo('a', 60_000, 60_000, 'PAGADO'))).toBe(0);
    expect(saldoDeCargos([cargo('a', 60_000, 30_000), cargo('b', 5_000), cargo('c', 1, 0, 'ANULADO')])).toBe(
      35_000,
    );
  });

  it('un pago parcial queda en el cargo sin cancelarlo', () => {
    expect(imputarPago([cargo('a', 75_000)], 30_000)).toEqual([
      { cargoId: 'a', monto: 30_000, cancela: false },
    ]);
  });

  it('sin cargo elegido, cancela primero el más viejo y lo que sobra va al siguiente', () => {
    const cargos = [
      cargo('pagado', 10, 10, 'PAGADO'),
      cargo('a', 60_000, 30_000),
      cargo('b', 5_000),
      cargo('c', 4_500),
    ];
    expect(imputarPago(cargos, 32_000)).toEqual([
      { cargoId: 'a', monto: 30_000, cancela: true },
      { cargoId: 'b', monto: 2_000, cancela: false },
    ]);
    expect(imputarPago(cargos, 39_500).every((i) => i.cancela)).toBe(true);
  });

  it('con un cargo elegido, todo va a ese cargo', () => {
    const cargos = [cargo('a', 60_000, 30_000), cargo('seguro', 4_500)];
    expect(imputarPago(cargos, 4_500, 'seguro')).toEqual([
      { cargoId: 'seguro', monto: 4_500, cancela: true },
    ]);
    expect(() => imputarPago(cargos, 5_000, 'seguro')).toThrow(/supera lo que se debe/);
    expect(() => imputarPago(cargos, 1, 'otro')).toThrow(/no es de este equipo/);
  });

  it('rechaza montos inválidos, de más o sin deuda', () => {
    expect(() => imputarPago([cargo('a', 100)], 0)).toThrow(/entero positivo/);
    expect(() => imputarPago([cargo('a', 100)], 10.5)).toThrow(/entero positivo/);
    expect(() => imputarPago([cargo('a', 100)], 101)).toThrow(/supera/);
    expect(() => imputarPago([cargo('a', 100, 100, 'PAGADO')], 1)).toThrow(/no tiene cargos pendientes/);
    expect(() => imputarPago([cargo('a', 100, 100, 'PAGADO')], 1, 'a')).toThrow(/ya está pagado/);
  });

  it('la fecha del pago no es futura ni de hace más de un año', () => {
    expect(validarFechaDePago('2026-10-26', '2026-10-26')).toBeNull();
    expect(validarFechaDePago('2026-10-01', '2026-10-26')).toBeNull();
    expect(validarFechaDePago('2026-10-27', '2026-10-26')).toMatch(/futura/);
    expect(validarFechaDePago('2025-10-25', '2026-10-26')).toMatch(/más de un año/);
  });

  it('solo se anulan pagos manuales aprobados', () => {
    expect(motivoParaNoAnular({ metodo: 'EFECTIVO', estado: 'APROBADO' })).toBeNull();
    expect(motivoParaNoAnular({ metodo: 'TRANSFERENCIA', estado: 'APROBADO' })).toBeNull();
    expect(motivoParaNoAnular({ metodo: 'MERCADO_PAGO', estado: 'APROBADO' })).toMatch(/reembolso/);
    expect(motivoParaNoAnular({ metodo: 'EFECTIVO', estado: 'ANULADO' })).toMatch(/ya está anulado/);
  });
});

describe('edición del torneo', () => {
  const c = (
    id: string,
    pagos: number,
    extra: Partial<{ estado: string; categoria: string; fecha: number | null }> = {},
  ) => ({
    id,
    pagos,
    estado: 'PENDIENTE',
    categoria: 'INSCRIPCIONES',
    fecha: null,
    ...extra,
  });

  it('el monto nuevo solo afecta a los cargos de inscripción sin pagos', () => {
    const cargos = [
      c('libre', 0),
      c('parcial', 1),
      c('pagado', 1, { estado: 'PAGADO' }),
      c('cuota', 0, { fecha: 1 }),
      c('multa', 0, { categoria: 'MULTAS' }),
    ];
    expect(cambiosPorMontoDeInscripcion(cargos, 80_000)).toEqual({
      actualizar: ['libre'],
      anular: [],
      conservan: 1,
    });
    expect(cambiosPorMontoDeInscripcion(cargos, 0)).toEqual({
      actualizar: [],
      anular: ['libre'],
      conservan: 1,
    });
  });

  it('el cupo no baja de los inscriptos', () => {
    expect(validarCupo(10, 9)).toBeNull();
    expect(validarCupo(9, 9)).toBeNull();
    expect(validarCupo(8, 9)).toMatch(/Ya hay 9 equipos/);
  });
});

describe('estado del torneo', () => {
  const sinFixture = { total: 0, sinJugar: 0 };
  it('cerrar y reabrir la inscripción mientras no haya fixture', () => {
    expect(transicionDeTorneo('INSCRIPCION', 'EN_CURSO', sinFixture).ok).toBe(true);
    expect(transicionDeTorneo('EN_CURSO', 'INSCRIPCION', sinFixture).ok).toBe(true);
    expect(transicionDeTorneo('EN_CURSO', 'INSCRIPCION', { total: 28, sinJugar: 28 })).toMatchObject({
      ok: false,
      motivo: expect.stringMatching(/ya tiene fixture/),
    });
  });

  it('finalizar con partidos sin jugar pide confirmación y dice cuántos quedan', () => {
    expect(transicionDeTorneo('EN_CURSO', 'FINALIZADO', { total: 28, sinJugar: 0 })).toEqual({ ok: true });
    expect(transicionDeTorneo('EN_CURSO', 'FINALIZADO', { total: 28, sinJugar: 16 })).toMatchObject({
      ok: true,
      requiereConfirmacion: true,
      aviso: expect.stringMatching(/Quedan 16 partidos sin jugar/),
    });
    expect(transicionDeTorneo('EN_CURSO', 'FINALIZADO', { total: 28, sinJugar: 1 }).aviso).toMatch(
      /1 partido sin/,
    );
  });

  it('rechaza las transiciones que no tienen sentido', () => {
    expect(transicionDeTorneo('EN_CURSO', 'EN_CURSO', sinFixture).ok).toBe(false);
    expect(transicionDeTorneo('FINALIZADO', 'INSCRIPCION', sinFixture).ok).toBe(false);
    expect(transicionDeTorneo('BORRADOR', 'FINALIZADO', sinFixture).ok).toBe(false);
    expect(transicionDeTorneo('EN_CURSO', 'BORRADOR', sinFixture).ok).toBe(false);
    expect(transicionDeTorneo('FINALIZADO', 'EN_CURSO', sinFixture).ok).toBe(true);
    expect(transicionDeTorneo('BORRADOR', 'INSCRIPCION', sinFixture).ok).toBe(true);
  });
});
