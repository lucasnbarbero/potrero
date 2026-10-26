import { describe, expect, it } from 'vitest';
import { DATOS } from '../datos.js';
import { asientosDePago, ingresoDeCategoria, saldos } from './caja.js';
import {
  type CargoPorFechaGuardado,
  cambiosDeCargosPorFecha,
  cargoConfirmaInscripcion,
  cargosPorFecha,
  configCobrosPorFecha,
  deudaPorFecha,
  desdeFechaAlConfigurar,
  proximaFecha,
  DIAS_ANTICIPACION_COBRO_POR_FECHA,
  inscripcionConfirmada,
  type PartidoParaCobro,
} from './cobros.js';

// Tres equipos: en cada fecha uno queda libre. Los partidos son a las 20 h de Argentina (23 h UTC).
const equipos = [
  { id: 'A', jugadores: 10 },
  { id: 'B', jugadores: 8 },
  { id: 'C', jugadores: 0 },
];
const partido = (
  id: string,
  fecha: number,
  localId: string,
  visitanteId: string,
  dia: string,
  extra: Partial<PartidoParaCobro> = {},
): PartidoParaCobro => ({
  id,
  fecha,
  fase: 'LIGA',
  localId,
  visitanteId,
  inicio: `${dia}T23:00:00.000Z`,
  estado: 'PROGRAMADO',
  ...extra,
});
const partidos = [
  partido('p1', 1, 'A', 'B', '2026-11-07'),
  partido('p2', 2, 'B', 'C', '2026-11-14'),
  partido('p3', 3, 'C', 'A', '2026-11-21'),
];
const cuota = (extra: Partial<Parameters<typeof configCobrosPorFecha>[0]> = {}) =>
  configCobrosPorFecha({ cuotaPorFecha: 5_000, ...extra });

