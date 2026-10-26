// Página pública del partido (E21) y perfil público del jugador (E20) de punta a punta: sin sesión, línea de tiempo
// sin anulados, crónica, trayectoria entre dos torneos con dos equipos, privacidad (iniciales, apodo, menores con y
// sin consentimiento) y que nunca salgan DNI, fecha de nacimiento, teléfonos ni emails. También el aislamiento.
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

const sql = async (q: string, params: unknown[] = []) => (await admin.query(q, params)).rows;

type P = { id: string; fecha: number; localId: string; visitanteId: string };

describe('sitio público: partido y jugador', () => {
  const api = cliente();
  const otra = cliente();
  const pub = cliente();
  let slug: string;
  const torneos: { id: string; slug: string }[] = [];
  const equipos: { id: string; jugadores: string[] }[] = [];
  let partido: P;
  let anulado: string;

  /** Carga eventos en el acta: `equipo` es el índice en `equipos` y `jugador`, el id. */
  const jugar = async (
    p: P,
    eventos: { equipo: number; tipo: string; jugador: string; minuto: number }[],
  ) => {
    await api('POST', `/partidos/${p.id}/iniciar`);
    const ids: string[] = [];
    for (const e of eventos) {
      const r = await api('POST', `/partidos/${p.id}/eventos`, {
        tipo: e.tipo,
        equipoId: equipos[e.equipo]!.id,
        jugadorId: e.jugador,
        minuto: e.minuto,
        clientUuid: randomUUID(),
      });
      ids.push(r.body.evento.id);
    }
    return ids;
  };

  it('prepara dos torneos: el mismo jugador juega en dos equipos', async () => {
    await api('POST', '/auth/registro', {
      nombre: 'Org',
      email: 'publico@test.com',
      password: 'clave-segura-1',
      organizacion: 'Liga Pública',
    });
    slug = (await api('GET', '/auth/yo')).body.organizacion.slug;
    await api('POST', '/canchas', { sede: 'Complejo', nombre: 'Cancha 1' });
    const cancha = (await api('GET', '/canchas')).body[0].canchas[0].id;
    for (let i = 1; i <= 3; i++) {
      const e = await api('POST', '/equipos', {
        nombre: `Equipo ${i}`,
        capitanEmail: `capitan${i}@test.com`,
        capitanTelefono: `3564 99900${i}`,
      });
      const jugadores: string[] = [];
      for (let j = 1; j <= 3; j++)
        jugadores.push(
          (
            await api('POST', `/equipos/${e.body.id}/jugadores`, {
              nombre: `Nombre${i}${j}`,
              apellido: `Apellido${i}${j}`,
              numero: j,
            })
          ).body.jugadorId,
        );
      equipos.push({ id: e.body.id, jugadores });
    }
    // Datos sensibles que nunca tienen que salir por el sitio público.
    await sql("UPDATE jugador SET dni_cifrado = 'DNI-SECRETO', fecha_nacimiento = '1990-05-17'");
    // El jugador 1 del equipo 1 también juega en el equipo 3 (para el segundo torneo).
    await sql(
      'INSERT INTO plantel_jugador (id, organizacion_id, equipo_id, jugador_id, numero) SELECT $1, organizacion_id, $2, id, 10 FROM jugador WHERE id = $3',
      [randomUUID(), equipos[2]!.id, equipos[0]!.jugadores[0]],
    );
    for (const [nombre, eqs] of [
      ['Apertura', [0, 1]],
      ['Clausura', [2, 1]],
    ] as const) {
      const t = (
        await api('POST', '/torneos', { nombre, modalidad: 'F5', formato: 'LIGA', cupo: 4, inscripcion: 0 })
      ).body;
      torneos.push({ id: t.id, slug: t.slug });
      for (const i of eqs) await api('POST', `/torneos/${t.id}/inscripciones`, { equipoId: equipos[i]!.id });
      await api('POST', `/torneos/${t.id}/fixture`, {
        primerDia: '2027-03-06',
        horarios: ['19:00'],
        canchaIds: [cancha],
      });
    }
    const [p1] = (await api('GET', `/torneos/${torneos[0]!.id}/partidos`)).body as P[];
    partido = p1!;
    const [e1, e2] = [equipos[0]!.jugadores, equipos[1]!.jugadores];
    const ids = await jugar(partido, [
      { equipo: 0, tipo: 'GOL', jugador: e1[0]!, minuto: 12 },
      { equipo: 1, tipo: 'GOL', jugador: e2[1]!, minuto: 25 },
      { equipo: 1, tipo: 'AMARILLA', jugador: e2[2]!, minuto: 31 },
      { equipo: 0, tipo: 'GOL', jugador: e1[0]!, minuto: 48 },
      { equipo: 0, tipo: 'GOL', jugador: e1[1]!, minuto: 50 },
    ]);
    anulado = ids[4]!;
    await api('POST', `/partidos/${partido.id}/eventos/${anulado}/anular`, { clientUuid: randomUUID() });
    expect(
      (await api('POST', `/partidos/${partido.id}/cerrar`, { firmaLocal: true, firmaVisitante: true }))
        .status,
    ).toBe(201);
    const [p2] = (await api('GET', `/torneos/${torneos[1]!.id}/partidos`)).body as P[];
    await jugar(p2!, [{ equipo: 2, tipo: 'GOL', jugador: e1[0]!, minuto: 7 }]);
    await api('POST', `/partidos/${p2!.id}/cerrar`, { firmaLocal: true, firmaVisitante: true });
  });

  it('página del partido: resultado, línea de tiempo sin anulados, crónica y sin datos personales', async () => {
    const r = await pub('GET', `/publico/${slug}/${torneos[0]!.slug}/partidos/${partido.id}`);
    expect(r.status).toBe(200);
    const goles1 = partido.localId === equipos[0]!.id;
    expect(r.body.partido).toMatchObject({
      estado: 'FINALIZADO',
      golesLocal: goles1 ? 2 : 1,
      golesVisitante: goles1 ? 1 : 2,
      cancha: 'Complejo · Cancha 1',
    });
    const linea = r.body.lineaDeTiempo as {
      id: string;
      minuto: number;
      tipo: string;
      jugador: { nombre: string };
    }[];
    expect(linea.map((e) => [e.minuto, e.tipo])).toEqual([
      [12, 'GOL'],
      [25, 'GOL'],
      [31, 'AMARILLA'],
      [48, 'GOL'],
    ]);
    expect(linea.some((e) => e.id === anulado)).toBe(false);
    // Por defecto, nombre e inicial del apellido.
    expect(linea[0]!.jugador.nombre).toBe('Nombre11 A.');
    expect(r.body.cronica[0]).toContain('Nombre11 A. hizo un doblete para Equipo 1.');
    expect(r.body.cronica[1]).toContain('En la tabla');
    expect(r.body.figura).toMatchObject({ goles: 2, jugador: { nombre: 'Nombre11 A.' } });
    const texto = JSON.stringify(r.body);
    expect(texto).not.toMatch(/Apellido11|DNI-SECRETO|1990|@test\.com|3564/);
  });

  it('un partido por jugar muestra horario y cancha, sin crónica', async () => {
    const t = (
      await api('POST', '/torneos', {
        nombre: 'Futuro',
        modalidad: 'F5',
        formato: 'LIGA',
        cupo: 4,
        inscripcion: 0,
      })
    ).body;
    for (const e of equipos.slice(0, 2))
      await api('POST', `/torneos/${t.id}/inscripciones`, { equipoId: e.id });
    const cancha = (await api('GET', '/canchas')).body[0].canchas[0].id;
    await api('POST', `/torneos/${t.id}/fixture`, {
      primerDia: '2027-05-01',
      horarios: ['20:00'],
      canchaIds: [cancha],
    });
    const [p] = (await api('GET', `/torneos/${t.id}/partidos`)).body as P[];
    const r = await pub('GET', `/publico/${slug}/${t.slug}/partidos/${p!.id}`);
    expect(r.body.partido).toMatchObject({
      estado: 'PROGRAMADO',
      golesLocal: null,
      cancha: 'Complejo · Cancha 1',
    });
    expect(r.body.partido.inicio).toBeTruthy();
    expect(r.body.cronica).toEqual([]);
    expect(r.body.lineaDeTiempo).toEqual([]);
  });

  it('perfil del jugador: estadísticas y trayectoria en dos torneos con dos equipos', async () => {
    const id = equipos[0]!.jugadores[0]!;
    const r = await pub('GET', `/publico/${slug}/jugadores/${id}`);
    expect(r.status).toBe(200);
    expect(r.body.jugador).toEqual({ nombre: 'Nombre11 A.', iniciales: 'NA' });
    expect(r.body.totales).toMatchObject({ pj: 2, goles: 3, amarillas: 0, rojas: 0, golesPorPartido: 1.5 });
    const tray = r.body.trayectoria as {
      torneo: { nombre: string };
      equipo: string;
      estadisticas: { goles: number };
    }[];
    expect(tray.map((x) => [x.torneo.nombre, x.equipo, x.estadisticas.goles]).sort()).toEqual([
      ['Apertura', 'Equipo 1', 2],
      ['Clausura', 'Equipo 3', 1],
      ['Futuro', 'Equipo 1', 0], // el torneo por jugar del test anterior
    ]);
    expect(r.body.logros).toContainEqual({ tipo: 'DOBLETE' });
    expect(r.body.ultimos).toHaveLength(2);
    const texto = JSON.stringify(r.body);
    expect(texto).not.toMatch(/Apellido11|DNI-SECRETO|1990|@test\.com|3564|dni|nacimiento|telefono|email/i);
  });

  it('privacidad: apodo, nombre completo y menores sin perfil salvo consentimiento del tutor', async () => {
    const [a, b, menor] = equipos[0]!.jugadores as [string, string, string];
    expect(
      (await otra('PATCH', `/jugadores/${a}/privacidad`, { nombrePublico: 'APODO', apodo: 'Tucu' })).status,
    ).toBe(401);
    expect((await api('PATCH', `/jugadores/${a}/privacidad`, { nombrePublico: 'NADA' })).status).toBe(400);
    expect(
      (await api('PATCH', `/jugadores/${a}/privacidad`, { nombrePublico: 'APODO', apodo: 'Tucu' })).status,
    ).toBe(200);
    expect((await api('PATCH', `/jugadores/${b}/privacidad`, { nombrePublico: 'COMPLETO' })).status).toBe(
      200,
    );
    expect((await pub('GET', `/publico/${slug}/jugadores/${a}`)).body.jugador.nombre).toBe('Tucu');
    expect((await pub('GET', `/publico/${slug}/jugadores/${b}`)).body.jugador.nombre).toBe(
      'Nombre12 Apellido12',
    );

    // Un menor sin consentimiento: no tiene perfil y en el partido aparece solo con iniciales y sin enlace.
    await sql("UPDATE jugador SET fecha_nacimiento = (now() - interval '15 years')::date WHERE id = $1", [
      menor,
    ]);
    expect((await pub('GET', `/publico/${slug}/jugadores/${menor}`)).status).toBe(404);
    const p = (await pub('GET', `/publico/${slug}/${torneos[0]!.slug}/partidos/${partido.id}`)).body;
    const amarilla = p.lineaDeTiempo.find((e: { tipo: string }) => e.tipo === 'AMARILLA');
    const deEquipo1 = [...p.planteles.local, ...p.planteles.visitante].find(
      (x: { iniciales: string; numero: number; id: string | null }) => x.id === null,
    );
    expect(deEquipo1).toMatchObject({ nombre: 'N. A.', id: null });
    expect(JSON.stringify(p)).not.toContain(menor);
    expect(amarilla.jugador.id).not.toBeNull(); // la amarilla es de otro equipo

    // Con el consentimiento de imagen y la autorización del tutor, tiene perfil (sin el nombre completo).
    for (const tipo of ['TUTOR_PARTICIPACION', 'IMAGEN'])
      await sql(
        "INSERT INTO consentimiento (id, organizacion_id, jugador_id, tipo, version, otorgante) SELECT $1, organizacion_id, id, $2, 1, 'Tutora' FROM jugador WHERE id = $3",
        [randomUUID(), tipo, menor],
      );
    await api('PATCH', `/jugadores/${menor}/privacidad`, { nombrePublico: 'COMPLETO' });
    const perfil = await pub('GET', `/publico/${slug}/jugadores/${menor}`);
    expect(perfil.status).toBe(200);
    expect(perfil.body.jugador.nombre).toBe('Nombre13 A.');
    expect(JSON.stringify(perfil.body)).not.toMatch(/Tutora|Apellido13/);
  });

  it('el sitio del torneo usa los nombres públicos en goleadores', async () => {
    const r = await pub('GET', `/publico/${slug}/${torneos[0]!.slug}`);
    expect(r.body.goleadores[0]).toMatchObject({ jugador: 'Tucu', goles: 2 });
    expect(JSON.stringify(r.body)).not.toMatch(/Apellido11|DNI-SECRETO/);
  });

  it('aislamiento: otra liga no ve partidos ni jugadores ajenos por su slug', async () => {
    await otra('POST', '/auth/registro', {
      nombre: 'Otra',
      email: 'otra-publico@test.com',
      password: 'clave-segura-1',
      organizacion: 'Liga Ajena',
    });
    const otroSlug = (await otra('GET', '/auth/yo')).body.organizacion.slug;
    const id = equipos[0]!.jugadores[0]!;
    expect((await pub('GET', `/publico/${otroSlug}/jugadores/${id}`)).status).toBe(404);
    expect((await pub('GET', `/publico/${slug}/${torneos[1]!.slug}/partidos/${partido.id}`)).status).toBe(
      404,
    );
    expect((await otra('PATCH', `/jugadores/${id}/privacidad`, { nombrePublico: 'COMPLETO' })).status).toBe(
      404,
    );
    expect((await pub('GET', `/publico/${slug}/jugadores/no-existe`)).status).toBe(404);
  });
});
