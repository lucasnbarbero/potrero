// Límites del plan de suscripción (E26-02): torneos activos, equipos activos y usuarios.
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

/** El cuerpo como JSON si se puede (los CSV no lo son). */
const analizar = (t: string) => {
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return t;
  }
};

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
    const bruto = Buffer.from(await r.clone().arrayBuffer());
    const texto = await r.text();
    return { status: r.status, body: analizar(texto), headers: r.headers, texto, bruto };
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

describe('límites del plan', () => {
  const api = cliente();
  let primero: string;
  const torneo = (nombre: string) =>
    api('POST', '/torneos', { nombre, modalidad: 'F5', formato: 'LIGA', cupo: 20, inscripcion: 0 });

  it('el plan Torneo permite un torneo activo y pide pasar a Liga para el segundo', async () => {
    await api('POST', '/auth/registro', {
      nombre: 'Organizador',
      email: 'plan@test.com',
      password: 'clave-segura-1',
      organizacion: 'Liga Plan',
    });
    await consulta("UPDATE organizacion SET plan = 'TORNEO' WHERE slug = 'liga-plan'");
    const t = await torneo('Apertura');
    expect(t.status).toBe(201);
    primero = t.body.id;
    const segundo = await torneo('Clausura');
    expect(segundo.status).toBe(422);
    expect(segundo.body.mensaje).toBe('Tu plan Torneo permite 1 torneo activo: pasá a Liga.');
  });

  it('el plan Torneo permite hasta 16 equipos activos', async () => {
    const id = primero;
    for (let i = 1; i <= 16; i++) {
      const e = await api('POST', '/equipos', { nombre: `Equipo ${i}` });
      expect((await api('POST', `/torneos/${id}/inscripciones`, { equipoId: e.body.id })).status).toBe(201);
    }
    const e = await api('POST', '/equipos', { nombre: 'Equipo 17' });
    const r = await api('POST', `/torneos/${id}/inscripciones`, { equipoId: e.body.id });
    expect(r.status).toBe(422);
    expect(r.body.mensaje).toBe('Tu plan Torneo permite 16 equipos activos: pasá a Liga.');
  });

  it('el plan Torneo permite 2 usuarios (las invitaciones pendientes cuentan)', async () => {
    const ok = await api('POST', '/usuarios/invitaciones', { email: 'otro@test.com', rol: 'TESORERO' });
    expect(ok.status).toBe(201);
    const r = await api('POST', '/usuarios/invitaciones', {
      email: 'tercero@test.com',
      rol: 'ADMINISTRADOR',
    });
    expect(r.status).toBe(422);
    expect(r.body.mensaje).toBe('Tu plan Torneo permite 2 usuarios: pasá a Liga.');
  });

  it('con plan Liga se puede seguir', async () => {
    await consulta("UPDATE organizacion SET plan = 'LIGA' WHERE slug = 'liga-plan'");
    expect((await torneo('Clausura')).status).toBe(201);
  });
});
