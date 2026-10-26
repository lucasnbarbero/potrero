// Fallas del acta y la tabla: equipo ausente con tolerancia y resultado del reglamento (F11), abrir el acta no la toma
// (F13), la tabla solo con los equipos del fixture (F8) y el tribunal carga el informe del árbitro (F17).
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

async function consulta(sql: string, params: unknown[] = []) {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL_ADMIN });
  await db.connect();
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.end();
  }
}

beforeAll(async () => {
  const rows = await consulta(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
  );
  await consulta(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} CASCADE`);
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  await app.listen(0);
  base = (await app.getUrl()).replace('[::1]', 'localhost');
});

afterAll(async () => {
  await app?.close();
});

type P = { id: string; fecha: number; localId: string; visitanteId: string; estado: string };

describe('acta y tabla', () => {
  const api = cliente();
  let torneoId: string;
  let partidos: P[];
  const equipos: Record<string, string> = {};
  const dispA = 'dispositivo-A-1234';
  const dispB = 'dispositivo-B-5678';

  let cargoTarde = '';
  const inscribir = async (nombre: string, pagar = true) => {
    const e = await api('POST', '/equipos', { nombre });
    equipos[nombre] = e.body.id;
    for (let n = 1; n <= 2; n++)
      await api('POST', `/equipos/${e.body.id}/jugadores`, { nombre: `J${n}`, apellido: nombre, numero: n });
    const ins = await api('POST', `/torneos/${torneoId}/inscripciones`, { equipoId: e.body.id });
    if (pagar) await api('POST', `/cargos/${ins.body.cargo.id}/pagos`, { metodo: 'EFECTIVO', monto: 1000 });
    else cargoTarde = ins.body.cargo.id;
  };
  const tabla = async () =>
    (await api('GET', `/torneos/${torneoId}/estadisticas`)).body.tabla as {
      equipoId: string;
      pj: number;
      pts: number;
      gf: number;
    }[];

  it('prepara una liga con fixture y sin fixture la tabla muestra a los confirmados', async () => {
    await api('POST', '/auth/registro', {
      nombre: 'Organizadora',
      email: 'orga@test.com',
      password: 'clave-segura-1',
      organizacion: 'Liga Fallas',
    });
    const cancha = (await api('POST', '/canchas', { sede: 'Complejo', nombre: 'Cancha 1' })).body.id;
    torneoId = (
      await api('POST', '/torneos', {
        nombre: 'Liga',
        modalidad: 'F5',
        formato: 'LIGA',
        cupo: 6,
        inscripcion: 1000,
      })
    ).body.id;
    for (const n of ['Rojo', 'Azul', 'Verde', 'Negro']) await inscribir(n);
    expect((await tabla()).map((f) => f.equipoId).sort()).toEqual(Object.values(equipos).sort());
    // Se inscribe pero todavía no pagó: queda afuera del fixture.
    await inscribir('Tarde', false);
    const fixture = await api('POST', `/torneos/${torneoId}/fixture`, {
      primerDia: '2027-03-06',
      horarios: ['19:00', '20:00'],
      canchaIds: [cancha],
    });
    expect(fixture.status, JSON.stringify(fixture.body)).toBe(201);
    partidos = (await api('GET', `/torneos/${torneoId}/partidos`)).body;
    expect(partidos.length).toBeGreaterThan(0);
  });

  it('F8: un equipo confirmado tarde, sin partidos en el fixture, no aparece en la tabla', async () => {
    // Paga después de generado el fixture (como Sportivo Barrio en la demo): queda confirmado, sin partidos.
    expect(
      (await api('POST', `/cargos/${cargoTarde}/pagos`, { metodo: 'EFECTIVO', monto: 1000 })).status,
    ).toBe(201);
    const t = await tabla();
    expect(t).toHaveLength(4);
    expect(t.map((f) => f.equipoId)).not.toContain(equipos.Tarde);
  });

  it('F13: abrir el acta no la toma; el dueño es el primero que carga algo', async () => {
    const p = partidos.find((x) => x.fecha === 2)!;
    expect((await api('GET', `/partidos/${p.id}`)).body.dueno).toBeNull();
    // Un cliente de la API (sin dispositivo) inicia: el acta sigue sin dueño.
    await api('POST', `/partidos/${p.id}/iniciar`, {});
    expect((await api('GET', `/partidos/${p.id}`)).body.dueno).toBeNull();
    const acta = (await api('GET', `/partidos/${p.id}`)).body;
    const gol = await api('POST', `/partidos/${p.id}/eventos`, {
      tipo: 'GOL',
      equipoId: acta.local.id,
      jugadorId: acta.local.jugadores[0].id,
      minuto: 3,
      clientUuid: randomUUID(),
      dispositivoId: dispB,
    });
    expect(gol.status).toBe(201);
    expect((await api('GET', `/partidos/${p.id}`)).body.dueno).toMatchObject({ dispositivoId: dispB });
    // Desde ahí, otro dispositivo ya no puede escribir.
    const otro = await api('POST', `/partidos/${p.id}/eventos`, {
      tipo: 'GOL',
      equipoId: acta.local.id,
      jugadorId: acta.local.jugadores[0].id,
      clientUuid: randomUUID(),
      dispositivoId: dispA,
    });
    expect(otro.status).toBe(409);
  });

  it('F11: el equipo ausente se marca recién cuando vence la tolerancia del reglamento del torneo', async () => {
    const p = partidos.find((x) => x.fecha === 1)!;
    const temprano = await api('POST', `/partidos/${p.id}/wo`, { ganadorId: p.localId });
    expect(temprano.status).toBe(422);
    expect(temprano.body.mensaje).toMatch(/Todavía no pasó la tolerancia de 15 minutos/);

    // Pasaron 10 minutos: con la tolerancia por defecto (15) todavía no; con la del torneo en 5, sí.
    await consulta(`UPDATE partido SET inicio = now() - interval '10 minutes' WHERE id = $1`, [p.id]);
    expect((await api('POST', `/partidos/${p.id}/wo`, { ganadorId: p.localId })).status).toBe(422);
    await consulta(
      `UPDATE reglamento SET tolerancia_wo_minutos = 5 WHERE id = (SELECT reglamento_id FROM torneo WHERE id = $1)`,
      [torneoId],
    );
    expect((await api('GET', `/partidos/${p.id}`)).body.toleranciaWOMinutos).toBe(5);

    // El dueño del acta también se controla en esta acción.
    await api('POST', `/partidos/${p.id}/tomar`, { dispositivoId: dispA });
    const ajeno = await api('POST', `/partidos/${p.id}/wo`, { ganadorId: p.localId, dispositivoId: dispB });
    expect(ajeno.status).toBe(409);

    const ok = await api('POST', `/partidos/${p.id}/wo`, { ganadorId: p.localId, dispositivoId: dispA });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ estado: 'WO', golesLocal: 3, golesVisitante: 0 });

    // El acta muestra el resultado del reglamento, igual que la tabla.
    const acta = (await api('GET', `/partidos/${p.id}`)).body;
    expect(acta).toMatchObject({
      estado: 'WO',
      ganadorWOId: p.localId,
      marcador: { local: 3, visitante: 0 },
    });
    const fila = (await tabla()).find((f) => f.equipoId === p.localId)!;
    expect(fila).toMatchObject({ pj: 1, pts: 3, gf: 3 });
    // Y el listado de partidos (sitio público, tarjeta) tiene el mismo resultado guardado.
    const lista = (await api('GET', `/torneos/${torneoId}/partidos`)).body as (P & {
      golesLocal: number;
      golesVisitante: number;
    })[];
    expect(lista.find((x) => x.id === p.id)).toMatchObject({ golesLocal: 3, golesVisitante: 0 });
  });

  it('F11: sin horario o con el partido empezado no se puede marcar un equipo ausente', async () => {
    const enJuego = partidos.find((x) => x.fecha === 2)!;
    const r = await api('POST', `/partidos/${enJuego.id}/wo`, { ganadorId: enJuego.localId });
    expect(r.status).toBe(409);
    const sinHora = partidos.find((x) => x.fecha === 3)!;
    await consulta(`UPDATE partido SET inicio = NULL WHERE id = $1`, [sinHora.id]);
    const s = await api('POST', `/partidos/${sinHora.id}/wo`, { ganadorId: sinHora.localId });
    expect(s.status).toBe(422);
    expect(s.body.mensaje).toMatch(/no tiene horario/);
  });

  it('F17: el tribunal carga el informe del árbitro sin tener permiso sobre el acta', async () => {
    const r = await api('POST', '/usuarios/invitaciones', {
      email: 'tribu@test.com',
      rol: 'TRIBUNAL',
      nombre: 'Tribu',
    });
    expect(r.status).toBe(201);
    const token = (r.body.link as string).split('/invitacion/')[1]!;
    const tribunal = cliente();
    const ok = await tribunal('POST', `/invitaciones/${token}/aceptar`, {
      nombre: 'Persona Tribunal',
      password: 'clave-segura-9',
    });
    expect(ok.status).toBe(200);
    const exp = await api('POST', '/expedientes', {
      tipo: 'AGRESION',
      torneoId,
      equipoId: equipos.Rojo,
      motivo: 'Empujón al árbitro',
    });
    expect(exp.status).toBe(201);
    const informe = await tribunal('POST', `/expedientes/${exp.body.id}/informe`, {
      informeArbitro: 'El jugador empujó al árbitro al terminar el partido.',
    });
    expect(informe.status).toBe(201);
    expect(informe.body.informeArbitro).toMatch(/empujó/);
    // El acta sigue siendo del árbitro y la organización: el tribunal no la puede tocar.
    const p = partidos.find((x) => x.fecha === 3)!;
    expect((await tribunal('POST', `/partidos/${p.id}/iniciar`, {})).status).toBe(403);
  });
});
