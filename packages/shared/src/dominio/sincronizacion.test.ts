import { describe, expect, it } from 'vitest';
import {
  type ActaBase,
  type OperacionActa,
  procesarCola,
  type ResultadoEnvio,
  vistaLocal,
} from './sincronizacion.js';

const base = (extra: Partial<ActaBase> = {}): ActaBase => ({
  estado: 'PROGRAMADO',
  local: { id: 'L' },
  visitante: { id: 'V' },
  eventos: [],
  ...extra,
});
let n = 0;
const t = () => ++n;
const iniciar = (): OperacionActa => ({ tipo: 'iniciar', id: `i${t()}`, creadoEn: t() });
const gol = (equipoId: string, id = `g${t()}`): OperacionActa => ({
  tipo: 'evento',
  id,
  creadoEn: t(),
  evento: { tipo: 'GOL', equipoId, jugadorId: 'J1', minuto: 10 },
});
const anular = (objetivoId: string): OperacionActa => ({
  tipo: 'anular',
  id: `a${t()}`,
  creadoEn: t(),
  objetivoId,
});
const cerrar = (): OperacionActa => ({
  tipo: 'cerrar',
  id: `c${t()}`,
  creadoEn: t(),
  cierre: { firmaLocal: true, firmaVisitante: true },
});

describe('acta sin conexión: vista local', () => {
  it('sin operaciones, es el acta del servidor con su marcador', () => {
    const v = vistaLocal(
      base({
        estado: 'EN_JUEGO',
        eventos: [{ id: 'e1', tipo: 'GOL', equipoId: 'L', jugadorId: null, minuto: 5 }],
      }),
      [],
    );
    expect(v.marcador).toEqual({ local: 1, visitante: 0 });
    expect(v.pendientes).toBe(0);
  });

  it('iniciar y cargar goles offline actualiza estado y marcador al instante', () => {
    const v = vistaLocal(base(), [iniciar(), gol('L'), gol('L'), gol('V')]);
    expect(v.estado).toBe('EN_JUEGO');
    expect(v.marcador).toEqual({ local: 2, visitante: 1 });
    expect(v.pendientes).toBe(4);
    expect(v.eventos.every((e) => e.pendiente)).toBe(true);
  });

  it('un gol en contra suma al rival', () => {
    const v = vistaLocal(base({ estado: 'EN_JUEGO' }), [
      { tipo: 'evento', id: 'x', creadoEn: 1, evento: { tipo: 'GOL_EN_CONTRA', equipoId: 'L' } },
    ]);
    expect(v.marcador).toEqual({ local: 0, visitante: 1 });
  });

  it('anular un gol cargado offline lo saca por su clientUuid', () => {
    const v = vistaLocal(base({ estado: 'EN_JUEGO' }), [
      gol('L', 'uuid-1'),
      gol('L', 'uuid-2'),
      anular('uuid-1'),
    ]);
    expect(v.marcador).toEqual({ local: 1, visitante: 0 });
    expect(v.eventos.map((e) => e.id)).toEqual(['uuid-2']);
  });

  it('anular un evento que ya estaba en el servidor lo saca por su id', () => {
    const v = vistaLocal(
      base({
        estado: 'EN_JUEGO',
        eventos: [{ id: 'db-1', tipo: 'GOL', equipoId: 'V', jugadorId: null, minuto: 3 }],
      }),
      [anular('db-1')],
    );
    expect(v.marcador).toEqual({ local: 0, visitante: 0 });
  });

  it('un evento que el servidor ya confirmó no se cuenta dos veces', () => {
    const v = vistaLocal(
      base({
        estado: 'EN_JUEGO',
        eventos: [
          { id: 'db-9', clientUuid: 'uuid-9', tipo: 'GOL', equipoId: 'L', jugadorId: null, minuto: 8 },
        ],
      }),
      [gol('L', 'uuid-9')],
    );
    expect(v.marcador).toEqual({ local: 1, visitante: 0 });
    expect(v.pendientes).toBe(0);
  });

  it('cerrar deja el partido finalizado en la vista, aunque falte enviar', () => {
    const v = vistaLocal(base({ estado: 'EN_JUEGO' }), [gol('V'), cerrar()]);
    expect(v.estado).toBe('FINALIZADO');
    expect(v.pendientes).toBe(2);
  });

  it('iniciar un partido que ya estaba en juego no cambia nada', () => {
    expect(vistaLocal(base({ estado: 'EN_JUEGO' }), [iniciar()]).estado).toBe('EN_JUEGO');
    expect(vistaLocal(base({ estado: 'FINALIZADO' }), [iniciar()]).estado).toBe('FINALIZADO');
  });

  it('no modifica el acta original', () => {
    const original = base({ estado: 'EN_JUEGO' });
    vistaLocal(original, [gol('L')]);
    expect(original.eventos).toHaveLength(0);
  });
});

describe('acta sin conexión: envío de la cola', () => {
  const cola = () => [iniciar(), gol('L'), gol('V'), cerrar()];

  it('con conexión envía todo en orden', async () => {
    const vistas: string[] = [];
    const c = cola();
    const r = await procesarCola(c, async (op) => {
      vistas.push(op.tipo);
      return { tipo: 'ok' };
    });
    expect(vistas).toEqual(['iniciar', 'evento', 'evento', 'cerrar']);
    expect(r.enviadas).toHaveLength(4);
    expect(r.pendientes).toHaveLength(0);
  });

  it('si se cae la conexión a mitad, corta y conserva el resto en orden', async () => {
    const c = cola();
    let llamadas = 0;
    const r = await procesarCola(c, async () => {
      llamadas++;
      return llamadas <= 2 ? { tipo: 'ok' } : { tipo: 'sin-red' };
    });
    expect(llamadas).toBe(3); // la cuarta ni se intenta: sería desordenar
    expect(r.enviadas).toEqual(c.slice(0, 2));
    expect(r.pendientes).toEqual(c.slice(2));
  });

  it('una operación rechazada se informa y no frena a las demás', async () => {
    const c = cola();
    const r = await procesarCola(c, async (op): Promise<ResultadoEnvio> =>
      op === c[1] ? { tipo: 'rechazada', motivo: 'El jugador no está en el plantel.' } : { tipo: 'ok' },
    );
    expect(r.rechazadas).toEqual([{ operacion: c[1], motivo: 'El jugador no está en el plantel.' }]);
    expect(r.enviadas).toHaveLength(3);
    expect(r.pendientes).toHaveLength(0);
  });

  it('una cola vacía no hace nada', async () => {
    const r = await procesarCola([], async () => ({ tipo: 'ok' }));
    expect(r).toEqual({ enviadas: [], rechazadas: [], pendientes: [] });
  });
});
