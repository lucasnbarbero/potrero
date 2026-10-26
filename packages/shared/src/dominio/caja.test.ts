import { describe, expect, it } from 'vitest';
import {
  aCsv,
  asientoDeEgreso,
  asientoDeIngreso,
  asientoDeRetiro,
  asientosDePago,
  cuentaDeMetodo,
  disponible,
  egresosPorRubro,
  invertir,
  type Linea,
  resultadoDeCaja,
  saldos,
  validarAsiento,
} from './caja.js';

describe('caja: asientos de partida doble', () => {
  it('un asiento que cierra es válido', () => {
    expect(() =>
      validarAsiento([
        { cuenta: 'MP', debe: 100, haber: 0 },
        { cuenta: 'INGRESOS:INSCRIPCIONES', debe: 0, haber: 100 },
      ]),
    ).not.toThrow();
  });

  it('rechaza un asiento que no cierra', () => {
    expect(() =>
      validarAsiento([
        { cuenta: 'MP', debe: 100, haber: 0 },
        { cuenta: 'X', debe: 0, haber: 90 },
      ]),
    ).toThrow(/no cierra: debe 100, haber 90/);
  });

  it('rechaza líneas mal formadas', () => {
    expect(() => validarAsiento([{ cuenta: 'MP', debe: 100, haber: 0 }])).toThrow(/al menos dos líneas/);
    expect(() =>
      validarAsiento([
        { cuenta: 'A', debe: 50, haber: 50 },
        { cuenta: 'B', debe: 0, haber: 0 },
      ]),
    ).toThrow(/debe o al haber/);
    expect(() =>
      validarAsiento([
        { cuenta: 'A', debe: -10, haber: 0 },
        { cuenta: 'B', debe: 0, haber: -10 },
      ]),
    ).toThrow(/enteros/);
    expect(() =>
      validarAsiento([
        { cuenta: 'A', debe: 10.5, haber: 0 },
        { cuenta: 'B', debe: 0, haber: 10.5 },
      ]),
    ).toThrow(/enteros/);
  });

  it('cada método de pago va a su cuenta', () => {
    expect(cuentaDeMetodo('MERCADO_PAGO')).toBe('MP');
    expect(cuentaDeMetodo('EFECTIVO')).toBe('EFECTIVO');
    expect(cuentaDeMetodo('TRANSFERENCIA')).toBe('BANCO');
  });

  it('si el organizador absorbe el cargo por servicio, sale de Mercado Pago como gasto y los dos asientos cierran', () => {
    const { cobro, cargo } = asientosDePago({ metodo: 'MERCADO_PAGO', monto: 60_000, cargoAbsorbido: 2_100 });
    expect(() => validarAsiento(cobro)).not.toThrow();
    expect(() => validarAsiento(cargo!)).not.toThrow();
    const s = saldos([...cobro, ...cargo!]);
    expect(s.MP).toBe(57_900); // 60.000 menos 2.100
    expect(s['INGRESOS:INSCRIPCIONES']).toBe(-60_000);
    expect(s.CARGO_SERVICIO).toBe(2_100);
  });

  it('un pago sin cargo absorbido entra completo y no genera otro asiento', () => {
    const { cargo } = asientosDePago({ metodo: 'EFECTIVO', monto: 60_000, cargoAbsorbido: 0 });
    expect(cargo).toBeNull();
  });

  it('un egreso saca plata de donde se pagó y suma al rubro', () => {
    const a = asientoDeEgreso({ rubro: 'CANCHAS', monto: 180_000, pagadoCon: 'BANCO' });
    expect(() => validarAsiento(a)).not.toThrow();
    expect(saldos(a)).toEqual({ 'EGRESOS:CANCHAS': 180_000, BANCO: -180_000 });
  });

  it('un ingreso de sponsor entra por la cuenta donde se cobró', () => {
    const a = asientoDeIngreso({ categoria: 'SPONSORS', monto: 50_000, cobradoEn: 'BANCO' });
    expect(saldos(a)).toEqual({ BANCO: 50_000, 'INGRESOS:SPONSORS': -50_000 });
  });

  it('los montos tienen que ser enteros positivos', () => {
    expect(() => asientoDeEgreso({ rubro: 'OTROS', monto: 0, pagadoCon: 'MP' })).toThrow(/entero positivo/);
    expect(() => asientoDeIngreso({ categoria: 'OTROS', monto: 1.5, cobradoEn: 'MP' })).toThrow();
    expect(() => asientoDeRetiro(-5)).toThrow();
  });

  it('un retiro mueve la plata de Mercado Pago al banco sin tocar el resultado', () => {
    const a = asientoDeRetiro(100_000);
    expect(saldos(a)).toEqual({ BANCO: 100_000, MP: -100_000 });
    expect(resultadoDeCaja(saldos(a))).toEqual({ ingresos: 0, cargoAbsorbido: 0, egresos: 0, resultado: 0 });
  });

  it('un asiento invertido anula al original', () => {
    const original = asientoDeEgreso({ rubro: 'PREMIOS', monto: 80_000, pagadoCon: 'EFECTIVO' });
    const inv = invertir(original);
    expect(() => validarAsiento(inv)).not.toThrow();
    const neto = saldos([...original, ...inv]);
    expect(Object.values(neto).every((v) => v === 0)).toBe(true);
  });
});

