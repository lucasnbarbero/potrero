import { describe, expect, it } from 'vitest';
import {
  armarLlave,
  cantidadDeClasificados,
  clasificadosDeLiga,
  cuadroDeGrupos,
  ganadorDelCruce,
  llaveDesdeCuadro,
  ordenDeSiembra,
  repartirEnGrupos,
  resolverLlave,
  sortear,
  type ResultadoLlave,
} from './llaves.js';

const equipos = (n: number) => Array.from({ length: n }, (_, i) => `E${i + 1}`);
const gana = (golesLocal: number, golesVisitante: number): ResultadoLlave => ({ golesLocal, golesVisitante });

describe('llaves: siembra y armado', () => {
  it('ordena las semillas para que la 1 y la 2 solo se crucen en la final', () => {
    expect(ordenDeSiembra(2)).toEqual([1, 2]);
    expect(ordenDeSiembra(4)).toEqual([1, 4, 2, 3]);
    expect(ordenDeSiembra(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it('rechaza tamaños que no son potencia de dos', () => {
    expect(() => ordenDeSiembra(6)).toThrow();
    expect(() => llaveDesdeCuadro(['a', 'b', 'c'])).toThrow();
  });

  it('8 equipos: cuartos 1-8, 4-5, 2-7, 3-6, semifinales y final', () => {
    const llave = armarLlave(equipos(8));
    expect(llave.rondas.map((r) => [r.nombre, r.partidos.length])).toEqual([
      ['Cuartos de final', 4],
      ['Semifinales', 2],
      ['Final', 1],
    ]);
    const cuartos = llave.rondas[0]!.partidos.map((p) =>
      [p.local, p.visitante].map((o) => (o.tipo === 'equipo' ? o.equipoId : '?')),
    );
    expect(cuartos).toEqual([
      ['E1', 'E8'],
      ['E4', 'E5'],
      ['E2', 'E7'],
      ['E3', 'E6'],
    ]);
  });

  it('2 equipos: solo la final', () => {
    const llave = armarLlave(equipos(2));
    expect(llave.rondas).toHaveLength(1);
    expect(llave.rondas[0]!.nombre).toBe('Final');
  });

  for (const n of [3, 5, 6, 7, 9, 12, 13]) {
    it(`${n} equipos: las mejores semillas pasan libres y hay n-1 partidos en total`, () => {
      const llave = armarLlave(equipos(n));
      const total = llave.rondas.reduce((s, r) => s + r.partidos.length, 0);
      expect(total).toBe(n - 1);
      // Cada equipo aparece una sola vez como origen directo.
      const directos = llave.rondas.flatMap((r) =>
        r.partidos.flatMap((p) =>
          [p.local, p.visitante].flatMap((o) => (o.tipo === 'equipo' ? [o.equipoId] : [])),
        ),
      );
      expect(new Set(directos).size).toBe(n);
      expect(directos).toHaveLength(n);
    });
  }

  it('con 6 equipos la 1ª y la 2ª semilla no juegan la primera ronda', () => {
    const llave = armarLlave(equipos(6));
    const primera = llave.rondas[0]!.partidos.flatMap((p) => [p.local, p.visitante]);
    const ids = primera.flatMap((o) => (o.tipo === 'equipo' ? [o.equipoId] : []));
    expect(ids).not.toContain('E1');
    expect(ids).not.toContain('E2');
    expect(ids).toHaveLength(4);
  });

  it('rechaza menos de 2 equipos y equipos repetidos', () => {
    expect(() => armarLlave(['E1'])).toThrow(/al menos 2/);
    expect(() => armarLlave(['E1', 'E1'])).toThrow(/repetido/);
  });
});

describe('llaves: resolución', () => {
  const llave = armarLlave(equipos(4)); // 1-4 y 2-3, final

  it('sin resultados, la primera ronda está lista y la final pendiente', () => {
    const r = resolverLlave(llave, {});
    expect(r.rondas[0]!.partidos.map((p) => p.estado)).toEqual(['LISTO', 'LISTO']);
    expect(r.rondas[1]!.partidos[0]!.estado).toBe('PENDIENTE');
    expect(r.campeonId).toBeUndefined();
  });

  it('el ganador avanza y la final se completa sola', () => {
    const r = resolverLlave(llave, { '1-1': gana(2, 0), '1-2': gana(1, 3) });
    const final = r.rondas[1]!.partidos[0]!;
    expect(final.localId).toBe('E1');
    expect(final.visitanteId).toBe('E3');
    expect(final.estado).toBe('LISTO');
  });

  it('un solo semifinalista definido deja la final pendiente con un lado conocido', () => {
    const final = resolverLlave(llave, { '1-1': gana(2, 0) }).rondas[1]!.partidos[0]!;
    expect(final.localId).toBe('E1');
    expect(final.visitanteId).toBeUndefined();
    expect(final.estado).toBe('PENDIENTE');
  });

  it('un empate sin penales queda sin definir y frena el cuadro', () => {
    const r = resolverLlave(llave, { '1-1': gana(1, 1), '1-2': gana(0, 1) });
    expect(r.rondas[0]!.partidos[0]!.estado).toBe('EMPATE_SIN_DEFINIR');
    expect(r.rondas[1]!.partidos[0]!.localId).toBeUndefined();
  });

  it('un empate se define por penales', () => {
    const r = resolverLlave(llave, {
      '1-1': { golesLocal: 1, golesVisitante: 1, penalesLocal: 3, penalesVisitante: 5 },
      '1-2': gana(2, 1),
      '2-1': gana(0, 2),
    });
    expect(r.rondas[0]!.partidos[0]!.ganadorId).toBe('E4');
    expect(r.campeonId).toBe('E2'); // la final es E4 (por penales) contra E2, y gana el visitante
  });

  it('el campeón es el ganador de la final', () => {
    const r = resolverLlave(llave, { '1-1': gana(1, 0), '1-2': gana(0, 1), '2-1': gana(2, 0) });
    expect(r.campeonId).toBe('E1');
  });

  it('penales empatados no definen al ganador', () => {
    expect(
      ganadorDelCruce('A', 'B', { golesLocal: 0, golesVisitante: 0, penalesLocal: 4, penalesVisitante: 4 }),
    ).toBeUndefined();
    expect(ganadorDelCruce('A', 'B', { golesLocal: 0, golesVisitante: 0, penalesLocal: 4 })).toBeUndefined();
  });

  it('un W.O. define al ganador aunque el marcador sea cualquiera', () => {
    expect(ganadorDelCruce('A', 'B', { golesLocal: 0, golesVisitante: 3, ganadorId: 'A' })).toBe('A');
  });

  it('los goles mandan sobre los penales cargados de más', () => {
    expect(
      ganadorDelCruce('A', 'B', { golesLocal: 2, golesVisitante: 1, penalesLocal: 0, penalesVisitante: 5 }),
    ).toBe('A');
  });

  it('con pases libres, el equipo libre ya está en la segunda ronda', () => {
    const l = armarLlave(equipos(3)); // E1 pasa libre (lugar 1-1 sin partido); juegan E2-E3 en 1-2
    expect(l.rondas[0]!.partidos.map((p) => p.clave)).toEqual(['1-2']);
    const r = resolverLlave(l, { '1-2': gana(0, 1) });
    const final = r.rondas[1]!.partidos[0]!;
    expect(final.localId).toBe('E1');
    expect(final.visitanteId).toBe('E3');
  });
});

describe('llaves: clasificación desde la liga', () => {
  it('clasifican potencia de dos, hasta 8', () => {
    expect([2, 3, 4, 5, 8, 9, 12, 16, 24].map(cantidadDeClasificados)).toEqual([2, 2, 4, 4, 8, 8, 8, 8, 8]);
    expect(cantidadDeClasificados(1)).toBe(0);
  });

  it('toma los primeros de la tabla en orden de semilla', () => {
    const tabla = equipos(6).map((equipoId) => ({ equipoId }));
    expect(clasificadosDeLiga(tabla, 4)).toEqual(['E1', 'E2', 'E3', 'E4']);
    expect(() => clasificadosDeLiga(tabla, 8)).toThrow(/tabla tiene 6/);
    expect(() => clasificadosDeLiga(tabla, 1)).toThrow();
  });
});

describe('sorteo con cabezas de serie', () => {
  it('con la misma semilla sale igual, con otra sale distinto', () => {
    const e = equipos(16);
    expect(sortear(e, [], 7)).toEqual(sortear(e, [], 7));
    expect(sortear(e, [], 7)).not.toEqual(sortear(e, [], 8));
  });

  it('mantiene a todos los equipos y pone primero a las cabezas de serie', () => {
    const e = equipos(10);
    const s = sortear(e, ['E9', 'E4'], 3);
    expect(s.slice(0, 2)).toEqual(['E9', 'E4']);
    expect([...s].sort()).toEqual([...e].sort());
  });

  it('las cabezas de serie no se cruzan entre sí antes de semifinales', () => {
    const s = sortear(equipos(8), ['E3', 'E6', 'E1', 'E8'], 1);
    const cuartos = armarLlave(s).rondas[0]!.partidos;
    const cabezas = new Set(['E3', 'E6', 'E1', 'E8']);
    for (const p of cuartos) {
      const ids = [p.local, p.visitante].map((o) => (o.tipo === 'equipo' ? o.equipoId : ''));
      expect(ids.filter((i) => cabezas.has(i))).toHaveLength(1);
    }
  });

  it('rechaza una cabeza que no juega o repetida', () => {
    expect(() => sortear(equipos(4), ['X'], 1)).toThrow(/no está/);
    expect(() => sortear(equipos(4), ['E1', 'E1'], 1)).toThrow(/repetida/);
  });
});

describe('grupos', () => {
  it('reparte en serpentina y los grupos quedan parejos', () => {
    const g = repartirEnGrupos(equipos(8), 2);
    expect(g[0]!.equipoIds).toEqual(['E1', 'E4', 'E5', 'E8']);
    expect(g[1]!.equipoIds).toEqual(['E2', 'E3', 'E6', 'E7']);
  });

  it('con una cantidad que no divide parejo, la diferencia es de un equipo', () => {
    const g = repartirEnGrupos(equipos(11), 3);
    const tamanos = g.map((x) => x.equipoIds.length).sort();
    expect(tamanos).toEqual([3, 4, 4]);
    expect(g.flatMap((x) => x.equipoIds).sort()).toEqual([...equipos(11)].sort());
  });

  it('pide al menos 3 equipos por grupo', () => {
    expect(() => repartirEnGrupos(equipos(5), 2)).toThrow(/al menos 6/);
    expect(() => repartirEnGrupos(equipos(8), 1)).toThrow();
  });

  it('2 grupos con 2 clasificados: 1A-2B y 1B-2A', () => {
    const cuadro = cuadroDeGrupos([
      ['A1', 'A2'],
      ['B1', 'B2'],
    ]);
    expect(cuadro).toEqual(['A1', 'B2', 'B1', 'A2']);
    const l = llaveDesdeCuadro(cuadro);
    expect(l.rondas[0]!.partidos).toHaveLength(2);
  });

  it('4 grupos: ningún cruce de primera ronda enfrenta a dos del mismo grupo', () => {
    const grupos = ['A', 'B', 'C', 'D'].map((g) => [`${g}1`, `${g}2`]);
    const cuadro = cuadroDeGrupos(grupos);
    for (let i = 0; i < cuadro.length; i += 2) expect(cuadro[i]![0]).not.toBe(cuadro[i + 1]![0]);
    // Los dos del mismo grupo quedan en mitades distintas del cuadro.
    expect(cuadro.indexOf('A1') < 4).not.toBe(cuadro.indexOf('A2') < 4);
  });

  it('1 clasificado por grupo se siembra por orden de grupo', () => {
    expect(cuadroDeGrupos([['A1'], ['B1'], ['C1'], ['D1']])).toEqual(['A1', 'D1', 'B1', 'C1']);
  });

  it('rechaza combinaciones que no forman un cuadro', () => {
    expect(() =>
      cuadroDeGrupos([
        ['A1', 'A2'],
        ['B1', 'B2'],
        ['C1', 'C2'],
      ]),
    ).toThrow(/sumar/);
    expect(() => cuadroDeGrupos([['A1', 'A2'], ['B1']])).toThrow(/misma cantidad/);
  });
});
