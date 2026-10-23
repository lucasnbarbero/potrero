import { describe, expect, it } from 'vitest';
import { REGLAMENTO_POR_DEFECTO as R } from '../reglamento.js';
import { goleadores, marcador } from './acta.js';
import { comisionPlataforma } from './cobros.js';
import { cantidadDePartidos, detectarConflictos, programar, todosContraTodos } from './fixture.js';
import { amarillasQueAcumulan, estadoSancion, sancionesDelPartido } from './sanciones.js';
import { tablaDePosiciones } from './tabla.js';
import type { EventoPartido, ResultadoPartido } from './tipos.js';

const equipos = (n: number) => Array.from({ length: n }, (_, i) => `E${String(i + 1).padStart(2, '0')}`);
const res = (
  id: string,
  l: string,
  v: string,
  gl: number,
  gv: number,
  extra: Partial<ResultadoPartido> = {},
): ResultadoPartido => ({
  id,
  localId: l,
  visitanteId: v,
  golesLocal: gl,
  golesVisitante: gv,
  ...extra,
});

describe('fixture: todos contra todos', () => {
  for (const n of [2, 3, 4, 7, 10, 16, 24]) {
    it(`${n} equipos: cada par se cruza una vez y nadie juega dos veces por fecha`, () => {
      const fechas = todosContraTodos(equipos(n));
      expect(fechas).toHaveLength(n % 2 === 0 ? n - 1 : n);
      const pares = new Set<string>();
      for (const f of fechas) {
        const enFecha = f.cruces.flatMap((c) => [c.localId, c.visitanteId]);
        expect(new Set(enFecha).size).toBe(enFecha.length);
        for (const c of f.cruces) pares.add([c.localId, c.visitanteId].sort().join('-'));
      }
      expect(pares.size).toBe((n * (n - 1)) / 2);
    });
  }

  it('equilibra la localía: nadie tiene más de 2 partidos de diferencia entre local y visitante', () => {
    const fechas = todosContraTodos(equipos(16));
    const local = new Map<string, number>();
    for (const c of fechas.flatMap((f) => f.cruces)) local.set(c.localId, (local.get(c.localId) ?? 0) + 1);
    for (const id of equipos(16)) {
      const l = local.get(id) ?? 0;
      expect(Math.abs(l - (15 - l))).toBeLessThanOrEqual(2);
    }
  });

  it('con impares, cada equipo queda libre exactamente una vez', () => {
    const libres = todosContraTodos(equipos(7)).map((f) => f.libre);
    expect(new Set(libres).size).toBe(7);
  });

  it('ida y vuelta invierte la localía', () => {
    const fechas = todosContraTodos(equipos(4), true);
    expect(fechas).toHaveLength(6);
    expect(fechas[3]!.cruces[0]).toEqual({
      localId: fechas[0]!.cruces[0]!.visitanteId,
      visitanteId: fechas[0]!.cruces[0]!.localId,
    });
  });

  it('24 equipos con ida y vuelta se arma en menos de 10 segundos', () => {
    const t = Date.now();
    const p = programar(todosContraTodos(equipos(24), true), {
      primerDia: '2027-03-06',
      diasEntreFechas: 7,
      horarios: ['09:00', '10:00', '11:00', '12:00'],
      canchaIds: ['A', 'B', 'C'],
    });
    expect(Date.now() - t).toBeLessThan(10_000);
    expect(p).toHaveLength(552);
    expect(detectarConflictos(p)).toEqual([]);
  });

  it('cantidad de partidos para la vista previa', () => {
    expect(cantidadDePartidos(16, 'LIGA')).toBe(120);
    expect(cantidadDePartidos(16, 'LIGA', true)).toBe(240);
    expect(cantidadDePartidos(16, 'COPA')).toBe(15);
  });
});

