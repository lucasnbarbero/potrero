// Cuota por fecha y seguro por jugador (E06-20, E06-21) de punta a punta: configuración, generación idempotente con el
// fixture, suspendidos y W.O., fecha libre, cambio de montos, inscripción, caja (rubro Seguros), deuda en el acta y aislamiento.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error: módulo compilado (ver vitest.config.ts)
import { AppModule } from '../dist/app.module.js';
// @ts-expect-error: módulo compilado
import { CobrosService } from '../dist/cobros/cobros.js';

let app: INestApplication;
let base: string;
let admin: pg.Client;

function cliente() {
  let cookies = '';
  return async (metodo: string, ruta: string, cuerpo?: unknown) => {
    const r = await fetch(`${base}/api${ruta}`, {
      method: metodo,
      headers: { 'content-type': 'application/json', cookie: cookies },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const nuevas = r.headers.getSetCookie().map((c) => c.split(';')[0]);
    if (nuevas.length) cookies = nuevas.join('; ');
    const texto = await r.text();
    return { status: r.status, body: texto ? JSON.parse(texto) : null };
  };
}

beforeAll(async () => {
  admin = new pg.Client({ connectionString: process.env.DATABASE_URL_ADMIN });
  await admin.connect();
  const { rows } = await admin.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
  );
  await admin.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} CASCADE`);
  app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  await app.listen(0);
  base = (await app.getUrl()).replace('[::1]', 'localhost');
}, 60_000);

afterAll(async () => {
  await app?.close();
  await admin?.end();
});

const consulta = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(
  new Date(),
);
const corrido = (dias: number) =>
  new Date(Date.parse(`${hoy}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);

interface CargoFecha {
  id: string;
  fecha: number;
  tipo: 'CUOTA' | 'SEGURO';
  equipo: { id: string; nombre: string };
  concepto: string;
  monto: number;
  pagado: number;
  estado: string;
  vence: string;
}

describe('cuota por fecha y seguro por jugador', () => {
  const api = cliente();
  const otra = cliente();
  let torneoId: string;
  const equipo: Record<string, string> = {};
  let partidos: { id: string; fecha: number; localId: string; visitanteId: string }[] = [];
  const cobros = async () =>
    (await api('GET', `/torneos/${torneoId}/cobros-por-fecha`)).body as {
      config: Record<string, unknown>;
      anticipacionDias: number;
      totales: { cuotas: { total: number; cobrado: number }; seguros: { total: number; cobrado: number } };
      cargos: CargoFecha[];
    };
  const configBase = {
    cuotaPorFecha: 5_000,
    seguroPorJugadorPorFecha: 500,
    cobrarFechaLibre: false,
    cobrarPartidoSuspendido: false,
    cobrarWO: true,
    deudaBloqueaJugar: false,
  };

  it('el torneo se crea con cuota y seguro; lo demás toma los valores por defecto', async () => {
    await api('POST', '/auth/registro', {
      nombre: 'Organizadora',
      email: 'cuotas@test.com',
      password: 'clave-segura-1',
      organizacion: 'Liga Cuotas',
    });
    const t = await api('POST', '/torneos', {
      nombre: 'Clausura por fecha',
      modalidad: 'F5',
      formato: 'LIGA',
      cupo: 8,
      inscripcion: 0,
      cobrosPorFecha: { cuotaPorFecha: 5_000, seguroPorJugadorPorFecha: 500 },
    });
    expect(t.status).toBe(201);
    torneoId = t.body.id;
    const r = await cobros();
    expect(r.config).toEqual({ ...configBase, cuotaDesdeFecha: null, seguroDesdeFecha: null });
    expect(r.anticipacionDias).toBe(7);
    expect(r.cargos).toEqual([]);
  });

  it('sin inscripción, los equipos quedan confirmados y el fixture genera solo la fecha próxima', async () => {
    for (const [n, jugadores] of [
      ['A', 3],
      ['B', 2],
      ['C', 1],
    ] as const) {
      const e = await api('POST', '/equipos', { nombre: `Equipo ${n}` });
      equipo[n] = e.body.id;
      for (let i = 0; i < jugadores; i++)
        await api('POST', `/equipos/${e.body.id}/jugadores`, { nombre: `J${i}`, apellido: n });
      const ins = await api('POST', `/torneos/${torneoId}/inscripciones`, { equipoId: e.body.id });
      expect(ins.body.inscripcion.estado).toBe('CONFIRMADA');
    }
    await api('POST', '/canchas', { sede: 'Complejo', nombre: 'Cancha 1' });
    const canchas = (await api('GET', '/canchas')).body[0].canchas.map((c: { id: string }) => c.id);
    const f = await api('POST', `/torneos/${torneoId}/fixture`, {
      primerDia: hoy,
      diasEntreFechas: 10,
      horarios: ['20:00'],
      canchaIds: canchas,
    });
    expect(f.status).toBe(201);
    partidos = (await api('GET', `/torneos/${torneoId}/partidos`)).body;
    const f1 = partidos.find((p) => p.fecha === 1)!;
    const { cargos } = await cobros();
    // Fecha 1: juegan dos equipos (uno queda libre). Cuota y seguro para cada uno; las fechas 2 y 3 todavía no.
    expect(cargos.every((x) => x.fecha === 1 && x.vence === hoy)).toBe(true);
    const deEquipo = (id: string) => cargos.filter((x) => x.equipo.id === id);
    const jugadores: Record<string, number> = { [equipo.A!]: 3, [equipo.B!]: 2, [equipo.C!]: 1 };
    for (const id of [f1.localId, f1.visitanteId]) {
      expect(deEquipo(id).map((x) => [x.tipo, x.monto])).toEqual([
        ['CUOTA', 5_000],
        ['SEGURO', 500 * jugadores[id]!],
      ]);
    }
    expect(cargos).toHaveLength(4);
    expect(cargos.find((x) => x.tipo === 'CUOTA')!.concepto).toBe('Cuota fecha 1');
    const [cargo] = await consulta("SELECT categoria FROM cargo WHERE clave LIKE 'seguro:%' LIMIT 1");
    expect(cargo).toEqual({ categoria: 'SEGUROS' });
  });

  it('generar otra vez no duplica nada', async () => {
    const r = await api('POST', `/torneos/${torneoId}/cobros-por-fecha/generar`);
    expect(r.body).toEqual({ creados: 0, actualizados: 0, anulados: 0 });
    expect(await app.get(CobrosService).generarCobrosPorFecha()).toBe(0);
    expect((await cobros()).cargos).toHaveLength(4);
  });

  it('la deuda entra en el estado de pago del equipo, sin trabar la inscripción', async () => {
    const lista = (await api('GET', `/torneos/${torneoId}/inscripciones`)).body as {
      estado: string;
      equipo: { id: string };
      debe: number;
      deudaPorFecha: { monto: number; vencido: number };
      cargos: { categoria: string; fecha: number | null; vence: string | null }[];
    }[];
    const f1 = partidos.find((p) => p.fecha === 1)!;
    const local = lista.find((i) => i.equipo.id === f1.localId)!;
    expect(local.estado).toBe('CONFIRMADA');
    expect(local.debe).toBeGreaterThan(5_000);
    expect(local.deudaPorFecha.monto).toBe(local.debe);
    expect(local.deudaPorFecha.vencido).toBe(0);
    expect(local.cargos[0]).toMatchObject({ fecha: 1, vence: hoy });
  });

  it('los pagos de seguro entran en el rubro Seguros de la caja; la cuota, en por cobrar', async () => {
    const { cargos } = await cobros();
    const seguro = cargos.find((x) => x.tipo === 'SEGURO')!;
    expect(
      (await api('POST', `/cargos/${seguro.id}/pagos`, { metodo: 'EFECTIVO', monto: seguro.monto })).status,
    ).toBe(201);
    const caja = (await api('GET', `/caja?torneoId=${torneoId}`)).body;
    const pendienteSeguros = cargos
      .filter((x) => x.tipo === 'SEGURO' && x.id !== seguro.id)
      .reduce((s, x) => s + x.monto, 0);
    expect(caja.seguros).toEqual({ cobrado: seguro.monto, porCobrar: pendienteSeguros });
    expect(caja.porCobrar.monto).toBe(10_000 + pendienteSeguros);
    const movs = (await api('GET', `/caja/movimientos?torneoId=${torneoId}`)).body.movimientos;
    expect(movs[0].detalle).toBe('Efectivo · Seguros');
  });

  it('si el partido se suspende, se anulan los cargos pendientes; si vuelve, reviven', async () => {
    const f1 = partidos.find((p) => p.fecha === 1)!;
    await consulta(`UPDATE partido SET estado = 'SUSPENDIDO' WHERE id = $1`, [f1.id]);
    const r = await api('POST', `/torneos/${torneoId}/cobros-por-fecha/generar`);
    // El seguro pagado no se toca: devolverlo es un reembolso.
    expect(r.body).toEqual({ creados: 0, actualizados: 0, anulados: 3 });
    const tras = await cobros();
    expect(tras.cargos.filter((x) => x.estado === 'ANULADO')).toHaveLength(3);
    expect(tras.cargos.filter((x) => x.estado === 'PAGADO')).toHaveLength(1);
    expect(tras.totales.cuotas.total).toBe(0);
    await consulta(`UPDATE partido SET estado = 'PROGRAMADO' WHERE id = $1`, [f1.id]);
    const otra = await api('POST', `/torneos/${torneoId}/cobros-por-fecha/generar`);
    expect(otra.body).toEqual({ creados: 0, actualizados: 3, anulados: 0 });
    expect((await cobros()).cargos.filter((x) => x.estado === 'PENDIENTE')).toHaveLength(3);
  });

  it('si el partido se mueve, el vencimiento lo acompaña', async () => {
    const f1 = partidos.find((p) => p.fecha === 1)!;
    await consulta(`UPDATE partido SET inicio = inicio + interval '1 day' WHERE id = $1`, [f1.id]);
    await api('POST', `/torneos/${torneoId}/cobros-por-fecha/generar`);
    const { cargos } = await cobros();
    expect(cargos.filter((x) => x.estado === 'PENDIENTE').every((x) => x.vence === corrido(1))).toBe(true);
  });

  it('el W.O. se cobra por defecto; si se apaga, se anulan los pendientes de esa fecha', async () => {
    const f1 = partidos.find((p) => p.fecha === 1)!;
    expect((await api('POST', `/partidos/${f1.id}/wo`, { ganadorId: f1.localId })).status).toBe(201);
    expect((await cobros()).cargos.filter((x) => x.estado === 'PENDIENTE')).toHaveLength(3);
    const r = await api('PATCH', `/torneos/${torneoId}/cobros-por-fecha`, { ...configBase, cobrarWO: false });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ anulados: 3 });
    await api('PATCH', `/torneos/${torneoId}/cobros-por-fecha`, configBase);
  });

  it('cambiar el monto reprecia los pendientes sin pagos; el seguro toma el plantel del momento', async () => {
    const f1 = partidos.find((p) => p.fecha === 1)!;
    const r = await api('PATCH', `/torneos/${torneoId}/cobros-por-fecha`, {
      ...configBase,
      cuotaPorFecha: 6_000,
    });
    expect(r.body).toMatchObject({ creados: 0, anulados: 0 });
    const cuotas = (await cobros()).cargos.filter((x) => x.tipo === 'CUOTA');
    expect(cuotas.map((x) => x.monto)).toEqual([6_000, 6_000]);
    // Uno de los equipos de la fecha 1 también juega la 2 (con tres equipos, uno solo queda libre).
    const f2 = partidos.find((p) => p.fecha === 2)!;
    const id = [f1.localId, f1.visitanteId].find((x) => x === f2.localId || x === f2.visitanteId)!;
    // Un jugador nuevo no cambia el seguro ya generado.
    await api('POST', `/equipos/${id}/jugadores`, { nombre: 'Nuevo', apellido: 'Refuerzo' });
    await api('POST', `/torneos/${torneoId}/cobros-por-fecha/generar`);
    const antes = (await cobros()).cargos.find((x) => x.tipo === 'SEGURO' && x.equipo.id === id)!;
    // La fecha 2 se acerca: su seguro sale con el plantel de hoy.
    await consulta(`UPDATE partido SET inicio = now() + interval '2 days' WHERE id = $1`, [f2.id]);
    const g = await api('POST', `/torneos/${torneoId}/cobros-por-fecha/generar`);
    expect(g.body.creados).toBe(4);
    const despues = (await cobros()).cargos.filter((x) => x.tipo === 'SEGURO' && x.equipo.id === id);
    expect(despues.find((x) => x.fecha === 1)!.monto).toBe(antes.monto);
    expect(despues.find((x) => x.fecha === 2)!.monto).toBe(antes.monto + 500);
  });

  it('la fecha libre se cobra solo si se configura', async () => {
    const f1 = partidos.find((p) => p.fecha === 1)!;
    const libre = Object.values(equipo).find((id) => id !== f1.localId && id !== f1.visitanteId)!;
    const r = await api('PATCH', `/torneos/${torneoId}/cobros-por-fecha`, {
      ...configBase,
      cuotaPorFecha: 6_000,
      cobrarFechaLibre: true,
    });
    // La libre de la fecha 1 y la de la fecha 2, que ya entró en la anticipación.
    expect(r.body.creados).toBe(2);
    const c = (await cobros()).cargos.find((x) => x.equipo.id === libre && x.fecha === 1)!;
    expect(c).toMatchObject({ concepto: 'Cuota fecha 1 (libre)', monto: 6_000, tipo: 'CUOTA' });
  });

  it('en el acta: alerta de deuda y, con el bloqueo encendido, el deudor con cuotas vencidas no está habilitado', async () => {
    const f1 = partidos.find((p) => p.fecha === 1)!;
    const f2 = partidos.find((p) => p.fecha === 2)!;
    // La fecha 1 pasa a haberse jugado hace dos días: sus cuotas impagas quedan vencidas.
    await consulta(`UPDATE partido SET inicio = inicio - interval '3 days' WHERE id = $1`, [f1.id]);
    await api('POST', `/torneos/${torneoId}/cobros-por-fecha/generar`);
    let d = (await api('GET', `/partidos/${f2.id}/deuda`)).body;
    expect(d.deudaBloqueaJugar).toBe(false);
    expect(d.local.habilitado).toBe(true);
    expect(d.local.vencido + d.visitante.vencido).toBeGreaterThan(0);
    await api('PATCH', `/torneos/${torneoId}/cobros-por-fecha`, {
      ...configBase,
      cuotaPorFecha: 6_000,
      cobrarFechaLibre: true,
      deudaBloqueaJugar: true,
    });
    d = (await api('GET', `/partidos/${f2.id}/deuda`)).body;
    expect(d.deudaBloqueaJugar).toBe(true);
    const deudor = d.local.vencido > 0 ? d.local : d.visitante;
    expect(deudor).toMatchObject({ habilitado: false });
    expect(deudor.cargos[0].concepto).toMatch(/^Cuota fecha 1/);
  });

  it('valida los montos y otra organización no ve nada', async () => {
    const mal = await api('PATCH', `/torneos/${torneoId}/cobros-por-fecha`, {
      ...configBase,
      cuotaPorFecha: -1,
    });
    expect(mal.status).toBe(400);
    const decimal = await api('PATCH', `/torneos/${torneoId}/cobros-por-fecha`, {
      ...configBase,
      seguroPorJugadorPorFecha: 10.5,
    });
    expect(decimal.status).toBe(400);
    await otra('POST', '/auth/registro', {
      nombre: 'Otra',
      email: 'otra-cuotas@test.com',
      password: 'clave-segura-1',
      organizacion: 'Liga Ajena',
    });
    expect((await otra('GET', `/torneos/${torneoId}/cobros-por-fecha`)).status).toBe(404);
    expect((await otra('PATCH', `/torneos/${torneoId}/cobros-por-fecha`, configBase)).status).toBe(404);
    expect((await otra('GET', `/partidos/${partidos[0]!.id}/deuda`)).status).toBe(404);
    expect((await otra('POST', `/torneos/${torneoId}/cobros-por-fecha/generar`)).status).toBe(404);
  });

  it('una inscripción con arancel se confirma al pagarla aunque deba cuotas por fecha', async () => {
    const t = (
      await api('POST', '/torneos', {
        nombre: 'Con arancel',
        modalidad: 'F5',
        formato: 'LIGA',
        cupo: 4,
        inscripcion: 10_000,
        cobrosPorFecha: { cuotaPorFecha: 3_000 },
      })
    ).body.id;
    const e = await api('POST', '/equipos', { nombre: 'Equipo D' });
    const ins = await api('POST', `/torneos/${t}/inscripciones`, { equipoId: e.body.id });
    expect(ins.body.inscripcion.estado).toBe('PENDIENTE');
    // Una cuota por fecha pendiente (por ejemplo, de una fecha ya generada) no traba la confirmación.
    await consulta(
      `INSERT INTO cargo (id, organizacion_id, inscripcion_id, concepto, monto, categoria, fecha, clave)
       SELECT 'cargo-cuota-d', organizacion_id, id, 'Cuota fecha 1', 3000, 'INSCRIPCIONES', 1, 'cuota:x' FROM inscripcion WHERE id = $1`,
      [ins.body.inscripcion.id],
    );
    await api('POST', `/cargos/${ins.body.cargo.id}/pagos`, { metodo: 'EFECTIVO', monto: 10_000 });
    const lista = (await api('GET', `/torneos/${t}/inscripciones`)).body;
    expect(lista[0].estado).toBe('CONFIRMADA');
    expect(lista[0].debe).toBe(3_000);
  });

  it('activada con el torneo empezado, se cobra desde la próxima fecha y nunca las ya jugadas', async () => {
    const t = (
      await api('POST', '/torneos', {
        nombre: 'Ya empezado',
        modalidad: 'F5',
        formato: 'LIGA',
        cupo: 4,
        inscripcion: 0,
      })
    ).body.id;
    for (const n of ['A', 'B', 'C'])
      await api('POST', `/torneos/${t}/inscripciones`, { equipoId: equipo[n] });
    const canchas = (await api('GET', '/canchas')).body[0].canchas.map((c: { id: string }) => c.id);
    await api('POST', `/torneos/${t}/fixture`, {
      primerDia: hoy,
      diasEntreFechas: 3,
      horarios: ['22:00'],
      canchaIds: canchas,
    });
    const lista = (await api('GET', `/torneos/${t}/partidos`)).body as typeof partidos;
    const f1 = lista.find((p) => p.fecha === 1)!;
    expect((await api('POST', `/partidos/${f1.id}/wo`, { ganadorId: f1.localId })).status).toBe(201);

    const r = await api('PATCH', `/torneos/${t}/cobros-por-fecha`, configBase);
    expect(r.body.config).toMatchObject({ cuotaDesdeFecha: 2, seguroDesdeFecha: 2 });
    const { cargos } = (await api('GET', `/torneos/${t}/cobros-por-fecha`)).body as { cargos: CargoFecha[] };
    expect(cargos.length).toBeGreaterThan(0);
    expect(cargos.some((x) => x.fecha === 1)).toBe(false);
    // Cambiar el monto con la cuota ya activa no corre el inicio.
    const otraVez = await api('PATCH', `/torneos/${t}/cobros-por-fecha`, {
      ...configBase,
      cuotaPorFecha: 6_000,
    });
    expect(otraVez.body.config).toMatchObject({ cuotaDesdeFecha: 2 });
  });
});
