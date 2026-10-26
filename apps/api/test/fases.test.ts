// Torneos por fases (ADR-026, E10-07/08) y llaves ida y vuelta (E10-03) de punta a punta.
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

const fase = (f: Record<string, unknown>) => ({
  inicio: 'DESPUES',
  ruedas: 1,
  grupos: { modo: 'CANTIDAD', valor: 2 },
  idaYVuelta: [false],
  cruces: 'SIEMBRA',
  ...f,
});

/** Grupos de 4, semis ida y vuelta (cruce entre grupos) con final única, y copa estímulo con los que no clasificaron. */
const formato = {
  fases: [
    fase({ id: 'f1', nombre: 'Fase de grupos', tipo: 'GRUPOS', entradas: [{ tipo: 'INSCRIPTOS' }] }),
    fase({
      id: 'f2',
      nombre: 'Playoffs',
      tipo: 'ELIMINACION',
      entradas: [{ tipo: 'PUESTOS', fase: 'f1', desde: 1, hasta: 2 }],
      idaYVuelta: [false, true],
      cruces: 'CRUZADO_ENTRE_GRUPOS',
    }),
    fase({
      id: 'f3',
      nombre: 'Copa estímulo',
      tipo: 'TODOS_CONTRA_TODOS',
      entradas: [{ tipo: 'NO_CLASIFICADOS', fase: 'f1' }],
      inicio: 'EN_PARALELO',
    }),
  ],
};

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

type Serie = {
  local: string;
  visitante: string;
  golesLocal: number | null;
  golesVisitante: number | null;
  penalesLocal: number | null;
  piernas: { id: string; pierna: number; local: string }[];
};

