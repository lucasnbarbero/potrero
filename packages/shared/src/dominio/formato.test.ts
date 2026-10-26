// Armado flexible por fases: validación, simulación del calendario y plantillas.
import { describe, expect, it } from 'vitest';
import {
  describirEntrada,
  type FormatoFlexible,
  nuevaFase,
  plantillaDeFormato,
  plantillaGruposPlayoffsCopa,
  PLANTILLAS_DE_FORMATO,
  simularFormato,
  validarFormato,
} from './formato.js';

const datos = { equipos: 20, canchas: 2, franjasPorDia: 5, cuotaPorFecha: 10000, inscripcion: 50000 };
const errores = (f: FormatoFlexible, n: number) =>
  validarFormato(f, n)
    .filter((p) => p.nivel === 'ERROR')
    .map((p) => p.mensaje);

describe('el ejemplo real: 20 equipos, grupos + playoffs + copa estímulo', () => {
  const formato = plantillaGruposPlayoffsCopa(20);
  const sim = simularFormato(formato, datos);
  const fase = (id: string) => sim.fases.find((f) => f.id === id)!;

  it('no tiene errores', () => {
    expect(errores(formato, 20)).toEqual([]);
  });

  it('fase 1: 2 grupos de 10, 9 fechas de 10 partidos', () => {
    expect(fase('f1').grupos).toEqual([10, 10]);
    expect(fase('f1').fechas).toBe(9);
    expect(fase('f1').partidos).toBe(90);
  });

  it('playoffs: 16 equipos, ida y vuelta salvo la final, cruces 1º A vs 8º B', () => {
    const p = fase('f2');
    expect(p.equipos).toBe(16);
    expect(p.rondas.map((r) => [r.nombre, r.partidos, r.idaYVuelta])).toEqual([
      ['Octavos de final', 8, true],
      ['Cuartos de final', 4, true],
      ['Semifinales', 2, true],
      ['Final', 1, false],
    ]);
    expect(p.partidos).toBe(16 + 8 + 4 + 1);
    expect(p.fechas).toBe(7);
    expect(p.cruces[0]).toBe('1º A vs 8º B');
    expect(p.cruces).toContain('1º B vs 8º A');
    expect(p.cruces).toHaveLength(8);
  });

  it('copa estímulo: 8 eliminados en octavos + 4 que no clasificaron, en 3 grupos de 4; a semis los 1º y el mejor 2º', () => {
    expect(fase('f3').equipos).toBe(12);
    expect(fase('f3').grupos).toEqual([4, 4, 4]);
    expect(fase('f4').equipos).toBe(4);
    expect(fase('f4').rondas.map((r) => r.nombre)).toEqual(['Semifinales', 'Final']);
  });

  it('calendario: la copa arranca después de octavos y comparte sábados con los playoffs', () => {
    expect(fase('f1').primerSabado).toBe(1);
    expect(fase('f1').ultimoSabado).toBe(9);
    expect(fase('f2').primerSabado).toBe(10);
    expect(fase('f3').primerSabado).toBe(12); // octavos ida y vuelta: sábados 10 y 11
    // En la fase 1 juegan los 20; en octavos, 16 (4 libres); en cuartos + copa, los 20.
    expect(sim.sabados[0]!.equiposJugando).toBe(20);
    expect(sim.sabados[9]!.equiposLibres).toBe(4);
    expect(sim.sabados[11]!.equiposJugando).toBe(8 + 12);
    expect(sim.sabados[11]!.porFase.map((p) => p.faseId)).toEqual(['f2', 'f3']);
  });

  it('nadie juega dos veces el mismo sábado y no se pasa la capacidad', () => {
    for (const s of sim.sabados) {
      expect(s.partidos).toBeLessThanOrEqual(10);
      expect(s.equiposJugando + s.equiposLibres).toBe(20);
      expect(new Set(s.porFase.map((p) => p.faseId)).size).toBe(s.porFase.length);
    }
  });

  it('totales y recaudación: inscripción + cuota × equipos que juegan cada sábado', () => {
    const jugados = sim.sabados.reduce((t, s) => t + s.equiposJugando, 0);
    expect(sim.totales.partidos).toBe(90 + 29 + 18 + 3);
    expect(sim.totales.recaudacion).toBe(20 * 50000 + jugados * 10000);
    expect(sim.totales.sabadosConTodos).toBeGreaterThanOrEqual(10);
  });

  it('describe las entradas en criollo', () => {
    expect(describirEntrada(formato.fases[1]!.entradas[0]!, formato, 20)).toBe(
      'Los 8 primeros de cada grupo de Fase 1',
    );
    expect(describirEntrada(formato.fases[2]!.entradas[0]!, formato, 20)).toBe(
      'Los perdedores de Octavos de final de Playoffs',
    );
    expect(describirEntrada(formato.fases[2]!.entradas[1]!, formato, 20)).toBe(
      'Los que no clasificaron de Fase 1',
    );
    expect(describirEntrada(formato.fases[3]!.entradas[1]!, formato, 20)).toBe(
      'El mejor 2º entre los grupos de Copa estímulo',
    );
  });
});

