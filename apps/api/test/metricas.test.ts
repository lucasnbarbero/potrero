// Métricas (E24) de punta a punta: retención entre torneos, cobranza por medio, canchas, horarios, permisos y aislamiento.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error: módulo compilado (ver vitest.config.ts)
import { AppModule } from '../dist/app.module.js';
// @ts-expect-error: módulo compilado
import { firmar } from '../dist/cobros/cobros.js';

let app: INestApplication;
let base: string;
let admin: pg.Client;

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

describe('métricas de la organización', () => {
  const api = cliente();
  const otra = cliente();
  const publico = cliente();
  const equipos: Record<string, string> = {};
  let anteriorId: string;
  let actualId: string;
  let canchaId: string;

  const torneo = async (nombre: string) =>
    (await api('POST', '/torneos', { nombre, modalidad: 'F5', formato: 'LIGA', cupo: 8, inscripcion: 10_000 })).body
      .id as string;

  it('prepara dos torneos: el anterior terminado y el actual con equipos que repiten', async () => {
    await api('POST', '/auth/registro', {
      nombre: 'Mora',
      email: 'metricas@test.com',
      password: 'clave-segura-1',
      organizacion: 'Liga Métricas',
    });
    await otra('POST', '/auth/registro', {
      nombre: 'Nico',
      email: 'metricas-otra@test.com',
      password: 'clave-segura-2',
      organizacion: 'Liga Ajena',
    });
    canchaId = (await api('POST', '/canchas', { sede: 'Club', nombre: 'Cancha A' })).body.id;
    for (const n of ['A', 'B', 'C', 'D', 'E']) equipos[n] = (await api('POST', '/equipos', { nombre: `Equipo ${n}` })).body.id;

    // Anterior: A, B, C y D pagan (dos en efectivo, una transferencia y una online) y juegan un sábado a las 15.
    anteriorId = await torneo('Anterior');
    const cargos: string[] = [];
    for (const n of ['A', 'B', 'C', 'D'])
      cargos.push((await api('POST', `/torneos/${anteriorId}/inscripciones`, { equipoId: equipos[n] })).body.cargo.id);
    await api('POST', `/cargos/${cargos[0]}/pagos`, { metodo: 'EFECTIVO', monto: 10_000 });
    await api('POST', `/cargos/${cargos[1]}/pagos`, { metodo: 'EFECTIVO', monto: 10_000 });
    await api('POST', `/cargos/${cargos[2]}/pagos`, { metodo: 'TRANSFERENCIA', monto: 10_000 });
    const link = await api('POST', `/cargos/${cargos[3]}/link`);
    const n = { preferenciaId: link.body.preferenciaId, pasarelaPagoId: 'PAGO-METRICAS-1', estado: 'aprobado' };
    await publico('POST', '/webhooks/pagos', n, { 'x-firma': firmar(JSON.stringify(n)) });
    const fx = await api('POST', `/torneos/${anteriorId}/fixture`, {
      primerDia: '2025-08-02',
      diasEntreFechas: 7,
      horarios: ['15:00', '16:00'],
      canchaIds: [canchaId],
    });
    expect(fx.status).toBe(201);
    // Se juega todo (se marca directo en la base: el acta tiene sus propios tests) y el torneo termina.
    await admin.query(`UPDATE partido SET estado = 'FINALIZADO', goles_local = 1, goles_visitante = 0 WHERE torneo_id = $1`, [
      anteriorId,
    ]);
    await admin.query(`UPDATE torneo SET estado = 'FINALIZADO', creado_en = '2025-07-01' WHERE id = $1`, [anteriorId]);

    // Actual (en inscripción): repiten A, B y C; D se fue; E es nuevo. A paga, el resto debe.
    actualId = await torneo('Actual');
    const actuales: string[] = [];
    for (const n of ['A', 'B', 'C', 'E'])
      actuales.push((await api('POST', `/torneos/${actualId}/inscripciones`, { equipoId: equipos[n] })).body.cargo.id);
    await api('POST', `/cargos/${actuales[0]}/pagos`, { metodo: 'EFECTIVO', monto: 10_000 });
  });

  it('exige sesión y valida el período', async () => {
    expect((await publico('GET', '/metricas')).status).toBe(401);
    const r = await api('GET', '/metricas?periodo=SIEMPRE');
    expect(r.status).toBe(400);
    expect(r.body.mensaje).toMatch(/período/);
    expect((await api('GET', '/metricas?torneoId=no-existe')).status).toBe(404);
  });

  it('histórico: retención, cobranza con la mezcla de medios, canchas y horarios', async () => {
    const r = await api('GET', '/metricas?periodo=HISTORICO');
    expect(r.status).toBe(200);
    const m = r.body;
    expect(m.torneos.map((t: { nombre: string }) => t.nombre)).toEqual(['Anterior', 'Actual']);

    // Retención: 3 de los 4 del torneo anterior se reinscribieron.
    expect(m.retencion.tasa).toBe(0.75);
    const [par] = m.retencion.pares;
    expect(par.abierto).toBe(true);
    expect(par.repiten.map((e: { nombre: string }) => e.nombre).sort()).toEqual(['Equipo A', 'Equipo B', 'Equipo C']);
    expect(par.seFueron.map((e: { nombre: string }) => e.nombre)).toEqual(['Equipo D']);
    expect(par.nuevos.map((e: { nombre: string }) => e.nombre)).toEqual(['Equipo E']);
    expect(m.inscriptos.serie.map((s: { equipos: number }) => s.equipos)).toEqual([4, 4]);

    // Cobranza: 8 inscripciones facturadas, 5 cobradas; 3 en efectivo, 1 transferencia, 1 online.
    expect(m.cobranza.facturado).toBe(80_000);
    expect(m.cobranza.cobrado).toBe(50_000);
    expect(m.cobranza.tasa).toBe(0.625);
    expect(m.cobranza.porMedio).toEqual({
      MERCADO_PAGO: { monto: 10_000, cantidad: 1 },
      EFECTIVO: { monto: 30_000, cantidad: 3 },
      TRANSFERENCIA: { monto: 10_000, cantidad: 1 },
    });
    expect(m.cobranza.mezcla.EFECTIVO).toBe(0.6);
    const anterior = m.cobranzaPorTorneo.find((t: { id: string }) => t.id === anteriorId);
    // Se pagó hoy y el torneo "empezó" en 2025: nada entró antes del inicio.
    expect(anterior.tasa).toBe(1);
    expect(anterior.inscripcion.tasa).toBe(0);
    const actual = m.cobranzaPorTorneo.find((t: { id: string }) => t.id === actualId);
    expect(actual.inscripcion.tasa).toBe(0.25);

    // Canchas: 4 equipos = 3 fechas de 2 partidos, a las 15 y 16 en una cancha → todo ocupado.
    expect(m.canchas.jornadas).toBe(3);
    expect(m.canchas.promedio).toBe(1);
    expect(m.canchas.porCancha).toEqual([{ id: canchaId, nombre: 'Cancha A', partidos: 6, ocupacion: 1 }]);
    // Sábados (columna 5): 3 partidos a las 15 (12 a 16 hs) y 3 a las 16 (16 a 20 hs).
    expect(m.horarios.celdas[1][5]).toBe(3);
    expect(m.horarios.celdas[2][5]).toBe(3);
    expect(m.asistencia).toEqual({ jugados: 6, wo: 0, tasa: 1 });
  });

  it('la temporada deja afuera el torneo del año pasado; un torneo elegido muestra solo lo suyo', async () => {
    const t = (await api('GET', '/metricas?periodo=TEMPORADA')).body;
    expect(t.torneos.map((x: { nombre: string }) => x.nombre)).toEqual(['Actual']);
    expect(t.canchas.partidos).toBe(0);
    // La retención que llega al torneo de este año sigue contando.
    expect(t.retencion.pares).toHaveLength(1);
    expect(t.cobranza.facturado).toBe(40_000);

    const solo = (await api('GET', `/metricas?periodo=30D&torneoId=${anteriorId}`)).body;
    expect(solo.torneos.map((x: { nombre: string }) => x.nombre)).toEqual(['Anterior']);
    expect(solo.canchas.partidos).toBe(6);
  });

  it('otra organización no ve nada de esta ni puede pedir sus torneos', async () => {
    const r = await otra('GET', '/metricas?periodo=HISTORICO');
    expect(r.status).toBe(200);
    expect(r.body.torneos).toEqual([]);
    expect(r.body.cobranza.facturado).toBe(0);
    expect(r.body.canchas.porCancha).toEqual([]);
    expect(r.body.retencion.pares).toEqual([]);
    expect((await otra('GET', `/metricas?torneoId=${anteriorId}`)).status).toBe(404);
  });
});
