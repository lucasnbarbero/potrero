// Contingencias (E17) de punta a punta. Prueba de aceptación (E17-08): lluvia simulada con 9 partidos de 2 torneos
// movidos, aviso a los capitanes y confirmaciones.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error: módulo compilado (ver vitest.config.ts)
import { AppModule } from '../dist/app.module.js';
// @ts-expect-error: módulo compilado
import { ContingenciasService } from '../dist/contingencias/contingencias.js';

let app: INestApplication;
let base: string;
let admin: pg.Client;
let servicio: {
  alertaDeClima(c: { usuarioId: string; organizacionId: string; rol: string }, ahora: Date): Promise<unknown>;
};

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
  servicio = app.get(ContingenciasService);
}, 60_000);

afterAll(async () => {
  await app?.close();
  await admin?.end();
});

const consulta = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;

describe('contingencias: lluvia sobre 9 partidos de 2 torneos', () => {
  const api = cliente();
  const otra = cliente();
  const canchas: string[] = [];
  const techadas: string[] = [];
  let torneoA: string;
  let torneoB: string;
  let sabado: { id: string; localId: string; visitanteId: string }[];

  it('prepara dos torneos con fixture el mismo sábado (5 + 4 partidos)', async () => {
    await api('POST', '/auth/registro', {
      nombre: 'Org',
      email: 'org@cont.test',
      password: 'clave-segura-1',
      organizacion: 'Liga Lluvia',
    });
    for (const n of ['1', '2', '3', '4', '5'])
      canchas.push((await api('POST', '/canchas', { sede: 'Complejo', nombre: `Cancha ${n}` })).body.id);
    for (const n of ['1', '2'])
      techadas.push((await api('POST', '/canchas', { sede: 'Techado', nombre: `Techada ${n}` })).body.id);

    const crear = async (nombre: string, cantidad: number, prefijo: string, canchaIds: string[]) => {
      const t = (
        await api('POST', '/torneos', { nombre, modalidad: 'F7', formato: 'LIGA', cupo: 12, inscripcion: 0 })
      ).body.id;
      for (let i = 1; i <= cantidad; i++) {
        // Capitanes con distintos canales: con WhatsApp, solo con email y sin ningún dato.
        const contacto =
          i % 3 === 1
            ? {
                capitanEmail: `${prefijo}${i}@x.com`,
                capitanTelefono: `35640000${i}`,
                capitanOptInWhatsapp: true,
              }
            : i % 3 === 2
              ? { capitanEmail: `${prefijo}${i}@x.com` }
              : {};
        const e = await api('POST', '/equipos', {
          nombre: `${prefijo}${i}`,
          capitanNombre: `Cap ${prefijo}${i}`,
          ...contacto,
        });
        for (let j = 1; j <= 3; j++)
          await api('POST', `/equipos/${e.body.id}/jugadores`, {
            nombre: `J${j}`,
            apellido: `${prefijo}${i}`,
            numero: j,
          });
        await api('POST', `/torneos/${t}/inscripciones`, { equipoId: e.body.id });
      }
      const fx = await api('POST', `/torneos/${t}/fixture`, {
        primerDia: '2027-03-06',
        horarios: ['14:00', '15:00'],
        canchaIds,
      });
      expect(fx.status).toBe(201);
      return t as string;
    };
    torneoA = await crear('Apertura', 10, 'A', canchas.slice(0, 3));
    torneoB = await crear('Senior', 8, 'B', canchas.slice(3, 5));

    const todos = [
      ...(await api('GET', `/torneos/${torneoA}/partidos`)).body,
      ...(await api('GET', `/torneos/${torneoB}/partidos`)).body,
    ].filter((p: { fecha: number }) => p.fecha === 1);
    sabado = todos;
    expect(sabado).toHaveLength(9);
  });

  it('la alerta de clima cuenta partidos, torneos y jugadores del día en riesgo', async () => {
    const yo = (await api('GET', '/auth/yo')).body;
    const ctx = { usuarioId: yo.usuario.id, organizacionId: yo.organizacion.id, rol: 'DUENO' };
    const alerta = (await servicio.alertaDeClima(ctx, new Date('2027-03-04T12:00:00Z'))) as Record<
      string,
      unknown
    >;
    expect(alerta).toMatchObject({
      dia: '2027-03-06',
      titulo: 'Lluvia fuerte',
      probabilidad: 85,
      partidos: 9,
      torneos: 2,
      jugadores: 54, // 18 equipos × 3
      desdeHora: 13,
      hastaHora: 16,
    });
    // Sin partidos a la vista en los próximos 7 días, no hay alerta.
    expect(await servicio.alertaDeClima(ctx, new Date('2026-01-01T12:00:00Z'))).toBeNull();
    // Por la API usa la fecha real: los partidos están lejos y no hay nada que mostrar.
    expect((await api('GET', '/contingencias/clima')).body).toBeNull();
  });

  const lluvia = {
    motivo: 'Por pronóstico de lluvia',
    alcance: { tipo: 'DIA', dia: '2027-03-06' },
    accion: { tipo: 'MOVER', dias: 1 },
    canal: 'WHATSAPP',
  };

  it('la propuesta de mover al domingo no cambia nada y muestra el efecto completo', async () => {
    const r = await api('POST', '/contingencias/propuesta', lluvia);
    expect(r.status).toBe(201);
    expect(r.body.resumen).toEqual({ partidos: 9, mueve: 9, equipos: 18, jugadores: 54, canchas: 5 });
    expect(r.body.conflictos).toEqual([]);
    expect(r.body.sinResolver).toEqual([]);
    expect(r.body.movimientos[0]).toMatchObject({
      de: { cancha: 'Complejo · Cancha 1' },
      a: { cancha: 'Complejo · Cancha 1' },
    });
    // 18 capitanes: 7 por WhatsApp, 6 por email y 5 sin ningún dato.
    expect(r.body.aviso).toMatchObject({ mensajes: 13, omitidos: 5 });
    expect(r.body.aviso.porCanal).toEqual({ EMAIL: 6, WHATSAPP: 7, PUSH: 0 });
    expect(r.body.aviso.costoUsd).toBe(0.182); // 7 WhatsApp de utilidad
    expect(r.body.aviso.ejemplo).toMatch(
      /Liga Lluvia · Por pronóstico de lluvia\. Tu partido ahora es dom 7\/3/,
    );
    // No se movió nada.
    const [{ n }] = await consulta(
      "SELECT count(*)::int AS n FROM partido WHERE inicio::date = '2027-03-06'",
    );
    expect(n).toBeGreaterThanOrEqual(9);
    expect(await consulta('SELECT 1 FROM contingencia')).toHaveLength(0);
  });

  it('cambiar a canchas techadas: entran solo los que caben y el resto queda sin resolver', async () => {
    const r = await api('POST', '/contingencias/propuesta', {
      ...lluvia,
      accion: { tipo: 'CAMBIAR_CANCHA', canchaIds: techadas },
    });
    // Hay 2 techadas y 2 horarios (14 y 15): entran 4 de los 9.
    expect(r.body.resumen.mueve).toBe(4);
    expect(r.body.sinResolver).toHaveLength(5);
    expect(r.body.sinResolver[0].motivo).toMatch(/No hay una cancha de destino libre/);
    expect(r.body.movimientos.every((m: { a: { cancha: string } }) => m.a.cancha.startsWith('Techado'))).toBe(
      true,
    );
  });

  it('una propuesta con conflictos se muestra y no se aplica hasta que se confirma', async () => {
    // Una semana después juegan los mismos equipos en las mismas canchas: choques de cancha y de equipo.
    const semana = { ...lluvia, accion: { tipo: 'MOVER', dias: 7 } };
    const p = await api('POST', '/contingencias/propuesta', semana);
    expect(p.body.conflictos.length).toBeGreaterThan(0);
    expect(p.body.conflictos.map((c: { tipo: string }) => c.tipo)).toContain('EQUIPO_DOBLE');
    expect(p.body.conflictos[0]).toMatchObject({
      partido: expect.stringContaining(' vs '),
      con: expect.stringContaining(' vs '),
    });
    const sinAceptar = await api('POST', '/contingencias/aplicar', semana);
    expect(sinAceptar.status).toBe(409);
    expect(sinAceptar.body.mensaje).toMatch(/conflicto/);
    expect(await consulta('SELECT 1 FROM contingencia')).toHaveLength(0);
  });

  it('un alcance sin partidos y una acción inválida se rechazan', async () => {
    const vacio = await api('POST', '/contingencias/propuesta', {
      ...lluvia,
      alcance: { tipo: 'DIA', dia: '2030-01-01' },
    });
    expect(vacio.status).toBe(422);
    expect(vacio.body.mensaje).toMatch(/No hay partidos programados/);
    const cero = await api('POST', '/contingencias/propuesta', {
      ...lluvia,
      accion: { tipo: 'MOVER', dias: 0 },
    });
    expect(cero.status).toBe(400);
  });

  let contingenciaId: string;

  it('aplica: mueve los 9 partidos al domingo, registra la contingencia y avisa a los capitanes', async () => {
    const r = await api('POST', '/contingencias/aplicar', lluvia);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ movidos: 9, avisados: 13, sinAviso: 5, sinResolver: [] });
    contingenciaId = r.body.contingenciaId;

    // Los partidos quedaron el domingo, mismo horario y cancha, y siguen programados.
    const movidos = await consulta(
      `SELECT to_char((inicio AT TIME ZONE 'UTC') AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD HH24:MI') AS cuando, estado
         FROM partido WHERE id = ANY($1) ORDER BY inicio`,
      [sabado.map((p) => p.id)],
    );
    expect(movidos.every((m) => m.estado === 'PROGRAMADO' && m.cuando.startsWith('2027-03-07'))).toBe(true);
    expect(movidos.map((m) => m.cuando.slice(11))).toEqual([
      '14:00',
      '14:00',
      '14:00',
      '14:00',
      '14:00',
      '15:00',
      '15:00',
      '15:00',
      '15:00',
    ]);

    const msgs = await consulta('SELECT * FROM mensaje WHERE contingencia_id = $1', [contingenciaId]);
    expect(msgs).toHaveLength(13);
    expect(msgs.every((m) => m.token && m.estado === 'ENTREGADO' && m.plantilla === 'CONTINGENCIA')).toBe(
      true,
    );
    expect(msgs[0].cuerpo).toMatch(/dom 7\/3 · 1[45]:00 en Complejo/);
    expect(msgs[0].cuerpo).toContain('/c/');
    expect(await consulta("SELECT 1 FROM auditoria WHERE accion = 'contingencia.aplicar'")).toHaveLength(1);
  });

  it('no se puede aplicar dos veces la misma reprogramación', async () => {
    const otraVez = await api('POST', '/contingencias/aplicar', lluvia);
    expect(otraVez.status).toBe(422); // ya no quedan partidos ese sábado
  });

  it('los capitanes confirman o dicen que no pueden con su link, sin sesión', async () => {
    const msgs = await consulta(
      'SELECT token FROM mensaje WHERE contingencia_id = $1 ORDER BY destinatario',
      [contingenciaId],
    );
    const publico = cliente();
    const v = await publico('GET', `/confirmaciones/${msgs[0].token}`);
    expect(v.body).toMatchObject({ liga: 'Liga Lluvia', respuesta: null });
    expect(v.body.mensaje).toMatch(/Tu partido ahora es dom 7\/3/);
    // 7 confirman y 2 no pueden; el resto no responde.
    for (const m of msgs.slice(0, 7))
      await publico('POST', `/confirmaciones/${m.token}`, { respuesta: 'CONFIRMO' });
    for (const m of msgs.slice(7, 9))
      await publico('POST', `/confirmaciones/${m.token}`, { respuesta: 'NO_PUEDO' });
    expect((await publico('POST', `/confirmaciones/${msgs[0].token}`, { respuesta: 'TAL_VEZ' })).status).toBe(
      400,
    );
    expect((await publico('GET', '/confirmaciones/token-inexistente')).status).toBe(404);
  });

  it('el organizador ve quién confirmó, quién no puede y quién no respondió', async () => {
    const lista = await api('GET', '/contingencias');
    expect(lista.body[0]).toMatchObject({
      id: contingenciaId,
      partidos: 9,
      confirmados: 7,
      noPuedo: 2,
      sinResponder: 4,
    });
    const d = await api('GET', `/contingencias/${contingenciaId}`);
    expect(d.body.resumen).toEqual({ confirmados: 7, noPuedo: 2, sinResponder: 4 });
    expect(d.body.movimientos).toHaveLength(9);
    expect(
      d.body.respuestas.filter((r: { respuesta: string | null }) => r.respuesta === 'NO_PUEDO'),
    ).toHaveLength(2);
    expect(d.body.respuestas.filter((r: { estado: string }) => r.estado === 'LEIDO')).toHaveLength(9); // responder cuenta como leer
  });

  it('los "No puedo" aparecen como alerta en el panel del organizador', async () => {
    const r = await api('GET', '/panel/resumen');
    const alerta = r.body.alertas.find((a: { tipo: string }) => a.tipo === 'NO_PUEDO');
    expect(alerta.mensaje).toMatch(/2 equipo\(s\) respondieron "No puedo"/);
    expect(alerta.href).toBe(`/panel/reprogramaciones/${contingenciaId}`);
  });

  it('otra liga no ve esta contingencia', async () => {
    await otra('POST', '/auth/registro', {
      nombre: 'Otra',
      email: 'otra@cont.test',
      password: 'clave-segura-1',
      organizacion: 'Otra Liga',
    });
    expect((await otra('GET', `/contingencias/${contingenciaId}`)).status).toBe(404);
    expect((await otra('GET', '/contingencias')).body).toEqual([]);
  });
});