describe('formatos actuales como plantillas', () => {
  it('liga de 8: 7 fechas, 28 partidos, todos juegan siempre', () => {
    const sim = simularFormato(plantillaDeFormato('LIGA', 8), { ...datos, equipos: 8 });
    expect(sim.totales.partidos).toBe(28);
    expect(sim.totales.sabados).toBe(7);
    expect(sim.totales.porcentajeConTodos).toBe(100);
  });

  it('liga ida y vuelta de 7: 14 fechas y uno libre por fecha', () => {
    const sim = simularFormato(plantillaDeFormato('LIGA_IDA_Y_VUELTA', 7), { ...datos, equipos: 7 });
    expect(sim.totales.partidos).toBe(42);
    expect(sim.totales.sabados).toBe(14);
    expect(sim.sabados.every((s) => s.equiposLibres === 1)).toBe(true);
  });

  it('copa de 12: pases libres en la primera ronda', () => {
    const f = plantillaDeFormato('COPA', 12);
    const sim = simularFormato(f, { ...datos, equipos: 12 });
    expect(sim.fases[0]!.rondas[0]).toMatchObject({ partidos: 4, pasesLibres: 4 });
    expect(sim.totales.partidos).toBe(11);
    expect(validarFormato(f, 12).some((p) => p.nivel === 'AVISO' && p.mensaje.includes('pases libres'))).toBe(
      true,
    );
    expect(sim.fases[0]!.cruces.filter((c) => c.includes('pasa libre'))).toHaveLength(4);
  });

  it('liga + playoffs de 10: 45 partidos de liga y 8 a cuartos', () => {
    const sim = simularFormato(plantillaDeFormato('LIGA_PLAYOFFS', 10), { ...datos, equipos: 10 });
    expect(sim.fases[1]!.equipos).toBe(8);
    expect(sim.totales.partidos).toBe(45 + 7);
    expect(sim.totales.sabados).toBe(9 + 3);
  });

  it('grupos + playoffs de 16: 4 grupos de 4 y cruces 1º A vs 2º B', () => {
    const sim = simularFormato(plantillaDeFormato('GRUPOS_PLAYOFFS', 16), { ...datos, equipos: 16 });
    expect(sim.fases[0]!.grupos).toEqual([4, 4, 4, 4]);
    expect(sim.fases[1]!.equipos).toBe(8);
    expect(sim.fases[1]!.cruces[0]).toBe('1º A vs 2º B');
  });

  it('todas las plantillas quedan sin errores de 8 a 32 equipos', () => {
    for (const p of PLANTILLAS_DE_FORMATO)
      for (const n of [8, 12, 16, 20, 24, 32])
        expect([p.clave, n, errores(plantillaDeFormato(p.clave, n), n)]).toEqual([p.clave, n, []]);
  });
});

