// Llaves y playoffs (E10) de punta a punta: copa, liga + playoffs y grupos + playoffs.
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
type Api = ReturnType<typeof cliente>;

beforeAll(async () => {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL_ADMIN });
  await db.connect();
  const { rows } = await db.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
  );
  await db.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} CASCADE`);
  await db.end();
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  await app.listen(0);
  base = (await app.getUrl()).replace('[::1]', 'localhost');
});

afterAll(async () => {
  await app?.close();
});

interface Escenario {
  api: Api;
  canchas: string[];
  equipos: { id: string; nombre: string }[];
  torneoId: string;
}

let contador = 0;
/** Una liga nueva con `n` equipos con plantel, inscriptos y pagos, y un torneo del formato pedido. */
async function armar(formato: string, n: number): Promise<Escenario> {
  const api = cliente();
  const k = ++contador;
  await api('POST', '/auth/registro', {
    nombre: 'Org',
    email: `org${k}@test.com`,
    password: 'clave-segura-1',
    organizacion: `Liga ${k}`,
  });
  const canchas = [
    (await api('POST', '/canchas', { sede: 'Complejo', nombre: 'Cancha 1' })).body.id,
    (await api('POST', '/canchas', { sede: 'Complejo', nombre: 'Cancha 2' })).body.id,
  ];
  const torneo = await api('POST', '/torneos', {
    nombre: `Torneo ${k}`,
    modalidad: 'F5',
    formato,
    cupo: 16,
    inscripcion: 1000,
  });
  const equipos: Escenario['equipos'] = [];
  for (let i = 1; i <= n; i++) {
    const e = await api('POST', '/equipos', { nombre: `E${i}` });
    for (let j = 1; j <= 3; j++)
      await api('POST', `/equipos/${e.body.id}/jugadores`, { nombre: `J${j}`, apellido: `E${i}`, numero: j });
    const ins = await api('POST', `/torneos/${torneo.body.id}/inscripciones`, { equipoId: e.body.id });
    await api('POST', `/cargos/${ins.body.cargo.id}/pagos`, { metodo: 'EFECTIVO', monto: 1000 });
    equipos.push({ id: e.body.id, nombre: `E${i}` });
  }
  return { api, canchas, equipos, torneoId: torneo.body.id };
}

const franjas = (canchaIds: string[]) => ({
  primerDia: '2027-03-06',
  horarios: ['19:00', '20:00'],
  canchaIds,
});

/** Juega un partido por la API con el marcador dado (el equipo local mete `gl` goles y el visitante `gv`). */
async function jugar(
  api: Api,
  partidoId: string,
  gl: number,
  gv: number,
  cierre: Record<string, unknown> = {},
) {
  const acta = (await api('GET', `/partidos/${partidoId}`)).body;
  await api('POST', `/partidos/${partidoId}/iniciar`);
  for (const [lado, goles] of [
    [acta.local, gl],
    [acta.visitante, gv],
  ] as const)
    for (let i = 0; i < goles; i++)
      await api('POST', `/partidos/${partidoId}/eventos`, {
        tipo: 'GOL',
        equipoId: lado.id,
        jugadorId: lado.jugadores[0].id,
        minuto: 5 + i,
        clientUuid: randomUUID(),
      });
  return api('POST', `/partidos/${partidoId}/cerrar`, { firmaLocal: true, firmaVisitante: true, ...cierre });
}

type P = {
  id: string;
  clave: string | null;
  fase: string;
  localId: string;
  visitanteId: string;
  estado: string;
};
const partidos = async (e: Escenario) => (await e.api('GET', `/torneos/${e.torneoId}/partidos`)).body as P[];
const deLlave = async (e: Escenario) => (await partidos(e)).filter((p) => p.fase === 'LLAVE');
const idDe = (e: Escenario, nombre: string) => e.equipos.find((x) => x.nombre === nombre)!.id;

/** Juega todos los partidos de la fase regular: gana siempre el de menor número (E1 > E2 > …). */
async function jugarFaseRegular(e: Escenario) {
  const fuerza = new Map(e.equipos.map((x, i) => [x.id, i]));
  for (const p of (await partidos(e)).filter((x) => x.fase !== 'LLAVE')) {
    const localGana = fuerza.get(p.localId)! < fuerza.get(p.visitanteId)!;
    await jugar(e.api, p.id, localGana ? 1 : 0, localGana ? 0 : 1);
  }
}

describe('copa con cabezas de serie', () => {
  let e: Escenario;

  it('no tiene fase de liga ni se puede generar la llave en un torneo de liga', async () => {
    e = await armar('COPA', 6);
    expect((await e.api('POST', `/torneos/${e.torneoId}/fixture`, franjas(e.canchas))).status).toBe(422);
    const liga = await armar('LIGA', 4);
    expect((await liga.api('POST', `/torneos/${liga.torneoId}/llaves`, franjas(liga.canchas))).status).toBe(
      422,
    );
  });

  it('el sorteo es reproducible y las cabezas de serie pasan libres con 6 equipos', async () => {
    const r = await e.api('POST', `/torneos/${e.torneoId}/llaves`, {
      ...franjas(e.canchas),
      cabezasDeSerie: [idDe(e, 'E5'), idDe(e, 'E2')],
      semilla: 42,
    });
    expect(r.body).toEqual({ equipos: 6, partidosCreados: 2 });
    const creados = await deLlave(e);
    const juegan = new Set(creados.flatMap((p) => [p.localId, p.visitanteId]));
    expect(juegan.has(idDe(e, 'E5'))).toBe(false);
    expect(juegan.has(idDe(e, 'E2'))).toBe(false);

    // Con la misma semilla, el mismo sorteo: rehacerla deja los mismos cruces.
    const antes = creados.map((p) => `${p.clave}:${p.localId}-${p.visitanteId}`).sort();
    await e.api('POST', `/torneos/${e.torneoId}/llaves`, {
      ...franjas(e.canchas),
      cabezasDeSerie: [idDe(e, 'E5'), idDe(e, 'E2')],
      semilla: 42,
    });
    expect((await deLlave(e)).map((p) => `${p.clave}:${p.localId}-${p.visitanteId}`).sort()).toEqual(antes);
  });

  it('muestra la llave con rondas, ganadores a definir y sin campeón', async () => {
    const l = (await e.api('GET', `/torneos/${e.torneoId}/llave`)).body;
    expect(l.rondas.map((r: { nombre: string }) => r.nombre)).toEqual([
      'Cuartos de final',
      'Semifinales',
      'Final',
    ]);
    expect(l.rondas[0].partidos).toHaveLength(2);
    expect(l.rondas[2].partidos[0].local).toBe('Ganador de semifinales 1');
    expect(l.campeon).toBeNull();
  });

  it('un empate exige penales distintos; con penales, el ganador avanza y se crea el próximo cruce', async () => {
    const [a, b] = await deLlave(e);
    const sinPenales = await jugar(e.api, a!.id, 1, 1);
    expect(sinPenales.status).toBe(422);
    expect(sinPenales.body.mensaje).toMatch(/penales/);
    const iguales = await e.api('POST', `/partidos/${a!.id}/cerrar`, {
      firmaLocal: true,
      firmaVisitante: true,
      penalesLocal: 3,
      penalesVisitante: 3,
    });
    expect(iguales.status).toBe(422);
    const ok = await e.api('POST', `/partidos/${a!.id}/cerrar`, {
      firmaLocal: true,
      firmaVisitante: true,
      penalesLocal: 2,
      penalesVisitante: 4,
    });
    expect(ok.status).toBe(201);
    // El ganador (el visitante, por penales) ya tiene su semifinal contra la cabeza de serie.
    const semi = (await deLlave(e)).filter((p) => p.clave?.startsWith('2-'));
    expect(semi).toHaveLength(1);
    expect(semi[0]!.visitanteId === a!.visitanteId || semi[0]!.localId === a!.visitanteId).toBe(true);

    const l = (await e.api('GET', `/torneos/${e.torneoId}/llave`)).body;
    const cruce = l.rondas[0].partidos.find((p: { clave: string }) => p.clave === a!.clave);
    expect(cruce).toMatchObject({ golesLocal: 1, golesVisitante: 1, penalesLocal: 2, penalesVisitante: 4 });
    expect(cruce.ganadorId).toBe(a!.visitanteId);
    await jugar(e.api, b!.id, 2, 0);
  });

  it('no se puede rehacer la llave con partidos jugados', async () => {
    const r = await e.api('POST', `/torneos/${e.torneoId}/llaves`, franjas(e.canchas));
    expect(r.status).toBe(409);
  });

  it('un W.O. también hace avanzar al ganador y la final define al campeón', async () => {
    const semis = (await deLlave(e)).filter((p) => p.clave?.startsWith('2-'));
    expect(semis).toHaveLength(2);
    const [s1, s2] = semis;
    expect((await e.api('POST', `/partidos/${s1!.id}/wo`, { ganadorId: s1!.localId })).status).toBe(201);
    expect((await jugar(e.api, s2!.id, 0, 1)).status).toBe(201);
    const final = (await deLlave(e)).find((p) => p.clave === '3-1')!;
    expect(final).toBeDefined();
    expect(final.localId).toBe(s1!.localId);
    expect(final.visitanteId).toBe(s2!.visitanteId);
    await jugar(e.api, final.id, 3, 2);
    const l = (await e.api('GET', `/torneos/${e.torneoId}/llave`)).body;
    expect(l.campeon.id).toBe(final.localId);
    expect((await e.api('GET', `/torneos/${e.torneoId}`)).body.estado).toBe('FINALIZADO');
  });

  it('los cruces de llave no suman puntos a la tabla, pero los goles cuentan para los goleadores', async () => {
    const est = (await e.api('GET', `/torneos/${e.torneoId}/estadisticas`)).body;
    expect(est.tabla.every((f: { pts: number }) => f.pts === 0)).toBe(true);
    expect(est.goleadores.length).toBeGreaterThan(0);
  });
});

describe('liga + playoffs', () => {
  let e: Escenario;

  it('no deja generar la llave hasta terminar la fase regular', async () => {
    e = await armar('LIGA_PLAYOFFS', 4);
    expect((await e.api('POST', `/torneos/${e.torneoId}/llaves`, franjas(e.canchas))).body.mensaje).toMatch(
      /Primero generá el fixture/,
    );
    await e.api('POST', `/torneos/${e.torneoId}/fixture`, franjas(e.canchas));
    const pend = await e.api('POST', `/torneos/${e.torneoId}/llaves`, franjas(e.canchas));
    expect(pend.status).toBe(422);
    expect(pend.body.mensaje).toMatch(/faltan jugar 6 partidos/);
  });

  it('clasifican los primeros de la tabla y se cruzan 1º con 4º y 2º con 3º', async () => {
    await jugarFaseRegular(e);
    const r = await e.api('POST', `/torneos/${e.torneoId}/llaves`, franjas(e.canchas));
    expect(r.body).toEqual({ equipos: 4, partidosCreados: 2 });
    const cruces = (await deLlave(e)).map((p) => [p.localId, p.visitanteId].sort().join('|')).sort();
    const esperado = [
      [idDe(e, 'E1'), idDe(e, 'E4')].sort().join('|'),
      [idDe(e, 'E2'), idDe(e, 'E3')].sort().join('|'),
    ].sort();
    expect(cruces).toEqual(esperado);
  });

  it('las rondas siguen la numeración de fechas de la fase regular', async () => {
    const fechas = (await e.api('GET', `/torneos/${e.torneoId}/partidos`)).body.filter(
      (p: P & { fecha: number }) => p.fase === 'LLAVE',
    );
    expect(fechas.every((p: { fecha: number }) => p.fecha === 4)).toBe(true); // 3 fechas de liga + ronda 1
  });

  it('se puede pedir menos clasificados', async () => {
    const r = await e.api('POST', `/torneos/${e.torneoId}/llaves`, {
      ...franjas(e.canchas),
      clasificados: 2,
    });
    expect(r.body).toEqual({ equipos: 2, partidosCreados: 1 });
    expect((await deLlave(e)).map((p) => [p.localId, p.visitanteId].sort().join('|'))).toEqual([
      [idDe(e, 'E1'), idDe(e, 'E2')].sort().join('|'),
    ]);
  });
});

describe('grupos + playoffs', () => {
  let e: Escenario;

  it('reparte los equipos en grupos y arma el fixture de cada uno', async () => {
    e = await armar('GRUPOS_PLAYOFFS', 8);
    const r = await e.api('POST', `/torneos/${e.torneoId}/fixture`, { ...franjas(e.canchas), grupos: 2 });
    expect(r.body).toEqual({ partidos: 12, fechas: 3 }); // 2 grupos de 4: 6 partidos cada uno
    const ps = (await e.api('GET', `/torneos/${e.torneoId}/partidos`)).body as (P & { grupo: string })[];
    expect(ps.every((p) => p.fase === 'GRUPOS' && ['A', 'B'].includes(p.grupo))).toBe(true);
    // Serpentina: el grupo A tiene E1, E4, E5, E8.
    const delA = new Set(ps.filter((p) => p.grupo === 'A').flatMap((p) => [p.localId, p.visitanteId]));
    expect([...delA].sort()).toEqual(['E1', 'E4', 'E5', 'E8'].map((n) => idDe(e, n)).sort());
  });

  it('rechaza grupos con pocos equipos', async () => {
    const chico = await armar('GRUPOS_PLAYOFFS', 4);
    const r = await chico.api('POST', `/torneos/${chico.torneoId}/fixture`, {
      ...franjas(chico.canchas),
      grupos: 2,
    });
    expect(r.status).toBe(422);
    expect(r.body.mensaje).toMatch(/al menos 6/);
  });

  it('calcula una tabla por grupo', async () => {
    await jugarFaseRegular(e);
    const est = (await e.api('GET', `/torneos/${e.torneoId}/estadisticas`)).body;
    expect(est.grupos.map((g: { grupo: string }) => g.grupo)).toEqual(['A', 'B']);
    expect(est.grupos[0].tabla.map((f: { equipo: string }) => f.equipo)).toEqual(['E1', 'E4', 'E5', 'E8']);
    expect(est.grupos[1].tabla.map((f: { equipo: string }) => f.equipo)).toEqual(['E2', 'E3', 'E6', 'E7']);
  });

  it('avanzan 2 por grupo en cruce cruzado: 1A-2B y 1B-2A', async () => {
    const r = await e.api('POST', `/torneos/${e.torneoId}/llaves`, franjas(e.canchas));
    expect(r.body).toEqual({ equipos: 4, partidosCreados: 2 });
    const cruces = (await deLlave(e)).map((p) => [p.localId, p.visitanteId].sort().join('|')).sort();
    const esperado = [
      [idDe(e, 'E1'), idDe(e, 'E3')].sort().join('|'), // 1ºA contra 2ºB
      [idDe(e, 'E2'), idDe(e, 'E4')].sort().join('|'), // 1ºB contra 2ºA
    ].sort();
    expect(cruces).toEqual(esperado);
  });

  it('el sitio público muestra grupos y llave sin datos personales', async () => {
    const pub = cliente();
    const slug = (await e.api('GET', '/auth/yo')).body.organizacion.slug;
    const torneoSlug = (await e.api('GET', `/torneos/${e.torneoId}`)).body.slug;
    const r = await pub('GET', `/publico/${slug}/${torneoSlug}`);
    expect(r.body.grupos).toHaveLength(2);
    expect(r.body.llave.rondas[0].partidos).toHaveLength(2);
    expect(JSON.stringify(r.body)).not.toMatch(/@test\.com/);
  });
});