describe('cuota por fecha (E06-20)', () => {
  it('los valores por defecto salen de datos.json', () => {
    const { anticipacionDias, ...porDefecto } = DATOS.cobrosPorFechaPorDefecto;
    expect(configCobrosPorFecha(null)).toEqual({
      ...porDefecto,
      cuotaDesdeFecha: null,
      seguroDesdeFecha: null,
    });
    expect(DIAS_ANTICIPACION_COBRO_POR_FECHA).toBe(anticipacionDias);
    expect(configCobrosPorFecha({ cuotaPorFecha: 3_000 }).cobrarWO).toBe(
      DATOS.cobrosPorFechaPorDefecto.cobrarWO,
    );
  });

  it('monto 0 = no se cobra nada', () => {
    expect(cargosPorFecha({ torneoId: 't', config: configCobrosPorFecha(null), equipos, partidos })).toEqual(
      [],
    );
  });

  it('un cargo por equipo y por fecha que juega, que vence el día del partido en hora de Argentina', () => {
    const c = cargosPorFecha({ torneoId: 't', config: cuota(), equipos, partidos });
    expect(c.map((x) => `${x.fecha}:${x.equipoId}`)).toEqual(['1:A', '1:B', '2:B', '2:C', '3:A', '3:C']);
    expect(c[0]).toMatchObject({
      clave: 'cuota:t:A:1',
      tipo: 'CUOTA',
      concepto: 'Cuota fecha 1',
      monto: 5_000,
      categoria: 'INSCRIPCIONES',
      vence: '2026-11-07',
      partidoId: 'p1',
    });
  });

  it('activada con el torneo empezado, se cobra desde la próxima fecha: nunca las ya jugadas', () => {
    const jugados = [
      { ...partidos[0]!, estado: 'FINALIZADO' as const },
      { ...partidos[1]!, estado: 'WO' as const },
      partidos[2]!,
    ];
    expect(proximaFecha(jugados)).toBe(3);
    expect(proximaFecha(partidos)).toBeNull();
    // Un partido postergado de la fecha 1 no hace volver a cobrar desde la 2.
    expect(proximaFecha([{ ...jugados[0]!, estado: 'PROGRAMADO' }, jugados[1]!, jugados[2]!])).toBe(3);

    const apagada = configCobrosPorFecha(null);
    const desde = desdeFechaAlConfigurar(
      apagada,
      { cuotaPorFecha: 5_000, seguroPorJugadorPorFecha: 0 },
      jugados,
    );
    expect(desde).toEqual({ cuotaDesdeFecha: 3, seguroDesdeFecha: null });
    const c = cargosPorFecha({ torneoId: 't', config: cuota(desde), equipos, partidos: jugados });
    expect(c.map((x) => `${x.fecha}:${x.equipoId}`)).toEqual(['3:A', '3:C']);
  });

  it('si ya estaba activa se mantiene desde dónde se cobra; apagarla lo olvida; el seguro tiene su propio inicio', () => {
    const jugados = [{ ...partidos[0]!, estado: 'FINALIZADO' as const }, partidos[1]!, partidos[2]!];
    const activa = cuota({ cuotaDesdeFecha: 1 });
    expect(
      desdeFechaAlConfigurar(activa, { cuotaPorFecha: 8_000, seguroPorJugadorPorFecha: 500 }, jugados),
    ).toEqual({
      cuotaDesdeFecha: 1,
      seguroDesdeFecha: 2,
    });
    expect(
      desdeFechaAlConfigurar(activa, { cuotaPorFecha: 0, seguroPorJugadorPorFecha: 0 }, jugados),
    ).toEqual({
      cuotaDesdeFecha: null,
      seguroDesdeFecha: null,
    });
    const c = cargosPorFecha({
      torneoId: 't',
      config: configCobrosPorFecha({ seguroPorJugadorPorFecha: 500, seguroDesdeFecha: 2 }),
      equipos,
      partidos: jugados,
    });
    expect(c.map((x) => `${x.fecha}:${x.equipoId}`)).toEqual(['2:B', '3:A']);
  });

  it('un partido de madrugada (UTC del día siguiente) vence el día de Argentina', () => {
    const c = cargosPorFecha({
      torneoId: 't',
      config: cuota(),
      equipos,
      partidos: [{ ...partidos[0]!, inicio: '2026-11-08T02:30:00.000Z' }],
    });
    expect(c[0]!.vence).toBe('2026-11-07');
  });

  it('la fecha libre no se cobra por defecto; si se configura, vence el primer día de la fecha', () => {
    expect(
      cargosPorFecha({ torneoId: 't', config: cuota(), equipos, partidos }).some((x) => !x.partidoId),
    ).toBe(false);
    const c = cargosPorFecha({ torneoId: 't', config: cuota({ cobrarFechaLibre: true }), equipos, partidos });
    const libre = c.find((x) => x.fecha === 1 && x.equipoId === 'C')!;
    expect(libre).toMatchObject({ partidoId: null, vence: '2026-11-07', concepto: 'Cuota fecha 1 (libre)' });
    expect(c).toHaveLength(9);
    // Un inscripto que no está en el fixture no tiene "fecha libre".
    const conAfuera = cargosPorFecha({
      torneoId: 't',
      config: cuota({ cobrarFechaLibre: true }),
      equipos: [...equipos, { id: 'D', jugadores: 5 }],
      partidos,
    });
    expect(conAfuera.some((x) => x.equipoId === 'D')).toBe(false);
  });

  it('en una llave, quedar afuera no es fecha libre', () => {
    const c = cargosPorFecha({
      torneoId: 't',
      config: cuota({ cobrarFechaLibre: true }),
      equipos,
      partidos: [partido('f', 4, 'A', 'B', '2026-11-28', { fase: 'LLAVE' })],
    });
    expect(c.map((x) => x.equipoId)).toEqual(['A', 'B']);
  });

  it('el suspendido no se cobra por defecto y el W.O. sí (configurable)', () => {
    const conEstados = [
      { ...partidos[0]!, estado: 'SUSPENDIDO' as const },
      { ...partidos[1]!, estado: 'WO' as const },
    ];
    const def = cargosPorFecha({ torneoId: 't', config: cuota(), equipos, partidos: conEstados });
    expect(def.map((x) => x.partidoId)).toEqual(['p2', 'p2']);
    const otro = cargosPorFecha({
      torneoId: 't',
      config: cuota({ cobrarPartidoSuspendido: true, cobrarWO: false }),
      equipos,
      partidos: conEstados,
    });
    expect(otro.map((x) => x.partidoId)).toEqual(['p1', 'p1']);
  });

  it('un partido sin horario todavía no genera cargo', () => {
    const c = cargosPorFecha({
      torneoId: 't',
      config: cuota(),
      equipos,
      partidos: [{ ...partidos[0]!, inicio: null }],
    });
    expect(c).toEqual([]);
  });
});

