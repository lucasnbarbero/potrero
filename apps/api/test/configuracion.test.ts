// Configuración inicial e importación desde Excel (E25) de punta a punta: asistente con su progreso, marca con
// dirección única, vista previa fila por fila, importación todo o nada, DNI cifrado y duplicados como en Documentación.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { SignJWT } from 'jose';
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

const consulta = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;

const EQUIPOS = ['Equipo', 'Color', 'Capitán', 'Email del capitán', 'Teléfono del capitán'];
const JUGADORES = ['Equipo', 'Nombre', 'Apellido', 'DNI', 'Fecha de nacimiento', 'Número'];
const CANCHAS = ['Sede', 'Cancha', 'Dirección', 'Superficie', 'Costo por partido'];

const archivo = (jugadorMalo = false) => ({
  tablas: [
    {
      nombre: 'Equipos',
      filas: [
        EQUIPOS,
        ['Los Pibes', 'rojo', 'Ana Paz', 'ana@mail.com', '1155550000'],
        ['La Doce', '', '', '', ''],
      ],
    },
    {
      nombre: 'Jugadores',
      filas: [
        JUGADORES,
        ['Los Pibes', 'Juan', 'Pérez', '30.123.456', '05/03/1998', '10'],
        ['Los Pibes', 'Luis', 'Sosa', '', '', '5'],
        ['La Doce', 'Pedro', 'Gómez', '31222333', '1999-01-20', ''],
        ...(jugadorMalo ? [['Equipo Fantasma', 'Mal', 'Dato', '12', '', '']] : []),
      ],
    },
    {
      nombre: 'Canchas',
      filas: [CANCHAS, ['Complejo Norte', 'Cancha 1', 'Calle 1', 'Sintético', '$ 25.000']],
    },
  ],
});