describe('torneo por fases', () => {
  const api = cliente();
  let torneoId: string;
  let canchas: string[];
  const equipos: { id: string; nombre: string }[] = [];
  const nombreDe = (id: string) => equipos.find((e) => e.id === id)?.nombre;
  const vista = async () => (await api('GET', `/torneos/${torneoId}/fases`)).body;
  const programacion = () => ({ primerDia: '2027-03-06', horarios: ['19:00', '20:00'], canchaIds: canchas });
  const fuerza = (id: string) => Number(nombreDe(id)!.slice(1));
  /** Juega los partidos pendientes de una fase: gana siempre el de menor número (E1 > E2 > …). */
  async function jugarFase(clave: string) {
    const f = (await vista()).fases.find((x: { clave: string }) => x.clave === clave);
    const partidos = (await api('GET', `/torneos/${torneoId}/partidos`)).body as {
      id: string;
      localId: string;
      visitanteId: string;
      estado: string;
    }[];
    const ids = new Set(f.partidos.map((p: { id: string }) => p.id));
    for (const p of partidos.filter((x) => ids.has(x.id) && x.estado === 'PROGRAMADO')) {
      const localGana = fuerza(p.localId) < fuerza(p.visitanteId);
      expect((await jugar(api, p.id, localGana ? 1 : 0, localGana ? 0 : 1)).status).toBe(201);
    }
  }

  it('crea el torneo desde el formato y rechaza un formato con errores', async () => {
    await api('POST', '/auth/registro', {
      nombre: 'Org',
      email: 'fases@test.com',
      password: 'clave-segura-1',
      organizacion: 'Liga Fases',
    });
    canchas = [
      (await api('POST', '/canchas', { sede: 'Complejo', nombre: 'Cancha 1' })).body.id,
      (await api('POST', '/canchas', { sede: 'Complejo', nombre: 'Cancha 2' })).body.id,
    ];
    const datos = { nombre: 'Apertura por fases', modalidad: 'F5', cupo: 8, inscripcion: 1000 };
    const malo = await api('POST', '/torneos/flexible', {
      ...datos,
      formato: { fases: [fase({ id: 'f1', nombre: 'Sin equipos', tipo: 'GRUPOS', entradas: [] })] },
    });
    expect(malo.status).toBe(422);
    expect(malo.body.mensaje).toMatch(/inscriptos/);
    const r = await api('POST', '/torneos/flexible', {
      ...datos,
      formato,
      cobrosPorFecha: { cuotaPorFecha: 500 },
    });
    expect(r.status).toBe(201);
    expect(r.body.formato).toBe('FLEXIBLE');
    torneoId = r.body.id;
    // El formulario común no crea torneos por fases, y el fixture fijo no aplica.
    expect((await api('POST', '/torneos', { ...datos, formato: 'FLEXIBLE' })).status).toBe(422);
    for (let i = 1; i <= 8; i++) {
      const e = await api('POST', '/equipos', { nombre: `E${i}` });
      for (let j = 1; j <= 3; j++)
        await api('POST', `/equipos/${e.body.id}/jugadores`, {
          nombre: `J${j}`,
          apellido: `E${i}`,
          numero: j,
        });
      const ins = await api('POST', `/torneos/${torneoId}/inscripciones`, { equipoId: e.body.id });
      await api('POST', `/cargos/${ins.body.cargo.id}/pagos`, { metodo: 'EFECTIVO', monto: 1000 });
      equipos.push({ id: e.body.id, nombre: `E${i}` });
    }
    expect((await api('POST', `/torneos/${torneoId}/fixture`, programacion())).status).toBe(422);
  });

  it('la fase 1 se genera con los inscriptos; las siguientes esperan', async () => {
    const v = await vista();
    expect(v.fases.map((f: { nombre: string; estado: string }) => [f.nombre, f.estado])).toEqual([
      ['Fase de grupos', 'PENDIENTE'],
      ['Playoffs', 'PENDIENTE'],
      ['Copa estímulo', 'PENDIENTE'],
    ]);
    expect(v.fases[0].puedeGenerar).toBe(true);
    expect(v.fases[1].motivo).toBe('Todavía no se generó Fase de grupos.');
    const f2 = await api('POST', `/torneos/${torneoId}/fases/${v.fases[1].id}/generar`, programacion());
    expect(f2.status).toBe(422);
    const f1 = await api('POST', `/torneos/${torneoId}/fases/${v.fases[0].id}/generar`, programacion());
    expect(f1.status).toBe(201);
    expect(f1.body).toEqual({ equipos: 8, partidos: 12 });
    const despues = await vista();
    expect(
      despues.fases[0].grupos.map((g: { grupo: string; tabla: { equipo: string }[] }) => [
        g.grupo,
        g.tabla.map((x) => x.equipo),
      ]),
    ).toEqual([
      ['A', ['E1', 'E4', 'E5', 'E8']],
      ['B', ['E2', 'E3', 'E6', 'E7']],
    ]);
    expect(despues.fases[1].motivo).toBe('Falta terminar Fase de grupos.');
  });

  it('al terminar la fase de grupos, los playoffs toman a los clasificados con cruce entre grupos', async () => {
    await jugarFase('f1');
    const v = await vista();
    expect(v.fases[0].estado).toBe('FINALIZADA');
    expect(v.fases[0].grupos[1].tabla.map((x: { equipo: string }) => x.equipo)).toEqual([
      'E2',
      'E3',
      'E6',
      'E7',
    ]);
    const r = await api('POST', `/torneos/${torneoId}/fases/${v.fases[1].id}/generar`, programacion());
    expect(r.body).toEqual({ equipos: 4, partidos: 4 });
    const llave = (await vista()).fases[1].llave;
    expect(
      llave.rondas.map((x: { nombre: string; idaYVuelta: boolean }) => [x.nombre, x.idaYVuelta]),
    ).toEqual([
      ['Semifinales', true],
      ['Final', false],
    ]);
    expect(llave.rondas[0].partidos.map((s: Serie) => `${s.local}-${s.visitante}`)).toEqual([
      'E1-E3',
      'E2-E4',
    ]);
    // La copa estímulo arranca con los que no clasificaron, sin esperar a los playoffs.
    const copa = await api('POST', `/torneos/${torneoId}/fases/${v.fases[2].id}/generar`, {
      ...programacion(),
      horarios: ['21:00'],
    });
    expect(copa.body).toEqual({ equipos: 4, partidos: 6 });
    const equiposCopa = (await vista()).fases[2].grupos[0].tabla
      .map((x: { equipo: string }) => x.equipo)
      .sort();
    expect(equiposCopa).toEqual(['E5', 'E6', 'E7', 'E8']);
  });

  it('ida y vuelta: la ida empatada no pide penales; la vuelta con el global empatado sí', async () => {
    const [s1, s2] = (await vista()).fases[1].llave.rondas[0].partidos as Serie[];
    // La ida se juega en la cancha del de peor semilla.
    expect(s1!.piernas.map((p) => [p.pierna, p.local])).toEqual([
      [1, 'E3'],
      [2, 'E1'],
    ]);
    expect((await jugar(api, s1!.piernas[0]!.id, 1, 0)).status).toBe(201); // E3 1-0 E1
    expect((await jugar(api, s2!.piernas[0]!.id, 1, 1)).status).toBe(201); // ida empatada: no pide penales
    const acta = (await api('GET', `/partidos/${s1!.piernas[1]!.id}`)).body;
    expect(acta.serie).toMatchObject({
      idaYVuelta: true,
      pierna: 2,
      ida: { golesLocal: 0, golesVisitante: 1 },
    });
    const sinPenales = await jugar(api, s1!.piernas[1]!.id, 1, 0); // E1 1-0 E3: global 1-1
    expect(sinPenales.status).toBe(422);
    expect(sinPenales.body.mensaje).toMatch(/penales/);
    const conPenales = await api('POST', `/partidos/${s1!.piernas[1]!.id}/cerrar`, {
      firmaLocal: true,
      firmaVisitante: true,
      penalesLocal: 4,
      penalesVisitante: 2,
    });
    expect(conPenales.status).toBe(201);
    expect((await jugar(api, s2!.piernas[1]!.id, 2, 0)).status).toBe(201); // E2 2-0 E4 (global 3-1)
    const llave = (await vista()).fases[1].llave;
    expect(
      llave.rondas[0].partidos.map((s: Serie) => [s.golesLocal, s.golesVisitante, s.penalesLocal]),
    ).toEqual([
      [1, 1, 4],
      [3, 1, null],
    ]);
    const final = llave.rondas[1].partidos[0] as Serie;
    expect([final.local, final.visitante, final.piernas.length]).toEqual(['E1', 'E2', 1]);
  });

  it('la final a partido único define al campeón y, con todas las fases jugadas, el torneo termina', async () => {
    const final = (await vista()).fases[1].llave.rondas[1].partidos[0] as Serie;
    expect((await jugar(api, final.piernas[0]!.id, 2, 1)).status).toBe(201);
    const v = await vista();
    expect(v.fases[1].llave.campeon.nombre).toBe('E1');
    expect(v.fases[1].estado).toBe('FINALIZADA');
    await jugarFase('f3');
    expect((await vista()).fases[2].estado).toBe('FINALIZADA');
    expect((await api('GET', `/torneos/${torneoId}`)).body.estado).toBe('FINALIZADO');
  });
});
