import { describe, expect, it } from 'vitest';
import {
  diaArgentina,
  equiposAfectados,
  type PartidoCalendario,
  proponerReprogramacion,
  sumarDiasAlInstante,
} from './reprogramacion.js';

// Sábado 7/11/2026 a las 14:00, 15:00 y 16:00 en Argentina (UTC-3).
const sab = (hora: number) => `2026-11-07T${String(hora + 3).padStart(2, '0')}:00:00.000Z`;
const dom = (hora: number) => `2026-11-08T${String(hora + 3).padStart(2, '0')}:00:00.000Z`;
const p = (
  id: string,
  inicio: string,
  canchaId: string | null,
  local: string,
  visitante: string,
): PartidoCalendario => ({
  id,
  inicio,
  canchaId,
  localId: local,
  visitanteId: visitante,
});

describe('reprogramación: fechas', () => {
  it('el día se cuenta en la hora de Argentina, no en UTC', () => {
    expect(diaArgentina('2026-11-08T01:30:00.000Z')).toBe('2026-11-07'); // 22:30 del sábado
    expect(diaArgentina('2026-11-08T03:00:00.000Z')).toBe('2026-11-08');
  });

  it('mover días conserva la hora local', () => {
    expect(sumarDiasAlInstante(sab(14), 1)).toBe(dom(14));
    expect(sumarDiasAlInstante(sab(14), 7)).toBe('2026-11-14T17:00:00.000Z');
    expect(sumarDiasAlInstante(sab(14), -1)).toBe('2026-11-06T17:00:00.000Z');
  });
});

describe('reprogramación: mover días', () => {
  const afectados = [
    p('p1', sab(14), 'c1', 'A', 'B'),
    p('p2', sab(15), 'c2', 'C', 'D'),
    p('p3', sab(16), 'c1', 'E', 'F'),
  ];

  it('mueve todo al domingo con los mismos horarios y canchas, sin conflictos', () => {
    const r = proponerReprogramacion(afectados, [], { tipo: 'MOVER', dias: 1 });
    expect(r.movimientos).toHaveLength(3);
    expect(r.movimientos[0]).toEqual({
      partidoId: 'p1',
      de: { inicio: sab(14), canchaId: 'c1' },
      a: { inicio: dom(14), canchaId: 'c1' },
    });
    expect(r.conflictos).toEqual([]);
    expect(r.sinResolver).toEqual([]);
  });

  it('avisa si la cancha ya está ocupada el día nuevo a esa hora', () => {
    const resto = [p('x', dom(14), 'c1', 'Y', 'Z')];
    const r = proponerReprogramacion(afectados, resto, { tipo: 'MOVER', dias: 1 });
    expect(r.conflictos).toEqual([
      {
        tipo: 'CANCHA_OCUPADA',
        partidoId: 'p1',
        conPartidoId: 'x',
        mensaje: 'La cancha ya está ocupada a esa hora.',
      },
    ]);
    expect(r.movimientos).toHaveLength(3); // advierte, no bloquea
  });

  it('avisa si un equipo termina jugando dos partidos el mismo día', () => {
    const resto = [p('x', dom(18), 'c3', 'A', 'Q')]; // A ya juega el domingo
    const r = proponerReprogramacion(afectados, resto, { tipo: 'MOVER', dias: 1 });
    expect(r.conflictos.map((c) => [c.tipo, c.partidoId, c.conPartidoId])).toEqual([
      ['EQUIPO_DOBLE', 'p1', 'x'],
    ]);
  });

  it('un partido que ya no coincide en el día no genera conflicto', () => {
    const resto = [p('x', '2026-11-09T22:00:00.000Z', 'c1', 'A', 'B')];
    expect(proponerReprogramacion(afectados, resto, { tipo: 'MOVER', dias: 1 }).conflictos).toEqual([]);
  });

  it('detecta choques entre los propios partidos movidos solo una vez', () => {
    const dos = [p('a', sab(14), 'c1', 'A', 'B'), p('b', sab(14), 'c2', 'C', 'A')];
    const r = proponerReprogramacion(dos, [], { tipo: 'MOVER', dias: 1 });
    expect(r.conflictos).toHaveLength(1);
    expect(r.conflictos[0]!.tipo).toBe('EQUIPO_DOBLE');
  });

  it('una semana (suspender la fecha) mueve 7 días', () => {
    const r = proponerReprogramacion(afectados, [], { tipo: 'MOVER', dias: 7 });
    expect(r.movimientos[0]!.a.inicio).toBe('2026-11-14T17:00:00.000Z');
  });

  it('pide un número de días válido', () => {
    expect(() => proponerReprogramacion(afectados, [], { tipo: 'MOVER', dias: 0 })).toThrow(/cuántos días/);
    expect(() => proponerReprogramacion(afectados, [], { tipo: 'MOVER', dias: 1.5 })).toThrow();
  });
});

describe('reprogramación: cambiar de cancha', () => {
  const afectados = [
    p('p1', sab(14), 'c1', 'A', 'B'),
    p('p2', sab(14), 'c2', 'C', 'D'),
    p('p3', sab(14), 'c3', 'E', 'F'),
    p('p4', sab(15), 'c1', 'G', 'H'),
  ];

  it('pasa a las canchas techadas mientras haya lugar y marca lo que no entra', () => {
    const r = proponerReprogramacion(afectados, [], { tipo: 'CAMBIAR_CANCHA', canchaIds: ['t1', 't2'] });
    // A las 14 entran dos partidos (hay dos techadas); el tercero no.
    expect(r.movimientos.map((m) => [m.partidoId, m.a.canchaId])).toEqual([
      ['p1', 't1'],
      ['p2', 't2'],
      ['p4', 't1'],
    ]);
    expect(r.sinResolver).toEqual([
      { partidoId: 'p3', motivo: 'No hay una cancha de destino libre a esa hora.' },
    ]);
    expect(r.movimientos.every((m) => m.a.inicio === m.de.inicio)).toBe(true); // mismo horario
  });

  it('no usa una cancha de destino que ya está ocupada a esa hora', () => {
    const resto = [p('x', sab(14), 't1', 'Y', 'Z')];
    const r = proponerReprogramacion(afectados.slice(0, 1), resto, {
      tipo: 'CAMBIAR_CANCHA',
      canchaIds: ['t1', 't2'],
    });
    expect(r.movimientos[0]!.a.canchaId).toBe('t2');
  });

  it('no "mueve" un partido a la cancha en la que ya estaba', () => {
    const r = proponerReprogramacion(afectados.slice(0, 1), [], {
      tipo: 'CAMBIAR_CANCHA',
      canchaIds: ['c1'],
    });
    expect(r.movimientos).toEqual([]);
    expect(r.sinResolver).toHaveLength(1);
  });

  it('pide al menos una cancha de destino', () => {
    expect(() => proponerReprogramacion(afectados, [], { tipo: 'CAMBIAR_CANCHA', canchaIds: [] })).toThrow(
      /al menos una cancha/,
    );
  });
});

describe('reprogramación: equipos afectados', () => {
  it('cuenta cada equipo una sola vez', () => {
    expect(
      equiposAfectados([p('1', sab(14), null, 'A', 'B'), p('2', sab(15), null, 'B', 'C')]).sort(),
    ).toEqual(['A', 'B', 'C']);
  });
});
