// Torneos por fases: entradas de cada fase, grupos, fechas, cuadro y series de ida y vuelta.
import { describe, expect, it } from 'vitest';
import {
  cuadroDeFase,
  fechasDeFase,
  gruposDeFase,
  pidePenales,
  type PiernaJugada,
  resolverEntradas,
  resolverLlaveDeFase,
  resultadoDeSerie,
  type ResultadoDeFase,
} from './fases.js';
import { nuevaFase, plantillaGruposPlayoffsCopa } from './formato.js';
import type { FilaTabla } from './tabla.js';

const fila = (equipoId: string, pts: number, dg = 0, gf = 0): FilaTabla => ({
  posicion: 0,
  equipoId,
  pj: 3,
  pg: 0,
  pe: 0,
  pp: 0,
  gf,
  gc: 0,
  dg,
  pts,
  amarillas: 0,
  rojas: 0,
});

const equipos = Array.from({ length: 12 }, (_, i) => `e${i + 1}`);

describe('grupos y fechas de una fase', () => {
  it('reparte en serpentina y arma las fechas de todos los grupos a la vez', () => {
    const fase = nuevaFase({
      id: 'f1',
      nombre: 'Fase 1',
      tipo: 'GRUPOS',
      entradas: [{ tipo: 'INSCRIPTOS' }],
      grupos: { modo: 'CANTIDAD', valor: 2 },
    });
    const grupos = gruposDeFase(fase, equipos);
    expect(grupos.map((g) => g.grupo)).toEqual(['A', 'B']);
    expect(grupos[0]!.equipoIds).toEqual(['e1', 'e4', 'e5', 'e8', 'e9', 'e12']);
    const { fechas, grupoDe } = fechasDeFase(fase, grupos);
    expect(fechas).toHaveLength(5);
    expect(fechas.every((f) => f.cruces.length === 6)).toBe(true);
    const c = fechas[0]!.cruces[0]!;
    expect(grupoDe.get(`${c.localId}|${c.visitanteId}`)).toBe('A');
  });

  it('con dos ruedas invierte la localía en la segunda', () => {
    const fase = nuevaFase({ id: 'f1', nombre: 'Liga', tipo: 'TODOS_CONTRA_TODOS', entradas: [], ruedas: 2 });
    const { fechas } = fechasDeFase(fase, gruposDeFase(fase, ['a', 'b', 'c', 'd']));
    expect(fechas).toHaveLength(6);
    const ida = fechas[0]!.cruces[0]!;
    expect(fechas[3]!.cruces[0]).toEqual({ localId: ida.visitanteId, visitanteId: ida.localId });
  });
});

describe('resolver las entradas de una fase', () => {
  const formato = plantillaGruposPlayoffsCopa(12, {
    grupos: 2,
    clasificanPorGrupo: 4,
    equiposPorGrupoCopa: 4,
  });
  const tablaA = ['e1', 'e4', 'e5', 'e8', 'e9', 'e12'].map((id, i) => fila(id, 15 - i * 3));
  const tablaB = ['e2', 'e3', 'e6', 'e7', 'e10', 'e11'].map((id, i) => fila(id, 14 - i * 3));
  const f1: ResultadoDeFase = { tipo: 'GRUPOS', generada: true, terminada: true, tablas: [tablaA, tablaB] };

  it('la fase 1 toma a los inscriptos', () => {
    expect(resolverEntradas(formato, 'f1', equipos, {})).toEqual({ ok: true, equipoIds: equipos });
  });

  it('los playoffs esperan a que termine la fase 1', () => {
    const r = resolverEntradas(formato, 'f2', equipos, { f1: { ...f1, terminada: false } });
    expect(r).toEqual({ ok: false, motivo: 'Falta terminar Fase 1.' });
  });

  it('puestos 1 a 4 de cada grupo, por puesto, y los clasificados por grupo para el cruce', () => {
    const r = resolverEntradas(formato, 'f2', equipos, { f1 });
    expect(r.ok && r.equipoIds).toEqual(['e1', 'e2', 'e4', 'e3', 'e5', 'e6', 'e8', 'e7']);
    expect(r.ok && r.porGrupo).toEqual([
      ['e1', 'e4', 'e5', 'e8'],
      ['e2', 'e3', 'e6', 'e7'],
    ]);
  });

  it('el cruce entre grupos enfrenta al 1º de un grupo con el 4º del otro', () => {
    const r = resolverEntradas(formato, 'f2', equipos, { f1 });
    if (!r.ok) throw new Error(r.motivo);
    const cuadro = cuadroDeFase(formato.fases[1]!, r.equipoIds, r.porGrupo);
    expect(cuadro.slice(0, 2)).toEqual(['e1', 'e7']);
    expect(new Set(cuadro).size).toBe(8);
  });

  it('copa estímulo: perdedores de la ronda 1 y los que no clasificaron', () => {
    const f2: ResultadoDeFase = {
      tipo: 'ELIMINACION',
      generada: true,
      terminada: false,
      rondas: [{ definida: true, ganadores: ['e1', 'e2', 'e3', 'e4'], perdedores: ['e5', 'e6', 'e7', 'e8'] }],
    };
    const r = resolverEntradas(formato, 'f3', equipos, { f1, f2 });
    expect(r.ok && r.equipoIds).toEqual(['e5', 'e6', 'e7', 'e8', 'e9', 'e10', 'e12', 'e11']);
    const sinDefinir = { ...f2, rondas: [{ ...f2.rondas![0]!, definida: false }] };
    expect(resolverEntradas(formato, 'f3', equipos, { f1, f2: sinDefinir }).ok).toBe(false);
  });

  it('los mejores segundos se comparan por puntos, diferencia y goles', () => {
    const f = {
      fases: [
        nuevaFase({ id: 'g', nombre: 'Grupos', tipo: 'GRUPOS', entradas: [{ tipo: 'INSCRIPTOS' }] }),
        nuevaFase({
          id: 'p',
          nombre: 'Final',
          tipo: 'ELIMINACION',
          entradas: [
            { tipo: 'PUESTOS', fase: 'g', desde: 1, hasta: 1 },
            { tipo: 'MEJORES', fase: 'g', puesto: 2, cantidad: 1 },
          ],
        }),
      ],
    };
    const tablas = [
      [fila('a', 9), fila('b', 6, 1)],
      [fila('c', 9), fila('d', 6, 3)],
    ];
    const r = resolverEntradas(f, 'p', [], {
      g: { tipo: 'GRUPOS', generada: true, terminada: true, tablas },
    });
    expect(r.ok && r.equipoIds).toEqual(['a', 'c', 'd']);
  });
});

