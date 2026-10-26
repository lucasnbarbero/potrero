// Sponsors (E23) de punta a punta: alta, reglas de rubros, sitio público, medición sin datos personales, reporte,
// cobros enlazados a la caja y aislamiento entre organizaciones.
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

const analizar = (t: string) => {
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return t;
  }
};

function cliente() {
  let cookies = '';
  return async (metodo: string, ruta: string, cuerpo?: unknown) => {
    const r = await fetch(`${base}/api${ruta}`, {
      method: metodo,
      headers: { 'content-type': 'application/json', cookie: cookies },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      redirect: 'manual',
    });
    const nuevas = r.headers.getSetCookie().map((c) => c.split(';')[0]);
    if (nuevas.length) cookies = nuevas.join('; ');
    const texto = await r.text();
    return { status: r.status, body: analizar(texto), headers: r.headers, texto };
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

/** Hoy en Argentina y días relativos, como AAAA-MM-DD. */
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(
  new Date(),
);
const mas = (dias: number) => {
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

describe('sponsors del torneo', () => {
  const api = cliente();
  const otra = cliente();
  const visitante = cliente();
  let mayores: string;
  let infantil: string;
  const sp: Record<string, string> = {};
  let cabecera: string;
  let futuro: string;

  it('prepara una liga con un torneo de mayores y uno con un jugador menor', async () => {
    await api('POST', '/auth/registro', {
      nombre: 'Org',
      email: 'sponsors@test.com',
      password: 'clave-segura-1',
      organizacion: 'Liga Sponsors',
    });
    await otra('POST', '/auth/registro', {
      nombre: 'Otra',
      email: 'otra-sponsors@test.com',
      password: 'clave-segura-1',
      organizacion: 'Otra Liga',
    });
    const torneo = async (nombre: string) => {
      const id = (
        await api('POST', '/torneos', { nombre, modalidad: 'F5', formato: 'LIGA', cupo: 4, inscripcion: 0 })
      ).body.id;
      await api('PATCH', `/torneos/${id}/estado`, { estado: 'INSCRIPCION' });
      return id as string;
    };
    mayores = await torneo('Apertura Mayores');
    infantil = await torneo('Infantil');
    const e = await api('POST', '/equipos', { nombre: 'Los Chicos' });
    const j = await api('POST', `/equipos/${e.body.id}/jugadores`, {
      nombre: 'Tito',
      apellido: 'Gómez',
      numero: 9,
    });
    await api('PATCH', `/documentacion/jugadores/${j.body.jugadorId}/identidad`, {
      dni: '50111333',
      fechaNacimiento: `${new Date().getUTCFullYear() - 14}-03-01`,
    });
    expect((await api('POST', `/torneos/${infantil}/inscripciones`, { equipoId: e.body.id })).status).toBe(
      201,
    );
  });

  it('da de alta sponsors y valida los datos', async () => {
    for (const [k, categoria] of [
      ['pepe', 'BEBIDAS'],
      ['cerveza', 'ALCOHOL'],
      ['apuesta', 'APUESTAS'],
    ] as const) {
      const r = await api('POST', '/sponsors', {
        nombre: `Sponsor ${k}`,
        categoria,
        link: `https://example.com/${k}`,
      });
      expect(r.status).toBe(201);
      sp[k] = r.body.id;
    }
    expect((await api('POST', '/sponsors', { nombre: 'Sponsor pepe', categoria: 'OTROS' })).status).toBe(409);
    expect(
      (await api('POST', '/sponsors', { nombre: 'X', categoria: 'OTROS', link: 'javascript:alert(1)' }))
        .status,
    ).toBe(400);
    expect((await api('POST', '/sponsors', { nombre: 'X', categoria: 'CASINO' })).status).toBe(400);
  });

  it('no se vende alcohol en un torneo con menores, ni un rubro que la organización rechaza', async () => {
    const espacio = (torneoId: string, extra = {}) => ({
      torneoId,
      espacio: 'CABECERA',
      desde: mas(-10),
      hasta: mas(20),
      monto: 90000,
      ...extra,
    });
    const r = await api('POST', `/sponsors/${sp.cerveza}/placements`, espacio(infantil));
    expect(r.status).toBe(422);
    expect(r.body.mensaje).toMatch(/menores/);
    // En el torneo de mayores sí se puede, salvo que la organización rechace el rubro.
    expect(
      (await api('PATCH', '/sponsors/preferencias', { categoriasRechazadas: ['APUESTAS'] })).status,
    ).toBe(200);
    const ap = await api(
      'POST',
      `/sponsors/${sp.apuesta}/placements`,
      espacio(mayores, { espacio: 'GOLEADORES' }),
    );
    expect(ap.status).toBe(422);
    expect(ap.body.mensaje).toMatch(/Tu organización no acepta/);

    const ok = await api('POST', `/sponsors/${sp.pepe}/placements`, espacio(mayores));
    expect(ok.status).toBe(201);
    cabecera = ok.body.id;
    // El mismo espacio no se vende dos veces en el mismo período.
    const pisado = await api(
      'POST',
      `/sponsors/${sp.cerveza}/placements`,
      espacio(mayores, { desde: mas(15) }),
    );
    expect(pisado.status).toBe(409);
    // Uno que todavía no empezó.
    const fut = await api(
      'POST',
      `/sponsors/${sp.cerveza}/placements`,
      espacio(mayores, { espacio: 'ENTRE_SECCIONES', desde: mas(5), hasta: mas(40) }),
    );
    expect(fut.status).toBe(201);
    futuro = fut.body.id;
    expect(
      (
        await api(
          'POST',
          `/sponsors/${sp.pepe}/placements`,
          espacio(mayores, { desde: mas(3), hasta: mas(1) }),
        )
      ).status,
    ).toBe(400);
  });

  it('el sitio público muestra solo los espacios vigentes, sin montos', async () => {
    const r = await visitante('GET', '/sponsors-publico/liga-sponsors/apertura-mayores');
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
    expect(r.body[0]).toMatchObject({
      id: cabecera,
      espacio: 'CABECERA',
      sponsor: { nombre: 'Sponsor pepe' },
    });
    expect(JSON.stringify(r.body)).not.toMatch(/monto|90000|example\.com/);
    // Pausado no se muestra.
    await api('PATCH', `/sponsors/placements/${cabecera}`, { activo: false });
    expect((await visitante('GET', '/sponsors-publico/liga-sponsors/apertura-mayores')).body).toHaveLength(0);
    await api('PATCH', `/sponsors/placements/${cabecera}`, { activo: true });
  });

  it('cuenta impresiones y clics en forma agregada, sin cookies', async () => {
    for (let i = 0; i < 3; i++) {
      const r = await visitante('POST', '/sponsors-publico/liga-sponsors/impresiones', {
        ids: [cabecera, futuro, 'x'],
      });
      expect(r.status).toBe(204);
      expect(r.headers.get('set-cookie')).toBeNull();
    }
    const c = await visitante('GET', `/sponsors-publico/liga-sponsors/clic/${cabecera}`);
    expect(c.status).toBe(302);
    expect(c.headers.get('location')).toBe('https://example.com/pepe');
    expect(c.headers.get('set-cookie')).toBeNull();
    expect((await visitante('GET', '/sponsors-publico/liga-sponsors/clic/no-existe')).status).toBe(404);
    // Otra organización no puede sumar en los espacios de esta.
    await visitante('POST', '/sponsors-publico/otra-liga/impresiones', { ids: [cabecera] });

    const filas = await consulta('SELECT placement_id, impresiones, clics FROM metrica_placement');
    expect(filas).toEqual([{ placement_id: cabecera, impresiones: 3, clics: 1 }]);
    // Solo contadores: la tabla no tiene dónde guardar nada del visitante.
    const columnas = (
      await consulta(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'metrica_placement'",
      )
    ).map((x) => x.column_name);
    expect(columnas.sort()).toEqual(['clics', 'dia', 'id', 'impresiones', 'organizacion_id', 'placement_id']);
  });

  it('un cobro al sponsor entra a la caja como ingreso de sponsors, enlazado', async () => {
    const antes = (await api('GET', '/caja')).body.resultado.ingresos;
    const r = await api('POST', `/sponsors/${sp.pepe}/cobros`, {
      monto: 30000,
      cobradoEn: 'BANCO',
      torneoId: mayores,
      comprobante: 'Recibo 1',
    });
    expect(r.status).toBe(201);
    const [a] = await consulta('SELECT tipo, referencia_tipo, referencia_id FROM asiento WHERE id = $1', [
      r.body.id,
    ]);
    expect(a).toEqual({ tipo: 'INGRESO', referencia_tipo: 'SPONSOR', referencia_id: sp.pepe });
    expect((await api('GET', '/caja')).body.resultado.ingresos).toBe(antes + 30000);
    // Un ingreso de sponsors cargado desde la caja, sin enlazar, queda "sin asignar".
    await api('POST', '/caja/ingresos', {
      categoria: 'SPONSORS',
      monto: 5000,
      descripcion: 'Varios',
      cobradoEn: 'EFECTIVO',
    });

    const p = (await api('GET', '/sponsors')).body;
    const pepe = p.sponsors.find((s: { id: string }) => s.id === sp.pepe);
    expect(pepe).toMatchObject({
      cobrado: 30000,
      activo: true,
      acordadoVigente: 90000,
      impresiones: 3,
      clics: 1,
    });
    expect(pepe.placements[0]).toMatchObject({ estado: 'ACTIVO', espacio: 'CABECERA' });
    expect(p.resumen).toMatchObject({ cobradoEnCaja: 35000, cobradoSinAsignar: 5000, sponsorsActivos: 1 });
    expect(p.torneos.find((t: { id: string }) => t.id === infantil).conMenores).toBe(true);
    expect(p.categoriasRechazadas).toEqual(['APUESTAS']);

    // Anulado en la caja, deja de contar como cobrado.
    await api('POST', `/caja/movimientos/${r.body.id}/anular`, { motivo: 'error' });
    const despues = (await api('GET', '/sponsors')).body.sponsors.find(
      (s: { id: string }) => s.id === sp.pepe,
    );
    expect(despues.cobrado).toBe(0);
  });

  it('arma el reporte del sponsor, también en CSV', async () => {
    const r = await api('GET', `/sponsors/${sp.pepe}/reporte`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ impresiones: 3, clics: 1, ctr: 33.3, desde: mas(-10), hasta: hoy });
    expect(r.body.espacios[0]).toMatchObject({ espacio: 'Banner del sitio', torneo: 'Apertura Mayores' });
    expect(r.body.serie.at(-1)).toEqual({ dia: hoy, impresiones: 3, clics: 1 });
    const csv = await api('GET', `/sponsors/${sp.pepe}/reporte.csv`);
    expect(csv.headers.get('content-type')).toMatch(/text\/csv/);
    expect(csv.headers.get('content-disposition')).toMatch(/reporte-sponsor-pepe\.csv/);
    expect(csv.texto).toMatch(/Impresiones;3/);
    expect(csv.texto).toMatch(/CTR \(%\);33,3/);
  });

  it('otra organización no ve ni toca los sponsors', async () => {
    expect((await otra('GET', '/sponsors')).body.sponsors).toEqual([]);
    expect((await otra('GET', `/sponsors/${sp.pepe}/reporte`)).status).toBe(404);
    expect((await otra('POST', `/sponsors/${sp.pepe}/cobros`, { monto: 1, cobradoEn: 'BANCO' })).status).toBe(
      404,
    );
    expect((await otra('PATCH', `/sponsors/placements/${cabecera}`, { activo: false })).status).toBe(404);
    expect((await visitante('GET', '/sponsors')).status).toBe(401);
  });
});