describe('fixture: programación', () => {
  it('asigna una fecha por semana, sin choques de cancha', () => {
    const p = programar(todosContraTodos(equipos(6)), {
      primerDia: '2027-03-06',
      diasEntreFechas: 7,
      horarios: ['19:00', '20:00'],
      canchaIds: ['A', 'B'],
    });
    expect(p.filter((x) => x.fecha === 2).every((x) => x.dia === '2027-03-13')).toBe(true);
    expect(p[0]!.inicio).toBe('2027-03-06T19:00:00-03:00');
    expect(detectarConflictos(p)).toEqual([]);
  });

  it('explica cuando no alcanzan las franjas', () => {
    expect(() =>
      programar(todosContraTodos(equipos(8)), {
        primerDia: '2027-03-06',
        diasEntreFechas: 7,
        horarios: ['19:00'],
        canchaIds: ['A'],
      }),
    ).toThrow(/Sumá horarios o canchas/);
  });

  it('detecta un partido movido a una cancha ocupada', () => {
    const p = programar(todosContraTodos(equipos(4)), {
      primerDia: '2027-03-06',
      diasEntreFechas: 7,
      horarios: ['19:00'],
      canchaIds: ['A', 'B'],
    });
    p[1] = { ...p[1]!, canchaId: 'A' };
    expect(detectarConflictos(p).map((c) => c.tipo)).toContain('CANCHA_OCUPADA');
  });
});

describe('acta', () => {
  const ev = (
    id: string,
    tipo: EventoPartido['tipo'],
    equipoId: string,
    jugadorId?: string,
    anulaA?: string,
  ): EventoPartido => ({ id, tipo, equipoId, jugadorId: jugadorId ?? null, anulaA: anulaA ?? null });

  it('calcula el marcador con goles en contra y anulaciones', () => {
    const eventos = [
      ev('1', 'GOL', 'L', 'a'),
      ev('2', 'GOL', 'V', 'b'),
      ev('3', 'GOL_EN_CONTRA', 'V', 'c'),
      ev('4', 'GOL', 'L', 'a'),
      ev('5', 'ANULACION', 'L', undefined, '4'),
    ];
    expect(marcador(eventos, 'L', 'V')).toEqual({ local: 2, visitante: 1 });
  });

  it('goleadores no cuenta goles en contra ni anulados', () => {
    const eventos = [
      ev('1', 'GOL', 'L', 'a'),
      ev('2', 'GOL', 'L', 'a'),
      ev('3', 'GOL_EN_CONTRA', 'V', 'b'),
      ev('4', 'ANULACION', 'L', undefined, '2'),
    ];
    expect(goleadores(eventos)).toEqual([{ jugadorId: 'a', equipoId: 'L', goles: 1 }]);
  });
});

describe('tabla de posiciones', () => {
  it('suma puntos 3-1-0 y ordena', () => {
    const t = tablaDePosiciones(
      ['A', 'B', 'C'],
      [res('1', 'A', 'B', 2, 0), res('2', 'B', 'C', 1, 1), res('3', 'C', 'A', 0, 1)],
      R,
    );
    // B y C empatan en puntos; C tiene mejor diferencia de gol (-1 contra -2).
    expect(t.map((f) => [f.equipoId, f.pts])).toEqual([
      ['A', 6],
      ['C', 1],
      ['B', 1],
    ]);
    expect(t[0]).toMatchObject({ pj: 2, pg: 2, gf: 3, gc: 0, dg: 3, posicion: 1 });
  });

  it('desempata por diferencia de gol y después por goles a favor', () => {
    const t = tablaDePosiciones(
      ['A', 'B', 'C', 'D'],
      [res('1', 'A', 'D', 3, 0), res('2', 'B', 'D', 4, 1), res('3', 'C', 'D', 1, 0)],
      R,
    );
    expect(t.slice(0, 3).map((f) => f.equipoId)).toEqual(['B', 'A', 'C']);
  });

  it('desempata por resultado entre sí cuando empatan puntos, diferencia y goles', () => {
    // B y C: 3 puntos, diferencia 0 y 1 gol a favor. C le ganó a B, así que va arriba (aunque B sea primero alfabéticamente).
    const t = tablaDePosiciones(
      ['A', 'B', 'C', 'D'],
      [res('1', 'C', 'B', 1, 0), res('2', 'B', 'D', 1, 0), res('3', 'A', 'C', 1, 0)],
      R,
    );
    expect(t.map((f) => f.equipoId)).toEqual(['A', 'C', 'B', 'D']);
  });

  it('usa juego limpio antes del sorteo', () => {
    const t = tablaDePosiciones(
      ['A', 'B'],
      [
        res('1', 'A', 'B', 1, 1, {
          tarjetas: [
            { equipoId: 'A', amarillas: 3, rojas: 0 },
            { equipoId: 'B', amarillas: 1, rojas: 0 },
          ],
        }),
      ],
      R,
    );
    expect(t.map((f) => f.equipoId)).toEqual(['B', 'A']);
  });

  it('W.O. da la victoria por el resultado del reglamento', () => {
    const t = tablaDePosiciones(['A', 'B'], [res('1', 'A', 'B', 0, 0, { ganadorWO: 'B' })], R);
    expect(t[0]).toMatchObject({ equipoId: 'B', pts: 3, gf: 3 });
  });
});