describe('configuración inicial e importación', () => {
  const api = cliente();
  const otra = cliente();

  it('una liga recién creada arranca el asistente en el primer paso', async () => {
    for (const [c, email, org] of [
      [api, 'conf@test.com', 'Liga Barrial Sur'],
      [otra, 'otra-conf@test.com', 'Otra Liga'],
    ] as const)
      expect(
        (
          await c('POST', '/auth/registro', {
            nombre: 'Ana',
            email,
            password: 'clave-segura-1',
            organizacion: org,
          })
        ).status,
      ).toBe(201);
    const r = await api('GET', '/configuracion');
    expect(r.status).toBe(200);
    expect(r.body.progreso).toMatchObject({ cantidad: 0, total: 5, siguiente: 'organizacion' });
    expect(r.body.organizacion).toMatchObject({
      nombre: 'Liga Barrial Sur',
      slug: 'liga-barrial-sur',
      mpConectado: false,
    });
    expect(r.body.reglamento.puntosVictoria).toBeGreaterThan(0);
  });

  it('guarda los datos, la marca y los pasos informativos', async () => {
    expect(
      (
        await api('PATCH', '/configuracion/organizacion', {
          nombre: 'Liga Barrial Sur',
          localidad: 'Lanús',
          provincia: 'Buenos Aires',
        })
      ).status,
    ).toBe(200);
    expect((await api('POST', '/configuracion/pasos', { paso: 'mercadoPago' })).status).toBe(201);
    // La dirección de otra liga no se puede usar.
    const ocupada = await api('PATCH', '/configuracion/marca', { slug: 'otra-liga', colorMarca: '#38bdf8' });
    expect(ocupada.status).toBe(409);
    const logoMalo = await api('PATCH', '/configuracion/marca', {
      slug: 'barrial-sur',
      colorMarca: '#38bdf8',
      logo: 'data:image/svg+xml;base64,PHN2Zz4=',
    });
    expect(logoMalo.status).toBe(400);
    const logo = 'data:image/png;base64,iVBORw0KGgo=';
    expect(
      (await api('PATCH', '/configuracion/marca', { slug: 'Barrial-Sur', colorMarca: '#38bdf8', logo }))
        .status,
    ).toBe(200);
    const r = await api('GET', '/configuracion');
    expect(r.body.organizacion).toMatchObject({
      slug: 'barrial-sur',
      colorMarca: '#38bdf8',
      logo,
      localidad: 'Lanús',
    });
    expect(r.body.progreso).toMatchObject({ cantidad: 3, porcentaje: 60, siguiente: 'reglamento' });
    // El sitio público ya responde en la nueva dirección.
    expect((await cliente()('GET', '/publico/barrial-sur')).status).toBe(200);
    expect((await consulta(`SELECT accion FROM auditoria WHERE accion = 'organizacion.slug'`)).length).toBe(
      1,
    );
  });

  it('la vista previa marca las filas con error y una fila mala no importa nada', async () => {
    const previa = await api('POST', '/importacion/vista-previa', archivo(true));
    expect(previa.status).toBe(201);
    expect(previa.body.valido).toBe(false);
    expect(previa.body.errores).toEqual([
      {
        hoja: 'jugadores',
        fila: 5,
        columna: 'Equipo',
        motivo: 'El equipo "Equipo Fantasma" no está en la hoja Equipos ni en tu liga.',
      },
      { hoja: 'jugadores', fila: 5, columna: 'DNI', motivo: '"12" no es un DNI: son 7 u 8 números.' },
    ]);
    expect(previa.body.hojas.jugadores.map((f: { estado: string }) => f.estado)).toEqual([
      'ok',
      'ok',
      'ok',
      'error',
    ]);

    const r = await api('POST', '/importacion', archivo(true));
    expect(r.status).toBe(422);
    expect(r.body.mensaje).toMatch(/^No se importó nada: hay 2 errores/);
    const [{ n }] = await consulta(`SELECT count(*)::int AS n FROM equipo`);
    expect(n).toBe(0);
    expect((await consulta(`SELECT 1 FROM jugador`)).length).toBe(0);
    expect((await consulta(`SELECT 1 FROM cancha`)).length).toBe(0);
  });

  it('importa todo junto, con el DNI cifrado, y la otra liga no lo ve', async () => {
    const previa = await api('POST', '/importacion/vista-previa', archivo());
    expect(previa.body.valido).toBe(true);
    expect(previa.body.resumen).toEqual({
      equipos: { nuevos: 2, existentes: 0 },
      jugadores: { nuevos: 3, duplicados: 0 },
      canchas: { nuevas: 1, existentes: 0 },
    });
    const r = await api('POST', '/importacion', archivo());
    expect(r.status).toBe(201);
    const equipos = (await api('GET', '/equipos')).body as {
      nombre: string;
      color: string;
      _count: { plantel: number };
    }[];
    expect(equipos.map((e) => [e.nombre, e.color, e._count.plantel])).toEqual([
      ['La Doce', null, 1],
      ['Los Pibes', '#dc2626', 2],
    ]);
    const filas = await consulta(
      `SELECT nombre, dni_cifrado, dni_hash, fecha_nacimiento FROM jugador WHERE nombre = 'Juan'`,
    );
    expect(filas[0].dni_cifrado).toMatch(/^v1\./);
    expect(filas[0].dni_cifrado).not.toContain('30123456');
    expect(filas[0].dni_hash).toBeTruthy();
    const canchas = (await api('GET', '/canchas')).body;
    expect(canchas[0]).toMatchObject({ nombre: 'Complejo Norte', direccion: 'Calle 1' });
    expect(canchas[0].canchas[0]).toMatchObject({
      nombre: 'Cancha 1',
      costoPorPartido: 25000,
      superficie: 'Sintético',
    });
    expect((await api('GET', '/configuracion')).body.progreso.completos.importacion).toBe(true);
    expect((await otra('GET', '/equipos')).body).toEqual([]);
  });

  it('al reimportar reutiliza lo existente y un DNI ya cargado queda como duplicado abierto', async () => {
    const segunda = {
      tablas: [
        { nombre: 'Equipos', filas: [EQUIPOS, ['los pibes', '', '', '', '']] },
        { nombre: 'Jugadores', filas: [JUGADORES, ['Los Pibes', 'Juancito', 'Pérez', '30123456', '', '']] },
      ],
    };
    const previa = await api('POST', '/importacion/vista-previa', segunda);
    expect(previa.body.valido).toBe(true);
    expect(previa.body.hojas.equipos[0].estado).toBe('existente');
    expect(previa.body.hojas.jugadores[0].estado).toBe('aviso');
    const r = await api('POST', '/importacion', segunda);
    expect(r.status).toBe(201);
    expect(r.body.resumen.jugadores).toEqual({ nuevos: 1, duplicados: 1 });
    expect((await api('GET', '/equipos')).body).toHaveLength(2);
    const dups = (await api('GET', '/documentacion/duplicados')).body;
    expect(dups).toHaveLength(1);
  });

  it('valida el cuerpo y los permisos', async () => {
    expect((await api('POST', '/importacion', { tablas: [] })).status).toBe(400);
    expect((await api('POST', '/configuracion/pasos', { paso: 'otro' })).status).toBe(400);
    expect((await cliente()('GET', '/configuracion')).status).toBe(401);
    // Un árbitro de la liga no configura ni importa.
    const yo = (await api('GET', '/auth/yo')).body;
    const token = await new SignJWT({ org: yo.organizacion.id, rol: 'ARBITRO', ent: 'produccion' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(yo.usuario.id)
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));
    const comoArbitro = (metodo: string, ruta: string, cuerpo: unknown) =>
      fetch(`${base}/api${ruta}`, {
        method: metodo,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
    expect((await comoArbitro('POST', '/importacion', archivo())).status).toBe(403);
    expect((await comoArbitro('PATCH', '/configuracion/organizacion', { nombre: 'X' })).status).toBe(403);
  });
});
