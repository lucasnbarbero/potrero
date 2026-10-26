// Levantar una suspensión pagando una multa (E14-08) de punta a punta: opción del reglamento (apagada por defecto),
// cargo al equipo en el rubro MULTAS, habilitación en el acta recién con el pago acreditado (manual o por la pasarela),
// pedido anulado que no levanta nada, roja directa sin la opción e historial con los partidos levantados.
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error: módulo compilado (ver vitest.config.ts)
import { AppModule } from '../dist/app.module.js';
// @ts-expect-error: módulo compilado
import { firmar } from '../dist/cobros/cobros.js';

let app: INestApplication;
let base: string;
let admin: pg.Client;

function cliente() {
  let cookies = '';
  return async (metodo: string, ruta: string, cuerpo?: unknown, headers: Record<string, string> = {}) => {
    const r = await fetch(`${base}/api${ruta}`, {
      method: metodo,
      headers: { 'content-type': 'application/json', cookie: cookies, ...headers },
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

type P = { id: string; fecha: number; localId: string; visitanteId: string };
type Suspendido = {
  sancionId: string;
  jugador: string;
  causa: string;
  restantes: number;
  levantados: number;
  pendientes: { id: string; cargoId: string; monto: number }[];
  levantar: { ok: boolean; monto?: number; mensaje?: string };
};

describe('levantar una suspensión pagando', () => {
  const api = cliente();
  const otra = cliente();
  const publico = cliente();
  let torneoId: string;
  let equipo: string;
  let partidoFecha2: string;
  const jugadores: string[] = [];
  const sancion: Record<string, string> = {};

  const suspendidos = async () =>
    ((await api('GET', `/tribunal?torneoId=${torneoId}`)).body.suspendidos as Suspendido[]).reduce<
      Record<string, Suspendido>
    >((m, s) => ({ ...m, [s.causa]: s }), {});
  const habilitado = async (jugadorId: string) => {
    const acta = (await api('GET', `/partidos/${partidoFecha2}`)).body;
    const lado = acta.local.id === equipo ? acta.local : acta.visitante;
    return lado.jugadores.find((j: { id: string }) => j.id === jugadorId) as {
      habilitado: boolean;
      motivo: string | null;
    };
  };

  it('prepara una liga y en la fecha 1 un equipo recibe roja directa, una amarilla y una doble amarilla', async () => {
    await api('POST', '/auth/registro', {
      nombre: 'Org',
      email: 'levantar@test.com',
      password: 'clave-segura-1',
      organizacion: 'Liga Levantar',
    });
    const canchas = [
      (await api('POST', '/canchas', { sede: 'Complejo', nombre: 'Cancha 1' })).body.id,
      (await api('POST', '/canchas', { sede: 'Complejo', nombre: 'Cancha 2' })).body.id,
    ];
    // Umbral de 1 amarilla: una sola amarilla ya suspende por acumulación.
    torneoId = (
      await api('POST', '/torneos', {
        nombre: 'Torneo',
        modalidad: 'F5',
        formato: 'LIGA',
        cupo: 4,
        inscripcion: 0,
        umbralAmarillas: 1,
      })
    ).body.id;
    for (let i = 1; i <= 4; i++) {
      const e = await api('POST', '/equipos', { nombre: `E${i}` });
      for (let j = 1; j <= 3; j++)
        await api('POST', `/equipos/${e.body.id}/jugadores`, {
          nombre: `J${j}`,
          apellido: `E${i}`,
          numero: j,
        });
      await api('POST', `/torneos/${torneoId}/inscripciones`, { equipoId: e.body.id });
    }
    await api('POST', `/torneos/${torneoId}/fixture`, {
      primerDia: '2027-03-06',
      horarios: ['19:00'],
      canchaIds: canchas,
    });
    const partidos = (await api('GET', `/torneos/${torneoId}/partidos`)).body as P[];
    const p = partidos.find((x) => x.fecha === 1)!;
    const acta = (await api('GET', `/partidos/${p.id}`)).body;
    equipo = acta.local.id;
    jugadores.push(...acta.local.jugadores.map((j: { id: string }) => j.id));
    partidoFecha2 = partidos.find(
      (x) => x.fecha === 2 && (x.localId === equipo || x.visitanteId === equipo),
    )!.id;
    await api('POST', `/partidos/${p.id}/iniciar`, {});
    const tarjeta = (tipo: string, jugadorId: string) =>
      api('POST', `/partidos/${p.id}/eventos`, {
        tipo,
        equipoId: equipo,
        jugadorId,
        minuto: 10,
        clientUuid: randomUUID(),
      });
    await tarjeta('ROJA', jugadores[0]!);
    await tarjeta('AMARILLA', jugadores[1]!);
    await tarjeta('AMARILLA', jugadores[2]!);
    await tarjeta('AMARILLA', jugadores[2]!);
    expect(
      (await api('POST', `/partidos/${p.id}/cerrar`, { firmaLocal: true, firmaVisitante: true })).status,
    ).toBe(201);
    const s = await suspendidos();
    expect(Object.keys(s).sort()).toEqual(['ACUMULACION', 'DOBLE_AMARILLA', 'ROJA_DIRECTA']);
    for (const [causa, x] of Object.entries(s)) sancion[causa] = x.sancionId;
  });

  it('con el reglamento apagado (por defecto) no se puede levantar', async () => {
    const t = (await api('GET', `/tribunal?torneoId=${torneoId}`)).body;
    expect(t.reglamento).toMatchObject({
      levantarSancionPagando: false,
      levantarSancionTipos: ['ACUMULACION', 'DOBLE_AMARILLA'],
      levantarSancionMonto: 0,
    });
    expect((await suspendidos()).ACUMULACION!.levantar).toMatchObject({ ok: false });
    const r = await api('POST', `/sanciones/${sancion.ACUMULACION}/levantar`);
    expect(r.status).toBe(422);
    expect(r.body.mensaje).toMatch(/no permite/);
  });

  it('el reglamento del torneo enciende la opción con un monto por partido (versión nueva)', async () => {
    const ruta = `/torneos/${torneoId}/reglamento/levantar-sancion`;
    const sinMonto = await api('PATCH', ruta, {
      levantarSancionPagando: true,
      levantarSancionTipos: ['ACUMULACION'],
      levantarSancionMonto: 0,
    });
    expect(sinMonto.status).toBe(400);
    expect(
      (
        await api('PATCH', ruta, {
          levantarSancionPagando: true,
          levantarSancionTipos: ['ROJA_DIRECTA'],
          levantarSancionMonto: 1,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await otra('PATCH', ruta, {
          levantarSancionPagando: false,
          levantarSancionTipos: [],
          levantarSancionMonto: 0,
        })
      ).status,
    ).toBe(401);
    const r = await api('PATCH', ruta, {
      levantarSancionPagando: true,
      levantarSancionTipos: ['ACUMULACION', 'DOBLE_AMARILLA'],
      levantarSancionMonto: 15_000,
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ version: 2, levantarSancionPagando: true, levantarSancionMonto: 15_000 });
    const [t] = await consulta(
      'SELECT r.version, r.umbral_amarillas FROM torneo t JOIN reglamento r ON r.id = t.reglamento_id WHERE t.id = $1',
      [torneoId],
    );
    expect(t).toMatchObject({ version: 2, umbral_amarillas: 1 });
  });

  it('la roja directa no ofrece la opción', async () => {
    const s = await suspendidos();
    expect(s.ROJA_DIRECTA!.levantar).toMatchObject({ ok: false });
    expect(s.ACUMULACION!.levantar).toEqual({ ok: true, monto: 15_000 });
    const r = await api('POST', `/sanciones/${sancion.ROJA_DIRECTA}/levantar`);
    expect(r.status).toBe(422);
  });

  it('un suspendido por acumulación paga y queda habilitado para la fecha siguiente', async () => {
    expect(await habilitado(jugadores[1]!)).toMatchObject({ habilitado: false });
    const r = await api('POST', `/sanciones/${sancion.ACUMULACION}/levantar`);
    expect(r.status).toBe(201);
    expect(r.body.cargo).toMatchObject({
      monto: 15_000,
      categoria: 'MULTAS',
      estado: 'PENDIENTE',
      concepto: 'Levantar sanción de J2 E1 — 1 partido',
    });
    // Un partido de suspensión, un pedido: el segundo no se puede mientras el primero esté pendiente.
    expect((await api('POST', `/sanciones/${sancion.ACUMULACION}/levantar`)).status).toBe(422);
    // Sin el pago acreditado sigue suspendido.
    expect(await habilitado(jugadores[1]!)).toMatchObject({ habilitado: false });
    expect((await suspendidos()).ACUMULACION!.pendientes).toHaveLength(1);

    const pago = await api('POST', `/cargos/${r.body.cargo.id}/pagos`, { metodo: 'EFECTIVO', monto: 15_000 });
    expect(pago.status).toBe(201);
    expect(await habilitado(jugadores[1]!)).toEqual(
      expect.objectContaining({ habilitado: true, motivo: null }),
    );
    expect((await suspendidos()).ACUMULACION).toBeUndefined();
    const [{ s }] = await consulta(
      "SELECT COALESCE(SUM(haber - debe), 0)::int AS s FROM linea_asiento WHERE cuenta = 'INGRESOS:MULTAS'",
    );
    expect(s).toBe(15_000);
  });

  it('si el cargo se anula no se levanta nada; pagado por la pasarela, sí', async () => {
    const pedido = await api('POST', `/sanciones/${sancion.DOBLE_AMARILLA}/levantar`);
    expect(pedido.status).toBe(201);
    const anular = await api('POST', `/levantamientos/${pedido.body.id}/anular`);
    expect(anular.status).toBe(201);
    expect((await api('POST', `/levantamientos/${pedido.body.id}/anular`)).status).toBe(409);
    const [cargo] = await consulta('SELECT estado FROM cargo WHERE id = $1', [pedido.body.cargoId]);
    expect(cargo.estado).toBe('ANULADO');
    expect(await habilitado(jugadores[2]!)).toMatchObject({ habilitado: false });
    expect((await suspendidos()).DOBLE_AMARILLA!.levantar.ok).toBe(true);

    const otraVez = await api('POST', `/sanciones/${sancion.DOBLE_AMARILLA}/levantar`);
    const link = await api('POST', `/cargos/${otraVez.body.cargoId}/link`);
    const notif = {
      preferenciaId: link.body.preferenciaId,
      pasarelaPagoId: 'PAGO-LEV-1',
      estado: 'aprobado',
    };
    // Mientras la pasarela no acredita, sigue suspendido.
    expect(await habilitado(jugadores[2]!)).toMatchObject({ habilitado: false });
    await publico('POST', '/webhooks/pagos', notif, { 'x-firma': firmar(JSON.stringify(notif)) });
    expect(await habilitado(jugadores[2]!)).toMatchObject({ habilitado: true });
    // Pagado no se puede anular.
    expect((await api('POST', `/levantamientos/${otraVez.body.id}/anular`)).status).toBe(409);
  });

  it('otra organización no ve ni levanta las sanciones', async () => {
    await otra('POST', '/auth/registro', {
      nombre: 'Otra',
      email: 'otra-levantar@test.com',
      password: 'clave-segura-1',
      organizacion: 'Otra Liga',
    });
    expect((await otra('POST', `/sanciones/${sancion.ROJA_DIRECTA}/levantar`)).status).toBe(404);
  });

  it('el partido levantado no cuenta como cumplido y el historial lo muestra', async () => {
    await api('POST', `/partidos/${partidoFecha2}/iniciar`, {});
    await api('POST', `/partidos/${partidoFecha2}/cerrar`, { firmaLocal: true, firmaVisitante: true });
    const est = (await api('GET', `/torneos/${torneoId}/estadisticas`)).body;
    const de = (id: string) => est.sanciones.find((s: { id: string }) => s.id === id);
    expect(de(sancion.ACUMULACION!)).toMatchObject({
      cumplidos: 0,
      levantados: 1,
      restantes: 0,
      activa: false,
    });
    expect(de(sancion.ROJA_DIRECTA!)).toMatchObject({ cumplidos: 1, levantados: 0, activa: false });
    const h = (await api('GET', `/tribunal/historial?torneoId=${torneoId}`)).body;
    const j2 = h.jugadores.find((j: { nombre: string }) => j.nombre === 'J2 E1');
    expect(j2).toMatchObject({ partidosSancionados: 1, partidosLevantados: 1 });
    const e1 = h.equipos.find((e: { nombre: string }) => e.nombre === 'E1');
    expect(e1).toMatchObject({ partidosSancionados: 3, partidosLevantados: 2 });
  });
});
