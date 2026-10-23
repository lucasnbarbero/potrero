// Tests de integración de punta a punta contra la API real y la base potrero_test.
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

/** Cliente HTTP mínimo que guarda las cookies de sesión. */
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
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL_ADMIN });
  await db.connect();
  const { rows } = await db.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
  );
  await db.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} CASCADE`);
  await db.end();
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  await app.listen(0);
  base = await app.getUrl();
  base = base.replace('[::1]', 'localhost');
});

afterAll(async () => {
  await app?.close();
});

describe('Potrero de punta a punta', () => {
  const org = cliente();
  const otra = cliente();
  const publico = cliente();
  let torneoId: string;
  const equipos: { id: string; jugadores: string[] }[] = [];

  it('registra organizaciones y exige sesión', async () => {
    expect((await org('GET', '/torneos')).status).toBe(401);
    expect(
      (
        await org('POST', '/auth/registro', {
          nombre: 'Ana',
          email: 'ana@test.com',
          password: 'clave-segura-1',
          organizacion: 'Liga Test',
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await otra('POST', '/auth/registro', {
          nombre: 'Beto',
          email: 'beto@test.com',
          password: 'clave-segura-2',
          organizacion: 'Otra Liga',
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await org('POST', '/auth/registro', {
          nombre: 'Ana',
          email: 'ana@test.com',
          password: 'clave-segura-1',
          organizacion: 'X',
        })
      ).status,
    ).toBe(409);
    const yo = await org('GET', '/auth/yo');
    expect(yo.body.organizacion.slug).toBe('liga-test');
    expect(yo.body.rol).toBe('DUENO');
  });

  it('valida los datos con mensajes en español', async () => {
    const r = await org('POST', '/torneos', { nombre: '', modalidad: 'F9' });
    expect(r.status).toBe(400);
    expect(r.body.mensaje).toBe('Revisá los datos ingresados.');
  });

  it('crea el torneo, equipos con plantel y canchas', async () => {
    const t = await org('POST', '/torneos', {
      nombre: 'Apertura',
      modalidad: 'F5',
      formato: 'LIGA',
      cupo: 4,
      inscripcion: 50000,
    });
    expect(t.status).toBe(201);
    torneoId = t.body.id;
    for (const nombre of ['Rojo', 'Azul', 'Verde']) {
      const e = await org('POST', '/equipos', { nombre });
      const jugadores = [];
      for (let n = 1; n <= 5; n++)
        jugadores.push(
          (
            await org('POST', `/equipos/${e.body.id}/jugadores`, {
              nombre: `J${n}`,
              apellido: nombre,
              numero: n,
            })
          ).body.jugadorId,
        );
      equipos.push({ id: e.body.id, jugadores });
    }
    expect((await org('POST', '/canchas', { sede: 'Complejo', nombre: 'Cancha 1' })).status).toBe(201);
  });

  it('aísla organizaciones (RLS): la otra liga no ve ni modifica nada', async () => {
    expect((await otra('GET', '/torneos')).body).toEqual([]);
    expect((await otra('GET', `/torneos/${torneoId}`)).status).toBe(404);
    expect(
      (await otra('POST', `/torneos/${torneoId}/inscripciones`, { equipoId: equipos[0]!.id })).status,
    ).toBe(404);
  });

  it('inscribe: pago manual sin comisión y pago online con comisión y webhook idempotente', async () => {
    const i0 = await org('POST', `/torneos/${torneoId}/inscripciones`, { equipoId: equipos[0]!.id });
    await org('POST', `/cargos/${i0.body.cargo.id}/pagos`, { metodo: 'EFECTIVO', monto: 50000 });

    const i1 = await org('POST', `/torneos/${torneoId}/inscripciones`, { equipoId: equipos[1]!.id });
    const link = await org('POST', `/cargos/${i1.body.cargo.id}/link`);
    expect(link.body.urlPago).toMatch(/\/pago\/SIM-PREF-/);
    const notif = { preferenciaId: link.body.preferenciaId, pasarelaPagoId: 'PAGO-1', estado: 'aprobado' };
    expect(
      (await publico('POST', '/webhooks/pagos', notif, { 'x-firma': 'falsa'.padEnd(64, '0') })).status,
    ).toBe(401);
    const firma = firmar(JSON.stringify(notif));
    expect((await publico('POST', '/webhooks/pagos', notif, { 'x-firma': firma })).body).toEqual({
      procesado: true,
      estado: 'APROBADO',
    });
    expect((await publico('POST', '/webhooks/pagos', notif, { 'x-firma': firma })).body).toEqual({
      procesado: false,
      estado: 'APROBADO',
    });

    const lista = (await org('GET', `/torneos/${torneoId}/inscripciones`)).body;
    expect(lista.map((x: { estado: string }) => x.estado)).toEqual(['CONFIRMADA', 'CONFIRMADA']);
    expect(lista[0].pagos[0].comision).toBe(0);
    expect(lista[1].pagos[0].comision).toBe(1750); // 3,5 % de 50.000 (plan Liga)
  });

  it('inscripción pública: crea equipo y link de pago; el checkout simulado confirma', async () => {
    const r = await publico('POST', '/publico/liga-test/apertura/inscripcion', {
      equipo: 'Negro',
      capitanNombre: 'Caro',
      capitanEmail: 'caro@test.com',
      capitanTelefono: '3564111222',
    });
    expect(r.status).toBe(201);
    const pref = r.body.urlPago.split('/pago/')[1];
    expect((await publico('GET', `/pagos/simulado/${pref}`)).body).toMatchObject({
      equipo: 'Negro',
      monto: 50000,
      estado: 'PENDIENTE',
    });
    expect((await publico('POST', `/pagos/simulado/${pref}/aprobar`)).body.estado).toBe('APROBADO');
    // El capitán del equipo nuevo carga su plantel (lo hace el organizador en esta demo).
    const negro = (await org('GET', '/equipos')).body.find((e: { nombre: string }) => e.nombre === 'Negro');
    const jugadores = [];
    for (let n = 1; n <= 5; n++)
      jugadores.push(
        (
          await org('POST', `/equipos/${negro.id}/jugadores`, {
            nombre: `J${n}`,
            apellido: 'Negro',
            numero: n,
          })
        ).body.jugadorId,
      );
    equipos.push({ id: negro.id, jugadores });
    expect(
      (
        await publico('POST', '/publico/liga-test/apertura/inscripcion', {
          equipo: 'negro',
          capitanNombre: 'X',
          capitanEmail: 'x@test.com',
          capitanTelefono: '3564111222',
        })
      ).status,
    ).toBe(409);
  });

  it('genera el fixture sin choques con los equipos confirmados', async () => {
    const canchas = (await org('GET', '/canchas')).body[0].canchas.map((c: { id: string }) => c.id);
    const r = await org('POST', `/torneos/${torneoId}/fixture`, {
      primerDia: '2027-03-06',
      horarios: ['19:00', '20:00'],
      canchaIds: canchas,
    });
    expect(r.body).toEqual({ partidos: 3, fechas: 3 }); // 3 equipos confirmados: uno libre por fecha
  });

  it('acta: eventos idempotentes, anulación, cierre, tabla y sanción automática', async () => {
    const partidos = (await org('GET', `/torneos/${torneoId}/partidos`)).body;
    const conPlantel = new Set(equipos.map((e) => e.id));
    type P = { id: string; fecha: number; localId: string; visitanteId: string };
    // Un partido entre equipos con plantel, cuyo visitante vuelve a jugar después (para verificar la suspensión).
    const p = (partidos as P[]).find(
      (x) =>
        conPlantel.has(x.localId) &&
        conPlantel.has(x.visitanteId) &&
        (partidos as P[]).some(
          (y) => y.fecha > x.fecha && [y.localId, y.visitanteId].includes(x.visitanteId),
        ),
    )!;
    const acta = (await org('GET', `/partidos/${p.id}`)).body;
    expect(
      (
        await org('POST', `/partidos/${p.id}/eventos`, {
          tipo: 'GOL',
          equipoId: acta.local.id,
          clientUuid: randomUUID(),
        })
      ).status,
    ).toBe(409);
    await org('POST', `/partidos/${p.id}/iniciar`);

    const gol = {
      tipo: 'GOL',
      equipoId: acta.local.id,
      jugadorId: acta.local.jugadores[0].id,
      minuto: 10,
      clientUuid: randomUUID(),
    };
    const g1 = await org('POST', `/partidos/${p.id}/eventos`, gol);
    expect((await org('POST', `/partidos/${p.id}/eventos`, gol)).body.repetido).toBe(true);
    const g2 = await org('POST', `/partidos/${p.id}/eventos`, {
      ...gol,
      minuto: 20,
      clientUuid: randomUUID(),
    });
    await org('POST', `/partidos/${p.id}/eventos/${g2.body.evento.id}/anular`, { clientUuid: randomUUID() });
    const roja = acta.visitante.jugadores[1].id;
    await org('POST', `/partidos/${p.id}/eventos`, {
      tipo: 'ROJA',
      equipoId: acta.visitante.id,
      jugadorId: roja,
      minuto: 30,
      clientUuid: randomUUID(),
    });
    expect(g1.status).toBe(201);
    expect((await org('GET', `/partidos/${p.id}`)).body.marcador).toEqual({ local: 1, visitante: 0 });

    expect((await org('POST', `/partidos/${p.id}/cerrar`, { firmaLocal: true })).status).toBe(422);
    expect(
      (await org('POST', `/partidos/${p.id}/cerrar`, { firmaLocal: true, firmaVisitante: true })).body
        .sanciones,
    ).toBe(1);

    const est = (await org('GET', `/torneos/${torneoId}/estadisticas`)).body;
    expect(est.tabla[0]).toMatchObject({ equipoId: acta.local.id, pts: 3, gf: 1 });
    expect(est.goleadores[0].goles).toBe(1);
    expect(est.sanciones[0]).toMatchObject({ jugadorId: roja, causa: 'ROJA_DIRECTA', activa: true });

    // En el siguiente partido de ese equipo, el jugador aparece no habilitado.
    const siguiente = partidos.find(
      (x: { fecha: number; localId: string; visitanteId: string }) =>
        x.fecha > p.fecha && [x.localId, x.visitanteId].includes(acta.visitante.id),
    );
    const acta2 = (await org('GET', `/partidos/${siguiente.id}`)).body;
    const jug = [...acta2.local.jugadores, ...acta2.visitante.jugadores].find(
      (j: { id: string }) => j.id === roja,
    );
    expect(jug.habilitado).toBe(false);
  });

  it('el sitio público muestra tabla y fixture sin datos personales', async () => {
    const r = await publico('GET', '/publico/liga-test/apertura');
    expect(r.body.tabla).toHaveLength(3);
    const texto = JSON.stringify(r.body);
    expect(texto).not.toMatch(/caro@test\.com|3564111222/);
  });
});
