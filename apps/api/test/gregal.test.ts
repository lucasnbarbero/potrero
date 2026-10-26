// Backoffice de Gregal (E36): sesión de staff separada de la de organizadores, lectura de todas las ligas y auditoría.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error: módulo compilado (ver vitest.config.ts)
import { AppModule } from '../dist/app.module.js';
// @ts-expect-error: módulo compilado
import { DbService } from '../dist/db/db.service.js';
// @ts-expect-error: módulo compilado
import { crearStaff } from '../dist/gregal/gregal.js';

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
  const db = app.get(DbService);
  await crearStaff(db, {
    email: 'staff@test.com',
    nombre: 'Staff',
    password: 'clave-staff-1',
    rol: 'SUPERADMIN',
  });
  await crearStaff(db, {
    email: 'soporte@test.com',
    nombre: 'Soporte',
    password: 'clave-staff-2',
    rol: 'SOPORTE',
  });
}, 60_000);

afterAll(async () => {
  await app?.close();
  await admin?.end();
});

describe('backoffice de Gregal', () => {
  const org = cliente();
  const ajena = cliente();
  const staff = cliente();
  const soporte = cliente();
  let orgId: string;

  it('prepara dos ligas con datos', async () => {
    await org('POST', '/auth/registro', {
      nombre: 'Ana',
      email: 'gregal-org@test.com',
      password: 'clave-segura-1',
      organizacion: 'Liga Uno',
    });
    await ajena('POST', '/auth/registro', {
      nombre: 'Beto',
      email: 'gregal-ajena@test.com',
      password: 'clave-segura-2',
      organizacion: 'Liga Dos',
    });
    const t = (
      await org('POST', '/torneos', {
        nombre: 'Apertura',
        modalidad: 'F5',
        formato: 'LIGA',
        cupo: 8,
        inscripcion: 10_000,
      })
    ).body;
    const e = (await org('POST', '/equipos', { nombre: 'Los Pibes' })).body;
    const i = (await org('POST', `/torneos/${t.id}/inscripciones`, { equipoId: e.id })).body;
    const r = await org('POST', `/inscripciones/${i.inscripcion.id}/pagos`, {
      metodo: 'EFECTIVO',
      monto: 10_000,
    });
    expect(r.status).toBeLessThan(300);
    orgId = (await org('GET', '/auth/yo')).body.organizacion.id;
  });

  it('un organizador no puede leer /gregal ni ingresar como staff', async () => {
    expect((await org('GET', '/gregal/inicio')).status).toBe(401);
    expect((await org('GET', '/gregal/organizaciones')).status).toBe(401);
    const r = await org('POST', '/gregal/sesion/ingresar', {
      email: 'gregal-org@test.com',
      password: 'clave-segura-1',
    });
    expect(r.status).toBe(401);
  });

  it('el staff ingresa con su cuenta y ve todas las ligas', async () => {
    expect(
      (await staff('POST', '/gregal/sesion/ingresar', { email: 'staff@test.com', password: 'mal' })).status,
    ).toBe(401);
    expect(
      (await staff('POST', '/gregal/sesion/ingresar', { email: 'staff@test.com', password: 'clave-staff-1' }))
        .status,
    ).toBe(200);
    expect((await staff('GET', '/gregal/yo')).body).toMatchObject({
      email: 'staff@test.com',
      rol: 'SUPERADMIN',
    });
    const inicio = (await staff('GET', '/gregal/inicio')).body;
    expect(inicio.ligas.total).toBe(2);
    expect(inicio.cobros).toMatchObject({ efectivo: 10_000, total: 10_000, comision: 0 });
    expect(inicio.partidosPorSemana).toHaveLength(8);
    const ligas = (await staff('GET', '/gregal/organizaciones?q=uno')).body;
    expect(ligas.map((l: { nombre: string }) => l.nombre)).toEqual(['Liga Uno']);
    const detalle = (await staff('GET', `/gregal/organizaciones/${orgId}`)).body;
    expect(detalle).toMatchObject({ nombre: 'Liga Uno', equipos: 1, cobrado: 10_000 });
    expect(detalle.torneos[0]).toMatchObject({ nombre: 'Apertura', equipos: 1 });
    expect(detalle.usuarios[0]).toMatchObject({ email: 'gregal-org@test.com', rol: 'DUENO' });
    expect((await staff('GET', '/gregal/dinero')).body.porLiga[0]).toMatchObject({
      nombre: 'Liga Uno',
      total: 10_000,
    });
  });

  it('un staff no puede usar los endpoints de una liga', async () => {
    expect((await staff('GET', '/torneos')).status).toBe(401);
    expect((await staff('GET', '/auth/yo')).status).toBe(401);
  });

  it('cada rol interno ve solo sus secciones', async () => {
    await soporte('POST', '/gregal/sesion/ingresar', {
      email: 'soporte@test.com',
      password: 'clave-staff-2',
    });
    expect((await soporte('GET', '/gregal/organizaciones')).status).toBe(200);
    expect((await soporte('GET', '/gregal/dinero')).status).toBe(403);
    expect((await soporte('GET', '/gregal/auditoria')).status).toBe(403);
  });

  it('la auditoría registra ingresos, lecturas y rechazos, y no se puede editar', async () => {
    const filas = (await staff('GET', '/gregal/auditoria')).body as {
      accion: string;
      staff: { email: string };
      organizacion: { id: string; nombre: string } | null;
    }[];
    const acciones = filas.map((f) => `${f.staff.email} ${f.accion}`);
    expect(acciones).toContain('staff@test.com INGRESO');
    expect(acciones).toContain('staff@test.com VER_METRICAS');
    expect(acciones).toContain('soporte@test.com VER_DINERO_DENEGADO');
    expect(filas.find((f) => f.accion === 'VER_ORGANIZACION')!.organizacion).toEqual({
      id: orgId,
      nombre: 'Liga Uno',
    });
    await expect(admin.query("UPDATE staff_auditoria SET accion = 'otra'")).rejects.toThrow(/no se edita/);
  });

  it('al salir, la sesión de staff deja de valer', async () => {
    await staff('POST', '/gregal/sesion/salir');
    expect((await staff('GET', '/gregal/inicio')).status).toBe(401);
  });
});
