import { describe, expect, it } from 'vitest';
import {
  actividadDelTorneo,
  asistencia,
  calcularMetricas,
  type CargoParaMetricas,
  cobranzaDelTorneo,
  enArgentina,
  mapaDeHorarios,
  mezclaDeMedios,
  ocupacionPorJornada,
  paresDeRetencion,
  type PartidoParaMetricas,
  rangoDelPeriodo,
  sumarCobranzas,
  tasaDeRetencion,
  type TorneoParaMetricas,
  torneoEnRango,
} from './metricas.js';

const eq = (...ns: string[]) => ns.map((n) => ({ id: n, nombre: `Equipo ${n}` }));
const partido = (inicio: string | null, canchaId: string | null = 'c1', estado: PartidoParaMetricas['estado'] = 'FINALIZADO'): PartidoParaMetricas => ({
  inicio,
  canchaId,
  estado,
});
const torneo = (o: Partial<TorneoParaMetricas> & { id: string }): TorneoParaMetricas => ({
  nombre: o.id,
  formato: 'LIGA',
  estado: 'FINALIZADO',
  creadoEn: '2025-01-01T12:00:00Z',
  equipos: [],
  cargos: [],
  partidos: [],
  ...o,
});
const cargo = (monto: number, pagos: CargoParaMetricas['pagos'] = [], o: Partial<CargoParaMetricas> = {}): CargoParaMetricas => ({
  monto,
  estado: pagos.reduce((s, p) => s + p.monto, 0) >= monto ? 'PAGADO' : 'PENDIENTE',
  esInscripcion: true,
  pagos,
  ...o,
});
const pago = (monto: number, fecha: string, metodo: 'EFECTIVO' | 'TRANSFERENCIA' | 'MERCADO_PAGO' = 'EFECTIVO', estado: 'APROBADO' | 'PENDIENTE' | 'RECHAZADO' = 'APROBADO') => ({
  monto,
  fecha,
  metodo,
  estado,
});

describe('métricas: fechas y períodos', () => {
  it('pasa un instante a día, hora y día de la semana de Argentina', () => {
    // Sábado 23:30 en Buenos Aires es domingo 02:30 UTC.
    expect(enArgentina('2026-10-25T02:30:00Z')).toEqual({ dia: '2026-10-24', hora: 23, diaSemana: 6 });
    expect(enArgentina('2026-10-24T19:00:00-03:00')).toEqual({ dia: '2026-10-24', hora: 19, diaSemana: 6 });
  });

  it('arma la ventana de cada período', () => {
    expect(rangoDelPeriodo('30D', '2026-10-26')).toEqual({ desde: '2026-09-27', hasta: '2026-10-26' });
    expect(rangoDelPeriodo('TEMPORADA', '2026-10-26')).toEqual({ desde: '2026-01-01', hasta: '2026-12-31' });
    expect(rangoDelPeriodo('HISTORICO', '2026-10-26')).toEqual({ desde: null, hasta: null });
  });

  it('un torneo está activo desde su primer partido hasta el último; si no terminó, sigue activo', () => {
    const t = torneo({
      id: 'a',
      partidos: [partido('2025-08-09T15:00:00-03:00'), partido('2025-03-01T15:00:00-03:00')],
    });
    expect(actividadDelTorneo(t)).toEqual({
      inicio: '2025-03-01T15:00:00-03:00',
      desde: '2025-03-01T15:00:00-03:00',
      hasta: '2025-08-09T15:00:00-03:00',
    });
    expect(torneoEnRango(t, { desde: '2026-01-01', hasta: '2026-12-31' })).toBe(false);
    expect(torneoEnRango(t, { desde: '2025-08-09', hasta: '2025-08-09' })).toBe(true);
    // Sin partidos cuenta desde que se creó, y en inscripción no tiene fin.
    const abierto = torneo({ id: 'b', estado: 'INSCRIPCION', creadoEn: '2026-10-20T12:00:00Z' });
    expect(actividadDelTorneo(abierto)).toEqual({ inicio: null, desde: '2026-10-20T12:00:00Z', hasta: null });
    expect(torneoEnRango(abierto, { desde: '2026-10-25', hasta: '2026-10-26' })).toBe(true);
    expect(torneoEnRango(abierto, { desde: '2026-01-01', hasta: '2026-10-19' })).toBe(false);
  });
});

