import { describe, expect, it } from 'vitest';
import {
  alertasDeSalud,
  cobrosPorMes,
  esLigaActiva,
  estadoDeSalud,
  type LigaParaSalud,
  lunesDe,
  mesDe,
  porMes,
  porSemana,
  sumarCobros,
  tasaDeCargo,
  ingresosDeGregal,
  ultimasSemanas,
} from './gregal.js';

// Lunes 26 de octubre de 2026, 15 h en Buenos Aires.
const ahora = new Date('2026-10-26T18:00:00Z');
const haceDias = (n: number) => new Date(ahora.getTime() - n * 86_400_000).toISOString();

const sana: LigaParaSalud = {
  creadaEn: haceDias(60),
  equipos: 12,
  torneosActivos: 1,
  partidosVencidos: 20,
  actasCargadas: 18,
  pagosOnline: 10,
  pagosManuales: 4,
  ultimoUso: haceDias(1),
};

describe('semanas y meses en hora de Argentina', () => {
  it('el lunes de la semana usa la fecha local', () => {
    expect(lunesDe('2026-10-25T20:00:00Z')).toBe('2026-10-19'); // domingo 17 h
    expect(lunesDe('2026-10-26T02:00:00Z')).toBe('2026-10-19'); // domingo 23 h local
    expect(lunesDe('2026-10-26T04:00:00Z')).toBe('2026-10-26'); // lunes 1 h local
  });
  it('el mes usa la fecha local', () => {
    expect(mesDe('2026-11-01T01:00:00Z')).toBe('2026-10');
  });
  it('devuelve las últimas 8 semanas y cuenta los cierres de cada una', () => {
    expect(ultimasSemanas(ahora, 8)).toHaveLength(8);
    expect(ultimasSemanas(ahora, 8).at(-1)).toBe('2026-10-26');
    const s = porSemana(
      ['2026-10-24T20:00:00Z', '2026-10-25T20:00:00Z', '2026-10-27T20:00:00Z', '2025-01-01T00:00:00Z'],
      ahora,
    );
    expect(s.find((x) => x.semana === '2026-10-19')!.cantidad).toBe(2);
    expect(s.find((x) => x.semana === '2026-10-26')!.cantidad).toBe(1);
    expect(s.reduce((a, x) => a + x.cantidad, 0)).toBe(3);
  });
  it('cuenta ligas nuevas por mes con los meses vacíos en cero', () => {
    const m = porMes([haceDias(1), haceDias(2), '2026-08-15T12:00:00Z'], ahora, 6);
    expect(m.map((x) => x.mes)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(m.map((x) => x.cantidad)).toEqual([0, 0, 0, 1, 0, 2]);
  });
});

describe('dinero de la plataforma', () => {
  const pagos = [
    { metodo: 'MERCADO_PAGO' as const, monto: 100_000, cargoServicio: 3_500, fecha: '2026-10-10T12:00:00Z' },
    { metodo: 'EFECTIVO' as const, monto: 50_000, cargoServicio: 0, fecha: '2026-10-11T12:00:00Z' },
    { metodo: 'TRANSFERENCIA' as const, monto: 30_000, cargoServicio: 0, fecha: '2026-09-11T12:00:00Z' },
  ];
  it('suma lo cobrado por medio y el cargo por servicio', () => {
    expect(sumarCobros(pagos)).toEqual({
      efectivo: 50_000,
      transferencia: 30_000,
      online: 100_000,
      total: 180_000,
      cargoServicio: 3_500,
      pagos: 3,
    });
  });
  it('el cargo por servicio se mide sobre lo online y sobre el total', () => {
    const t = tasaDeCargo(sumarCobros(pagos));
    expect(t.sobreOnline).toBeCloseTo(0.035);
    expect(t.sobreTotal).toBeCloseTo(3_500 / 180_000);
    expect(tasaDeCargo(sumarCobros([]))).toEqual({ sobreOnline: 0, sobreTotal: 0 });
  });
  it('agrupa por mes', () => {
    const m = cobrosPorMes(pagos, ahora, 3);
    expect(m.map((x) => [x.mes, x.total])).toEqual([
      ['2026-08', 0],
      ['2026-09', 30_000],
      ['2026-10', 150_000],
    ]);
  });
});

describe('salud de la liga (alertas de abandono)', () => {
  it('una liga que usa todo no tiene alertas', () => {
    expect(alertasDeSalud(sana, ahora)).toEqual([]);
    expect(estadoDeSalud([])).toBe('SANA');
  });
  it('sin equipos a los 7 días del alta', () => {
    const l = { ...sana, equipos: 0, creadaEn: haceDias(9), partidosVencidos: 0, actasCargadas: 0 };
    expect(alertasDeSalud(l, ahora).map((a) => a.clave)).toEqual(['SIN_EQUIPOS']);
    expect(alertasDeSalud({ ...l, creadaEn: haceDias(3) }, ahora)).toEqual([]);
  });
  it('menos del 50 % de actas cargadas (con partidos suficientes para medir)', () => {
    expect(alertasDeSalud({ ...sana, actasCargadas: 9 }, ahora).map((a) => a.clave)).toEqual(['ACTAS_BAJAS']);
    expect(alertasDeSalud({ ...sana, actasCargadas: 10 }, ahora)).toEqual([]);
    expect(alertasDeSalud({ ...sana, partidosVencidos: 3, actasCargadas: 0 }, ahora)).toEqual([]);
  });
  it('pagos manuales sostenidos sin cobro online', () => {
    const a = alertasDeSalud({ ...sana, pagosOnline: 0, pagosManuales: 8 }, ahora);
    expect(a.map((x) => x.clave)).toEqual(['SOLO_MANUALES']);
    expect(alertasDeSalud({ ...sana, pagosOnline: 0, pagosManuales: 2 }, ahora)).toEqual([]);
  });
  it('panel sin uso por 2 semanas solo cuenta con un torneo activo', () => {
    expect(alertasDeSalud({ ...sana, ultimoUso: haceDias(20) }, ahora).map((a) => a.clave)).toEqual([
      'PANEL_SIN_USO',
    ]);
    expect(alertasDeSalud({ ...sana, ultimoUso: haceDias(20), torneosActivos: 0 }, ahora)).toEqual([]);
    expect(alertasDeSalud({ ...sana, ultimoUso: null }, ahora)[0]!.detalle).toContain('Nunca');
  });
  it('dos alertas o más es riesgo', () => {
    const a = alertasDeSalud({ ...sana, ultimoUso: haceDias(20), actasCargadas: 2 }, ahora);
    expect(estadoDeSalud(a)).toBe('RIESGO');
    expect(estadoDeSalud(a.slice(0, 1))).toBe('ATENCION');
  });
});

describe('liga activa', () => {
  it('con torneo activo o con un partido cerrado en los últimos 30 días', () => {
    expect(esLigaActiva({ torneosActivos: 1, ultimoPartidoCerrado: null }, ahora)).toBe(true);
    expect(esLigaActiva({ torneosActivos: 0, ultimoPartidoCerrado: haceDias(10) }, ahora)).toBe(true);
    expect(esLigaActiva({ torneosActivos: 0, ultimoPartidoCerrado: haceDias(45) }, ahora)).toBe(false);
    expect(esLigaActiva({ torneosActivos: 0, ultimoPartidoCerrado: null }, ahora)).toBe(false);
  });
});

describe('ingresos de Gregal', () => {
  it('suma las suscripciones (con descuento de fundadora) y los cargos por servicio del mes', () => {
    const ahora = new Date('2026-10-20T12:00:00Z');
    const r = ingresosDeGregal(
      [
        { plan: 'PRO', fundadora: true },
        { plan: 'TORNEO', fundadora: false },
      ],
      [
        { metodo: 'MERCADO_PAGO', monto: 60_000, cargoServicio: 2_400, fecha: '2026-10-05T12:00:00Z' },
        { metodo: 'MERCADO_PAGO', monto: 60_000, cargoServicio: 2_400, fecha: '2026-09-05T12:00:00Z' },
      ],
      ahora,
    );
    expect(r).toEqual({ suscripciones: 275_000, cargosDelMes: 2_400, total: 277_400 });
  });
});
