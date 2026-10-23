// Acta sin conexión (E11-06) y un solo dueño por partido (E11-05): lo que la API tiene que garantizar para que
// el dispositivo pueda guardar, reordenar y reenviar sin duplicar ni pisar a otro delegado.
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error: módulo compilado (ver vitest.config.ts)
import { AppModule } from '../dist/app.module.js';

let app: INestApplication;
let base: string;

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
  base = (await app.getUrl()).replace('[::1]', 'localhost');
});

afterAll(async () => {
  await app?.close();
});

describe('acta sin conexión y dueño único', () => {
  const api = cliente();
  let partidoId: string;
  let local: { id: string; jugadores: { id: string }[] };

  const dispA = 'dispositivo-A-1234';
  const dispB = 'dispositivo-B-5678';
  const evento = (equipoId: string, jugadorId: string, extra: Record<string, unknown> = {}) => ({
    tipo: 'GOL',
    equipoId,
    jugadorId,
    minuto: 10,
    clientUuid: randomUUID(),
    ...extra,
  });

  it('prepara un partido programado', async () => {
    await api('POST', '/auth/registro', {
      nombre: 'Delegado',
      email: 'delegado@test.com',
      password: 'clave-segura-1',
      organizacion: 'Liga Acta',
    });
    const cancha = (await api('POST', '/canchas', { sede: 'Complejo', nombre: 'Cancha 1' })).body.id;
    const torneo = (
      await api('POST', '/torneos', {
        nombre: 'Torneo',
        modalidad: 'F5',
        formato: 'LIGA',
        cupo: 4,
        inscripcion: 1000,
      })
    ).body;
    for (const nombre of ['Rojo', 'Azul']) {
      const e = await api('POST', '/equipos', { nombre });
      for (let n = 1; n <= 3; n++)
        await api('POST', `/equipos/${e.body.id}/jugadores`, {
          nombre: `J${n}`,
          apellido: nombre,
          numero: n,
        });
      const ins = await api('POST', `/torneos/${torneo.id}/inscripciones`, { equipoId: e.body.id });
      await api('POST', `/cargos/${ins.body.cargo.id}/pagos`, { metodo: 'EFECTIVO', monto: 1000 });
    }
    await api('POST', `/torneos/${torneo.id}/fixture`, {
      primerDia: '2027-03-06',
      horarios: ['19:00'],
      canchaIds: [cancha],
    });
    partidoId = (await api('GET', `/torneos/${torneo.id}/partidos`)).body[0].id;
    const acta = (await api('GET', `/partidos/${partidoId}`)).body;
    local = acta.local;
    expect(acta.dueno).toBeNull();
  });

  it('el acta informa el clientUuid de cada evento y permite anular por clientUuid', async () => {
    await api('POST', `/partidos/${partidoId}/iniciar`, {});
    const e = evento(local.id, local.jugadores[0]!.id);
    expect((await api('POST', `/partidos/${partidoId}/eventos`, e)).status).toBe(201);
    const acta = (await api('GET', `/partidos/${partidoId}`)).body;
    expect(acta.eventos[0]).toMatchObject({ clientUuid: e.clientUuid });
    expect(acta.marcador).toEqual({ local: 1, visitante: 0 });

    // Un evento cargado sin conexión se anula con su clientUuid, sin conocer el id del servidor.
    const anulacion = randomUUID();
    const r = await api('POST', `/partidos/${partidoId}/eventos/${e.clientUuid}/anular`, {
      clientUuid: anulacion,
    });
    expect(r.status).toBe(201);
    expect((await api('GET', `/partidos/${partidoId}`)).body.marcador).toEqual({ local: 0, visitante: 0 });
  });

  it('reenviar la cola completa no duplica nada', async () => {
    const e = evento(local.id, local.jugadores[1]!.id);
    const primero = await api('POST', `/partidos/${partidoId}/eventos`, e);
    const reenvio = await api('POST', `/partidos/${partidoId}/eventos`, e);
    expect(primero.body.repetido).toBe(false);
    expect(reenvio.body.repetido).toBe(true);
    expect((await api('GET', `/partidos/${partidoId}`)).body.marcador).toEqual({ local: 1, visitante: 0 });

    const anulacion = randomUUID();
    await api('POST', `/partidos/${partidoId}/eventos/${e.clientUuid}/anular`, { clientUuid: anulacion });
    const otraVez = await api('POST', `/partidos/${partidoId}/eventos/${e.clientUuid}/anular`, {
      clientUuid: anulacion,
    });
    expect(otraVez.status).toBe(201);
    expect((await api('GET', `/partidos/${partidoId}`)).body.marcador).toEqual({ local: 0, visitante: 0 });
  });

  it('un solo dueño: quien toma el acta primero se la queda y el otro dispositivo recibe el aviso', async () => {
    const a = await api('POST', `/partidos/${partidoId}/tomar`, { dispositivoId: dispA });
    expect(a.body).toEqual({ dueno: true, motivo: null, actual: null });
    // El mismo dispositivo puede volver a tomarla sin problema.
    expect((await api('POST', `/partidos/${partidoId}/tomar`, { dispositivoId: dispA })).body.dueno).toBe(
      true,
    );

    const b = await api('POST', `/partidos/${partidoId}/tomar`, { dispositivoId: dispB });
    expect(b.body.dueno).toBe(false);
    expect(b.body.actual.usuario).toBe('Delegado');
    expect((await api('GET', `/partidos/${partidoId}`)).body.dueno).toMatchObject({
      dispositivoId: dispA,
      usuario: 'Delegado',
    });
  });

  it('el dispositivo que no es dueño no puede escribir en el acta', async () => {
    const delB = await api('POST', `/partidos/${partidoId}/eventos`, {
      ...evento(local.id, local.jugadores[0]!.id),
      dispositivoId: dispB,
    });
    expect(delB.status).toBe(409);
    expect(delB.body.mensaje).toMatch(/Otro dispositivo/);
    const delA = await api('POST', `/partidos/${partidoId}/eventos`, {
      ...evento(local.id, local.jugadores[0]!.id),
      dispositivoId: dispA,
    });
    expect(delA.status).toBe(201);
    // Un cierre desde el dispositivo equivocado tampoco pasa.
    const cierre = await api('POST', `/partidos/${partidoId}/cerrar`, {
      firmaLocal: true,
      firmaVisitante: true,
      dispositivoId: dispB,
    });
    expect(cierre.status).toBe(409);
  });

  it('se puede tomar el acta a propósito y el dueño anterior queda afuera', async () => {
    const forzada = await api('POST', `/partidos/${partidoId}/tomar`, { dispositivoId: dispB, forzar: true });
    expect(forzada.body.dueno).toBe(true);
    const deA = await api('POST', `/partidos/${partidoId}/eventos`, {
      ...evento(local.id, local.jugadores[0]!.id),
      dispositivoId: dispA,
    });
    expect(deA.status).toBe(409);
    const deB = await api('POST', `/partidos/${partidoId}/eventos`, {
      ...evento(local.id, local.jugadores[0]!.id),
      dispositivoId: dispB,
    });
    expect(deB.status).toBe(201);
  });

  it('los clientes de la API sin dispositivo siguen pudiendo escribir', async () => {
    const r = await api('POST', `/partidos/${partidoId}/eventos`, evento(local.id, local.jugadores[2]!.id));
    expect(r.status).toBe(201);
  });

  it('un acta cerrada ya no se puede tomar', async () => {
    const cierre = await api('POST', `/partidos/${partidoId}/cerrar`, {
      firmaLocal: true,
      firmaVisitante: true,
      dispositivoId: dispB,
    });
    expect(cierre.status).toBe(201);
    const t = await api('POST', `/partidos/${partidoId}/tomar`, { dispositivoId: dispA, forzar: true });
    expect(t.body).toMatchObject({ dueno: false, motivo: 'El acta ya está cerrada.' });
  });
});