describe('métricas: retención de equipos (E24-01)', () => {
  const ap25 = torneo({ id: 'ap25', equipos: eq('A', 'B', 'C', 'D'), partidos: [partido('2025-03-01T15:00:00-03:00')] });
  const cl25 = torneo({ id: 'cl25', equipos: eq('A', 'B', 'C', 'E', 'F'), partidos: [partido('2025-08-02T15:00:00-03:00')] });
  const copa = torneo({ id: 'copa', formato: 'COPA', equipos: eq('Z'), partidos: [partido('2025-09-02T19:00:00-03:00')] });
  const ap26 = torneo({
    id: 'ap26',
    estado: 'INSCRIPCION',
    creadoEn: '2026-02-01T12:00:00Z',
    equipos: eq('A', 'E'),
  });

  it('compara cada torneo de temporada con el anterior, sin las copas y en orden de inicio', () => {
    const pares = paresDeRetencion([ap26, copa, cl25, ap25]);
    expect(pares.map((p) => `${p.desde.id}→${p.hacia.id}`)).toEqual(['ap25→cl25', 'cl25→ap26']);
    const [p1, p2] = pares;
    expect(p1!.repiten.map((e) => e.id)).toEqual(['A', 'B', 'C']);
    expect(p1!.seFueron.map((e) => e.id)).toEqual(['D']);
    expect(p1!.nuevos.map((e) => e.id)).toEqual(['E', 'F']);
    expect(p1!.tasa).toBe(0.75);
    expect(p1!.abierto).toBe(false);
    expect(p2!.tasa).toBe(0.4);
    expect(p2!.abierto).toBe(true);
  });

  it('la tasa usa los pares que ya cerraron la inscripción; si no hay, todos', () => {
    const pares = paresDeRetencion([ap25, cl25, ap26]);
    expect(tasaDeRetencion(pares)).toBe(0.75);
    expect(tasaDeRetencion(pares.slice(1))).toBe(0.4);
    expect(tasaDeRetencion([])).toBeNull();
  });

  it('un torneo sin equipos no rompe la cuenta', () => {
    const vacio = torneo({ id: 'v', partidos: [partido('2024-01-01T15:00:00-03:00')] });
    const [p] = paresDeRetencion([vacio, ap25]);
    expect(p!.tasa).toBeNull();
    expect(p!.nuevos).toHaveLength(4);
  });
});

describe('métricas: cobranza (E24-02)', () => {
  const inicio = '2026-03-07T19:00:00-03:00';

  it('tasa de cobro, cobro antes del inicio y mezcla de medios', () => {
    const r = cobranzaDelTorneo(
      [
        cargo(60000, [pago(60000, '2026-03-01T10:00:00-03:00', 'EFECTIVO')]),
        cargo(60000, [pago(30000, '2026-03-02T10:00:00-03:00', 'TRANSFERENCIA'), pago(30000, '2026-03-10T10:00:00-03:00', 'EFECTIVO')]),
        cargo(60000, [pago(60000, '2026-03-20T10:00:00-03:00', 'MERCADO_PAGO')]),
        cargo(60000),
        // Una multa: suma al facturado pero no a la inscripción.
        cargo(5000, [pago(5000, '2026-04-01T10:00:00-03:00')], { esInscripcion: false }),
        // Lo anulado no cuenta.
        cargo(9999, [], { estado: 'ANULADO' }),
      ],
      inicio,
    );
    expect(r.facturado).toBe(245000);
    expect(r.cobrado).toBe(185000);
    expect(r.tasa).toBeCloseTo(185000 / 245000);
    expect(r.inscripcion).toEqual({ facturado: 240000, antesDelInicio: 90000, tasa: 0.375 });
    expect(r.porMedio).toEqual({
      EFECTIVO: { monto: 95000, cantidad: 3 },
      TRANSFERENCIA: { monto: 30000, cantidad: 1 },
      MERCADO_PAGO: { monto: 60000, cantidad: 1 },
    });
    const mezcla = mezclaDeMedios(r.porMedio);
    expect(mezcla.EFECTIVO).toBeCloseTo(95000 / 185000);
    expect(mezcla.MERCADO_PAGO! + mezcla.EFECTIVO! + mezcla.TRANSFERENCIA!).toBeCloseTo(1);
  });

  it('los pagos pendientes o rechazados no cuentan y un pago de más no pasa el monto del cargo', () => {
    const r = cobranzaDelTorneo(
      [
        cargo(1000, [pago(1500, '2026-01-01T00:00:00Z')]),
        cargo(1000, [pago(1000, '2026-01-01T00:00:00Z', 'MERCADO_PAGO', 'PENDIENTE'), pago(1000, '2026-01-01T00:00:00Z', 'MERCADO_PAGO', 'RECHAZADO')]),
      ],
      null,
    );
    expect(r.cobrado).toBe(1000);
    expect(r.porMedio.MERCADO_PAGO.cantidad).toBe(0);
    // Sin partidos todavía, todo lo cobrado es anterior al inicio.
    expect(r.inscripcion.antesDelInicio).toBe(1000);
  });

  it('sin cargos las tasas quedan vacías, y la suma de torneos recalcula las tasas', () => {
    const vacio = cobranzaDelTorneo([], null);
    expect(vacio.tasa).toBeNull();
    expect(mezclaDeMedios(vacio.porMedio).EFECTIVO).toBeNull();
    const a = cobranzaDelTorneo([cargo(100, [pago(100, '2026-01-01T00:00:00Z')])], null);
    const b = cobranzaDelTorneo([cargo(300)], null);
    const s = sumarCobranzas([a, b]);
    expect(s.facturado).toBe(400);
    expect(s.tasa).toBe(0.25);
    expect(s.porMedio.EFECTIVO).toEqual({ monto: 100, cantidad: 1 });
  });
});

