import { describe, expect, it } from 'vitest';
import { REGLAMENTO_POR_DEFECTO as R } from '../reglamento.js';
import {
  ordenarLineaDeTiempo,
  puedeMarcarAusente,
  resultadoPorAusencia,
  vencimientoDeTolerancia,
} from './acta.js';
import { equiposDeLaTabla, tablaDePosiciones } from './tabla.js';

describe('línea de tiempo del acta', () => {
  it('ordena por minuto, desempata por orden de carga y deja al final los eventos sin minuto', () => {
    const cargados = [
      { id: 'a', minuto: 30 },
      { id: 'b', minuto: null },
      { id: 'c', minuto: 5 },
      { id: 'd', minuto: 30 },
      { id: 'e', minuto: undefined },
      { id: 'f', minuto: 0 },
    ];
    expect(ordenarLineaDeTiempo(cargados).map((e) => e.id)).toEqual(['f', 'c', 'a', 'd', 'b', 'e']);
  });
});

describe('equipo ausente', () => {
  const inicio = new Date('2026-10-24T22:00:00Z');

  it('solo se puede marcar cuando venció la tolerancia del reglamento', () => {
    expect(vencimientoDeTolerancia(inicio, 15)).toEqual(new Date('2026-10-24T22:15:00Z'));
    expect(puedeMarcarAusente(inicio, 15, new Date('2026-10-24T22:14:59Z'))).toEqual({
      puede: false,
      motivo: 'TOLERANCIA',
      desde: new Date('2026-10-24T22:15:00Z'),
    });
    expect(puedeMarcarAusente(inicio, 15, new Date('2026-10-24T22:15:00Z'))).toEqual({ puede: true });
    // Con otra tolerancia en el reglamento del torneo, cuenta esa.
    expect(puedeMarcarAusente(inicio, 30, new Date('2026-10-24T22:20:00Z')).puede).toBe(false);
  });

  it('sin horario no se puede marcar', () => {
    expect(puedeMarcarAusente(null, 15)).toEqual({ puede: false, motivo: 'SIN_HORARIO' });
  });

  it('el que se presentó gana por los goles del reglamento', () => {
    expect(resultadoPorAusencia('L', 'L', R.golesWO)).toEqual({ local: R.golesWO, visitante: 0 });
    expect(resultadoPorAusencia('V', 'L', 3)).toEqual({ local: 0, visitante: 3 });
  });
});

describe('equipos de la tabla', () => {
  const partidos = [
    { localId: 'A', visitanteId: 'B' },
    { localId: 'C', visitanteId: 'A' },
  ];

  it('con fixture, solo los equipos que tienen partidos: el confirmado tarde no aparece con 0 PJ', () => {
    expect(equiposDeLaTabla(['A', 'B', 'C', 'TARDE'], partidos).sort()).toEqual(['A', 'B', 'C']);
    const tabla = tablaDePosiciones(
      equiposDeLaTabla(['A', 'B', 'C', 'TARDE'], partidos),
      [{ id: 'p1', localId: 'A', visitanteId: 'B', golesLocal: 1, golesVisitante: 0 }],
      R,
    );
    expect(tabla.map((f) => f.equipoId)).not.toContain('TARDE');
  });

  it('sin fixture, los confirmados', () => {
    expect(equiposDeLaTabla(['A', 'B'], [])).toEqual(['A', 'B']);
  });
});