describe('series de ida y vuelta', () => {
  const pierna = (p: Partial<PiernaJugada> & Pick<PiernaJugada, 'pierna' | 'localId' | 'visitanteId'>) => ({
    cerrado: true,
    golesLocal: 0,
    golesVisitante: 0,
    ...p,
  });

  it('el global suma la ida y la vuelta con la localía invertida', () => {
    const r = resultadoDeSerie(
      'a',
      [
        pierna({ pierna: 1, localId: 'a', visitanteId: 'b', golesLocal: 2, golesVisitante: 1 }),
        pierna({ pierna: 2, localId: 'b', visitanteId: 'a', golesLocal: 3, golesVisitante: 0 }),
      ],
      true,
    );
    expect(r).toMatchObject({ golesLocal: 2, golesVisitante: 4 });
  });

  it('sin la vuelta no hay resultado', () => {
    expect(
      resultadoDeSerie('a', [pierna({ pierna: 1, localId: 'a', visitanteId: 'b' })], true),
    ).toBeUndefined();
  });

  it('la vuelta pide penales solo si el global empata', () => {
    const ida = { golesLocal: 1, golesVisitante: 2 }; // desde el local de la vuelta
    expect(pidePenales({ golesLocal: 1, golesVisitante: 0 }, { pierna: 2, idaYVuelta: true, ida })).toBe(
      true,
    );
    expect(pidePenales({ golesLocal: 2, golesVisitante: 0 }, { pierna: 2, idaYVuelta: true, ida })).toBe(
      false,
    );
    expect(pidePenales({ golesLocal: 1, golesVisitante: 1 }, { pierna: 1, idaYVuelta: true })).toBe(false);
    expect(pidePenales({ golesLocal: 1, golesVisitante: 1 }, { pierna: 1, idaYVuelta: false })).toBe(true);
  });

  it('resuelve la llave con penales en la vuelta, final a partido único y pases libres', () => {
    const fase = { idaYVuelta: [false, true] }; // final única, el resto ida y vuelta
    const cuadro = ['a', null, 'b', 'c'];
    const r0 = resolverLlaveDeFase(fase, cuadro, {});
    expect(r0.rondas.map((r) => [r.nombre, r.idaYVuelta, r.fecha])).toEqual([
      ['Semifinales', true, 1],
      ['Final', false, 3],
    ]);
    const r = resolverLlaveDeFase(fase, cuadro, {
      '1-2': [
        pierna({ pierna: 1, localId: 'b', visitanteId: 'c', golesLocal: 1, golesVisitante: 0 }),
        pierna({
          pierna: 2,
          localId: 'c',
          visitanteId: 'b',
          golesLocal: 1,
          golesVisitante: 0,
          penalesLocal: 5,
          penalesVisitante: 4,
        }),
      ],
    });
    expect(r.porRonda[0]).toEqual({ numero: 1, definida: true, ganadores: ['a', 'c'], perdedores: ['b'] });
    const final = r.resuelta.rondas[1]!.partidos[0]!;
    expect([final.localId, final.visitanteId, final.estado]).toEqual(['a', 'c', 'LISTO']);
    expect(r.campeonId).toBeUndefined();
  });
});
