// Tribunal de disciplina (E14) de punta a punta: expediente automático por roja, resolución que amplía, multa que genera un
// cargo (y entra a la caja al cobrarse), jugador no habilitado en el acta e historial disciplinario.
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

const consulta = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;

describe('tribunal de disciplina', () => {
  const api = cliente();
  const otra = cliente();
  let torneoId: string;
  const equipos: string[] = [];
  type P = { id: string; fecha: number; localId: string; visitanteId: string };
  let expedienteRoja: string;
  let jugadorRojo: string;
  let equipoRojo: string;
  let sancionId: string;

  it('prepara una liga de 4 equipos y juega la fecha 1 con una roja directa', async () => {
    await api('POST', '/auth/registro', {
      nombre: 'Org',
      email: 'tri@test.com',
      password: 'clave-segura-1',
      organizacion: 'Liga Tribunal',
    });
    const canchas = [
      (await api('POST', '/canchas', { sede: 'Complejo', nombre: 'Cancha 1' })).body.id,
      (await api('POST', '/canchas', { sede: 'Complejo', nombre: 'Cancha 2' })).body.id,
    ];
    torneoId = (
      await api('POST', '/torneos', {
        nombre: 'Torneo',
        modalidad: 'F5',
        formato: 'LIGA',
        cupo: 4,
        inscripcion: 0,
      })
    ).body.id;
    for (let i = 1; i <= 4; i++) {
      const e = await api('POST', '/equipos', { nombre: `E${i}` });
      equipos.push(e.body.id);
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
    const p = ((await api('GET', `/torneos/${torneoId}/partidos`)).body as P[]).find((x) => x.fecha === 1)!;
    const acta = (await api('GET', `/partidos/${p.id}`)).body;
    equipoRojo = acta.local.id;
    jugadorRojo = acta.local.jugadores[0].id;
    await api('POST', `/partidos/${p.id}/iniciar`, {});
    await api('POST', `/partidos/${p.id}/eventos`, {
      tipo: 'ROJA',
      equipoId: equipoRojo,
      jugadorId: jugadorRojo,
      minuto: 20,
      clientUuid: randomUUID(),
    });
    const cierre = await api('POST', `/partidos/${p.id}/cerrar`, { firmaLocal: true, firmaVisitante: true });
    expect(cierre.status).toBe(201);
  });

  it('la roja abre sola un expediente con lo que sugiere el reglamento', async () => {
    const t = (await api('GET', `/tribunal?torneoId=${torneoId}`)).body;
    expect(t.contadores).toMatchObject({ abiertos: 1, suspendidos: 1, descargos: 0 });
    const e = t.expedientes[0];
    expect(e).toMatchObject({
      tipo: 'ROJA_DIRECTA',
      estado: 'ABIERTO',
      sugeridos: 1,
      jugador: 'J1 E1',
      equipo: 'E1',
    });
    expedienteRoja = e.id;
    sancionId = e.sancionId;
    expect(sancionId).toBeTruthy();
  });

  it('informe del árbitro y descargo del capitán quedan en el expediente', async () => {
    expect(
      (
        await api('POST', `/expedientes/${expedienteRoja}/informe`, {
          informeArbitro: 'Entrada con tapones.',
        })
      ).status,
    ).toBe(201);
    expect(
      (await api('POST', `/expedientes/${expedienteRoja}/descargo`, { descargo: 'Fue pelota dividida.' }))
        .status,
    ).toBe(201);
    const t = (await api('GET', `/tribunal?torneoId=${torneoId}`)).body;
    expect(t.contadores.descargos).toBe(1);
    expect(t.expedientes[0]).toMatchObject({
      informeArbitro: 'Entrada con tapones.',
      descargo: 'Fue pelota dividida.',
    });
  });

  it('valida la resolución y exige permiso y sesión', async () => {
    const mala = await api('POST', `/expedientes/${expedienteRoja}/resolver`, {
      partidos: 25,
      multa: 0,
      resolucion: 'Demasiado',
    });
    expect(mala.status).toBe(400);
    expect(
      (await otra('POST', `/expedientes/${expedienteRoja}/resolver`, { partidos: 1, resolucion: 'x y z' }))
        .status,
    ).toBe(401);
  });

  it('el tribunal amplía la sanción y le carga una multa al equipo', async () => {
    const r = await api('POST', `/expedientes/${expedienteRoja}/resolver`, {
      partidos: 3,
      multa: 5_000,
      resolucion: 'Juego peligroso con antecedentes.',
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      estado: 'RESUELTO',
      veredicto: 'AMPLIADA',
      partidosResueltos: 3,
      multa: 5_000,
    });
    const [s] = await consulta('SELECT partidos FROM sancion WHERE id = $1', [sancionId]);
    expect(s.partidos).toBe(3);
    const [cargo] = await consulta('SELECT monto, categoria, concepto FROM cargo WHERE id = $1', [
      r.body.cargoId,
    ]);
    expect(cargo).toMatchObject({ monto: 5_000, categoria: 'MULTAS' });
    expect(cargo.concepto).toMatch(/^Multa/);
    const otraVez = await api('POST', `/expedientes/${expedienteRoja}/resolver`, {
      partidos: 1,
      resolucion: 'Otra vez',
    });
    expect(otraVez.status).toBe(409);
  });

  it('la multa cobrada entra a la caja como ingreso de multas', async () => {
    const [{ id }] = await consulta("SELECT id FROM cargo WHERE categoria = 'MULTAS'");
    const pago = await api('POST', `/cargos/${id}/pagos`, { metodo: 'EFECTIVO', monto: 5_000 });
    expect(pago.status).toBe(201);
    const [{ s }] = await consulta(
      "SELECT COALESCE(SUM(haber - debe), 0)::int AS s FROM linea_asiento WHERE cuenta = 'INGRESOS:MULTAS'",
    );
    expect(s).toBe(5_000);
  });

  it('un jugador suspendido que figura en el acta abre un expediente por no habilitado (una sola vez)', async () => {
    const p = ((await api('GET', `/torneos/${torneoId}/partidos`)).body as P[]).find(
      (x) => x.fecha === 2 && (x.localId === equipoRojo || x.visitanteId === equipoRojo),
    )!;
    await api('POST', `/partidos/${p.id}/iniciar`, {});
    const evento = () => ({
      tipo: 'GOL',
      equipoId: equipoRojo,
      jugadorId: jugadorRojo,
      minuto: 10,
      clientUuid: randomUUID(),
    });
    const a = await api('POST', `/partidos/${p.id}/eventos`, evento());
    expect(a.body.advertencia).toMatch(/suspendido/);
    await api('POST', `/partidos/${p.id}/eventos`, evento());
    const t = (await api('GET', `/tribunal?torneoId=${torneoId}`)).body;
    const noHab = t.expedientes.filter((e: { tipo: string }) => e.tipo === 'JUGADOR_NO_HABILITADO');
    expect(noHab).toHaveLength(1);
    expect(noHab[0]).toMatchObject({ estado: 'ABIERTO', jugador: 'J1 E1', sugeridos: 0 });
    const r = await api('POST', `/expedientes/${noHab[0].id}/resolver`, {
      partidos: 0,
      multa: 0,
      resolucion: 'Se le da el partido por perdido según reglamento.',
    });
    expect(r.body.veredicto).toBe('APLICADA');
  });

  it('abre un expediente a mano (incidente de la hinchada) y lo resuelve con multa, sin suspender partidos', async () => {
    const e = await api('POST', '/expedientes', {
      tipo: 'INCIDENTE_HINCHADA',
      torneoId,
      equipoId: equipos[1],
      motivo: 'Bengalas en la tribuna',
    });
    expect(e.status).toBe(201);
    const susp = await api('POST', `/expedientes/${e.body.id}/resolver`, {
      partidos: 2,
      resolucion: 'Una hinchada no se suspende.',
    });
    expect(susp.status).toBe(422);
    const r = await api('POST', `/expedientes/${e.body.id}/resolver`, {
      partidos: 0,
      multa: 8_000,
      resolucion: 'Multa por incidentes.',
    });
    expect(r.body).toMatchObject({ estado: 'RESUELTO', multa: 8_000 });
  });

  it('el historial resume tarjetas, partidos sancionados y multas por jugador y por equipo', async () => {
    const h = (await api('GET', `/tribunal/historial?torneoId=${torneoId}`)).body;
    expect(h.jugadores[0]).toMatchObject({
      nombre: 'J1 E1',
      rojas: 1,
      partidosSancionados: 3,
      multas: 5_000,
    });
    const e1 = h.equipos.find((e: { nombre: string }) => e.nombre === 'E1');
    expect(e1).toMatchObject({ rojas: 1, partidosSancionados: 3, multas: 5_000 });
    const e2 = h.equipos.find((e: { nombre: string }) => e.nombre === 'E2');
    expect(e2).toMatchObject({ multas: 8_000, expedientes: 1 });
  });
});
