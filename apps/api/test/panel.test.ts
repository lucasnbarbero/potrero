// Panel del organizador (E18) de punta a punta: partido en vivo, alertas accionables y sugerencias del próximo paso.
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
/** Instante para una columna timestamp sin zona (Prisma guarda UTC): pg mandaría la hora local. */
const haceMs = (ms: number) => new Date(Date.now() - ms).toISOString().slice(0, 23);
/** Día de Argentina dentro de `n` días, como AAAA-MM-DD. */
const diaAR = (n: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(
    new Date(Date.now() + n * 86_400_000),
  );

interface Tablero {
  vivo: {
    id: string;
    minuto: number | null;
    marcador: { local: number; visitante: number };
    goles: { jugador: string; minuto: number; lado: string }[];
  }[];
  alertas: { tipo: string; titulo: string; detalle: string; href: string; accion: string }[];
  sugerencias: {
    clave: string;
    texto: string;
    href: string;
    envio?: { plantilla: string; torneoId: string };
  }[];
  torneos: { id: string; estado: string; fechaActual: number; fechas: number }[];
  dinero: { cobrado: number; pendiente: number; serie: { dia: string; cobrado: number }[] };
  hoyPartidos: { total: number; enJuego: number };
  deudores: { equipo: string; debe: number }[];
}

describe('panel del organizador', () => {
  const api = cliente();
  const otra = cliente();
  let torneoId: string;
  let orgId: string;
  let partidos: { id: string; fecha: number; localId: string; visitanteId: string }[];
  const jugadores: Record<string, string[]> = {};
  const tablero = async () => (await api('GET', '/panel/tablero')).body as Tablero;

  it('prepara una liga con fixture para pasado mañana', async () => {
    await api('POST', '/auth/registro', {
      nombre: 'Panel',
      email: 'panel@test.com',
      password: 'clave-segura-1',
      organizacion: 'Liga Panel',
    });
    await otra('POST', '/auth/registro', {
      nombre: 'Otro',
      email: 'otro-panel@test.com',
      password: 'clave-segura-2',
      organizacion: 'Otra Liga Panel',
    });
    orgId = (await api('GET', '/auth/yo')).body.organizacion.id;
    const cancha = (await api('POST', '/canchas', { sede: 'Complejo', nombre: 'Cancha 1' })).body.id;
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
        nombre: `Equipo ${i}`,
        capitanTelefono: `11 5555 000${i}`,
        capitanOptInWhatsapp: true,
      });
      jugadores[e.body.id] = [];
      for (let j = 1; j <= 3; j++)
        jugadores[e.body.id]!.push(
          (
            await api('POST', `/equipos/${e.body.id}/jugadores`, {
              nombre: `J${j}`,
              apellido: `Apellido${i}${j}`,
              numero: j,
            })
          ).body.jugadorId,
        );
      await api('POST', `/torneos/${torneoId}/inscripciones`, { equipoId: e.body.id });
    }
    expect(
      (
        await api('POST', `/torneos/${torneoId}/fixture`, {
          primerDia: diaAR(2),
          horarios: ['19:00', '20:00'],
          canchaIds: [cancha],
        })
      ).status,
    ).toBe(201);
    partidos = (await api('GET', `/torneos/${torneoId}/partidos`)).body;
  });

  it('sugiere designar árbitros, avisar a los capitanes y completar planteles', async () => {
    const t = await tablero();
    expect(t.torneos[0]).toMatchObject({ id: torneoId, estado: 'EN_CURSO', fechaActual: 0 });
    const claves = t.sugerencias.map((s) => s.clave.split(':')[0]);
    expect(claves).toEqual(['ARBITROS', 'AVISAR', 'PLANTELES']);
    expect(t.sugerencias[0]!.texto).toContain('2 partidos de la fecha 1 de Apertura no tienen árbitro');
    expect(t.sugerencias[1]!.texto).toBe(
      'Publicá el fixture de la fecha 1 de Apertura y avisá a 4 capitanes por WhatsApp.',
    );
    expect(t.sugerencias[1]!.envio).toEqual({ plantilla: 'FIXTURE_PUBLICADO', torneoId });
    expect(t.sugerencias[2]!.texto).toContain('4 equipos de Apertura no tienen el plantel completo');
    expect(t.alertas.map((a) => a.tipo)).toEqual(['SIN_ARBITRO']);
    expect(t.deudores).toEqual([]);
  });

  it('avisar el fixture en un toque saca la sugerencia', async () => {
    const r = await api('POST', '/comunicacion/enviar', {
      plantilla: 'FIXTURE_PUBLICADO',
      canal: 'WHATSAPP',
      segmento: { tipo: 'TORNEO', torneoId },
    });
    expect(r.status).toBe(201);
    expect((await tablero()).sugerencias.map((s) => s.clave.split(':')[0])).not.toContain('AVISAR');
  });

  it('muestra el partido en vivo con marcador, goleadores y minuto', async () => {
    const p = partidos[0]!;
    await sql('UPDATE partido SET inicio = $2 WHERE id = $1', [p.id, haceMs(20 * 60_000)]);
    expect((await api('POST', `/partidos/${p.id}/iniciar`, {})).status).toBe(201);
    const gol = (equipoId: string, jugadorId: string, minuto: number) =>
      api('POST', `/partidos/${p.id}/eventos`, {
        tipo: 'GOL',
        equipoId,
        jugadorId,
        minuto,
        clientUuid: randomUUID(),
      });
    await gol(p.localId, jugadores[p.localId]![0]!, 7);
    await gol(p.visitanteId, jugadores[p.visitanteId]![1]!, 15);
    await gol(p.localId, jugadores[p.localId]![2]!, 18);

    const vivo = (await api('GET', '/panel/vivo')).body as Tablero['vivo'];
    expect(vivo).toHaveLength(1);
    expect(vivo[0]).toMatchObject({ id: p.id, marcador: { local: 2, visitante: 1 } });
    expect(vivo[0]!.minuto).toBeGreaterThanOrEqual(19);
    expect(vivo[0]!.goles.map((g) => [g.minuto, g.lado])).toEqual([
      [7, 'LOCAL'],
      [15, 'VISITANTE'],
      [18, 'LOCAL'],
    ]);
    expect(vivo[0]!.goles[0]!.jugador).toMatch(/^Apellido/);
    const t = await tablero();
    expect(t.vivo[0]!.id).toBe(p.id);
    expect(t.hoyPartidos).toMatchObject({ total: 1, enJuego: 1 });
  });

  it('alerta el acta sin cargar, el suspendido que jugó y el pago sin conciliar, cada una con su botón', async () => {
    const atrasado = partidos[1]!;
    await sql('UPDATE partido SET inicio = $2 WHERE id = $1', [atrasado.id, haceMs(3 * 3_600_000)]);
    const jugador = jugadores[atrasado.localId]![0]!;
    await sql(
      `INSERT INTO expediente (id, organizacion_id, torneo_id, partido_id, equipo_id, jugador_id, tipo, motivo)
       VALUES ('exp-panel', $1, $2, $3, $4, $5, 'JUGADOR_NO_HABILITADO', 'Jugador no habilitado en el acta')`,
      [orgId, torneoId, atrasado.id, atrasado.localId, jugador],
    );
    // Una transferencia aprobada sin su asiento en la caja (por ejemplo, anterior a la caja).
    const [ins] = await sql('SELECT id FROM inscripcion WHERE torneo_id = $1 LIMIT 1', [torneoId]);
    const [cargo] = await sql(
      `INSERT INTO cargo (id, organizacion_id, inscripcion_id, concepto, monto) VALUES ('cargo-panel', $1, $2, 'Cuota', 1000)
       RETURNING id`,
      [orgId, ins.id],
    );
    await sql(
      `INSERT INTO pago (id, organizacion_id, cargo_id, metodo, monto, estado)
       VALUES ('pago-panel', $1, $2, 'TRANSFERENCIA', 400, 'APROBADO')`,
      [orgId, cargo.id],
    );

    const t = await tablero();
    const por = (tipo: string) => t.alertas.find((a) => a.tipo === tipo)!;
    expect(t.alertas.map((a) => a.tipo)).toEqual([
      'SUSPENDIDO_JUGO',
      'ACTA_SIN_CARGAR',
      'PAGO_SIN_CONCILIAR',
    ]);
    expect(por('SUSPENDIDO_JUGO')).toMatchObject({
      titulo: 'Jugó un suspendido',
      accion: 'Resolver',
      href: '/panel/sanciones',
    });
    expect(por('SUSPENDIDO_JUGO').detalle).toContain('fecha 1');
    expect(por('ACTA_SIN_CARGAR')).toMatchObject({
      accion: 'Cargar',
      href: `/panel/partidos/${atrasado.id}`,
    });
    expect(por('PAGO_SIN_CONCILIAR')).toMatchObject({ accion: 'Conciliar', href: '/panel/caja' });
    expect(t.dinero.cobrado).toBe(400);
    expect(t.dinero.pendiente).toBe(600);
    expect(t.dinero.serie.at(-1)!.cobrado).toBe(400);
    // El tribunal abierto también aparece como próximo paso.
    expect(t.sugerencias.map((s) => s.clave)).toContain('TRIBUNAL');

    // Abrir la caja concilia el pago: la alerta se va.
    expect((await api('GET', '/caja')).status).toBe(200);
    expect((await tablero()).alertas.map((a) => a.tipo)).not.toContain('PAGO_SIN_CONCILIAR');
  });

  it('avisa los documentos vencidos o por vencer de los jugadores inscriptos', async () => {
    const [j1, j2] = jugadores[partidos[0]!.localId]!;
    const doc = (id: string, jugador: string, vence: string) =>
      sql(
        `INSERT INTO documento_jugador (id, organizacion_id, jugador_id, tipo, estado, archivo_clave, archivo_nombre, mime, tamano, vencimiento)
         VALUES ($1, $2, $3, 'APTO_FISICO', 'APROBADO', 'x', 'apto.pdf', 'application/pdf', 10, $4)`,
        [id, orgId, jugador, vence],
      );
    await doc('doc-vencido', j1!, diaAR(-5));
    await doc('doc-por-vencer', j2!, diaAR(10));
    const a = (await tablero()).alertas.find((x) => x.tipo === 'DOCUMENTO_VENCIDO')!;
    expect(a).toMatchObject({ titulo: '1 documento vencido', href: '/panel/documentacion' });
    expect(a.detalle).toContain('1 por vencer');
  });

  it('otra organización no ve nada de esta liga y hace falta sesión', async () => {
    const t = (await otra('GET', '/panel/tablero')).body as Tablero;
    expect(t.vivo).toEqual([]);
    expect(t.torneos).toEqual([]);
    expect(t.alertas).toEqual([]);
    expect(t.sugerencias.map((s) => s.clave)).toEqual(['CREAR_TORNEO']);
    expect((await otra('GET', '/panel/vivo')).body).toEqual([]);
    expect((await cliente()('GET', '/panel/tablero')).status).toBe(401);
  });
});
