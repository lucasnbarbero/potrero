import { describe, expect, it } from 'vitest';
import {
  designarAutomatico,
  estaDisponible,
  formatearDisponibilidad,
  momentoLocal,
  ocupacionDeCanchas,
  parsearDisponibilidad,
} from './arbitros.js';

// Sábado 7/11/2026 en Argentina (UTC-3).
const sab = (h: number) => `2026-11-07T${String(h + 3).padStart(2, '0')}:00:00.000Z`;
const dom = (h: number) => `2026-11-08T${String(h + 3).padStart(2, '0')}:00:00.000Z`;

describe('árbitros: disponibilidad', () => {
  it('el momento se lee en la hora de Argentina', () => {
    expect(momentoLocal(sab(14))).toEqual({ dia: 6, hora: '14:00', fecha: '2026-11-07' });
    expect(momentoLocal('2026-11-08T01:30:00.000Z')).toEqual({ dia: 6, hora: '22:30', fecha: '2026-11-07' });
  });

  it('sin franjas cargadas está disponible siempre', () => {
    expect(estaDisponible(null, sab(14))).toBe(true);
    expect(estaDisponible([], sab(14))).toBe(true);
    expect(estaDisponible(undefined, sab(14))).toBe(true);
  });

  it('con franjas, el partido tiene que caer dentro de alguna (el final no cuenta)', () => {
    const franjas = [{ dia: 6, desde: '14:00', hasta: '18:00' }];
    expect(estaDisponible(franjas, sab(14))).toBe(true);
    expect(estaDisponible(franjas, sab(17))).toBe(true);
    expect(estaDisponible(franjas, sab(18))).toBe(false);
    expect(estaDisponible(franjas, sab(13))).toBe(false);
    expect(estaDisponible(franjas, dom(15))).toBe(false); // otro día
  });
});

describe('árbitros: designación automática', () => {
  const partidos = [
    { id: 'p1', inicio: sab(14) },
    { id: 'p2', inicio: sab(14) },
    { id: 'p3', inicio: sab(15) },
    { id: 'p4', inicio: sab(16) },
  ];

  it('nunca le da dos partidos en la misma franja al mismo árbitro', () => {
    const r = designarAutomatico(partidos, [{ id: 'a' }, { id: 'b' }]);
    expect(r.sinAsignar).toEqual([]);
    const porFranja = new Map<string, string[]>();
    for (const a of r.asignaciones) {
      const inicio = partidos.find((p) => p.id === a.partidoId)!.inicio;
      porFranja.set(inicio, [...(porFranja.get(inicio) ?? []), a.arbitroId]);
    }
    for (const arbs of porFranja.values()) expect(new Set(arbs).size).toBe(arbs.length);
  });

  it('reparte parejo la cantidad de partidos', () => {
    const r = designarAutomatico(partidos, [{ id: 'a' }, { id: 'b' }]);
    const cuenta = (id: string) => r.asignaciones.filter((x) => x.arbitroId === id).length;
    expect(Math.abs(cuenta('a') - cuenta('b'))).toBeLessThanOrEqual(1);
  });

  it('deja sin asignar lo que no puede cubrir y dice por qué', () => {
    // Dos partidos a la misma hora y un solo árbitro.
    const r = designarAutomatico(partidos.slice(0, 2), [{ id: 'a' }]);
    expect(r.asignaciones).toHaveLength(1);
    expect(r.sinAsignar).toEqual([
      { partidoId: 'p2', motivo: 'Todos los árbitros disponibles ya dirigen a esa hora.' },
    ]);
  });

  it('respeta la disponibilidad de cada árbitro', () => {
    const arbitros = [
      { id: 'a', disponibilidad: [{ dia: 6, desde: '14:00', hasta: '16:00' }] },
      { id: 'b', disponibilidad: [{ dia: 6, desde: '16:00', hasta: '20:00' }] },
    ];
    const r = designarAutomatico(
      [
        { id: 'p3', inicio: sab(15) },
        { id: 'p4', inicio: sab(16) },
      ],
      arbitros,
    );
    expect(r.asignaciones).toEqual([
      { partidoId: 'p3', arbitroId: 'a' },
      { partidoId: 'p4', arbitroId: 'b' },
    ]);
    const nadie = designarAutomatico([{ id: 'x', inicio: dom(15) }], arbitros);
    expect(nadie.sinAsignar[0]!.motivo).toBe('Ningún árbitro está disponible a esa hora.');
  });

  it('tiene en cuenta lo ya designado: la franja ocupada y la carga previa', () => {
    const ocupados = [{ arbitroId: 'a', inicio: sab(14) }];
    const r = designarAutomatico(
      [
        { id: 'p1', inicio: sab(14) },
        { id: 'p3', inicio: sab(15) },
      ],
      [{ id: 'a' }, { id: 'b' }],
      ocupados,
    );
    expect(r.asignaciones).toEqual([
      { partidoId: 'p1', arbitroId: 'b' }, // a ya dirige a las 14
      { partidoId: 'p3', arbitroId: 'a' }, // b ya lleva uno más que a? a lleva 1 previo, b 1 recién asignado: gana el id menor
    ]);
  });

  it('ignora a los árbitros inactivos y avisa si no hay ninguno', () => {
    const r = designarAutomatico(partidos.slice(0, 1), [{ id: 'a', activo: false }]);
    expect(r.sinAsignar[0]!.motivo).toBe('No hay árbitros cargados.');
  });

  it('con el mismo punto de partida da siempre el mismo resultado', () => {
    const arbitros = [{ id: 'b' }, { id: 'a' }, { id: 'c' }];
    expect(designarAutomatico(partidos, arbitros)).toEqual(
      designarAutomatico([...partidos].reverse(), arbitros),
    );
  });
});

