import { describe, expect, it } from 'vitest';
import { REGLAMENTO_POR_DEFECTO } from '../reglamento.js';
import { evaluarResolucion, historialDisciplinario, sugeridoPorReglamento } from './tribunal.js';

describe('tribunal', () => {
  it('sugiere según el reglamento', () => {
    expect(sugeridoPorReglamento('ROJA_DIRECTA', REGLAMENTO_POR_DEFECTO)).toBe(
      REGLAMENTO_POR_DEFECTO.suspensionRojaDirecta,
    );
    expect(sugeridoPorReglamento('INCIDENTE_HINCHADA', REGLAMENTO_POR_DEFECTO)).toBe(0);
    expect(sugeridoPorReglamento('JUGADOR_NO_HABILITADO', REGLAMENTO_POR_DEFECTO)).toBe(0);
  });

  it('clasifica el veredicto contra lo sugerido', () => {
    const v = (s: number, p: number) => {
      const r = evaluarResolucion(s, p, 0);
      return r.ok ? r.resolucion.veredicto : 'ERROR';
    };
    expect(v(2, 2)).toBe('APLICADA');
    expect(v(2, 3)).toBe('AMPLIADA');
    expect(v(2, 1)).toBe('REDUCIDA');
    expect(v(2, 0)).toBe('ANULADA');
    expect(v(0, 0)).toBe('APLICADA');
    expect(v(0, 2)).toBe('AMPLIADA');
  });

  it('rechaza partidos o multas fuera de rango', () => {
    expect(evaluarResolucion(1, -1, 0).ok).toBe(false);
    expect(evaluarResolucion(1, 21, 0).ok).toBe(false);
    expect(evaluarResolucion(1, 1.5, 0).ok).toBe(false);
    expect(evaluarResolucion(1, 1, -5).ok).toBe(false);
    expect(evaluarResolucion(1, 1, 2_000_000).ok).toBe(false);
  });

  it('arma el historial ordenado por gravedad', () => {
    const h = historialDisciplinario([
      { clave: 'a', nombre: 'Ana', amarillas: 2 },
      { clave: 'b', nombre: 'Beto', rojas: 1, partidos: 2 },
      { clave: 'a', nombre: 'Ana', partidos: 1, multa: 5000, expediente: true },
    ]);
    expect(h.map((f) => f.clave)).toEqual(['b', 'a']);
    expect(h[1]).toMatchObject({ amarillas: 2, partidosSancionados: 1, multas: 5000, expedientes: 1 });
  });
});
