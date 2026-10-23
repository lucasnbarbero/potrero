// Árbitros y canchas (E08) de punta a punta, y su conexión con la caja (E07-04): al cerrar el acta se paga al árbitro
// y el alquiler de la cancha, si el organizador lo tiene encendido.
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

describe('árbitros y canchas', () => {
  const api = cliente();
  const otra = cliente();
  const canchas: string[] = [];
  const arb: Record<string, string> = {};
  let torneoId: string;
  let partidos: { id: string; localId: string; inicio: string; canchaId?: string }[];
  const DIA = '2027-03-06'; // sábado

  it('prepara una liga con 2 canchas (una con costo) y un torneo con 2 partidos a la misma hora', async () => {
    await api('POST', '/auth/registro', {
      nombre: 'Org',
      email: 'arb@test.com',
      password: 'clave-segura-1',
      organizacion: 'Liga Árbitros',
    });
    canchas.push(
      (
        await api('POST', '/canchas', {
          sede: 'Complejo',
          nombre: 'Cancha 1',
          costoPorPartido: 8_000,
          superficie: 'césped',
        })
      ).body.id,
      (await api('POST', '/canchas', { sede: 'Complejo', nombre: 'Cancha 2' })).body.id,
    );
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
      for (let j = 1; j <= 3; j++)
        await api('POST', `/equipos/${e.body.id}/jugadores`, {
          nombre: `J${j}`,
          apellido: `E${i}`,
          numero: j,
        });
      await api('POST', `/torneos/${torneoId}/inscripciones`, { equipoId: e.body.id });
    }
    const fx = await api('POST', `/torneos/${torneoId}/fixture`, {
      primerDia: DIA,
      horarios: ['19:00'],
      canchaIds: canchas,
    });
    expect(fx.status).toBe(201);
    partidos = (await api('GET', `/torneos/${torneoId}/partidos`)).body.filter(
      (p: { fecha: number }) => p.fecha === 1,
    );
    expect(partidos).toHaveLength(2);
  });

  it('las canchas guardan costo y superficie', async () => {
    const sedes = (await api('GET', '/canchas')).body;
    expect(sedes[0].canchas.find((c: { nombre: string }) => c.nombre === 'Cancha 1')).toMatchObject({
      costoPorPartido: 8_000,
      superficie: 'césped',
      bloqueada: false,
    });
  });

  it('alta de árbitros con tarifa, valoración y disponibilidad, validando los datos', async () => {
    const a = await api('POST', '/arbitros', {
      nombre: 'Marcos',
      apellido: 'Costa',
      tarifa: 12_000,
      valoracion: 4.7,
      disponibilidad: [{ dia: 6, desde: '14:00', hasta: '22:00' }],
    });
    expect(a.status).toBe(201);
    arb.marcos = a.body.id;
    arb.julian = (
      await api('POST', '/arbitros', { nombre: 'Julián', apellido: 'Vera', tarifa: 10_000 })
    ).body.id;
    expect((await api('POST', '/arbitros', { nombre: 'X', apellido: 'Y', tarifa: -5 })).status).toBe(400);
    expect(
      (
        await api('POST', '/arbitros', {
          nombre: 'X',
          apellido: 'Y',
          disponibilidad: [{ dia: 6, desde: '18:00', hasta: '14:00' }],
        })
      ).status,
    ).toBe(400);
    expect((await api('POST', '/arbitros', { nombre: 'X', apellido: 'Y', valoracion: 9 })).status).toBe(400);
    const lista = (await api('GET', '/arbitros')).body;
    expect(lista.map((x: { apellido: string }) => x.apellido)).toEqual(['Costa', 'Vera']);
    expect(lista[0]).toMatchObject({ tarifa: 12_000, dirigidos: 0, proximos: 0, pagado: 0 });
  });

  it('las designaciones del día muestran partidos sin árbitro, quién puede dirigir y la ocupación de las canchas', async () => {
    const r = (await api('GET', `/designaciones?dia=${DIA}`)).body;
    expect(r.sinArbitro).toBe(2);
    expect(r.partidos).toHaveLength(2);
    expect(r.partidos[0].disponibles.map((x: { nombre: string }) => x.nombre).sort()).toEqual([
      'Julián Vera',
      'Marcos Costa',
    ]);
    expect(r.canchas.map((c: { nombre: string; pct: number }) => [c.nombre, c.pct])).toEqual([
      ['Cancha 1', 100],
      ['Cancha 2', 100],
    ]);
    expect((await api('GET', '/designaciones')).status).toBe(422);
    expect((await api('GET', '/designaciones?dia=hoy')).status).toBe(422);
  });

  it('designa a mano, pero un árbitro no dirige dos partidos a la misma hora', async () => {
    const [p1, p2] = partidos;
    const ok = await api('POST', `/partidos/${p1!.id}/arbitro`, { arbitroId: arb.marcos });
    expect(ok.status).toBe(201);
    expect(ok.body.advertencia).toBeNull();
    const choque = await api('POST', `/partidos/${p2!.id}/arbitro`, { arbitroId: arb.marcos });
    expect(choque.status).toBe(409);
    expect(choque.body.mensaje).toBe('Marcos Costa ya dirige otro partido a esa hora.');
    expect((await api('POST', `/partidos/${p2!.id}/arbitro`, { arbitroId: arb.julian })).status).toBe(201);
    const dia = (await api('GET', `/designaciones?dia=${DIA}`)).body;
    expect(dia.partidos.map((p: { arbitroEstado: string }) => p.arbitroEstado)).toEqual([
      'PENDIENTE',
      'PENDIENTE',
    ]);
    expect(dia.sinArbitro).toBe(0);
  });

  it('el árbitro confirma, y se puede sacar la designación', async () => {
    const [p1] = partidos;
    expect((await api('POST', `/partidos/${p1!.id}/arbitro/confirmar`)).status).toBe(201);
    const dia = (await api('GET', `/designaciones?dia=${DIA}`)).body;
    expect(dia.partidos.find((p: { id: string }) => p.id === p1!.id).arbitroEstado).toBe('CONFIRMADO');
    expect((await api('POST', `/partidos/${partidos[1]!.id}/arbitro`, { arbitroId: null })).status).toBe(201);
    expect((await api('POST', `/partidos/${partidos[1]!.id}/arbitro/confirmar`)).status).toBe(422); // sin árbitro
    expect((await api('POST', '/partidos/no-existe/arbitro', { arbitroId: arb.julian })).status).toBe(404);
    expect(
      (await api('POST', `/partidos/${partidos[1]!.id}/arbitro`, { arbitroId: 'no-existe' })).status,
    ).toBe(404);
  });

  it('designar a alguien fuera de su disponibilidad se permite pero se advierte', async () => {
    await api('PATCH', `/arbitros/${arb.julian}`, {
      disponibilidad: [{ dia: 0, desde: '10:00', hasta: '12:00' }],
    }); // solo domingos a la mañana
    const r = await api('POST', `/partidos/${partidos[1]!.id}/arbitro`, { arbitroId: arb.julian });
    expect(r.status).toBe(201);
    expect(r.body.advertencia).toMatch(/Julián Vera cargó que a esa hora no está disponible/);
  });

  it('la designación automática respeta la franja y deja sin asignar lo que no puede cubrir', async () => {
    await api('POST', `/partidos/${partidos[1]!.id}/arbitro`, { arbitroId: null });
    await api('POST', `/partidos/${partidos[0]!.id}/arbitro`, { arbitroId: null });
    // Julián solo está disponible los domingos a la mañana: de los dos partidos del sábado solo puede dirigir Marcos.
    const r = await api('POST', '/designaciones/automatico', { dia: DIA });
    expect(r.body).toMatchObject({ designados: 1, sinAsignar: 1 });
    expect(r.body.detalleSinAsignar[0].motivo).toBe('Todos los árbitros disponibles ya dirigen a esa hora.');
    // Si Julián tuviera disponibilidad libre, se cubrirían los dos.
    await api('PATCH', `/arbitros/${arb.julian}`, { disponibilidad: [] });
    const r2 = await api('POST', '/designaciones/automatico', { dia: DIA });
    expect(r2.body).toMatchObject({ designados: 1, sinAsignar: 0 });
    const dia = (await api('GET', `/designaciones?dia=${DIA}`)).body;
    const ids = dia.partidos.map((p: { arbitroId: string }) => p.arbitroId);
    expect(new Set(ids).size).toBe(2); // dos árbitros distintos
    expect((await api('POST', '/designaciones/automatico', {})).status).toBe(400);
  });

  it('un árbitro inactivo no se designa solo y avisa si no queda nadie', async () => {
    await api('POST', `/partidos/${partidos[0]!.id}/arbitro`, { arbitroId: null });
    await api('PATCH', `/arbitros/${arb.marcos}`, { activo: false });
    await api('PATCH', `/arbitros/${arb.julian}`, { activo: false });
    const r = await api('POST', '/designaciones/automatico', { torneoId });
    expect(r.body.designados).toBe(0);
    expect(r.body.detalleSinAsignar[0].motivo).toBe('No hay árbitros cargados.');
    expect(
      (await api('POST', `/partidos/${partidos[0]!.id}/arbitro`, { arbitroId: arb.marcos })).status,
    ).toBe(422);
    await api('PATCH', `/arbitros/${arb.marcos}`, { activo: true });
    await api('PATCH', `/arbitros/${arb.julian}`, { activo: true });
    // Editar un dato no pisa los demás: la tarifa sigue siendo la que se cargó.
    const lista = (await api('GET', '/arbitros')).body;
    expect(lista.find((a: { id: string }) => a.id === arb.marcos).tarifa).toBe(12_000);
    expect(lista.find((a: { id: string }) => a.id === arb.julian).tarifa).toBe(10_000);
  });

  it('una cancha bloqueada no se ofrece para armar un fixture y desbloquearla limpia el motivo', async () => {
    const b = await api('PATCH', `/canchas/${canchas[1]}`, {
      bloqueada: true,
      motivoBloqueo: 'Mantenimiento del césped',
    });
    expect(b.status).toBe(200);
    const otro = (
      await api('POST', '/torneos', {
        nombre: 'Otro',
        modalidad: 'F5',
        formato: 'LIGA',
        cupo: 4,
        inscripcion: 0,
      })
    ).body.id;
    for (const n of ['X', 'Y']) {
      const e = await api('POST', '/equipos', { nombre: `Eq ${n}` });
      await api('POST', `/torneos/${otro}/inscripciones`, { equipoId: e.body.id });
    }
    const fx = await api('POST', `/torneos/${otro}/fixture`, {
      primerDia: DIA,
      horarios: ['19:00'],
      canchaIds: [canchas[1]],
    });
    expect(fx.status).toBe(422);
    expect(fx.body.mensaje).toMatch(/Cancha 2 está bloqueada \(Mantenimiento del césped\)/);
    const dia = (await api('GET', `/designaciones?dia=${DIA}`)).body;
    expect(dia.canchas.find((c: { nombre: string }) => c.nombre === 'Cancha 2')).toMatchObject({
      bloqueada: true,
    });
    const d = await api('PATCH', `/canchas/${canchas[1]}`, { bloqueada: false });
    expect(d.body.motivoBloqueo).toBeNull();
    expect((await api('PATCH', '/canchas/no-existe', { bloqueada: true })).status).toBe(404);
  });

  it('al cerrar el acta se paga al árbitro y la cancha, si los cargos automáticos están encendidos', async () => {
    const [p1, p2] = partidos;
    // Se limpia lo que dejó la designación automática: p1 con Marcos y p2 sin árbitro.
    await api('POST', `/partidos/${p2!.id}/arbitro`, { arbitroId: null });
    await api('POST', `/partidos/${p1!.id}/arbitro`, { arbitroId: null });
    expect((await api('POST', `/partidos/${p1!.id}/arbitro`, { arbitroId: arb.marcos })).status).toBe(201);
    // p2 queda sin árbitro y en la cancha sin costo: no genera nada.
    expect((await api('PATCH', '/caja/automatizaciones/CAJA_PAGO_ARBITROS', { activa: true })).status).toBe(
      200,
    );
    expect(
      (await api('PATCH', '/caja/automatizaciones/CAJA_ALQUILER_CANCHAS', { activa: true })).status,
    ).toBe(200);
    expect((await api('PATCH', '/caja/automatizaciones/INEXISTENTE', { activa: true })).status).toBe(404);
    const jugar = async (id: string) => {
      const acta = (await api('GET', `/partidos/${id}`)).body;
      await api('POST', `/partidos/${id}/iniciar`, {});
      await api('POST', `/partidos/${id}/eventos`, {
        tipo: 'GOL',
        equipoId: acta.local.id,
        jugadorId: acta.local.jugadores[0].id,
        clientUuid: randomUUID(),
      });
      return api('POST', `/partidos/${id}/cerrar`, { firmaLocal: true, firmaVisitante: true });
    };
    expect((await jugar(p1!.id)).status).toBe(201);
    expect((await jugar(p2!.id)).status).toBe(201);
    const egresos = await consulta(
      "SELECT a.clave, a.descripcion, l.debe FROM asiento a JOIN linea_asiento l ON l.asiento_id = a.id WHERE a.tipo = 'EGRESO' AND l.debe > 0 ORDER BY a.clave",
    );
    expect(egresos.map((e) => [e.clave.split(':')[0], e.debe])).toEqual([
      ['arb', 12_000],
      ['cancha', 8_000],
    ]);
    expect(egresos[0].descripcion).toContain('Marcos Costa');
    const caja = (await api('GET', '/caja')).body;
    expect(caja.resultado.egresos).toBe(20_000);
    expect(caja.porRubro.map((r: { rubro: string; monto: number }) => [r.rubro, r.monto])).toEqual([
      ['CANCHAS', 8_000],
      ['ARBITROS', 12_000],
    ]);
  });

  it('el árbitro suma partidos dirigidos y lo pagado sale de la caja, ya descontadas las anulaciones', async () => {
    let lista = (await api('GET', '/arbitros')).body;
    const marcos = () => lista.find((a: { id: string }) => a.id === arb.marcos);
    expect(marcos()).toMatchObject({ dirigidos: 1, pagado: 12_000 });
    const [pago] = await consulta("SELECT id FROM asiento WHERE clave LIKE 'arb:%'");
    expect(
      (await api('POST', `/caja/movimientos/${pago.id}/anular`, { motivo: 'Lo pagó otro' })).status,
    ).toBe(201);
    lista = (await api('GET', '/arbitros')).body;
    expect(marcos().pagado).toBe(0);
  });

  it('sin la automatización encendida no se genera ningún cargo', async () => {
    await api('PATCH', '/caja/automatizaciones/CAJA_PAGO_ARBITROS', { activa: false });
    await api('PATCH', '/caja/automatizaciones/CAJA_ALQUILER_CANCHAS', { activa: false });
    const partidosF2 = (await api('GET', `/torneos/${torneoId}/partidos`)).body.filter(
      (p: { fecha: number }) => p.fecha === 2,
    );
    const antes = (await consulta("SELECT count(*)::int AS n FROM asiento WHERE tipo = 'EGRESO'"))[0].n;
    const p = partidosF2[0];
    await api('POST', `/partidos/${p.id}/arbitro`, { arbitroId: arb.marcos });
    const acta = (await api('GET', `/partidos/${p.id}`)).body;
    await api('POST', `/partidos/${p.id}/iniciar`, {});
    await api('POST', `/partidos/${p.id}/cerrar`, { firmaLocal: true, firmaVisitante: true });
    expect(acta.id).toBe(p.id);
    expect((await consulta("SELECT count(*)::int AS n FROM asiento WHERE tipo = 'EGRESO'"))[0].n).toBe(antes);
  });

  it('hay una alerta en el panel para los partidos de la semana sin árbitro', async () => {
    // Torneo con partidos mañana, sin árbitros designados.
    const otro = (
      await api('POST', '/torneos', {
        nombre: 'Mañana',
        modalidad: 'F5',
        formato: 'LIGA',
        cupo: 4,
        inscripcion: 0,
      })
    ).body.id;
    for (const n of ['M1', 'M2']) {
      const e = await api('POST', '/equipos', { nombre: n });
      await api('POST', `/torneos/${otro}/inscripciones`, { equipoId: e.body.id });
    }
    const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const fixture = await api('POST', `/torneos/${otro}/fixture`, {
      primerDia: manana,
      horarios: ['19:00'],
      canchaIds: [canchas[0]],
    });
    expect([fixture.status, fixture.body.mensaje]).toEqual([201, undefined]);
    const alerta = (await api('GET', '/panel/resumen')).body.alertas.find(
      (a: { tipo: string }) => a.tipo === 'SIN_ARBITRO',
    );
    expect(alerta).toMatchObject({ href: '/panel/arbitros' });
    expect(alerta.mensaje).toMatch(/1 partido\(s\) de la semana sin árbitro/);
  });

  it('otra liga no ve ni toca estos árbitros ni canchas', async () => {
    await otra('POST', '/auth/registro', {
      nombre: 'Otra',
      email: 'otra@arb.test',
      password: 'clave-segura-1',
      organizacion: 'Otra Liga',
    });
    expect((await otra('GET', '/arbitros')).body).toEqual([]);
    expect((await otra('PATCH', `/arbitros/${arb.marcos}`, { tarifa: 1 })).status).toBe(404);
    expect((await otra('PATCH', `/canchas/${canchas[0]}`, { bloqueada: true })).status).toBe(404);
    expect(
      (await otra('POST', `/partidos/${partidos[0]!.id}/arbitro`, { arbitroId: arb.marcos })).status,
    ).toBe(404);
  });
});