describe('canchas: ocupación', () => {
  const ps = [
    { canchaId: 'c1', inicio: sab(14) },
    { canchaId: 'c2', inicio: sab(14) },
    { canchaId: 'c1', inicio: sab(15) },
    { canchaId: 'c1', inicio: dom(14) },
  ];

  it('mide partidos de la cancha sobre las franjas que la liga usa ese día', () => {
    expect(ocupacionDeCanchas(ps, ['c1', 'c2', 'c3'], '2026-11-07')).toEqual([
      { canchaId: 'c1', partidos: 2, franjas: 2, pct: 100 },
      { canchaId: 'c2', partidos: 1, franjas: 2, pct: 50 },
      { canchaId: 'c3', partidos: 0, franjas: 2, pct: 0 },
    ]);
  });

  it('un día sin partidos da 0 %', () => {
    expect(ocupacionDeCanchas(ps, ['c1'], '2026-11-10')).toEqual([
      { canchaId: 'c1', partidos: 0, franjas: 0, pct: 0 },
    ]);
  });

  it('ignora los partidos sin cancha', () => {
    expect(ocupacionDeCanchas([{ canchaId: null, inicio: sab(14) }], ['c1'], '2026-11-07')[0]!.franjas).toBe(
      0,
    );
  });
});

describe('árbitros: texto de disponibilidad', () => {
  it('lee días, horas y varias franjas', () => {
    expect(parsearDisponibilidad('sáb 14:00-22:00, dom 10:00 - 14:00')).toEqual([
      { dia: 6, desde: '14:00', hasta: '22:00' },
      { dia: 0, desde: '10:00', hasta: '14:00' },
    ]);
  });

  it('acepta mayúsculas, sin tildes, días largos y horas sin cero adelante', () => {
    expect(parsearDisponibilidad('SABADO 9:00-13:00; Miércoles 18:30 a 21:00')).toEqual([
      { dia: 6, desde: '09:00', hasta: '13:00' },
      { dia: 3, desde: '18:30', hasta: '21:00' },
    ]);
  });

  it('un texto vacío es disponible siempre', () => {
    expect(parsearDisponibilidad('')).toEqual([]);
    expect(parsearDisponibilidad('  , ')).toEqual([]);
  });

  it('avisa cuál franja no entendió', () => {
    expect(() => parsearDisponibilidad('sáb 14:00-22:00, cuando pueda')).toThrow(
      /No entendimos "cuando pueda"/,
    );
    expect(() => parsearDisponibilidad('xyz 14:00-22:00')).toThrow(/No entendimos/);
    expect(() => parsearDisponibilidad('sáb 25:00-26:00')).toThrow(/No entendimos/);
    expect(() => parsearDisponibilidad('sáb 18:00-14:00')).toThrow(/No entendimos/);
  });

  it('formatea y vuelve a leer lo mismo', () => {
    const franjas = [
      { dia: 6, desde: '14:00', hasta: '22:00' },
      { dia: 0, desde: '10:00', hasta: '14:00' },
    ];
    expect(formatearDisponibilidad(franjas)).toBe('sáb 14:00-22:00, dom 10:00-14:00');
    expect(parsearDisponibilidad(formatearDisponibilidad(franjas))).toEqual(franjas);
    expect(formatearDisponibilidad([])).toBe('');
  });
});
