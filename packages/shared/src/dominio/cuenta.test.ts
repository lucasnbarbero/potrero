import { describe, expect, it } from 'vitest';
import {
  estadoDeLink,
  evaluarIntentos,
  LIMITE_INGRESO,
  mensajeDeBloqueo,
  vencimientoDeLink,
} from './cuenta.js';

const ahora = new Date('2026-10-26T12:00:00Z');
const hace = (min: number) => new Date(ahora.getTime() - min * 60_000);
const veces = (n: number, min: number) => Array.from({ length: n }, () => hace(min));

describe('límite de intentos de ingreso', () => {
  it('deja intentar por debajo del límite', () => {
    const b = evaluarIntentos({ cuenta: veces(LIMITE_INGRESO.porCuenta - 1, 1), ip: [] }, ahora);
    expect(b).toEqual({ bloqueado: false, motivo: null, esperaMin: 0 });
  });

  it('bloquea la cuenta al llegar al límite y dice cuánto esperar', () => {
    const b = evaluarIntentos(
      { cuenta: [...veces(LIMITE_INGRESO.porCuenta - 1, 1), hace(5)], ip: [] },
      ahora,
    );
    expect(b.bloqueado).toBe(true);
    expect(b.motivo).toBe('CUENTA');
    // El quinto intento más nuevo fue hace 5 minutos: sale de la ventana de 15 en 10.
    expect(b.esperaMin).toBe(LIMITE_INGRESO.ventanaMin - 5);
    expect(mensajeDeBloqueo(b)).toContain('10 minutos');
  });

  it('los intentos viejos no cuentan', () => {
    const b = evaluarIntentos(
      { cuenta: veces(LIMITE_INGRESO.porCuenta, LIMITE_INGRESO.ventanaMin + 1), ip: [] },
      ahora,
    );
    expect(b.bloqueado).toBe(false);
  });

  it('bloquea por IP aunque cada cuenta tenga pocos intentos', () => {
    const b = evaluarIntentos({ cuenta: [hace(1)], ip: veces(LIMITE_INGRESO.porIp, 2) }, ahora);
    expect(b).toMatchObject({ bloqueado: true, motivo: 'IP', esperaMin: 13 });
    expect(mensajeDeBloqueo(b)).toContain('esta conexión');
  });

  it('nunca pide esperar menos de un minuto', () => {
    const b = evaluarIntentos(
      { cuenta: veces(LIMITE_INGRESO.porCuenta, LIMITE_INGRESO.ventanaMin - 0.01), ip: [] },
      ahora,
    );
    expect(b.esperaMin).toBe(1);
    expect(mensajeDeBloqueo(b)).toContain('1 minuto ');
  });
});

describe('links de un solo uso', () => {
  it('vale si no se usó ni venció', () => {
    expect(estadoDeLink({ venceEn: vencimientoDeLink('RECUPERAR', ahora), usadoEn: null }, ahora)).toBe(
      'VALIDO',
    );
  });
  it('se usa una sola vez', () => {
    expect(estadoDeLink({ venceEn: vencimientoDeLink('RECUPERAR', ahora), usadoEn: ahora }, ahora)).toBe(
      'USADO',
    );
  });
  it('vence', () => {
    const venceEn = vencimientoDeLink('RECUPERAR', ahora);
    expect(estadoDeLink({ venceEn, usadoEn: null }, new Date(venceEn.getTime() + 1))).toBe('VENCIDO');
    expect(estadoDeLink(null, ahora)).toBe('INEXISTENTE');
  });
  it('la verificación de email dura más que la recuperación', () => {
    expect(vencimientoDeLink('VERIFICAR_EMAIL', ahora).getTime()).toBeGreaterThan(
      vencimientoDeLink('RECUPERAR', ahora).getTime(),
    );
  });
});
