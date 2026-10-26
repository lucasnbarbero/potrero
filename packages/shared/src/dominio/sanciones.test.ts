// Levantar una suspensión pagando una multa (E14-08).
import { describe, expect, it } from 'vitest';
import { REGLAMENTO_POR_DEFECTO } from '../reglamento.js';
import { cumplimientoSancion, estadoSancion, levantarSancion } from './sanciones.js';
import type { Reglamento } from './tipos.js';

const dia = (d: number) => new Date(Date.UTC(2027, 2, d, 20));
const encendido: Reglamento = {
  ...REGLAMENTO_POR_DEFECTO,
  levantarSancionPagando: true,
  levantarSancionMonto: 15_000,
};
const sancion = (
  causa: string,
  extra: Partial<{ revisadaPorTribunal: boolean; restantes: number; pendientes: number }> = {},
) => ({
  causa,
  revisadaPorTribunal: false,
  restantes: 1,
  pendientes: 0,
  ...extra,
});

describe('cumplimiento con partidos levantados pagando', () => {
  it('sin pagos es igual al cumplimiento de siempre', () => {
    for (const [p, j] of [
      [2, 1],
      [1, 3],
      [3, 0],
    ] as const)
      expect(cumplimientoSancion(p, Array(j).fill(null))).toEqual({ ...estadoSancion(p, j), levantados: 0 });
  });

  it('un pago acreditado antes del partido lo levanta: el jugador queda habilitado y no cuenta como cumplido', () => {
    expect(cumplimientoSancion(1, [], [dia(10)])).toEqual({
      cumplidos: 0,
      levantados: 1,
      restantes: 0,
      activa: false,
    });
    // Después de jugar ese partido sigue sin contar como cumplido.
    expect(cumplimientoSancion(1, [dia(13)], [dia(10)])).toMatchObject({ cumplidos: 0, levantados: 1 });
  });

  it('cada pago levanta un solo partido', () => {
    expect(cumplimientoSancion(3, [], [dia(10)])).toMatchObject({
      levantados: 1,
      restantes: 2,
      activa: true,
    });
    // Levanta la fecha 13; la 20 la cumple.
    expect(cumplimientoSancion(2, [dia(13), dia(20)], [dia(10)])).toMatchObject({
      cumplidos: 1,
      levantados: 1,
      restantes: 0,
    });
  });

  it('un pago acreditado después de un partido no lo levanta: ese partido ya se cumplió', () => {
    expect(cumplimientoSancion(2, [dia(13)], [dia(15)])).toEqual({
      cumplidos: 1,
      levantados: 1,
      restantes: 0,
      activa: false,
    });
  });

  it('los pagos de más no levantan partidos que no faltan', () => {
    expect(cumplimientoSancion(1, [dia(13)], [dia(15)])).toMatchObject({ cumplidos: 1, levantados: 0 });
    expect(cumplimientoSancion(1, [], [dia(10), dia(11)])).toMatchObject({ levantados: 1, restantes: 0 });
  });
});

describe('cuándo se puede levantar pagando', () => {
  it('apagado por defecto', () => {
    expect(REGLAMENTO_POR_DEFECTO.levantarSancionPagando).toBe(false);
    expect(levantarSancion(sancion('ACUMULACION'), REGLAMENTO_POR_DEFECTO)).toMatchObject({
      ok: false,
      motivo: 'APAGADO',
    });
  });

  it('encendido, acumulación y doble amarilla se levantan por el monto del reglamento', () => {
    expect(levantarSancion(sancion('ACUMULACION'), encendido)).toEqual({ ok: true, monto: 15_000 });
    expect(levantarSancion(sancion('DOBLE_AMARILLA'), encendido)).toEqual({ ok: true, monto: 15_000 });
  });

  it('sin monto no está disponible aunque esté encendido', () => {
    expect(levantarSancion(sancion('ACUMULACION'), { ...encendido, levantarSancionMonto: 0 })).toMatchObject({
      ok: false,
      motivo: 'SIN_MONTO',
    });
  });

  it('nunca una roja directa ni una sanción del tribunal, aunque el reglamento las incluya', () => {
    const todo = {
      ...encendido,
      levantarSancionTipos: ['ROJA_DIRECTA', 'DOBLE_AMARILLA', 'ACUMULACION'],
    } as Reglamento;
    expect(levantarSancion(sancion('ROJA_DIRECTA'), todo)).toMatchObject({ motivo: 'TIPO_NO_PERMITIDO' });
    expect(levantarSancion(sancion('TRIBUNAL'), todo)).toMatchObject({ motivo: 'TIPO_NO_PERMITIDO' });
    expect(levantarSancion(sancion('ACUMULACION', { revisadaPorTribunal: true }), todo)).toMatchObject({
      motivo: 'TRIBUNAL',
    });
  });

  it('solo los tipos que eligió el reglamento', () => {
    const r = { ...encendido, levantarSancionTipos: ['ACUMULACION' as const] };
    expect(levantarSancion(sancion('DOBLE_AMARILLA'), r)).toMatchObject({ motivo: 'TIPO_NO_PERMITIDO' });
    expect(levantarSancion(sancion('ACUMULACION'), r).ok).toBe(true);
  });

  it('no si ya está cumplida o si los pagos pendientes cubren lo que falta', () => {
    expect(levantarSancion(sancion('ACUMULACION', { restantes: 0 }), encendido)).toMatchObject({
      motivo: 'CUMPLIDA',
    });
    expect(levantarSancion(sancion('ACUMULACION', { restantes: 1, pendientes: 1 }), encendido)).toMatchObject(
      {
        motivo: 'PAGOS_PENDIENTES',
      },
    );
    expect(levantarSancion(sancion('ACUMULACION', { restantes: 2, pendientes: 1 }), encendido).ok).toBe(true);
  });
});