describe('validación', () => {
  const base = plantillaGruposPlayoffsCopa(20);

  it('clasifican más equipos de los que hay', () => {
    const f: FormatoFlexible = {
      fases: [
        base.fases[0]!,
        { ...base.fases[1]!, entradas: [{ tipo: 'PUESTOS', fase: 'f1', desde: 1, hasta: 12 }] },
      ],
    };
    expect(errores(f, 20).join(' ')).toContain('no hay puesto 12');
  });

  it('puestos repetidos entre dos fases', () => {
    const f: FormatoFlexible = {
      fases: [
        base.fases[0]!,
        { ...base.fases[1]!, entradas: [{ tipo: 'PUESTOS', fase: 'f1', desde: 1, hasta: 4 }] },
        nuevaFase({
          id: 'f3',
          nombre: 'Copa',
          tipo: 'ELIMINACION',
          entradas: [{ tipo: 'PUESTOS', fase: 'f1', desde: 4, hasta: 5 }],
        }),
      ],
    };
    expect(errores(f, 20).join(' ')).toContain('El puesto 4 de Fase 1 ya pasa a otra fase');
  });

  it('fase sin entrada, fase que toma de una posterior y nadie toma a los inscriptos', () => {
    const f: FormatoFlexible = {
      fases: [
        nuevaFase({
          id: 'a',
          nombre: 'Primera',
          tipo: 'ELIMINACION',
          entradas: [{ tipo: 'GANADORES', fase: 'b', ronda: 1 }],
        }),
        nuevaFase({ id: 'b', nombre: 'Segunda', tipo: 'ELIMINACION', entradas: [] }),
      ],
    };
    const e = errores(f, 8).join(' | ');
    expect(e).toContain('Ninguna fase toma a los inscriptos');
    expect(e).toContain('Primera toma equipos de Segunda, que viene después');
    expect(e).toContain('Segunda no tiene de dónde sacar equipos');
  });

  it('grupos desparejos: aviso', () => {
    const f: FormatoFlexible = {
      fases: [
        nuevaFase({
          id: 'a',
          nombre: 'Zonas',
          tipo: 'GRUPOS',
          entradas: [{ tipo: 'INSCRIPTOS' }],
          grupos: { modo: 'CANTIDAD', valor: 3 },
        }),
      ],
    };
    expect(validarFormato(f, 10).find((p) => p.nivel === 'AVISO')?.mensaje).toContain(
      'grupos desparejos (4, 3, 3',
    );
  });

  it('ganadores o perdedores de una fase que no es eliminación', () => {
    const f: FormatoFlexible = {
      fases: [
        base.fases[0]!,
        nuevaFase({
          id: 'x',
          nombre: 'Copa',
          tipo: 'ELIMINACION',
          entradas: [{ tipo: 'PERDEDORES', fase: 'f1', ronda: 1 }],
        }),
      ],
    };
    expect(errores(f, 20).join(' ')).toContain('no es una eliminación');
  });

  it('poca capacidad: la fecha se estira al sábado siguiente', () => {
    const sim = simularFormato(plantillaDeFormato('LIGA', 8), {
      ...datos,
      equipos: 8,
      canchas: 1,
      franjasPorDia: 3,
    });
    expect(sim.sabados.every((s) => s.partidos <= 3)).toBe(true);
    expect(sim.totales.partidos).toBe(28);
    expect(sim.problemas.some((p) => p.mensaje.includes('por sábado entran 3'))).toBe(true);
  });

  it('sin canchas: error', () => {
    const sim = simularFormato(plantillaDeFormato('LIGA', 8), { ...datos, equipos: 8, canchas: 0 });
    expect(sim.problemas.some((p) => p.nivel === 'ERROR')).toBe(true);
    expect(sim.sabados).toEqual([]);
  });
});
