// Cuenta y panel del jugador (E20-01, E20-05, E19-02): invitación del capitán, términos, solo lo suyo y asistencia.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error: módulo compilado (ver vitest.config.ts)
import { AppModule } from '../dist/app.module.js';

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

const tokenDe = (link: string) => link.split('/invitacion/')[1]!;

describe('cuenta y panel del jugador', () => {
  const dueno = cliente();
  const cap = cliente();
  const jug = cliente();
  const equipos: string[] = [];
  type P = { id: string; fecha: number; localId: string; visitanteId: string; estado: string };
  let partidos: P[] = [];
  let mio: { jugadorId: string; nombre: string };
  let ajeno: string;
  let link: string;

  it('prepara una liga de 4 equipos con fixture y un capitán', async () => {
    await dueno('POST', '/auth/registro', {
      nombre: 'Dueña',
      email: 'duena@test.com',
      password: 'clave-segura-1',
      organizacion: 'Liga Jugadores',
    });
    const canchas = [(await dueno('POST', '/canchas', { sede: 'Complejo', nombre: 'Cancha 1' })).body.id];
    const torneoId = (
      await dueno('POST', '/torneos', {
        nombre: 'Torneo',
        modalidad: 'F5',
        formato: 'LIGA',
        cupo: 4,
        inscripcion: 0,
      })
    ).body.id;
    for (let i = 1; i <= 4; i++) {
      const e = await dueno('POST', '/equipos', { nombre: `E${i}` });
      equipos.push(e.body.id);
      for (let j = 1; j <= 3; j++)
        await dueno('POST', `/equipos/${e.body.id}/jugadores`, {
          nombre: `J${j}`,
          apellido: `E${i}`,
          numero: j,
        });
      await dueno('POST', `/torneos/${torneoId}/inscripciones`, { equipoId: e.body.id });
    }
    await dueno('POST', `/torneos/${torneoId}/fixture`, {
      primerDia: '2027-03-06',
      horarios: ['19:00', '20:00'],
      canchaIds: canchas,
    });
    partidos = (await dueno('GET', `/torneos/${torneoId}/partidos`)).body;
    const inv = await dueno('POST', '/usuarios/invitaciones', {
      email: 'cap@test.com',
      rol: 'CAPITAN',
      equipoId: equipos[0],
    });
    const ok = await cap('POST', `/invitaciones/${tokenDe(inv.body.link)}/aceptar`, {
      nombre: 'Capi',
      password: 'clave-segura-9',
    });
    expect(ok.status).toBe(200);
    const r = (await cap('GET', '/capitan')).body;
    mio = r.plantel[0];
    expect(r.plantel[0].cuenta).toBeNull();
    ajeno = (await dueno('GET', `/equipos/${equipos[1]}`)).body.plantel[0].jugadorId;
  });

  it('el capitán invita a un jugador de su plantel (y a uno ajeno no)', async () => {
    expect((await cap('POST', `/capitan/plantel/${ajeno}/invitar`, { email: 'x@test.com' })).status).toBe(
      404,
    );
    expect((await cap('POST', `/capitan/plantel/${mio.jugadorId}/invitar`, { email: 'mal' })).status).toBe(
      400,
    );
    const r = await cap('POST', `/capitan/plantel/${mio.jugadorId}/invitar`, { email: 'jugador@test.com' });
    expect(r.status).toBe(201);
    expect(r.body.texto).toContain(r.body.link);
    link = tokenDe(r.body.link);
    expect((await cap('GET', '/capitan')).body.plantel[0].cuenta).toBe('INVITADO');
    // El organizador no usa esta ruta.
    const org = await dueno('POST', `/capitan/plantel/${mio.jugadorId}/invitar`, { email: 'y@test.com' });
    expect(org.status).toBe(403);
  });

  it('el jugador crea su cuenta aceptando los términos y queda atado a su perfil', async () => {
    const v = (await jug('GET', `/invitaciones/${link}`)).body;
    expect(v).toMatchObject({ rol: 'JUGADOR', equipo: 'E1', tieneCuenta: false });
    expect(v.terminos.version).toBeGreaterThan(0);
    const sin = await jug('POST', `/invitaciones/${link}/aceptar`, {
      nombre: 'J1 E1',
      password: 'clave-segura-9',
    });
    expect(sin.status).toBe(422);
    expect(sin.body.mensaje).toMatch(/términos/);
    const ok = await jug('POST', `/invitaciones/${link}/aceptar`, {
      nombre: 'J1 E1',
      password: 'clave-segura-9',
      terminosVersion: v.terminos.version,
    });
    expect(ok.status).toBe(200);
    expect((await jug('GET', '/auth/yo')).body.rol).toBe('JUGADOR');
    const r = (await jug('GET', '/jugador')).body;
    expect(r.jugador.id).toBe(mio.jugadorId);
    expect(r.terminos.version).toBe(v.terminos.version);
    expect(r.equipos).toHaveLength(1);
    expect(r.equipos[0].proximo.respuesta).toBeNull();
    expect(r.avisos.map((a: { tipo: string }) => a.tipo)).toContain('CONVOCATORIA');
    expect((await cap('GET', '/capitan')).body.plantel[0].cuenta).toBe('ACTIVA');
    // Ya tiene cuenta: no se lo vuelve a invitar.
    const otra = await cap('POST', `/capitan/plantel/${mio.jugadorId}/invitar`, { email: 'z@test.com' });
    expect(otra.status).toBe(409);
  });

  it('confirma su asistencia y el capitán lo ve en la convocatoria', async () => {
    const r = (await jug('GET', '/jugador')).body;
    const partidoId = r.equipos[0].proximo.id;
    const voy = await jug('POST', `/jugador/partidos/${partidoId}/asistencia`, { respuesta: 'VA' });
    expect(voy.status).toBe(200);
    const fila = (c: { plantel: { jugadorId: string; convocatoria: string }[] }) =>
      c.plantel.find((j) => j.jugadorId === mio.jugadorId)!.convocatoria;
    let c = (await cap('GET', '/capitan')).body;
    expect(fila(c)).toBe('VA');
    expect(c.convocatoria.va).toBe(1);
    const noVoy = await jug('POST', `/jugador/partidos/${partidoId}/asistencia`, { respuesta: 'NO_VA' });
    expect(noVoy.status).toBe(200);
    c = (await cap('GET', '/capitan')).body;
    expect(fila(c)).toBe('NO_VA');
    const despues = (await jug('GET', '/jugador')).body;
    expect(despues.equipos[0].proximo.respuesta).toBe('NO_VA');
    expect(despues.avisos.map((a: { tipo: string }) => a.tipo)).not.toContain('CONVOCATORIA');
  });

  it('solo ve lo suyo: un partido ajeno no existe y no entra al panel del organizador ni al del capitán', async () => {
    const otro = partidos.find((p) => p.localId !== equipos[0] && p.visitanteId !== equipos[0])!;
    const r = await jug('POST', `/jugador/partidos/${otro.id}/asistencia`, { respuesta: 'VA' });
    expect(r.status).toBe(404);
    for (const ruta of ['/capitan', '/torneos', '/equipos', '/usuarios', `/equipos/${equipos[1]}`])
      expect((await jug('GET', ruta)).status).toBe(403);
    // El capitán y el organizador no usan el panel del jugador.
    expect((await cap('GET', '/jugador')).status).toBe(403);
    expect((await dueno('GET', '/jugador')).status).toBe(403);
  });

  it('elige cómo aparece su nombre y sube su documentación simple', async () => {
    expect((await jug('PATCH', '/jugador/privacidad', { nombrePublico: 'APODO' })).status).toBe(422);
    expect((await jug('PATCH', '/jugador/privacidad', { nombrePublico: 'COMPLETO' })).status).toBe(200);
    expect((await jug('GET', '/jugador')).body.privacidad.comoAparece).toBe('J1 E1');
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]).toString('base64');
    const doc = { nombreArchivo: 'apto.png', mime: 'image/png', contenido: png };
    const menor = await jug('POST', '/jugador/documentos', { ...doc, tipo: 'AUTORIZACION_MENOR' });
    expect(menor.status).toBe(403);
    expect((await jug('POST', '/jugador/documentos', { ...doc, tipo: 'APTO_FISICO' })).status).toBe(201);
    const r = (await jug('GET', '/jugador')).body;
    const apto = r.documentacion.items.find((i: { tipo: string }) => i.tipo === 'APTO_FISICO');
    expect(apto.estado).toBe('PENDIENTE');
  });
});