describe('métricas: canchas y horarios (E24-03)', () => {
  const canchas = [
    { id: 'c1', nombre: 'Cancha 1' },
    { id: 'c2', nombre: 'Cancha 2' },
  ];

  it('ocupación por jornada: partidos sobre canchas por horarios usados ese día', () => {
    const r = ocupacionPorJornada(
      [
        // Sábado: 19 y 20 hs en 2 canchas, 3 partidos → 75 %.
        partido('2026-10-03T19:00:00-03:00', 'c1'),
        partido('2026-10-03T19:00:00-03:00', 'c2'),
        partido('2026-10-03T20:00:00-03:00', 'c1'),
        // Martes: un horario, las dos canchas → 100 %.
        partido('2026-10-06T19:00:00-03:00', 'c1', 'PROGRAMADO'),
        partido('2026-10-06T19:00:00-03:00', 'c2', 'PROGRAMADO'),
        // Suspendidos y sin cancha no ocupan.
        partido('2026-10-06T20:00:00-03:00', 'c1', 'SUSPENDIDO'),
        partido('2026-10-07T20:00:00-03:00', null),
      ],
      canchas,
    );
    expect(r.jornadas).toBe(2);
    expect(r.partidos).toBe(5);
    expect(r.promedio).toBeCloseTo(0.875);
    expect(r.porCancha).toEqual([
      { id: 'c1', nombre: 'Cancha 1', partidos: 3, ocupacion: 1 },
      { id: 'c2', nombre: 'Cancha 2', partidos: 2, ocupacion: 2 / 3 },
    ]);
  });

  it('una cancha bloqueada que no se usó no suma capacidad', () => {
    const r = ocupacionPorJornada([partido('2026-10-03T19:00:00-03:00', 'c1')], [...canchas.slice(0, 1), { id: 'c3', nombre: 'C3', bloqueada: true }]);
    expect(r.promedio).toBe(1);
    expect(r.porCancha.map((c) => c.id)).toEqual(['c1']);
    expect(ocupacionPorJornada([], canchas).promedio).toBeNull();
  });

  it('mapa de calor: día de la semana (lunes primero) por franja, con el pico', () => {
    const m = mapaDeHorarios([
      partido('2026-10-03T19:00:00-03:00'), // sábado 16–20
      partido('2026-10-03T18:00:00-03:00'), // sábado 16–20
      partido('2026-10-03T21:00:00-03:00'), // sábado 20–24
      partido('2026-10-04T10:00:00-03:00'), // domingo 8–12
      partido('2026-10-05T07:00:00-03:00'), // lunes temprano: primera franja
      partido('2026-10-06T19:00:00-03:00', 'c1', 'SUSPENDIDO'),
      partido(null),
    ]);
    expect(m.celdas[2]![5]).toBe(2);
    expect(m.celdas[3]![5]).toBe(1);
    expect(m.celdas[0]![6]).toBe(1);
    expect(m.celdas[0]![0]).toBe(1);
    expect(m.celdas[2]![1]).toBe(0);
    expect(m.maximo).toBe(2);
    expect(m.pico).toEqual({ franja: 2, dia: 5, partidos: 2 });
    expect(mapaDeHorarios([]).pico).toBeNull();
  });

  it('asistencia: W.O. sobre partidos jugados', () => {
    expect(
      asistencia([partido(null), partido(null, null, 'WO'), partido(null, null, 'PROGRAMADO'), partido(null, null, 'FINALIZADO'), partido(null, null, 'FINALIZADO')]),
    ).toEqual({ jugados: 4, wo: 1, tasa: 0.75 });
    expect(asistencia([]).tasa).toBeNull();
  });
});

