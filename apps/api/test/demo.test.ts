// Demo pública (ADR-019): sandboxes por visitante, aisladas, que vencen y se eliminan con todos sus datos.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let app: INestApplication;
let base: string;
let admin: pg.Client;
let demo: { limpiarVencidas(ahora?: Date): Promise<number> };
let auth: { registrar(d: Record<string, string>): Promise<{ acceso: string }> };

function cliente(cookieInicial = '') {
  let cookies = cookieInicial;
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

/** Cantidad de filas que quedan en todas las tablas que tienen `organizacion_id` para esa organización. */
async function filasDeOrganizacion(organizacionId: string) {
  const { rows } = await admin.query(
    "SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'organizacion_id'",
  );
  let total = 0;
  for (const { table_name } of rows) {
    const r = await admin.query(`SELECT count(*)::int AS n FROM "${table_name}" WHERE organizacion_id = $1`, [
      organizacionId,
    ]);
    total += r.rows[0].n;
  }
  return total;
}

beforeAll(async () => {
  // La configuración se lee al importar: DEMO_MODE tiene que estar fijado antes.
  process.env.DEMO_MODE = 'true';
  admin = new pg.Client({ connectionString: process.env.DATABASE_URL_ADMIN });
  await admin.connect();
  const { rows } = await admin.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
  );
  await admin.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} CASCADE`);
  // @ts-expect-error: módulo compilado (ver vitest.config.ts)
  const { AppModule } = await import('../dist/app.module.js');
  // @ts-expect-error: módulo compilado
  const { DemoService } = await import('../dist/demo/demo.js');
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  await app.listen(0);
  base = (await app.getUrl()).replace('[::1]', 'localhost');
  demo = app.get(DemoService);
  // @ts-expect-error: módulo compilado
  const { AuthService } = await import('../dist/auth/auth.js');
  auth = app.get(AuthService);
}, 60_000);

afterAll(async () => {
  await app?.close();
  await admin?.end();
});

describe('Demo pública', () => {
  const ana = cliente();
  const beto = cliente();
  let orgAna: string;
  let orgBeto: string;

  it('cada visitante recibe su propia sandbox con los datos de la plantilla', async () => {
    const a = await ana('POST', '/demo/sandbox');
    const b = await beto('POST', '/demo/sandbox');
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.urlPublica).not.toBe(b.body.urlPublica);

    const yoA = (await ana('GET', '/auth/yo')).body;
    const yoB = (await beto('GET', '/auth/yo')).body;
    orgAna = yoA.organizacion.id;
    orgBeto = yoB.organizacion.id;
    expect(orgAna).not.toBe(orgBeto);

    const torneos = (await ana('GET', '/torneos')).body as { nombre: string }[];
    expect(torneos.map((t) => t.nombre).sort()).toEqual(['Apertura 2026', 'Clausura 2026', 'Copa Relámpago']);
  });

  it('un visitante no ve ni toca los datos del otro', async () => {
    const idsB = ((await beto('GET', '/torneos')).body as { id: string }[]).map((t) => t.id);
    const idsA = ((await ana('GET', '/torneos')).body as { id: string }[]).map((t) => t.id);
    expect(idsA.filter((id) => idsB.includes(id))).toEqual([]);
    expect((await ana('GET', `/torneos/${idsB[0]}`)).status).toBe(404);
  });

  it('reiniciar descarta la sandbox y entrega otra con los datos originales', async () => {
    const r = await beto('POST', '/demo/reiniciar');
    expect(r.status).toBe(200);
    const nuevaOrg = (await beto('GET', '/auth/yo')).body.organizacion.id;
    expect(nuevaOrg).not.toBe(orgBeto);
    expect(await filasDeOrganizacion(orgBeto)).toBe(0);
    expect(((await beto('GET', '/torneos')).body as unknown[]).length).toBe(3);
    orgBeto = nuevaOrg;
  });

  let real: ReturnType<typeof cliente>;
  let orgReal: string;

  it('no permite registrarse en la demo: las cuentas nacen solo como sandboxes', async () => {
    const r = await cliente()('POST', '/auth/registro', {
      nombre: 'Intruso',
      email: 'intruso@test.com',
      password: 'clave-segura-1',
      organizacion: 'Liga Eterna',
    });
    expect(r.status).toBe(403);
  });

  it('no reinicia una liga real', async () => {
    // Una liga "real" dentro de la base de prueba: se crea por el servicio, porque el registro está bloqueado.
    const { acceso } = await auth.registrar({
      nombre: 'Rosa',
      email: 'rosa@liga-real.com',
      password: 'clave-segura-1',
      organizacion: 'Liga Real',
    });
    real = cliente(`potrero_at=${acceso}`);
    orgReal = (await real('GET', '/auth/yo')).body.organizacion.id;
    expect((await real('POST', '/demo/reiniciar')).status).toBe(403);
    expect((await real('GET', '/auth/yo')).status).toBe(200);
  });

  it('el job elimina las sandboxes vencidas con todos sus datos y sus usuarios', async () => {
    expect(await filasDeOrganizacion(orgAna)).toBeGreaterThan(0);
    // Todavía no vencieron: no se borra nada.
    expect(await demo.limpiarVencidas()).toBe(0);
    expect(await filasDeOrganizacion(orgAna)).toBeGreaterThan(0);

    const borradas = await demo.limpiarVencidas(new Date(Date.now() + 2 * 86_400_000));
    expect(borradas).toBe(2);
    for (const id of [orgAna, orgBeto]) {
      // Si alguien agrega una tabla con organizacion_id y no la suma a TABLAS_DE_ORGANIZACION, este test falla.
      expect(await filasDeOrganizacion(id)).toBe(0);
      const o = await admin.query('SELECT 1 FROM organizacion WHERE id = $1', [id]);
      expect(o.rowCount).toBe(0);
    }
    const u = await admin.query("SELECT 1 FROM usuario WHERE email LIKE '%@sandbox.potrero.app'");
    expect(u.rowCount).toBe(0);
    // Una liga real no tiene vencimiento: aunque pase mucho tiempo, la limpieza no la toca.
    await demo.limpiarVencidas(new Date(Date.now() + 365 * 86_400_000));
    const r = await admin.query('SELECT 1 FROM organizacion WHERE id = $1', [orgReal]);
    expect(r.rowCount).toBe(1);
    expect((await real('GET', '/auth/yo')).status).toBe(200);
  });

  it('limita cuántas sandboxes crea una misma IP por hora', async () => {
    // Los tests anteriores ya crearon 3 desde esta IP (2 visitantes + 1 reinicio); el tope por defecto es 5.
    const nuevo = cliente();
    expect((await nuevo('POST', '/demo/sandbox')).status).toBe(201);
    expect((await nuevo('POST', '/demo/sandbox')).status).toBe(201);
    const r = await nuevo('POST', '/demo/sandbox');
    expect(r.status).toBe(429);
    expect(r.body.message ?? r.body.error ?? JSON.stringify(r.body)).toContain('última hora');
  });
});
