// Usuarios e invitaciones (E04-09), matriz de permisos por rol (E04-06) y panel del capitán (E19) de punta a punta.
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
type Api = ReturnType<typeof cliente>;

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

const tokenDe = (link: string) => link.split('/invitacion/')[1]!;

describe('usuarios, roles y panel del capitán', () => {
  const dueno = cliente();
  const otra = cliente();
  const roles: Record<string, Api> = {};
  let torneoId: string;
  const equipos: string[] = [];
  type P = { id: string; fecha: number; localId: string; visitanteId: string; estado: string };
  let expedienteMio: string;
  let expedienteAjeno: string;
  let jugadorConRoja: string;
  let nombreMio: string;

  it('prepara una liga con 4 equipos y una fecha jugada con una roja en cada partido', async () => {
    await dueno('POST', '/auth/registro', {
      nombre: 'Dueña',
      email: 'duena@test.com',
      password: 'clave-segura-1',
      organizacion: 'Liga Usuarios',
    });
    await otra('POST', '/auth/registro', {
      nombre: 'Otro',
      email: 'otro@test.com',
      password: 'clave-segura-2',
      organizacion: 'Otra Liga',
    });
    const canchas = [(await dueno('POST', '/canchas', { sede: 'Complejo', nombre: 'Cancha 1' })).body.id];
    torneoId = (
      await dueno('POST', '/torneos', {
        nombre: 'Torneo',
        modalidad: 'F5',
        formato: 'LIGA',
        cupo: 4,
        inscripcion: 0,
      })
    ).body.id;
    for (let i = 1; i <= 4; i++) {
      const e = await dueno('POST', '/equipos', { nombre: `E${i}` });
      equipos.push(e.body.id);
      for (let j = 1; j <= 3; j++)
        await dueno('POST', `/equipos/${e.body.id}/jugadores`, {
          nombre: `J${j}`,
          apellido: `E${i}`,
          numero: j,
        });
      await dueno('POST', `/torneos/${torneoId}/inscripciones`, { equipoId: e.body.id });
    }
    await dueno('POST', `/torneos/${torneoId}/fixture`, {
      primerDia: '2027-03-06',
      horarios: ['19:00', '20:00'],
      canchaIds: canchas,
    });
    const fecha1 = ((await dueno('GET', `/torneos/${torneoId}/partidos`)).body as P[]).filter(
      (x) => x.fecha === 1,
    );
    for (const p of fecha1) {
      const acta = (await dueno('GET', `/partidos/${p.id}`)).body;
      await dueno('POST', `/partidos/${p.id}/iniciar`, {});
      await dueno('POST', `/partidos/${p.id}/eventos`, {
        tipo: 'ROJA',
        equipoId: acta.local.id,
        jugadorId: acta.local.jugadores[0].id,
        minuto: 20,
        clientUuid: randomUUID(),
      });
      expect(
        (await dueno('POST', `/partidos/${p.id}/cerrar`, { firmaLocal: true, firmaVisitante: true })).status,
      ).toBe(201);
    }
    // El capitán va a ser del local del primer partido (tiene un expediente por roja); el otro expediente es ajeno.
    const t = (await dueno('GET', `/tribunal?torneoId=${torneoId}`)).body;
    const local = (await dueno('GET', `/partidos/${fecha1[0]!.id}`)).body.local;
    const mio = t.expedientes.find((e: { equipoId: string }) => e.equipoId === local.id);
    expedienteMio = mio.id;
    jugadorConRoja = mio.jugadorId;
    expedienteAjeno = t.expedientes.find((e: { equipoId: string }) => e.equipoId !== local.id).id;
    equipos.splice(equipos.indexOf(local.id), 1);
    equipos.unshift(local.id);
    nombreMio = local.nombre;
  });

  it('el dueño invita con un rol: link de un solo uso; el invitado crea su cuenta y queda con la membresía', async () => {
    const mala = await dueno('POST', '/usuarios/invitaciones', { email: 'cap@test.com', rol: 'CAPITAN' });
    expect(mala.status).toBe(403);
    expect(mala.body.mensaje).toMatch(/equipo/);
    expect(
      (await dueno('POST', '/usuarios/invitaciones', { email: 'x@test.com', rol: 'DUENO' })).status,
    ).toBe(400);

    const invitar = async (email: string, rol: string, extra: object = {}) => {
      const r = await dueno('POST', '/usuarios/invitaciones', { email, rol, nombre: rol, ...extra });
      expect(r.status).toBe(201);
      expect(r.body.link).toContain('/invitacion/');
      return tokenDe(r.body.link);
    };
    const tokens: Record<string, string> = {
      ADMINISTRADOR: await invitar('admin@test.com', 'ADMINISTRADOR'),
      TESORERO: await invitar('teso@test.com', 'TESORERO'),
      ARBITRO: await invitar('arbi@test.com', 'ARBITRO'),
      TRIBUNAL: await invitar('tribu@test.com', 'TRIBUNAL'),
      CAPITAN: await invitar('cap@test.com', 'CAPITAN', { equipoId: equipos[0] }),
    };
    const publico = cliente();
    const vista = await publico('GET', `/invitaciones/${tokens.CAPITAN}`);
    expect(vista.body).toMatchObject({
      organizacion: 'Liga Usuarios',
      rol: 'CAPITAN',
      equipo: nombreMio,
      estado: 'PENDIENTE',
      tieneCuenta: false,
    });
    expect((await publico('GET', '/invitaciones/no-existe')).status).toBe(404);

    for (const [rol, token] of Object.entries(tokens)) {
      roles[rol] = cliente();
      // Sin nombre, una cuenta nueva no se crea; con contraseña corta tampoco.
      expect(
        (await roles[rol]!('POST', `/invitaciones/${token}/aceptar`, { password: 'clave-segura-9' })).status,
      ).toBe(422);
      const ok = await roles[rol]!('POST', `/invitaciones/${token}/aceptar`, {
        nombre: `Persona ${rol}`,
        password: 'clave-segura-9',
      });
      expect(ok.status).toBe(200);
      expect((await roles[rol]!('GET', '/auth/yo')).body.rol).toBe(rol);
    }
    // El link es de un solo uso.
    expect(
      (await cliente()('POST', `/invitaciones/${tokens.TESORERO}/aceptar`, { password: 'clave-segura-9' }))
        .status,
    ).toBe(410);
  });

  it('reenviar cambia el link, anular lo invalida, y una cuenta existente entra con su contraseña', async () => {
    const r = await dueno('POST', '/usuarios/invitaciones', { email: 'otro@test.com', rol: 'ARBITRO' });
    const viejo = tokenDe(r.body.link);
    const re = await dueno('POST', `/usuarios/invitaciones/${r.body.id}/reenviar`);
    expect(re.status).toBe(200);
    const nuevo = tokenDe(re.body.link);
    expect(nuevo).not.toBe(viejo);
    expect((await cliente()('GET', `/invitaciones/${viejo}`)).status).toBe(404);
    const v = (await cliente()('GET', `/invitaciones/${nuevo}`)).body;
    expect(v.tieneCuenta).toBe(true);
    // Contraseña equivocada: no entra.
    expect(
      (await cliente()('POST', `/invitaciones/${nuevo}/aceptar`, { password: 'otra-clave-x' })).status,
    ).toBe(422);

    const anulable = await dueno('POST', '/usuarios/invitaciones', {
      email: 'nadie@test.com',
      rol: 'TRIBUNAL',
    });
    expect((await dueno('POST', `/usuarios/invitaciones/${anulable.body.id}/anular`)).status).toBe(200);
    expect(
      (
        await cliente()('POST', `/invitaciones/${tokenDe(anulable.body.link)}/aceptar`, {
          nombre: 'N',
          password: 'clave-segura-9',
        })
      ).status,
    ).toBe(410);

    const rechazable = await dueno('POST', '/usuarios/invitaciones', {
      email: 'rech@test.com',
      rol: 'TRIBUNAL',
    });
    expect((await cliente()('POST', `/invitaciones/${tokenDe(rechazable.body.link)}/rechazar`)).status).toBe(
      200,
    );

    const u = (await dueno('GET', '/usuarios')).body;
    expect(u.miembros).toHaveLength(6);
    const estados = Object.fromEntries(
      u.invitaciones.map((i: { email: string; estado: string }) => [i.email, i.estado]),
    );
    expect(estados).toMatchObject({
      'otro@test.com': 'PENDIENTE',
      'nadie@test.com': 'ANULADA',
      'rech@test.com': 'RECHAZADA',
      'cap@test.com': 'ACEPTADA',
    });
    expect(u.miembros.find((m: { rol: string }) => m.rol === 'CAPITAN').equipo).toBe(nombreMio);
    // Ya es miembro: no se lo vuelve a invitar.
    expect(
      (await dueno('POST', '/usuarios/invitaciones', { email: 'teso@test.com', rol: 'ARBITRO' })).status,
    ).toBe(409);
  });

  it('matriz de permisos: cada rol hace solo lo suyo (E04-06)', async () => {
    const [tes, arb, tri, adm, cap] = ['TESORERO', 'ARBITRO', 'TRIBUNAL', 'ADMINISTRADOR', 'CAPITAN'].map(
      (r) => roles[r]!,
    ) as [Api, Api, Api, Api, Api];
    const st = async (api: Api, m: string, ruta: string, cuerpo?: unknown) =>
      (await api(m, ruta, cuerpo)).status;
    // Tesorero: caja sí; fixture, sanciones y usuarios no.
    expect(await st(tes, 'GET', '/caja')).toBe(200);
    expect(
      await st(tes, 'POST', '/torneos', {
        nombre: 'X',
        modalidad: 'F5',
        formato: 'LIGA',
        cupo: 4,
        inscripcion: 0,
      }),
    ).toBe(403);
    expect(
      await st(tes, 'POST', `/expedientes/${expedienteMio}/resolver`, { partidos: 1, resolucion: 'abc' }),
    ).toBe(403);
    expect(await st(tes, 'GET', '/usuarios')).toBe(403);
    // Árbitro: ve torneos y carga actas; no ve la caja ni registra pagos.
    expect(await st(arb, 'GET', '/torneos')).toBe(200);
    expect(await st(arb, 'GET', '/caja')).toBe(403);
    expect(await st(arb, 'POST', '/cargos/x/pagos', { metodo: 'EFECTIVO', monto: 1 })).toBe(403);
    // Tribunal: expedientes sí, caja y fixture no.
    expect(await st(tri, 'GET', `/tribunal?torneoId=${torneoId}`)).toBe(200);
    expect(await st(tri, 'GET', '/caja')).toBe(403);
    expect(await st(tri, 'POST', `/torneos/${torneoId}/fixture`, {})).toBe(403);
    // Administrador: invita roles operativos, no a un tesorero; no retira plata.
    expect(await st(adm, 'GET', '/usuarios')).toBe(200);
    expect(await st(adm, 'POST', '/usuarios/invitaciones', { email: 'a2@test.com', rol: 'TESORERO' })).toBe(
      403,
    );
    expect(await st(adm, 'POST', '/usuarios/invitaciones', { email: 'a3@test.com', rol: 'ARBITRO' })).toBe(
      201,
    );
    expect(await st(adm, 'POST', '/caja/retiros', { monto: 1, destino: 'x' })).toBe(403);
    // Administrador: registra y anula pagos (decisión del dueño); el tribunal no.
    expect((await adm('GET', '/auth/yo')).body.permisos).toContain('cobro.registrar');
    expect(await st(adm, 'POST', '/cargos/x/pagos', { metodo: 'EFECTIVO', monto: 1 })).not.toBe(403);
    expect(await st(adm, 'POST', '/pagos/x/anular', { motivo: 'Mal cargado' })).not.toBe(403);
    expect(await st(tri, 'POST', '/cargos/x/pagos', { metodo: 'EFECTIVO', monto: 1 })).toBe(403);
    // Capitán: ni el panel del organizador, ni la lista de equipos, ni otros equipos, ni la caja.
    for (const ruta of [
      '/torneos',
      '/equipos',
      `/equipos/${equipos[1]}`,
      '/panel/resumen',
      '/caja',
      '/usuarios',
      '/tribunal',
      '/documentacion',
    ])
      expect(await st(cap, 'GET', ruta), ruta).toBe(403);
    expect(await st(cap, 'GET', '/capitan')).toBe(200);
    expect(await st(cap, 'GET', '/auth/yo')).toBe(200);
    // El organizador no tiene panel de capitán (no maneja un equipo).
    expect(await st(dueno, 'GET', '/capitan')).toBe(403);
  });

  it('el capitán ve su equipo: próximo partido, tabla, plantel, documentación, sanciones y deudas', async () => {
    const cap = roles.CAPITAN!;
    const r = (await cap('GET', '/capitan')).body;
    expect(r.equipo.nombre).toBe(nombreMio);
    expect(r.capitan).toBe('Persona CAPITAN');
    expect(r.torneo.nombre).toBe('Torneo');
    expect(r.tabla).toHaveLength(4);
    expect(r.tabla.filter((f: { propio: boolean }) => f.propio)).toHaveLength(1);
    expect(r.proximo.fecha).toBe(2);
    expect(r.plantel).toHaveLength(3);
    const suspendido = r.plantel.find((j: { jugadorId: string }) => j.jugadorId === jugadorConRoja);
    expect(suspendido).toMatchObject({ habilitado: false, convocatoria: 'SUSPENDIDO' });
    expect(r.convocatoria).toMatchObject({ va: 0, pendientes: 2, suspendidos: 1, convocables: 2 });
    expect(r.sanciones).toHaveLength(1);
    expect(r.expedientes.map((e: { id: string }) => e.id)).toEqual([expedienteMio]);
    expect(r.deudas).toMatchObject({ total: 0, cargos: [] });
    // Nada de otros equipos.
    expect(JSON.stringify(r)).not.toContain(expedienteAjeno);
  });

  it('altas y bajas del plantel respetando las reglas (número repetido, DNI, actas del torneo en curso)', async () => {
    const cap = roles.CAPITAN!;
    expect(
      (await cap('POST', '/capitan/plantel', { nombre: 'Nuevo', apellido: 'Uno', numero: 1 })).status,
    ).toBe(409);
    const alta = await cap('POST', '/capitan/plantel', {
      nombre: 'Nuevo',
      apellido: 'Uno',
      numero: 10,
      dni: '30.111.222',
    });
    expect(alta.status).toBe(201);
    expect((await cap('POST', '/capitan/plantel', { nombre: 'A', apellido: 'B', dni: '12' })).status).toBe(
      400,
    );
    let r = (await cap('GET', '/capitan')).body;
    expect(r.plantel).toHaveLength(4);
    // El de la roja figura en el acta del torneo en curso: el capitán no lo puede dar de baja.
    const conRoja = await cap('POST', `/capitan/plantel/${jugadorConRoja}/baja`);
    expect(conRoja.status).toBe(409);
    expect((await cap('POST', `/capitan/plantel/${alta.body.jugadorId}/baja`)).status).toBe(200);
    r = (await cap('GET', '/capitan')).body;
    expect(r.plantel).toHaveLength(3);
    // Un jugador de otro equipo no existe para el capitán.
    const ajeno = (await dueno('GET', `/equipos/${equipos[1]}`)).body.plantel[1].jugadorId;
    expect((await cap('POST', `/capitan/plantel/${ajeno}/baja`)).status).toBe(404);
  });

  it('convocatoria: confirma, rechaza y vuelve a pendiente; solo partidos y jugadores propios', async () => {
    const cap = roles.CAPITAN!;
    const r = (await cap('GET', '/capitan')).body;
    const [a, b] = r.plantel.filter((j: { convocatoria: string }) => j.convocatoria === 'PENDIENTE');
    const ruta = `/capitan/partidos/${r.proximo.id}/convocatoria`;
    expect((await cap('POST', ruta, { jugadorId: a.jugadorId, respuesta: 'VA' })).status).toBe(200);
    expect((await cap('POST', ruta, { jugadorId: b.jugadorId, respuesta: 'NO_VA' })).status).toBe(200);
    let c = (await cap('GET', '/capitan')).body.convocatoria;
    expect(c).toMatchObject({ va: 1, noVa: 1, pendientes: 0 });
    await cap('POST', ruta, { jugadorId: b.jugadorId, respuesta: 'PENDIENTE' });
    c = (await cap('GET', '/capitan')).body.convocatoria;
    expect(c).toMatchObject({ va: 1, noVa: 0, pendientes: 1 });
    const partidos = (await dueno('GET', `/torneos/${torneoId}/partidos`)).body as P[];
    const ajeno = partidos.find(
      (p) => p.localId !== equipos[0] && p.visitanteId !== equipos[0] && p.estado === 'PROGRAMADO',
    )!;
    expect(
      (
        await cap('POST', `/capitan/partidos/${ajeno.id}/convocatoria`, {
          jugadorId: a.jugadorId,
          respuesta: 'VA',
        })
      ).status,
    ).toBe(404);
  });

  it('descargo del capitán en el expediente de su equipo (y nunca en uno ajeno)', async () => {
    const cap = roles.CAPITAN!;
    expect(
      (await cap('POST', `/capitan/expedientes/${expedienteAjeno}/descargo`, { descargo: 'No fue así.' }))
        .status,
    ).toBe(404);
    expect(
      (
        await cap('POST', `/capitan/expedientes/${expedienteMio}/descargo`, {
          descargo: 'Fue pelota dividida.',
        })
      ).status,
    ).toBe(200);
    const t = (await dueno('GET', `/tribunal?torneoId=${torneoId}`)).body;
    expect(t.expedientes.find((e: { id: string }) => e.id === expedienteMio).descargo).toBe(
      'Fue pelota dividida.',
    );
  });

  it('quitar acceso: nunca al último dueño; el capitán sin membresía deja de ver su equipo al instante', async () => {
    const u = (await dueno('GET', '/usuarios')).body;
    const yo = u.miembros.find((m: { rol: string }) => m.rol === 'DUENO');
    expect(yo.quitar.ok).toBe(false);
    expect((await dueno('POST', `/usuarios/miembros/${yo.id}/quitar`)).status).toBe(403);
    // El administrador no puede quitar a un tesorero.
    const teso = u.miembros.find((m: { rol: string }) => m.rol === 'TESORERO');
    expect((await roles.ADMINISTRADOR!('POST', `/usuarios/miembros/${teso.id}/quitar`)).status).toBe(403);
    const cap = u.miembros.find((m: { rol: string }) => m.rol === 'CAPITAN');
    expect((await roles.ADMINISTRADOR!('POST', `/usuarios/miembros/${cap.id}/quitar`)).status).toBe(200);
    expect((await roles.CAPITAN!('GET', '/capitan')).status).toBe(403);
    // Otra organización no ve ni toca los usuarios de esta.
    expect((await otra('POST', `/usuarios/miembros/${teso.id}/quitar`)).status).toBe(404);
    expect((await otra('GET', '/usuarios')).body.miembros).toHaveLength(1);
  });

  it('una cuenta existente que acepta queda en la organización que la invitó, con sus permisos (F18, F20)', async () => {
    const inv = (await dueno('GET', '/usuarios')).body.invitaciones.find(
      (i: { email: string; estado: string }) => i.email === 'otro@test.com' && i.estado === 'PENDIENTE',
    );
    const link = (await dueno('POST', `/usuarios/invitaciones/${inv.id}/reenviar`)).body.link;
    const invitado = cliente();
    const ok = await invitado('POST', `/invitaciones/${tokenDe(link)}/aceptar`, {
      password: 'clave-segura-2',
    });
    expect(ok.status).toBe(200);
    const yo = (await invitado('GET', '/auth/yo')).body;
    expect(yo.organizacion.id).toBe((await dueno('GET', '/auth/yo')).body.organizacion.id);
    expect(yo.rol).toBe('ARBITRO');
    expect(yo.permisos).toEqual(['torneo.leer', 'partido.acta', 'expediente.informe']);
    expect(yo.organizacion.mpConectado).toBe(false);
  });
});