describe('seguro por jugador por fecha (E06-21)', () => {
  const seguro = configCobrosPorFecha({ seguroPorJugadorPorFecha: 700 });

  it('monto × jugadores del plantel, aparte de la cuota y en el rubro Seguros', () => {
    const c = cargosPorFecha({
      torneoId: 't',
      config: { ...seguro, cuotaPorFecha: 5_000 },
      equipos,
      partidos: partidos.slice(0, 1),
    });
    expect(c.map((x) => [x.tipo, x.equipoId, x.monto])).toEqual([
      ['CUOTA', 'A', 5_000],
      ['SEGURO', 'A', 7_000],
      ['CUOTA', 'B', 5_000],
      ['SEGURO', 'B', 5_600],
    ]);
    expect(c[1]).toMatchObject({
      clave: 'seguro:t:A:1',
      concepto: 'Seguro fecha 1 · 10 jugadores',
      categoria: 'SEGUROS',
    });
  });

  it('sin jugadores en el plantel no hay seguro, y en la fecha libre tampoco', () => {
    const c = cargosPorFecha({
      torneoId: 't',
      config: { ...seguro, cobrarFechaLibre: true },
      equipos,
      partidos,
    });
    expect(c.every((x) => x.equipoId !== 'C')).toBe(true);
    expect(c.every((x) => x.partidoId)).toBe(true);
  });
});

describe('sincronización de los cargos por fecha', () => {
  const deseados = cargosPorFecha({ torneoId: 't', config: cuota(), equipos, partidos });
  const guardado = (clave: string, extra: Partial<CargoPorFechaGuardado> = {}): CargoPorFechaGuardado => {
    const x = deseados.find((d) => d.clave === clave)!;
    return {
      id: `id-${clave}`,
      clave,
      estado: 'PENDIENTE',
      monto: x.monto,
      concepto: x.concepto,
      vence: x.vence,
      partidoId: x.partidoId,
      pagado: 0,
      ...extra,
    };
  };

  it('crea solo las fechas que se juegan dentro de la anticipación (7 días)', () => {
    const r = cambiosDeCargosPorFecha([], deseados, { hoy: '2026-11-01' });
    expect(r.crear.map((x) => x.clave)).toEqual(['cuota:t:A:1', 'cuota:t:B:1']);
    expect(cambiosDeCargosPorFecha([], deseados, { hoy: '2026-11-06' }).crear).toHaveLength(2);
    expect(cambiosDeCargosPorFecha([], deseados, { hoy: '2026-11-07' }).crear).toHaveLength(4);
    expect(cambiosDeCargosPorFecha([], deseados, { hoy: '2026-12-01' }).crear).toHaveLength(6);
  });

  it('es idempotente: con los cargos ya guardados no hay nada que hacer', () => {
    const guardados = deseados.map((d) => guardado(d.clave));
    expect(cambiosDeCargosPorFecha(guardados, deseados, { hoy: '2026-12-01' })).toEqual({
      crear: [],
      actualizar: [],
      anular: [],
    });
  });

  it('si el partido se suspende, el cargo pendiente sin pagos se anula; el pagado o con pagos no se toca', () => {
    const suspendido = cargosPorFecha({
      torneoId: 't',
      config: cuota(),
      equipos,
      partidos: [{ ...partidos[0]!, estado: 'SUSPENDIDO' }, ...partidos.slice(1)],
    });
    const r = cambiosDeCargosPorFecha(
      [guardado('cuota:t:A:1'), guardado('cuota:t:B:1', { estado: 'PAGADO', pagado: 5_000 })],
      suspendido,
      { hoy: '2026-11-01' },
    );
    expect(r.anular).toEqual(['id-cuota:t:A:1']);
    const conPagoParcial = cambiosDeCargosPorFecha([guardado('cuota:t:A:1', { pagado: 1_000 })], suspendido, {
      hoy: '2026-11-01',
    });
    expect(conPagoParcial.anular).toEqual([]);
  });

  it('un cargo anulado revive si su partido vuelve al fixture', () => {
    const r = cambiosDeCargosPorFecha([guardado('cuota:t:A:1', { estado: 'ANULADO' })], deseados, {
      hoy: '2026-11-01',
    });
    expect(r.actualizar).toEqual([
      { id: 'id-cuota:t:A:1', vence: '2026-11-07', partidoId: 'p1', estado: 'PENDIENTE' },
    ]);
  });

  it('si se mueve el partido, el vencimiento lo acompaña (aunque quede fuera de la anticipación)', () => {
    const movido = cargosPorFecha({
      torneoId: 't',
      config: cuota(),
      equipos,
      partidos: [{ ...partidos[0]!, inicio: '2026-11-20T23:00:00.000Z' }],
    });
    const r = cambiosDeCargosPorFecha([guardado('cuota:t:A:1')], movido, { hoy: '2026-11-01' });
    expect(r.actualizar).toEqual([{ id: 'id-cuota:t:A:1', vence: '2026-11-20', partidoId: 'p1' }]);
    expect(r.crear).toEqual([]);
  });

  it('el monto queda fijo al generarse; con repreciar cambia solo en los pendientes sin pagos', () => {
    const caros = cargosPorFecha({
      torneoId: 't',
      config: cuota({ cuotaPorFecha: 6_000 }),
      equipos,
      partidos,
    });
    const guardados = [guardado('cuota:t:A:1'), guardado('cuota:t:B:1', { pagado: 2_000 })];
    expect(cambiosDeCargosPorFecha(guardados, caros, { hoy: '2026-11-01' }).actualizar).toEqual([]);
    expect(
      cambiosDeCargosPorFecha(guardados, caros, { hoy: '2026-11-01', repreciar: true }).actualizar,
    ).toEqual([
      { id: 'id-cuota:t:A:1', vence: '2026-11-07', partidoId: 'p1', monto: 6_000, concepto: 'Cuota fecha 1' },
    ]);
  });

  it('si el organizador apaga la cuota, se anulan los pendientes sin pagos', () => {
    const r = cambiosDeCargosPorFecha([guardado('cuota:t:A:1'), guardado('cuota:t:B:1')], [], {
      hoy: '2026-11-01',
    });
    expect(r.anular).toHaveLength(2);
  });
});