describe('caja: resultado y saldos', () => {
  const libro: Linea[] = [
    ...asientosDePago({ metodo: 'MERCADO_PAGO', monto: 100_000, cargoAbsorbido: 0 }).cobro,
    ...asientosDePago({ metodo: 'MERCADO_PAGO', monto: 100_000, cargoAbsorbido: 3_500 }).cargo!,
    ...asientosDePago({ metodo: 'EFECTIVO', monto: 60_000, cargoAbsorbido: 0 }).cobro,
    ...asientoDeIngreso({ categoria: 'SPONSORS', monto: 50_000, cobradoEn: 'BANCO' }),
    ...asientoDeEgreso({ rubro: 'CANCHAS', monto: 90_000, pagadoCon: 'MP' }),
    ...asientoDeEgreso({ rubro: 'ARBITROS', monto: 30_000, pagadoCon: 'EFECTIVO' }),
    ...asientoDeEgreso({ rubro: 'PREMIOS', monto: 10_000, pagadoCon: 'EFECTIVO' }),
  ];
  const s = saldos(libro);

  it('el resultado resta el cargo absorbido y los egresos de los ingresos', () => {
    expect(resultadoDeCaja(s)).toEqual({
      ingresos: 210_000, // 100.000 + 60.000 + 50.000
      cargoAbsorbido: 3_500,
      egresos: 130_000,
      resultado: 76_500,
    });
  });

  it('la plata disponible en cada lugar sale de los asientos', () => {
    expect(disponible(s)).toEqual({
      MP: 100_000 - 3_500 - 90_000,
      EFECTIVO: 60_000 - 30_000 - 10_000,
      BANCO: 50_000,
    });
  });

  it('los egresos por rubro llevan su porcentaje y no muestran los vacíos', () => {
    expect(egresosPorRubro(s)).toEqual([
      { rubro: 'CANCHAS', monto: 90_000, pct: 69 },
      { rubro: 'ARBITROS', monto: 30_000, pct: 23 },
      { rubro: 'PREMIOS', monto: 10_000, pct: 8 },
    ]);
  });

  it('sin movimientos, todo da cero', () => {
    expect(resultadoDeCaja({})).toEqual({ ingresos: 0, cargoAbsorbido: 0, egresos: 0, resultado: 0 });
    expect(egresosPorRubro({})).toEqual([]);
    expect(disponible({})).toEqual({ MP: 0, EFECTIVO: 0, BANCO: 0 });
  });

  it('el libro completo siempre cierra en cero', () => {
    expect(Object.values(s).reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe('caja: exportación CSV', () => {
  it('separa por punto y coma, lleva BOM y termina cada fila con salto de línea', () => {
    expect(
      aCsv([
        ['fecha', 'monto'],
        ['2026-10-23', 60000],
      ]),
    ).toBe('﻿fecha;monto\r\n2026-10-23;60000\r\n');
  });

  it('pone entre comillas lo que tiene separador, comillas o saltos de línea', () => {
    expect(aCsv([['Pago; "árbitros"', 'línea\ndos']])).toBe('﻿"Pago; ""árbitros""";"línea\ndos"\r\n');
  });

  it('deja vacíos los nulos y no pierde los ceros ni los falsos', () => {
    expect(aCsv([[null, undefined, 0, false, '']])).toBe('﻿;;0;false;\r\n');
  });
});