describe('sanciones automáticas', () => {
  const ev = (id: string, tipo: EventoPartido['tipo'], jugadorId: string): EventoPartido => ({
    id,
    tipo,
    equipoId: 'L',
    jugadorId,
  });

  it('roja directa: 1 partido', () => {
    expect(sancionesDelPartido([ev('1', 'ROJA', 'a')], new Map(), R)).toEqual([
      { jugadorId: 'a', equipoId: 'L', causa: 'ROJA_DIRECTA', partidos: 1 },
    ]);
  });

  it('doble amarilla: 1 partido y no suma a la acumulación', () => {
    const eventos = [ev('1', 'AMARILLA', 'a'), ev('2', 'AMARILLA', 'a'), ev('3', 'ROJA', 'a')];
    expect(sancionesDelPartido(eventos, new Map([['a', 4]]), R)).toEqual([
      { jugadorId: 'a', equipoId: 'L', causa: 'DOBLE_AMARILLA', partidos: 1 },
    ]);
    expect(amarillasQueAcumulan(eventos).get('a')).toBe(0);
  });

  it('acumulación: la quinta amarilla suspende', () => {
    expect(sancionesDelPartido([ev('1', 'AMARILLA', 'a')], new Map([['a', 4]]), R)).toEqual([
      { jugadorId: 'a', equipoId: 'L', causa: 'ACUMULACION', partidos: 1 },
    ]);
    expect(sancionesDelPartido([ev('1', 'AMARILLA', 'a')], new Map([['a', 3]]), R)).toEqual([]);
    expect(sancionesDelPartido([ev('1', 'AMARILLA', 'a')], new Map([['a', 9]]), R)).toHaveLength(1);
  });

  it('una tarjeta anulada no sanciona', () => {
    expect(
      sancionesDelPartido(
        [ev('1', 'ROJA', 'a'), { id: '2', tipo: 'ANULACION', equipoId: 'L', anulaA: '1' }],
        new Map(),
        R,
      ),
    ).toEqual([]);
  });

  it('se cumple con partidos oficiales jugados después', () => {
    expect(estadoSancion(2, 1)).toEqual({ cumplidos: 1, restantes: 1, activa: true });
    expect(estadoSancion(1, 3)).toEqual({ cumplidos: 1, restantes: 0, activa: false });
  });
});

describe('cobros', () => {
  it('comisión según plan, solo con Mercado Pago', () => {
    expect(comisionPlataforma(960_000, 'LIGA', 'MERCADO_PAGO')).toBe(33_600);
    expect(comisionPlataforma(960_000, 'FUNDADORA', 'MERCADO_PAGO')).toBe(24_000);
    expect(comisionPlataforma(960_000, 'PRO', 'MERCADO_PAGO')).toBe(19_200);
    expect(comisionPlataforma(960_000, 'LIGA', 'EFECTIVO')).toBe(0);
  });
});
