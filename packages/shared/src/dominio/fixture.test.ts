// Mover un partido a mano e intercambiar horarios de una fecha (E09-07): conflictos con su causa, sin bloquear.
import { describe, expect, it } from 'vitest';
import { evaluarCambioDeProgramacion, type PartidoDeLaGrilla } from './fixture.js';

// Sábado 7/11/2026 en Argentina (UTC-3): la hora local + 3 es la hora UTC.
const sab = (hora: number) => new Date(Date.UTC(2026, 10, 7, hora + 3)).toISOString();
const dom = (hora: number) => new Date(Date.UTC(2026, 10, 8, hora + 3)).toISOString();
const p = (
  id: string,
  inicio: string,
  canchaId: string | null,
  local: string,
  visitante: string,
  extra: Partial<PartidoDeLaGrilla> = {},
): PartidoDeLaGrilla => ({
  id,
  inicio,
  canchaId,
  localId: local,
  visitanteId: visitante,
  torneoId: 't1',
  fecha: 1,
  ...extra,
});

// Fecha 1 del torneo t1: tres partidos en dos canchas. Otro torneo usa la cancha c2 el domingo.
const calendario = [
  p('a', sab(20), 'c1', 'A', 'B', { arbitroId: 'r1' }),
  p('b', sab(21), 'c1', 'C', 'D', { arbitroId: 'r2' }),
  p('c', sab(20), 'c2', 'E', 'F', { arbitroId: 'r3' }),
  p('x', dom(10), 'c2', 'A', 'Z', { torneoId: 't2', fecha: 3 }),
];

describe('mover un partido a mano', () => {
  it('a una franja libre: el movimiento sin conflictos', () => {
    const r = evaluarCambioDeProgramacion(calendario, {
      tipo: 'MOVER',
      partidoId: 'b',
      a: { inicio: sab(22), canchaId: 'c2' },
    });
    expect(r.movimientos).toEqual([
      { partidoId: 'b', de: { inicio: sab(21), canchaId: 'c1' }, a: { inicio: sab(22), canchaId: 'c2' } },
    ]);
    expect(r.conflictos).toEqual([]);
  });

  it('a una cancha ocupada en esa franja: lo advierte con el partido que la ocupa', () => {
    const r = evaluarCambioDeProgramacion(calendario, {
      tipo: 'MOVER',
      partidoId: 'b',
      a: { inicio: sab(20), canchaId: 'c2' },
    });
    expect(r.conflictos).toContainEqual(
      expect.objectContaining({ tipo: 'CANCHA_OCUPADA', partidoId: 'b', conPartidoId: 'c' }),
    );
  });

  it('un equipo con dos partidos el mismo día (de otro torneo también)', () => {
    const r = evaluarCambioDeProgramacion(calendario, {
      tipo: 'MOVER',
      partidoId: 'a',
      a: { inicio: dom(18), canchaId: 'c1' },
    });
    expect(r.conflictos).toEqual([
      expect.objectContaining({
        tipo: 'EQUIPO_DOBLE',
        conPartidoId: 'x',
        mensaje: 'Un equipo juega dos partidos el mismo día.',
      }),
    ]);
  });

  it('un equipo con dos partidos a la vez: lo dice así', () => {
    const r = evaluarCambioDeProgramacion(calendario, {
      tipo: 'MOVER',
      partidoId: 'a',
      a: { inicio: dom(10), canchaId: 'c1' },
    });
    expect(r.conflictos).toEqual([
      expect.objectContaining({
        tipo: 'EQUIPO_DOBLE',
        mensaje: 'Un equipo juega dos partidos a la misma hora.',
      }),
    ]);
  });

  it('el árbitro designado ya dirige otro partido en esa franja', () => {
    const r = evaluarCambioDeProgramacion(
      calendario,
      { tipo: 'MOVER', partidoId: 'b', a: { inicio: sab(20), canchaId: 'c3' } },
      { arbitros: [{ id: 'r2', nombre: 'Juan Vera' }] },
    );
    expect(r.conflictos).toEqual([]);
    const conR2 = calendario.map((x) => (x.id === 'c' ? { ...x, arbitroId: 'r2' } : x));
    const r2 = evaluarCambioDeProgramacion(
      conR2,
      { tipo: 'MOVER', partidoId: 'b', a: { inicio: sab(20), canchaId: 'c3' } },
      { arbitros: [{ id: 'r2', nombre: 'Juan Vera' }] },
    );
    expect(r2.conflictos).toEqual([
      expect.objectContaining({
        tipo: 'ARBITRO_OCUPADO',
        partidoId: 'b',
        conPartidoId: 'c',
        mensaje: expect.stringContaining('Juan Vera ya dirige otro partido'),
      }),
    ]);
  });

  it('el árbitro designado no está disponible a esa hora: advierte y sigue designado', () => {
    const r = evaluarCambioDeProgramacion(
      calendario,
      { tipo: 'MOVER', partidoId: 'a', a: { inicio: sab(23), canchaId: 'c1' } },
      // Sábado (6) de 14 a 22: a las 23 queda afuera.
      {
        arbitros: [
          { id: 'r1', nombre: 'Marta Costa', disponibilidad: [{ dia: 6, desde: '14:00', hasta: '22:00' }] },
        ],
      },
    );
    expect(r.conflictos).toEqual([
      expect.objectContaining({ tipo: 'ARBITRO_NO_DISPONIBLE', partidoId: 'a', conPartidoId: null }),
    ]);
  });

  it('a una cancha bloqueada: lo advierte con el motivo', () => {
    const r = evaluarCambioDeProgramacion(
      calendario,
      { tipo: 'MOVER', partidoId: 'b', a: { inicio: sab(22), canchaId: 'c9' } },
      { canchas: [{ id: 'c9', nombre: 'Cancha 9', bloqueada: true, motivoBloqueo: 'Mantenimiento' }] },
    );
    expect(r.conflictos).toEqual([
      expect.objectContaining({
        tipo: 'CANCHA_BLOQUEADA',
        mensaje: 'La cancha Cancha 9 está bloqueada (Mantenimiento).',
      }),
    ]);
  });

  it('acepta el inicio con la zona de Argentina y lo compara normalizado', () => {
    const r = evaluarCambioDeProgramacion(calendario, {
      tipo: 'MOVER',
      partidoId: 'b',
      a: { inicio: '2026-11-07T20:00:00-03:00', canchaId: 'c2' },
    });
    expect(r.movimientos[0]!.a.inicio).toBe(sab(20));
    expect(r.conflictos.map((x) => x.tipo)).toContain('CANCHA_OCUPADA');
  });

  it('al mismo lugar en el que ya está: falla con un mensaje claro', () => {
    expect(() =>
      evaluarCambioDeProgramacion(calendario, {
        tipo: 'MOVER',
        partidoId: 'a',
        a: { inicio: sab(20), canchaId: 'c1' },
      }),
    ).toThrow('El partido ya está en ese día, horario y cancha.');
  });

  it('un partido que no está en el calendario: falla', () => {
    expect(() =>
      evaluarCambioDeProgramacion(calendario, {
        tipo: 'MOVER',
        partidoId: 'nada',
        a: { inicio: sab(20), canchaId: 'c1' },
      }),
    ).toThrow('No encontramos el partido');
  });
});

