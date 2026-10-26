// Fixture a mano (E09-07): mover un partido y ordenar los horarios de una fecha intercambiando partidos, con cada
// conflicto explicado, sin bloquear, auditado y con aviso opcional a los capitanes.
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

const consulta = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;

interface PartidoGrilla {
  id: string;
  fecha: number;
  inicio: string;
  canchaId: string;
  local: string;
  visitante: string;
  arbitro: string | null;
  noMovible: string | null;
}

describe('fixture a mano: mover e intercambiar partidos', () => {
  const api = cliente();
  const otra = cliente();
  const canchas: Record<string, string> = {};
  let torneoId: string;
  let a: PartidoGrilla; // fecha 1, 20:00, cancha 1
  let b: PartidoGrilla; // fecha 1, 21:00, cancha 1
  let fecha2: PartidoGrilla[];
  let arbitroId: string;
  const SAB = '2027-03-06';
  const SAB2 = '2027-03-13';

  const grilla = async () =>
    (await api('GET', `/torneos/${torneoId}/programacion`)).body as {
      partidos: PartidoGrilla[];
      canchas: { id: string; nombre: string; bloqueada: boolean }[];
    };
  const mover = (id: string, cambio: unknown, extra: Record<string, unknown> = {}) =>
    api('POST', `/partidos/${id}/programacion/propuesta`, { cambio, ...extra });
  const aplicar = (id: string, cambio: unknown, extra: Record<string, unknown> = {}) =>
    api('POST', `/partidos/${id}/programacion`, { cambio, ...extra });

  it('prepara una liga de 4 equipos con una fecha a las 20 y a las 21 en la misma cancha', async () => {
    await api('POST', '/auth/registro', {
      nombre: 'Org',
      email: 'fixture@test.com',
      password: 'clave-segura-1',
      organizacion: 'Liga Fixture',
    });
    for (const n of ['1', '2', '3'])
      canchas[n] = (await api('POST', '/canchas', { sede: 'Complejo', nombre: `Cancha ${n}` })).body.id;
    await api('PATCH', `/canchas/${canchas['3']}`, { bloqueada: true, motivoBloqueo: 'Mantenimiento' });
    torneoId = (
      await api('POST', '/torneos', {
        nombre: 'Apertura',
        modalidad: 'F5',
        formato: 'LIGA',
        cupo: 4,
        inscripcion: 0,
      })
    ).body.id;
    for (let i = 1; i <= 4; i++) {
      const e = await api('POST', '/equipos', {
        nombre: `E${i}`,
        capitanNombre: `Cap ${i}`,
        capitanEmail: `cap${i}@x.com`,
      });
      await api('POST', `/torneos/${torneoId}/inscripciones`, { equipoId: e.body.id });
    }
    const fx = await api('POST', `/torneos/${torneoId}/fixture`, {
      primerDia: SAB,
      horarios: ['20:00', '21:00'],
      canchaIds: [canchas['1']],
    });
    expect(fx.status).toBe(201);
    const g = await grilla();
    const f1 = g.partidos.filter((p) => p.fecha === 1);
    expect(f1).toHaveLength(2);
    [a, b] = f1 as [PartidoGrilla, PartidoGrilla];
    fecha2 = g.partidos.filter((p) => p.fecha === 2);
    expect(new Date(a.inicio).toISOString()).toBe('2027-03-06T23:00:00.000Z'); // 20:00 en Argentina
    expect(a.noMovible).toBeNull();
    expect(g.canchas.find((x) => x.id === canchas['3'])).toMatchObject({ bloqueada: true });
  });

  it('a una franja libre: propuesta sin conflictos y sin tocar nada', async () => {
    const r = await mover(a.id, { tipo: 'MOVER', dia: SAB, hora: '20:00', canchaId: canchas['2'] });
    expect(r.status).toBe(201);
    expect(r.body.conflictos).toEqual([]);
    expect(r.body.movimientos).toEqual([
      expect.objectContaining({
        partidoId: a.id,
        de: { inicio: '2027-03-06T23:00:00.000Z', cancha: 'Complejo · Cancha 1' },
        a: { inicio: '2027-03-06T23:00:00.000Z', cancha: 'Complejo · Cancha 2' },
      }),
    ]);
    expect(r.body.aviso.mensajes).toBe(2); // los dos capitanes, por email
    const [fila] = await consulta('SELECT cancha_id FROM partido WHERE id = $1', [a.id]);
    expect(fila.cancha_id).toBe(canchas['1']);
  });

  it('a una cancha ocupada: explica el conflicto y no aplica sin confirmar', async () => {
    const cambio = { tipo: 'MOVER', dia: SAB, hora: '21:00', canchaId: canchas['1'] };
    const r = await mover(a.id, cambio);
    expect(r.body.conflictos).toEqual([
      {
        tipo: 'CANCHA_OCUPADA',
        mensaje: 'La cancha ya está ocupada a esa hora.',
        partido: `${a.local} vs ${a.visitante}`,
        con: `${b.local} vs ${b.visitante}`,
      },
    ]);
    const sinConfirmar = await aplicar(a.id, cambio);
    expect(sinConfirmar.status).toBe(409);
    expect(sinConfirmar.body.mensaje).toContain('1 conflicto');
  });

  it('a otro día donde los equipos ya juegan: equipo con dos partidos el mismo día y a la misma hora', async () => {
    const r = await mover(a.id, { tipo: 'MOVER', dia: SAB2, hora: '20:00', canchaId: canchas['2'] });
    const tipos = r.body.conflictos.map((x: { tipo: string }) => x.tipo);
    expect(tipos).toContain('EQUIPO_DOBLE');
    expect(r.body.conflictos.map((x: { mensaje: string }) => x.mensaje)).toContain(
      'Un equipo juega dos partidos a la misma hora.',
    );
  });

  it('a una cancha bloqueada: lo advierte con el motivo', async () => {
    const r = await mover(a.id, { tipo: 'MOVER', dia: SAB, hora: '22:00', canchaId: canchas['3'] });
    expect(r.body.conflictos).toEqual([
      expect.objectContaining({
        tipo: 'CANCHA_BLOQUEADA',
        mensaje: 'La cancha Cancha 3 está bloqueada (Mantenimiento).',
      }),
    ]);
  });

  it('con árbitro designado: choque de franja y fuera de su disponibilidad, sin desasignarlo', async () => {
    arbitroId = (
      await api('POST', '/arbitros', {
        nombre: 'Marcos',
        apellido: 'Costa',
        disponibilidad: [{ dia: 6, desde: '14:00', hasta: '22:00' }],
      })
    ).body.id;
    expect((await api('POST', `/partidos/${b.id}/arbitro`, { arbitroId })).status).toBe(201);
    expect((await api('POST', `/partidos/${fecha2[0]!.id}/arbitro`, { arbitroId })).status).toBe(201);

    // b a la franja de un partido de la fecha 2 que dirige el mismo árbitro, en otra cancha.
    const choque = await mover(b.id, {
      tipo: 'MOVER',
      dia: SAB2,
      hora: '20:00',
      canchaId: canchas['2'],
    });
    expect(choque.body.conflictos).toContainEqual(
      expect.objectContaining({
        tipo: 'ARBITRO_OCUPADO',
        mensaje: 'Marcos Costa ya dirige otro partido a esa hora. Cambiá la designación o el horario.',
        con: `${fecha2[0]!.local} vs ${fecha2[0]!.visitante}`,
      }),
    );
    const tarde = await mover(b.id, { tipo: 'MOVER', dia: SAB, hora: '23:00', canchaId: canchas['1'] });
    expect(tarde.body.conflictos).toEqual([
      expect.objectContaining({ tipo: 'ARBITRO_NO_DISPONIBLE', con: null }),
    ]);

    // Confirmando, se mueve igual y el árbitro sigue designado.
    const ok = await aplicar(
      b.id,
      { tipo: 'MOVER', dia: SAB, hora: '23:00', canchaId: canchas['1'] },
      { aceptarConflictos: true },
    );
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ movidos: 1, conflictos: 1, contingenciaId: null, avisados: 0 });
    // (Se lee por la API: la columna no tiene zona y el driver de pg la leería en la hora local de la máquina.)
    const movido = (await grilla()).partidos.find((p) => p.id === b.id)!;
    expect(new Date(movido.inicio).toISOString()).toBe('2027-03-07T02:00:00.000Z'); // 23:00
    expect(movido.arbitro).toBe('Marcos Costa');
    const [audit] = await consulta("SELECT antes, despues FROM auditoria WHERE accion = 'partido.mover'");
    expect(audit.antes).toMatchObject({ inicio: '2027-03-07T00:00:00.000Z', canchaId: canchas['1'] });
    expect(audit.despues.conflictosAceptados).toHaveLength(1);

    // Vuelve a las 21 (sin conflictos) para seguir.
    expect(
      (await aplicar(b.id, { tipo: 'MOVER', dia: SAB, hora: '21:00', canchaId: canchas['1'] })).status,
    ).toBe(201);
  });

  it('intercambiar "este a las 20 y aquel a las 21", avisando a los capitanes', async () => {
    const propuesta = await mover(a.id, { tipo: 'INTERCAMBIAR', conPartidoId: b.id });
    expect(propuesta.body.conflictos).toEqual([]);
    expect(propuesta.body.movimientos).toHaveLength(2);
    expect(propuesta.body.aviso.mensajes).toBe(4);

    const r = await aplicar(
      a.id,
      { tipo: 'INTERCAMBIAR', conPartidoId: b.id },
      { avisar: true, canal: 'EMAIL', motivo: 'Orden de la fecha' },
    );
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ movidos: 2, avisados: 4, sinAviso: 0 });
    const g = await grilla();
    const nuevoA = g.partidos.find((p) => p.id === a.id)!;
    const nuevoB = g.partidos.find((p) => p.id === b.id)!;
    expect(new Date(nuevoA.inicio).toISOString()).toBe('2027-03-07T00:00:00.000Z'); // 21:00
    expect(new Date(nuevoB.inicio).toISOString()).toBe('2027-03-06T23:00:00.000Z'); // 20:00
    expect(nuevoB.arbitro).toBe('Marcos Costa');

    // Queda como una reprogramación más, con los mensajes de "Confirmo" / "No puedo".
    const lista = (await api('GET', '/contingencias')).body;
    expect(lista).toEqual([
      expect.objectContaining({ motivo: 'Orden de la fecha', accion: 'INTERCAMBIAR', partidos: 2 }),
    ]);
    const mensajes = await consulta(
      "SELECT cuerpo, canal FROM mensaje WHERE plantilla = 'CONTINGENCIA' ORDER BY destinatario",
    );
    expect(mensajes).toHaveLength(4);
    expect(mensajes[0].canal).toBe('EMAIL');
    expect(mensajes[0].cuerpo).toContain('Orden de la fecha');
    expect(await consulta("SELECT 1 FROM auditoria WHERE accion = 'partido.intercambiar'")).toHaveLength(2);
  });

  it('no deja intercambiar partidos de fechas distintas ni mover uno con el acta en curso o cerrado', async () => {
    const otraFecha = await mover(a.id, { tipo: 'INTERCAMBIAR', conPartidoId: fecha2[1]!.id });
    expect(otraFecha.status).toBe(422);
    expect(otraFecha.body.mensaje).toBe('Solo se pueden intercambiar partidos de la misma fecha del torneo.');
    const mismoLugar = await mover(a.id, {
      tipo: 'MOVER',
      dia: SAB,
      hora: '21:00',
      canchaId: canchas['1'],
    });
    expect(mismoLugar.status).toBe(422);

    expect((await api('POST', `/partidos/${fecha2[1]!.id}/iniciar`)).status).toBe(201);
    const enJuego = await mover(fecha2[1]!.id, {
      tipo: 'MOVER',
      dia: SAB2,
      hora: '22:00',
      canchaId: canchas['2'],
    });
    expect(enJuego.status).toBe(409);
    expect(enJuego.body.mensaje).toContain('acta en curso');
    const conEnJuego = await mover(fecha2[0]!.id, { tipo: 'INTERCAMBIAR', conPartidoId: fecha2[1]!.id });
    expect(conEnJuego.status).toBe(409);
    expect((await grilla()).partidos.find((p) => p.id === fecha2[1]!.id)!.noMovible).toBe(
      'El partido tiene el acta en curso.',
    );

    await admin.query("UPDATE partido SET estado = 'FINALIZADO' WHERE id = $1", [fecha2[1]!.id]);
    const cerrado = await aplicar(
      fecha2[1]!.id,
      { tipo: 'MOVER', dia: SAB2, hora: '22:00', canchaId: canchas['2'] },
      { aceptarConflictos: true },
    );
    expect(cerrado.status).toBe(409);
    expect(cerrado.body.mensaje).toContain('ya se jugó');
  });

  it('valida los datos, los permisos y que otra organización no ve nada', async () => {
    expect(
      (await mover(a.id, { tipo: 'MOVER', dia: '6/3', hora: '20:00', canchaId: canchas['1'] })).status,
    ).toBe(400);
    expect(
      (await mover(a.id, { tipo: 'MOVER', dia: SAB, hora: '25:00', canchaId: canchas['1'] })).status,
    ).toBe(400);
    expect((await mover(a.id, { tipo: 'OTRO' })).status).toBe(400);
    expect((await mover('no-existe', { tipo: 'INTERCAMBIAR', conPartidoId: b.id })).status).toBe(404);
    expect(
      (await mover(a.id, { tipo: 'MOVER', dia: SAB, hora: '22:00', canchaId: 'no-existe' })).status,
    ).toBe(404);

    const sinSesion = cliente();
    expect((await sinSesion('GET', `/torneos/${torneoId}/programacion`)).status).toBe(401);

    await otra('POST', '/auth/registro', {
      nombre: 'Otra',
      email: 'otra-fixture@test.com',
      password: 'clave-segura-1',
      organizacion: 'Otra Liga',
    });
    expect((await otra('GET', `/torneos/${torneoId}/programacion`)).status).toBe(404);
    expect(
      (
        await otra('POST', `/partidos/${a.id}/programacion/propuesta`, {
          cambio: { tipo: 'INTERCAMBIAR', conPartidoId: b.id },
        })
      ).status,
    ).toBe(404);
  });
});
