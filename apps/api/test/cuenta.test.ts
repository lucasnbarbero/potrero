// Cuenta del usuario (E04-02, E04-05, E04-10, E04-14): recuperar la contraseña, verificar el email, límite de intentos,
// organización activa, "Mi cuenta" y cerrar sesión en todos los dispositivos.
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
  let cookies: Record<string, string> = {};
  const llamar = async (metodo: string, ruta: string, cuerpo?: unknown) => {
    const r = await fetch(`${base}/api${ruta}`, {
      method: metodo,
      headers: {
        'content-type': 'application/json',
        cookie: Object.entries(cookies)
          .map(([k, v]) => `${k}=${v}`)
          .join('; '),
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    for (const c of r.headers.getSetCookie()) {
      const [par] = c.split(';');
      const [k, v] = par!.split('=');
      if (v) cookies[k!] = v;
      else delete cookies[k!];
    }
    const texto = await r.text();
    return { status: r.status, body: texto ? JSON.parse(texto) : null };
  };
  llamar.cookies = () => cookies;
  llamar.olvidar = () => (cookies = {});
  return llamar;
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

const sql = async (q: string, params: unknown[] = []) => (await admin.query(q, params)).rows;
const token = (link: string) => link.split('/').at(-1)!;

describe('cuenta del usuario', () => {
  const ana = cliente();
  const EMAIL = 'ana-cuenta@test.com';

  it('registra y deja el email sin verificar', async () => {
    expect(
      (
        await ana('POST', '/auth/registro', {
          nombre: 'Ana Cuenta',
          email: EMAIL,
          password: 'clave-segura-1',
          organizacion: 'Liga Cuenta',
        })
      ).status,
    ).toBe(201);
    const c = (await ana('GET', '/cuenta')).body;
    expect(c.usuario).toMatchObject({ nombre: 'Ana Cuenta', email: EMAIL, emailVerificado: false });
    expect(c.organizaciones).toHaveLength(1);
    expect(c.organizaciones[0]).toMatchObject({ nombre: 'Liga Cuenta', rol: 'DUENO', activa: true });
    // El registro ya "mandó" un link de verificación (simulado): queda guardado solo su hash.
    const links = await sql("SELECT token_hash FROM link_cuenta WHERE tipo = 'VERIFICAR_EMAIL'");
    expect(links).toHaveLength(1);
    expect(links[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('verifica el email con un link de un solo uso', async () => {
    const r = await ana('POST', '/cuenta/verificacion');
    expect(r.status).toBe(200);
    expect(r.body.linkDev).toContain('/verificar/');
    // Pedir uno nuevo invalida los anteriores: solo queda uno sin usar.
    expect(
      await sql("SELECT 1 FROM link_cuenta WHERE tipo = 'VERIFICAR_EMAIL' AND usado_en IS NULL"),
    ).toHaveLength(1);
    const anonimo = cliente();
    expect((await anonimo('POST', '/auth/verificar-email', { token: 'x'.repeat(43) })).status).toBe(410);
    const ok = await anonimo('POST', '/auth/verificar-email', { token: token(r.body.linkDev) });
    expect(ok.status).toBe(200);
    expect(ok.body.email).toBe(EMAIL);
    const otraVez = await anonimo('POST', '/auth/verificar-email', { token: token(r.body.linkDev) });
    expect(otraVez.status).toBe(410);
    expect(otraVez.body.mensaje).toContain('ya se usó');
    expect((await ana('GET', '/cuenta')).body.usuario.emailVerificado).toBe(true);
    expect((await ana('POST', '/cuenta/verificacion')).body.yaVerificado).toBe(true);
  });

  it('recupera la contraseña con un link que vence y se usa una sola vez', async () => {
    const anonimo = cliente();
    // Un email que no existe responde igual (no revela quién tiene cuenta) y no genera link.
    const nadie = await anonimo('POST', '/auth/recuperar', { email: 'nadie@test.com' });
    expect(nadie).toMatchObject({ status: 200, body: { ok: true } });
    expect(nadie.body.linkDev).toBeUndefined();

    const r = await anonimo('POST', '/auth/recuperar', { email: EMAIL.toUpperCase() });
    expect(r.status).toBe(200);
    const t = token(r.body.linkDev);
    expect((await anonimo('POST', '/auth/recuperar/estado', { token: t })).body.estado).toBe('VALIDO');
    expect((await anonimo('POST', '/auth/restablecer', { token: t, password: 'corta' })).status).toBe(400);

    // Ana tenía la sesión abierta: al restablecer, se cierra en todos lados.
    const refreshViejo = ana.cookies().potrero_rt;
    const ok = await anonimo('POST', '/auth/restablecer', { token: t, password: 'clave-nueva-123' });
    expect(ok.status).toBe(200);
    expect((await anonimo('GET', '/auth/yo')).body.usuario.email).toBe(EMAIL);
    const renovar = await fetch(`${base}/api/auth/renovar`, {
      method: 'POST',
      headers: { cookie: `potrero_rt=${refreshViejo}` },
    });
    expect(renovar.status).toBe(401);

    const repetido = await cliente()('POST', '/auth/restablecer', { token: t, password: 'otra-clave-123' });
    expect(repetido.status).toBe(410);
    expect((await cliente()('POST', '/auth/recuperar/estado', { token: t })).body.estado).toBe('USADO');

    // Un link vencido no sirve.
    const r2 = await cliente()('POST', '/auth/recuperar', { email: EMAIL });
    await sql("UPDATE link_cuenta SET vence_en = now() - interval '1 minute' WHERE usado_en IS NULL");
    const vencido = await cliente()('POST', '/auth/restablecer', {
      token: token(r2.body.linkDev),
      password: 'otra-clave-123',
    });
    expect(vencido.status).toBe(410);
    expect(vencido.body.mensaje).toContain('venció');

    // Entra con la contraseña nueva, no con la vieja.
    expect(
      (await cliente()('POST', '/auth/ingresar', { email: EMAIL, password: 'clave-segura-1' })).status,
    ).toBe(401);
    expect((await ana('POST', '/auth/ingresar', { email: EMAIL, password: 'clave-nueva-123' })).status).toBe(
      200,
    );
  });

  it('bloquea el ingreso tras varios intentos fallidos con un mensaje claro', async () => {
    const b = cliente();
    await b('POST', '/auth/registro', {
      nombre: 'Beto',
      email: 'beto-cuenta@test.com',
      password: 'clave-segura-2',
      organizacion: 'Liga Beto',
    });
    const intento = (password: string) =>
      cliente()('POST', '/auth/ingresar', { email: 'beto-cuenta@test.com', password });
    for (let i = 0; i < 5; i++) expect((await intento('mal')).status).toBe(401);
    const bloqueado = await intento('clave-segura-2');
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.body.mensaje).toMatch(/bloqueamos el ingreso a esta cuenta por \d+ minutos/);
    // Otra cuenta desde el mismo lugar sigue entrando (el límite por IP es más alto).
    expect((await ana('POST', '/auth/ingresar', { email: EMAIL, password: 'clave-nueva-123' })).status).toBe(
      200,
    );
    // Pasada la ventana, vuelve a poder entrar.
    await sql(
      "UPDATE intento_ingreso SET creado_en = creado_en - interval '20 minutes' WHERE email = 'beto-cuenta@test.com'",
    );
    expect((await intento('clave-segura-2')).status).toBe(200);
  });

  it('bloquea por IP cuando se prueban muchas cuentas desde el mismo lugar', async () => {
    for (let i = 0; i < 20; i++)
      await cliente()('POST', '/auth/ingresar', { email: `x${i}@test.com`, password: 'mal' });
    const r = await cliente()('POST', '/auth/ingresar', { email: EMAIL, password: 'clave-nueva-123' });
    expect(r.status).toBe(429);
    expect(r.body.mensaje).toContain('desde esta conexión');
    await sql('DELETE FROM intento_ingreso');
  });

  it('cambia de organización activa y la sesión renovada la conserva', async () => {
    const [ana0] = await sql('SELECT id FROM usuario WHERE email = $1', [EMAIL]);
    const [beto] = await sql("SELECT o.id FROM organizacion o WHERE o.nombre = 'Liga Beto'");
    await sql(
      "INSERT INTO membresia (id, usuario_id, organizacion_id, rol) VALUES ('m-ana-beto', $1, $2, 'TESORERO')",
      [ana0.id, beto.id],
    );
    const c = (await ana('GET', '/cuenta')).body;
    expect(c.organizaciones.map((o: { nombre: string; activa: boolean }) => [o.nombre, o.activa])).toEqual([
      ['Liga Cuenta', true],
      ['Liga Beto', false],
    ]);
    // No se puede pasar a una organización de la que no es miembro.
    const ajena = cliente();
    await ajena('POST', '/auth/registro', {
      nombre: 'Caro',
      email: 'caro-cuenta@test.com',
      password: 'clave-segura-3',
      organizacion: 'Liga Caro',
    });
    const caro = (await ajena('GET', '/auth/yo')).body.organizacion.id;
    expect((await ana('POST', '/cuenta/organizacion', { organizacionId: caro })).status).toBe(403);

    expect((await ana('POST', '/cuenta/organizacion', { organizacionId: beto.id })).status).toBe(200);
    const yo = (await ana('GET', '/auth/yo')).body;
    expect(yo.organizacion.nombre).toBe('Liga Beto');
    expect(yo.rol).toBe('TESORERO');
    // Al renovar el token de acceso sigue en la organización elegida.
    expect((await ana('POST', '/auth/renovar')).status).toBe(200);
    expect((await ana('GET', '/auth/yo')).body.organizacion.nombre).toBe('Liga Beto');
    expect(
      (await ana('POST', '/cuenta/organizacion', { organizacionId: c.organizaciones[0].id })).status,
    ).toBe(200);
    expect((await ana('GET', '/auth/yo')).body.organizacion.nombre).toBe('Liga Cuenta');
  });

  it('edita nombre y email (el email nuevo pide contraseña y se vuelve a verificar)', async () => {
    expect((await ana('PATCH', '/cuenta', { nombre: 'Ana María', email: EMAIL })).status).toBe(200);
    expect((await ana('GET', '/cuenta')).body.usuario).toMatchObject({
      nombre: 'Ana María',
      emailVerificado: true,
    });
    expect((await ana('PATCH', '/cuenta', { nombre: 'Ana María', email: 'nueva@test.com' })).status).toBe(
      403,
    );
    expect(
      (
        await ana('PATCH', '/cuenta', {
          nombre: 'Ana María',
          email: 'beto-cuenta@test.com',
          password: 'clave-nueva-123',
        })
      ).status,
    ).toBe(409);
    const r = await ana('PATCH', '/cuenta', {
      nombre: 'Ana María',
      email: 'nueva@test.com',
      password: 'clave-nueva-123',
    });
    expect(r.status).toBe(200);
    expect(r.body.verificacionEnviada).toBe(true);
    expect((await ana('GET', '/cuenta')).body.usuario).toMatchObject({
      email: 'nueva@test.com',
      emailVerificado: false,
    });
    expect((await cliente()('POST', '/auth/verificar-email', { token: token(r.body.linkDev) })).status).toBe(
      200,
    );
    expect((await ana('GET', '/cuenta')).body.usuario.emailVerificado).toBe(true);
  });

  it('cambia la contraseña: pide la actual y cierra las otras sesiones', async () => {
    const otroDispositivo = cliente();
    await otroDispositivo('POST', '/auth/ingresar', { email: 'nueva@test.com', password: 'clave-nueva-123' });
    expect((await ana('POST', '/cuenta/password', { actual: 'mal', nueva: 'clave-final-123' })).status).toBe(
      403,
    );
    expect(
      (await ana('POST', '/cuenta/password', { actual: 'clave-nueva-123', nueva: 'clave-nueva-123' })).status,
    ).toBe(400);
    expect(
      (await ana('POST', '/cuenta/password', { actual: 'clave-nueva-123', nueva: 'clave-final-123' })).status,
    ).toBe(200);
    expect((await otroDispositivo('POST', '/auth/renovar')).status).toBe(401);
    expect((await ana('POST', '/auth/renovar')).status).toBe(200);
  });

  it('cierra la sesión en todos los dispositivos', async () => {
    const otroDispositivo = cliente();
    await otroDispositivo('POST', '/auth/ingresar', { email: 'nueva@test.com', password: 'clave-final-123' });
    expect((await ana('GET', '/cuenta')).body.sesionesActivas).toBeGreaterThanOrEqual(2);
    const r = await ana('POST', '/cuenta/cerrar-sesiones');
    expect(r.status).toBe(200);
    expect(r.body.cerradas).toBeGreaterThanOrEqual(2);
    expect(ana.cookies().potrero_rt).toBeUndefined();
    expect((await ana('GET', '/cuenta')).status).toBe(401);
    expect((await otroDispositivo('POST', '/auth/renovar')).status).toBe(401);
  });
});