describe('métricas: todo junto', () => {
  const canchas = [{ id: 'c1', nombre: 'Cancha 1' }];
  const viejo = torneo({
    id: 'cl25',
    nombre: 'Clausura 2025',
    equipos: eq('A', 'B', 'C', 'D'),
    cargos: [cargo(100, [pago(100, '2025-07-01T00:00:00Z', 'EFECTIVO')])],
    partidos: [partido('2025-08-02T15:00:00-03:00'), partido('2025-08-09T15:00:00-03:00', 'c1', 'WO')],
  });
  const actual = torneo({
    id: 'ap26',
    nombre: 'Apertura 2026',
    estado: 'EN_CURSO',
    equipos: eq('A', 'B', 'C', 'E', 'F'),
    cargos: [cargo(200, [pago(200, '2026-10-01T00:00:00Z', 'MERCADO_PAGO')]), cargo(200)],
    partidos: [partido('2026-10-03T19:00:00-03:00'), partido('2026-10-31T19:00:00-03:00', 'c1', 'PROGRAMADO')],
  });
  const todos = [actual, viejo];

  it('la temporada toma los torneos activos este año y la retención que llega a ellos', () => {
    const m = calcularMetricas(todos, canchas, { periodo: 'TEMPORADA' }, '2026-10-26');
    expect(m.torneos.map((t) => t.id)).toEqual(['ap26']);
    expect(m.retencion.pares).toHaveLength(1);
    expect(m.retencion.tasa).toBe(0.75);
    expect(m.cobranza.facturado).toBe(400);
    expect(m.cobranza.tasa).toBe(0.5);
    expect(m.cobranza.mezcla.MERCADO_PAGO).toBe(1);
    expect(m.cobranzaPorTorneo[0]!.inscripcion.tasa).toBe(0.5);
    expect(m.canchas.partidos).toBe(2);
    expect(m.asistencia).toEqual({ jugados: 1, wo: 0, tasa: 1 });
    // La serie de inscriptos muestra toda la historia y marca lo que entra en el filtro.
    expect(m.inscriptos.serie.map((s) => [s.id, s.equipos, s.enFiltro])).toEqual([
      ['cl25', 4, false],
      ['ap26', 5, true],
    ]);
    expect(m.inscriptos.variacion).toBe(0.25);
  });

  it('últimos 30 días: solo los partidos de la ventana', () => {
    const m = calcularMetricas(todos, canchas, { periodo: '30D' }, '2026-10-26');
    expect(m.canchas.partidos).toBe(1);
  });

  it('histórico junta todo; un torneo elegido manda sobre el período', () => {
    const h = calcularMetricas(todos, canchas, { periodo: 'HISTORICO' }, '2026-10-26');
    expect(h.torneos.map((t) => t.id)).toEqual(['cl25', 'ap26']);
    expect(h.asistencia).toEqual({ jugados: 3, wo: 1, tasa: 2 / 3 });
    expect(h.cobranza.mezcla.EFECTIVO).toBeCloseTo(1 / 3);
    const t = calcularMetricas(todos, canchas, { periodo: '30D', torneoId: 'cl25' }, '2026-10-26');
    expect(t.torneos.map((x) => x.id)).toEqual(['cl25']);
    expect(t.retencion.pares.map((p) => p.hacia.id)).toEqual(['ap26']);
    // El último torneo no tiene siguiente: muestra de dónde vinieron sus equipos.
    const ultimo = calcularMetricas(todos, canchas, { periodo: '30D', torneoId: 'ap26' }, '2026-10-26');
    expect(ultimo.retencion.pares.map((p) => p.desde.id)).toEqual(['cl25']);
    expect(t.canchas.partidos).toBe(2);
  });
});