describe('intercambiar horarios de una fecha', () => {
  it('"este a las 20 y aquel a las 21": se cambian el lugar sin conflictos', () => {
    const r = evaluarCambioDeProgramacion(calendario, {
      tipo: 'INTERCAMBIAR',
      partidoId: 'a',
      conPartidoId: 'b',
    });
    expect(r.movimientos).toEqual([
      { partidoId: 'a', de: { inicio: sab(20), canchaId: 'c1' }, a: { inicio: sab(21), canchaId: 'c1' } },
      { partidoId: 'b', de: { inicio: sab(21), canchaId: 'c1' }, a: { inicio: sab(20), canchaId: 'c1' } },
    ]);
    expect(r.conflictos).toEqual([]);
  });

  it('si el árbitro de uno queda con otro partido en la nueva franja, lo avisa', () => {
    // b (r3) pasa a las 20, donde r3 ya dirige c en la otra cancha.
    const conR3 = calendario.map((x) => (x.id === 'b' ? { ...x, arbitroId: 'r3' } : x));
    const r = evaluarCambioDeProgramacion(conR3, { tipo: 'INTERCAMBIAR', partidoId: 'b', conPartidoId: 'a' });
    expect(r.conflictos).toEqual([
      expect.objectContaining({ tipo: 'ARBITRO_OCUPADO', partidoId: 'b', conPartidoId: 'c' }),
    ]);
  });

  it('dos partidos que comparten árbitro: al cambiarse de franja no chocan entre sí', () => {
    const r = evaluarCambioDeProgramacion(
      [
        p('a', sab(20), 'c1', 'A', 'B', { arbitroId: 'r1' }),
        p('b', sab(21), 'c1', 'C', 'D', { arbitroId: 'r1' }),
      ],
      { tipo: 'INTERCAMBIAR', partidoId: 'a', conPartidoId: 'b' },
    );
    expect(r.conflictos).toEqual([]);
  });

  it('solo dentro de la misma fecha del torneo', () => {
    expect(() =>
      evaluarCambioDeProgramacion(calendario, { tipo: 'INTERCAMBIAR', partidoId: 'a', conPartidoId: 'x' }),
    ).toThrow('Solo se pueden intercambiar partidos de la misma fecha del torneo.');
  });

  it('con el mismo partido: falla', () => {
    expect(() =>
      evaluarCambioDeProgramacion(calendario, { tipo: 'INTERCAMBIAR', partidoId: 'a', conPartidoId: 'a' }),
    ).toThrow('Elegí otro partido para intercambiar.');
  });
});
