// Caja (E07) de punta a punta: libro de partida doble, resultado, egresos, retiros, anulaciones, exportación y aislamiento.
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
// @ts-expect-error: módulo compilado
import { tienePermiso } from '../dist/comun/permisos.js';

let app: INestApplication;
let base: string;
let admin: pg.Client;

/** El cuerpo como JSON si se puede (los CSV no lo son). */
const analizar = (t: string) => {
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return t;
  }
};

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
    const bruto = Buffer.from(await r.clone().arrayBuffer());
    const texto = await r.text();
    return { status: r.status, body: analizar(texto), headers: r.headers, texto, bruto };
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

describe('caja del torneo', () => {
  const api = cliente();
  const otra = cliente();
  const publico = cliente();
  let torneoId: string;
  let otroTorneoId: string;
  const cargo: Record<string, string> = {};
  let egresoId: string;

  it('prepara un torneo: un equipo paga en efectivo, otro online y otro debe', async () => {
    await api('POST', '/auth/registro', {
      nombre: 'Tesorera',
      email: 'caja@test.com',
      password: 'clave-segura-1',
      organizacion: 'Liga Caja',
    });
    torneoId = (
      await api('POST', '/torneos', {
        nombre: 'Copa Caja',
        modalidad: 'F5',
        formato: 'LIGA',
        cupo: 8,
        inscripcion: 10_000,
      })
    ).body.id;
    otroTorneoId = (
      await api('POST', '/torneos', {
        nombre: 'Otro torneo',
        modalidad: 'F5',
        formato: 'LIGA',
        cupo: 8,
        inscripcion: 0,
      })
    ).body.id;
    for (const n of ['A', 'B', 'C']) {
      const e = await api('POST', '/equipos', { nombre: `Equipo ${n}` });
      const ins = await api('POST', `/torneos/${torneoId}/inscripciones`, { equipoId: e.body.id });
      cargo[n] = ins.body.cargo.id;
    }
    // A: efectivo. B: online con Mercado Pago (plan Liga: 3,5 % de comisión).
    await api('POST', `/cargos/${cargo.A}/pagos`, { metodo: 'EFECTIVO', monto: 10_000 });
    const link = await api('POST', `/cargos/${cargo.B}/link`);
    const n = { preferenciaId: link.body.preferenciaId, pasarelaPagoId: 'PAGO-CAJA-1', estado: 'aprobado' };
    await publico('POST', '/webhooks/pagos', n, { 'x-firma': firmar(JSON.stringify(n)) });
  });

  it('cada pago aprobado quedó asentado, con su comisión, y el resumen sale del libro', async () => {
    const r = await api('GET', '/caja');
    expect(r.status).toBe(200);
    expect(r.body.plan).toEqual({ nombre: 'Liga', comisionPct: 3.5 });
    expect(r.body.disponible).toEqual({ MP: 9_650, EFECTIVO: 10_000, BANCO: 0 });
    expect(r.body.comisionTotal).toBe(350);
    expect(r.body.resultado).toEqual({ ingresos: 20_000, comision: 350, egresos: 0, resultado: 19_650 });
    expect(r.body.porCobrar).toEqual({ monto: 10_000, equipos: 1 });
  });

  it('el libro cierra: todos los asientos suman lo mismo al debe y al haber', async () => {
    expect(
      await consulta(
        'SELECT asiento_id FROM linea_asiento GROUP BY asiento_id HAVING sum(debe) <> sum(haber)',
      ),
    ).toEqual([]);
    expect(await consulta('SELECT sum(debe) - sum(haber) AS d FROM linea_asiento')).toEqual([{ d: '0' }]);
  });

  it('los movimientos muestran cada cobro y la comisión con su efecto en el resultado', async () => {
    const r = await api('GET', '/caja/movimientos');
    expect(r.body.total).toBe(3);
    const porTipo = (t: string) => r.body.movimientos.filter((m: { tipo: string }) => m.tipo === t);
    expect(porTipo('COBRO')).toHaveLength(2);
    expect(porTipo('COMISION')[0]).toMatchObject({ efecto: -350, monto: 350, detalle: 'Mercado Pago' });
    expect(
      porTipo('COBRO')
        .map((m: { detalle: string }) => m.detalle)
        .sort(),
    ).toEqual(['Efectivo', 'Mercado Pago']);
    const ingresos = await api('GET', '/caja/movimientos?tipo=INGRESOS');
    expect(ingresos.body.movimientos.every((m: { efecto: number }) => m.efecto > 0)).toBe(true);
    const egresos = await api('GET', '/caja/movimientos?tipo=EGRESOS');
    expect(egresos.body.movimientos.map((m: { tipo: string }) => m.tipo)).toEqual(['COMISION']);
  });

  it('los pagos anteriores a la caja se asientan solos al mirarla (y una sola vez)', async () => {
    // Un pago aprobado "viejo", insertado sin pasar por el cobro: no tiene asiento.
    const [{ id: orgId }] = await consulta("SELECT id FROM organizacion WHERE slug = 'liga-caja'");
    await admin.query(
      `INSERT INTO pago (id, organizacion_id, cargo_id, metodo, monto, estado, comision_plataforma, creado_en)
       VALUES ('pago-viejo', $1, $2, 'TRANSFERENCIA', 10000, 'APROBADO', 0, now())`,
      [orgId, cargo.C],
    );
    expect(await consulta("SELECT 1 FROM asiento WHERE clave = 'pago:pago-viejo'")).toHaveLength(0);
    const r = await api('GET', '/caja');
    expect(r.body.disponible.BANCO).toBe(10_000);
    expect(r.body.resultado.ingresos).toBe(30_000);
    await api('GET', '/caja');
    expect(await consulta("SELECT 1 FROM asiento WHERE clave = 'pago:pago-viejo'")).toHaveLength(1);
    expect(r.body.porCobrar).toEqual({ monto: 0, equipos: 0 }); // el cargo de C ya está cubierto
  });

  it('un egreso por rubro baja el resultado y el saldo de donde se pagó', async () => {
    const r = await api('POST', '/caja/egresos', {
      rubro: 'CANCHAS',
      monto: 6_000,
      descripcion: 'Alquiler fecha 1',
      pagadoCon: 'EFECTIVO',
      comprobante: 'Recibo 0021',
      torneoId,
    });
    expect(r.status).toBe(201);
    egresoId = r.body.id;
    const caja = await api('GET', '/caja');
    expect(caja.body.disponible.EFECTIVO).toBe(4_000);
    expect(caja.body.resultado).toMatchObject({ egresos: 6_000, resultado: 30_000 - 350 - 6_000 });
    expect(caja.body.porRubro).toEqual([{ rubro: 'CANCHAS', monto: 6_000, pct: 100, nombre: 'Canchas' }]);
  });

  it('valida los datos de los movimientos', async () => {
    const base = { rubro: 'OTROS', descripcion: 'Algo', pagadoCon: 'MP' };
    expect((await api('POST', '/caja/egresos', { ...base, monto: 0 })).status).toBe(400);
    expect((await api('POST', '/caja/egresos', { ...base, monto: 10.5 })).status).toBe(400);
    expect((await api('POST', '/caja/egresos', { ...base, monto: 100, rubro: 'SUELDOS' })).status).toBe(400);
    expect((await api('POST', '/caja/egresos', { ...base, monto: 100, torneoId: 'no-existe' })).status).toBe(
      404,
    );
  });

  it('un ingreso de sponsor entra por el banco', async () => {
    const r = await api('POST', '/caja/ingresos', {
      categoria: 'SPONSORS',
      monto: 5_000,
      descripcion: 'Kiosco Don Pepe · cuota',
      cobradoEn: 'BANCO',
    });
    expect(r.status).toBe(201);
    const caja = await api('GET', '/caja');
    expect(caja.body.disponible.BANCO).toBe(15_000);
    expect(caja.body.resultado.ingresos).toBe(35_000);
    // Los ingresos por inscripción y multas salen solos de los cobros: no se cargan a mano.
    expect(
      (
        await api('POST', '/caja/ingresos', {
          categoria: 'INSCRIPCIONES',
          monto: 1,
          descripcion: 'x',
          cobradoEn: 'MP',
        })
      ).status,
    ).toBe(400);
  });

  it('el retiro mueve la plata de Mercado Pago al banco sin tocar el resultado, y no deja retirar de más', async () => {
    const antes = (await api('GET', '/caja')).body;
    const demasiado = await api('POST', '/caja/retiros', { monto: 20_000 });
    expect(demasiado.status).toBe(422);
    expect(demasiado.body.mensaje).toMatch(/Solo tenés \$\s?9\.650 disponibles en Mercado Pago/);
    const ok = await api('POST', '/caja/retiros', { monto: 5_000, destino: 'CBU ...4321' });
    expect(ok.status).toBe(201);
    expect(ok.body.disponibleEnMp).toBe(4_650);
    const despues = (await api('GET', '/caja')).body;
    expect(despues.disponible).toEqual({ MP: 4_650, EFECTIVO: 4_000, BANCO: 20_000 });
    expect(despues.resultado).toEqual(antes.resultado);
    expect(await consulta("SELECT descripcion FROM asiento WHERE tipo = 'RETIRO'")).toEqual([
      { descripcion: 'Retiro a CBU ...4321' },
    ]);
  });

  it('solo el dueño puede retirar; el tesorero opera la caja pero no retira', () => {
    expect(tienePermiso('DUENO', 'caja.retirar')).toBe(true);
    expect(tienePermiso('TESORERO', 'caja.retirar')).toBe(false);
    expect(tienePermiso('TESORERO', 'caja.escribir')).toBe(true);
    expect(tienePermiso('ADMINISTRADOR', 'caja.retirar')).toBe(false);
    expect(tienePermiso('ADMINISTRADOR', 'caja.leer')).toBe(true);
    expect(tienePermiso('ADMINISTRADOR', 'caja.escribir')).toBe(false);
    expect(tienePermiso('ARBITRO', 'caja.leer')).toBe(false);
  });

  it('filtrar por torneo cambia el resultado pero no la plata disponible', async () => {
    const t = (await api('GET', `/caja?torneoId=${torneoId}`)).body;
    expect(t.resultado).toMatchObject({ ingresos: 30_000, egresos: 6_000 }); // sin el sponsor, que no es de ningún torneo
    expect(t.disponible).toEqual({ MP: 4_650, EFECTIVO: 4_000, BANCO: 20_000 });
    const otro = (await api('GET', `/caja?torneoId=${otroTorneoId}`)).body;
    expect(otro.resultado).toEqual({ ingresos: 0, comision: 0, egresos: 0, resultado: 0 });
    expect(otro.disponible.BANCO).toBe(20_000);
    expect((await api('GET', `/caja/movimientos?torneoId=${otroTorneoId}`)).body.total).toBe(0);
  });

  it('un movimiento mal cargado se anula con otro asiento: el original queda y se ve anulado', async () => {
    const r = await api('POST', `/caja/movimientos/${egresoId}/anular`, { motivo: 'Lo cargué dos veces' });
    expect(r.status).toBe(201);
    const caja = (await api('GET', '/caja')).body;
    expect(caja.resultado.egresos).toBe(0);
    expect(caja.disponible.EFECTIVO).toBe(10_000);
    const movs = (await api('GET', '/caja/movimientos?limite=100')).body.movimientos;
    const original = movs.find((m: { id: string }) => m.id === egresoId);
    expect(original).toMatchObject({ anulado: true, efecto: -6_000 });
    const reversa = movs.find((m: { tipo: string }) => m.tipo === 'REVERSA');
    expect(reversa).toMatchObject({ efecto: 6_000 });
    expect(reversa.descripcion).toContain('Lo cargué dos veces');
    expect(await consulta("SELECT 1 FROM asiento WHERE tipo = 'EGRESO'")).toHaveLength(1); // el original sigue ahí
  });

  it('no se anula dos veces ni se anulan los cobros', async () => {
    expect((await api('POST', `/caja/movimientos/${egresoId}/anular`, {})).status).toBe(409);
    const [cobro] = await consulta("SELECT id FROM asiento WHERE tipo = 'COBRO' LIMIT 1");
    const r = await api('POST', `/caja/movimientos/${cobro.id}/anular`, {});
    expect(r.status).toBe(422);
    expect(r.body.mensaje).toMatch(/reembolso/);
    expect((await api('POST', '/caja/movimientos/no-existe/anular', {})).status).toBe(404);
  });

  it('no se anula un ingreso si dejaría una cuenta en negativo', async () => {
    const [sponsor] = await consulta("SELECT id FROM asiento WHERE tipo = 'INGRESO' LIMIT 1");
    // Se retira del banco lo que entró: ahora anular el sponsor dejaría el banco en negativo.
    await admin.query(
      `INSERT INTO asiento (id, organizacion_id, fecha, descripcion, tipo, creado_en)
       SELECT 'sacar-banco', organizacion_id, now(), 'Gasto en banco', 'EGRESO', now() FROM asiento LIMIT 1`,
    );
    await admin.query(
      `INSERT INTO linea_asiento (id, organizacion_id, asiento_id, cuenta, debe, haber)
       SELECT 'l1', organizacion_id, 'sacar-banco', 'EGRESOS:OTROS', 19000, 0 FROM asiento LIMIT 1`,
    );
    await admin.query(
      `INSERT INTO linea_asiento (id, organizacion_id, asiento_id, cuenta, debe, haber)
       SELECT 'l2', organizacion_id, 'sacar-banco', 'BANCO', 0, 19000 FROM asiento LIMIT 1`,
    );
    const r = await api('POST', `/caja/movimientos/${sponsor.id}/anular`, {});
    expect(r.status).toBe(422);
    expect(r.body.mensaje).toMatch(/quedaría en negativo/);
  });

  it('la base no deja editar ni borrar el libro', async () => {
    await expect(admin.query("UPDATE asiento SET descripcion = 'trucho'")).rejects.toThrow(
      /no se edita ni se borra/,
    );
    await expect(admin.query('DELETE FROM asiento')).rejects.toThrow(/no se edita ni se borra/);
    await expect(admin.query('UPDATE linea_asiento SET debe = debe + 1')).rejects.toThrow(
      /no se edita ni se borra/,
    );
    await expect(admin.query('DELETE FROM linea_asiento')).rejects.toThrow(/no se edita ni se borra/);
  });

  it('se exporta todo a un CSV que abre en Excel', async () => {
    const r = await api('GET', '/caja/movimientos.csv');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/csv');
    expect(r.headers.get('content-disposition')).toContain('movimientos-caja.csv');
    // El BOM (EF BB BF) hace que Excel respete las tildes; fetch lo descarta al decodificar, así que se mira en bytes.
    expect([...r.bruto.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(r.texto.startsWith('Fecha;Tipo;Descripción')).toBe(true);
    const filas = r.texto.trim().split('\r\n');
    expect(filas.length).toBeGreaterThan(5);
    expect(r.texto).toContain('COBRO;Inscripción Copa Caja · Equipo A;Efectivo;10000;10000');
    expect(r.texto).toContain(';Sí'); // el egreso anulado
    expect((await cliente()('GET', '/caja/movimientos.csv')).status).toBe(401);
  });

  it('otra liga no ve nada de esta caja', async () => {
    await otra('POST', '/auth/registro', {
      nombre: 'Otra',
      email: 'otra@caja.test',
      password: 'clave-segura-1',
      organizacion: 'Otra Liga',
    });
    const r = (await otra('GET', '/caja')).body;
    expect(r.disponible).toEqual({ MP: 0, EFECTIVO: 0, BANCO: 0 });
    expect(r.resultado.ingresos).toBe(0);
    expect((await otra('GET', '/caja/movimientos')).body.total).toBe(0);
    expect((await otra('POST', `/caja/movimientos/${egresoId}/anular`, {})).status).toBe(404);
    expect((await cliente()('GET', '/caja')).status).toBe(401);
  });
});