describe('inscripción y deuda por fecha', () => {
  it('la inscripción se confirma con la inscripción o seña pagadas, sin esperar cuotas ni multas', () => {
    expect(cargoConfirmaInscripcion({ categoria: 'INSCRIPCIONES', fecha: null })).toBe(true);
    expect(cargoConfirmaInscripcion({ categoria: 'INSCRIPCIONES', fecha: 3 })).toBe(false);
    expect(cargoConfirmaInscripcion({ categoria: 'SEGUROS', fecha: 3 })).toBe(false);
    expect(cargoConfirmaInscripcion({ categoria: 'MULTAS', fecha: null })).toBe(false);
    expect(
      inscripcionConfirmada([
        { estado: 'PAGADO', categoria: 'INSCRIPCIONES', fecha: null },
        { estado: 'PENDIENTE', categoria: 'INSCRIPCIONES', fecha: 2 },
        { estado: 'PENDIENTE', categoria: 'SEGUROS', fecha: 2 },
      ]),
    ).toBe(true);
    expect(inscripcionConfirmada([{ estado: 'PENDIENTE', categoria: 'INSCRIPCIONES', fecha: null }])).toBe(
      false,
    );
    expect(inscripcionConfirmada([])).toBe(true);
  });

  it('la deuda por fecha cuenta lo que vence hasta hoy y separa lo vencido', () => {
    const base = { estado: 'PENDIENTE', monto: 5_000, pagado: 0 };
    const d = deudaPorFecha(
      [
        { ...base, concepto: 'Cuota fecha 2', fecha: 2, vence: '2026-11-14' },
        { ...base, concepto: 'Cuota fecha 1', fecha: 1, vence: '2026-11-07', pagado: 1_000 },
        { ...base, concepto: 'Cuota fecha 3', fecha: 3, vence: '2026-11-21' },
        { ...base, concepto: 'Inscripción', fecha: null, vence: '2026-11-01' },
        { ...base, concepto: 'Cuota fecha 0', fecha: 0, vence: '2026-11-01', estado: 'PAGADO' },
      ],
      '2026-11-14',
    );
    expect(d).toEqual({
      monto: 9_000,
      vencido: 4_000,
      cargos: [
        { concepto: 'Cuota fecha 1', falta: 4_000, vence: '2026-11-07' },
        { concepto: 'Cuota fecha 2', falta: 5_000, vence: '2026-11-14' },
      ],
    });
  });
});

describe('caja: rubro Seguros', () => {
  it('un pago de seguro entra en INGRESOS:SEGUROS y se ve aparte', () => {
    const { cobro } = asientosDePago({ metodo: 'EFECTIVO', monto: 7_000, comision: 0, categoria: 'SEGUROS' });
    const s = saldos(cobro);
    expect(ingresoDeCategoria(s, 'SEGUROS')).toBe(7_000);
    expect(ingresoDeCategoria(s, 'INSCRIPCIONES')).toBe(0);
  });
});
