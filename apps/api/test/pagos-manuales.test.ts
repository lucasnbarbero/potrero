// Pagos manuales completos y parciales (efectivo o transferencia), anulación con asiento inverso, edición del torneo,
// cambios de estado y reintento de un pago rechazado en el checkout simulado.
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
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(
  new Date(),
);
const corrido = (dias: number) =>
  new Date(Date.parse(`${hoy}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);

interface Inscripcion {
  id: string;
  estado: string;
  equipo: { id: string; nombre: string };
  total: number;
  pagado: number;
  cargos: { id: string; monto: number; estado: string; pagado: number }[];
  pagos: {
    id: string;
    metodo: string;
    monto: number;
    estado: string;
    comision: number;
    comprobante: string | null;
  }[];
}

describe('pagos manuales, edición y estado del torneo', () => {
  const api = cliente();
  const publico = cliente();
  let torneoId: string;
  const ins: Record<string, string> = {};
  const inscripciones = async () =>
    (await api('GET', `/torneos/${torneoId}/inscripciones`)).body as Inscripcion[];
  const de = async (n: string) => (await inscripciones()).find((i) => i.equipo.nombre === n)!;
  const disponible = async () =>
    (await api('GET', '/caja')).body.disponible as { MP: number; EFECTIVO: number; BANCO: number };

  it('arma un torneo con inscripción de $ 60.000 y tres equipos', async () => {
    await api('POST', '/auth/registro', {
      nombre: 'Tesorera',
      email: 'pagos@test.com',
      password: 'clave-segura-1',
      organizacion: 'Liga Pagos',
    });
    const t = await api('POST', '/torneos', {
      nombre: 'Apertura Pagos',
      modalidad: 'F5',
      formato: 'LIGA',
      cupo: 6,
      inscripcion: 60_000,
    });
    torneoId = t.body.id;
    for (const n of ['Norte', 'Sur', 'Este']) {
      const e = await api('POST', '/equipos', { nombre: n });
      const r = await api('POST', `/torneos/${torneoId}/inscripciones`, { equipoId: e.body.id });
      ins[n] = r.body.inscripcion.id;
    }
    expect((await inscripciones()).map((i) => i.estado)).toEqual(['PENDIENTE', 'PENDIENTE', 'PENDIENTE']);
  });

  it('un pago parcial por transferencia deja el cargo pendiente y entra al banco sin comisión', async () => {
    const r = await api('POST', `/inscripciones/${ins.Norte}/pagos`, {
      metodo: 'TRANSFERENCIA',
      monto: 20_000,
      fecha: corrido(-1),
      comprobante: 'Transf. 123',
    });
    expect(r.status).toBe(201);
    expect(r.body.pagos).toMatchObject([{ monto: 20_000, cancela: false }]);
    const n = await de('Norte');
    expect(n).toMatchObject({ estado: 'PENDIENTE', pagado: 20_000, total: 60_000 });
    expect(n.cargos[0]).toMatchObject({ estado: 'PENDIENTE', pagado: 20_000 });
    expect(n.pagos[0]).toMatchObject({ metodo: 'TRANSFERENCIA', comision: 0, comprobante: 'Transf. 123' });
    expect(await disponible()).toEqual({ MP: 0, EFECTIVO: 0, BANCO: 20_000 });
    const [pago] = await consulta('SELECT acreditado_en FROM pago WHERE id = $1', [n.pagos[0]!.id]);
    expect(new Date(pago.acreditado_en).toISOString().slice(0, 10)).toBe(corrido(-1));
  });

  it('rechaza montos de más, fechas futuras y cargos ajenos', async () => {
    const mas = await api('POST', `/inscripciones/${ins.Norte}/pagos`, { metodo: 'EFECTIVO', monto: 40_001 });
    expect(mas.status).toBe(422);
    expect(mas.body.mensaje).toMatch(/supera lo que se debe/);
    const futura = await api('POST', `/inscripciones/${ins.Norte}/pagos`, {
      metodo: 'EFECTIVO',
      monto: 1_000,
      fecha: corrido(2),
    });
    expect(futura.body.mensaje).toMatch(/futura/);
    const ajeno = (await de('Sur')).cargos[0]!.id;
    const r = await api('POST', `/inscripciones/${ins.Norte}/pagos`, {
      metodo: 'EFECTIVO',
      monto: 1_000,
      cargoId: ajeno,
    });
    expect(r.body.mensaje).toMatch(/no es de este equipo/);
    // El atajo "Cobré $X" tampoco cobra de más.
    const atajo = await api('POST', `/cargos/${ajeno}/pagos`, { metodo: 'EFECTIVO', monto: 60_001 });
    expect(atajo.body.mensaje).toMatch(/supera/);
  });

  it('el resto en efectivo completa el cargo y confirma la inscripción', async () => {
    const cargoId = (await de('Norte')).cargos[0]!.id;
    const r = await api('POST', `/inscripciones/${ins.Norte}/pagos`, {
      metodo: 'EFECTIVO',
      monto: 40_000,
      cargoId,
    });
    expect(r.body.pagos).toMatchObject([{ cargoId, monto: 40_000, cancela: true }]);
    const n = await de('Norte');
    expect(n).toMatchObject({ estado: 'CONFIRMADA', pagado: 60_000 });
    expect(n.cargos[0]!.estado).toBe('PAGADO');
    expect(await disponible()).toEqual({ MP: 0, EFECTIVO: 40_000, BANCO: 20_000 });
  });

  it('anular un pago manual lo revierte en la caja y el cargo vuelve a deber', async () => {
    const efectivo = (await de('Norte')).pagos.find((p) => p.metodo === 'EFECTIVO')!;
    const r = await api('POST', `/pagos/${efectivo.id}/anular`, { motivo: 'Cargado dos veces' });
    expect(r.status).toBe(201);
    expect(r.body.reversa).toBeTruthy();
    const n = await de('Norte');
    expect(n).toMatchObject({ estado: 'PENDIENTE', pagado: 20_000 });
    expect(n.cargos[0]!.estado).toBe('PENDIENTE');
    expect(n.pagos.find((p) => p.id === efectivo.id)!.estado).toBe('ANULADO');
    expect(await disponible()).toEqual({ MP: 0, EFECTIVO: 0, BANCO: 20_000 });
    const [reversa] = await consulta('SELECT tipo, revierte_a_id FROM asiento WHERE id = $1', [
      r.body.reversa,
    ]);
    expect(reversa.tipo).toBe('REVERSA');
    expect((await api('POST', `/pagos/${efectivo.id}/anular`, {})).body.mensaje).toMatch(/ya está anulado/);
    const [aud] = await consulta("SELECT count(*)::int AS n FROM auditoria WHERE accion = 'pago.anular'");
    expect(aud.n).toBe(1);
    // Lo vuelve a cobrar bien.
    await api('POST', `/inscripciones/${ins.Norte}/pagos`, { metodo: 'EFECTIVO', monto: 40_000 });
    expect((await de('Norte')).estado).toBe('CONFIRMADA');
  });

  it('editar: el cupo no baja de los inscriptos y el monto nuevo solo toca cargos sin pagos', async () => {
    await api('POST', `/inscripciones/${ins.Sur}/pagos`, { metodo: 'EFECTIVO', monto: 10_000 });
    const cupo = await api('PATCH', `/torneos/${torneoId}`, { cupo: 2 });
    expect(cupo.body.mensaje).toMatch(/Ya hay 3 equipos inscriptos/);
    const r = await api('PATCH', `/torneos/${torneoId}`, {
      nombre: 'Apertura 2027',
      cupo: 8,
      inscripcion: 80_000,
      venceInscripcion: corrido(10),
      puntosVictoria: 2,
      umbralAmarillas: 4,
    });
    expect(r.status).toBe(200);
    expect(r.body.cargos).toEqual({ actualizados: 1, anulados: 0, conservan: 1 });
    expect((await de('Este')).total).toBe(80_000);
    expect((await de('Sur')).total).toBe(60_000);
    expect((await de('Norte')).total).toBe(60_000);
    const d = (await api('GET', `/torneos/${torneoId}`)).body;
    expect(d).toMatchObject({ nombre: 'Apertura 2027', cupo: 8, inscripcion: 80_000, inscriptos: 3 });
    expect(d.venceInscripcion.slice(0, 10)).toBe(corrido(10));
    expect(d.reglamento).toMatchObject({
      version: 2,
      puntosVictoria: 2,
      puntosEmpate: 1,
      umbralAmarillas: 4,
    });
    const [aud] = await consulta("SELECT antes FROM auditoria WHERE accion = 'torneo.editar'");
    expect(aud.antes).toMatchObject({ nombre: 'Apertura Pagos', inscripcion: 60_000, puntosVictoria: 3 });
  });

  it('un pago que cubre de más que un cargo se reparte entre los pendientes', async () => {
    // Una multa al equipo Este: cargo aparte. Sin elegir cargo, el pago cubre la inscripción y después la multa.
    const [cargo] = await consulta(
      `INSERT INTO cargo (id, organizacion_id, inscripcion_id, concepto, monto, categoria, vence)
       SELECT 'multa-este', organizacion_id, id, 'Multa', 5000, 'MULTAS', (now() + interval '30 days')::date
       FROM inscripcion WHERE id = $1 RETURNING id`,
      [ins.Este],
    );
    const r = await api('POST', `/inscripciones/${ins.Este}/pagos`, { metodo: 'EFECTIVO', monto: 82_000 });
    expect(r.body.pagos.map((p: { monto: number }) => p.monto)).toEqual([80_000, 2_000]);
    const e = await de('Este');
    expect(e.estado).toBe('CONFIRMADA');
    expect(e.cargos.find((x) => x.id === cargo.id)).toMatchObject({ estado: 'PENDIENTE', pagado: 2_000 });
  });

  it('estado: cerrar y reabrir la inscripción; con fixture no se reabre y finalizar pide confirmación', async () => {
    expect((await api('PATCH', `/torneos/${torneoId}/estado`, { estado: 'EN_CURSO' })).body.estado).toBe(
      'EN_CURSO',
    );
    expect((await api('PATCH', `/torneos/${torneoId}/estado`, { estado: 'INSCRIPCION' })).body.estado).toBe(
      'INSCRIPCION',
    );
    await api('POST', '/canchas', { sede: 'Club', nombre: 'Cancha 1' });
    const canchas = (await api('GET', '/canchas')).body[0].canchas.map((c: { id: string }) => c.id);
    const f = await api('POST', `/torneos/${torneoId}/fixture`, {
      primerDia: corrido(3),
      diasEntreFechas: 7,
      horarios: ['20:00', '21:00'],
      canchaIds: canchas,
    });
    expect(f.status).toBe(201);
    const reabrir = await api('PATCH', `/torneos/${torneoId}/estado`, { estado: 'INSCRIPCION' });
    expect(reabrir.status).toBe(409);
    expect(reabrir.body.mensaje).toMatch(/ya tiene fixture/);
    const sinConfirmar = await api('PATCH', `/torneos/${torneoId}/estado`, { estado: 'FINALIZADO' });
    expect(sinConfirmar.status).toBe(409);
    expect(sinConfirmar.body.mensaje).toMatch(/Queda 1 partido sin jugar/);
    expect((await api('GET', `/torneos/${torneoId}`)).body.partidos).toEqual({ total: 1, sinJugar: 1 });
    const fin = await api('PATCH', `/torneos/${torneoId}/estado`, { estado: 'FINALIZADO', confirmar: true });
    expect(fin.body.estado).toBe('FINALIZADO');
    expect((await api('PATCH', `/torneos/${torneoId}`, { cupo: 10 })).body.mensaje).toMatch(/finalizado/);
    expect((await api('PATCH', `/torneos/${torneoId}`, { nombre: 'Apertura 2027 (final)' })).status).toBe(
      200,
    );
  });

  it('un pago rechazado en el checkout ofrece un link nuevo', async () => {
    const t = await api('POST', '/torneos', {
      nombre: 'Copa Reintento',
      modalidad: 'F5',
      formato: 'LIGA',
      cupo: 4,
      inscripcion: 30_000,
    });
    const e = await api('POST', '/equipos', { nombre: 'Oeste' });
    const r = await api('POST', `/torneos/${t.body.id}/inscripciones`, { equipoId: e.body.id });
    const link = await api('POST', `/cargos/${r.body.cargo.id}/link`);
    const pref = link.body.preferenciaId as string;
    expect((await publico('POST', `/pagos/simulado/${pref}/reintentar`)).status).toBe(409);
    await publico('POST', `/pagos/simulado/${pref}/rechazar`);
    const nuevo = await publico('POST', `/pagos/simulado/${pref}/reintentar`);
    expect(nuevo.status).toBe(200);
    expect(nuevo.body.preferenciaId).not.toBe(pref);
    expect((await publico('POST', `/pagos/simulado/${nuevo.body.preferenciaId}/aprobar`)).body.estado).toBe(
      'APROBADO',
    );
  });

  it('otra organización no ve ni anula los pagos', async () => {
    const otra = cliente();
    await otra('POST', '/auth/registro', {
      nombre: 'Otra',
      email: 'otra-pagos@test.com',
      password: 'clave-segura-1',
      organizacion: 'Liga Ajena',
    });
    const pago = (await de('Norte')).pagos[0]!;
    expect((await otra('POST', `/pagos/${pago.id}/anular`, {})).status).toBe(404);
    expect(
      (await otra('POST', `/inscripciones/${ins.Norte}/pagos`, { metodo: 'EFECTIVO', monto: 1 })).status,
    ).toBe(404);
  });
});
