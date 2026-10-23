// Comunicación (E16) de punta a punta: consentimientos, canal por destinatario, costo, topes del plan, envíos programados,
// automatizaciones, aviso de entrega y aislamiento entre ligas.
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
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
import { MensajeriaService } from '../dist/mensajeria/mensajeria.js';

let app: INestApplication;
let base: string;
let admin: pg.Client;
let servicio: {
  procesarProgramadas(ahora: Date): Promise<number>;
  ejecutarAutomatizaciones(ahora: Date): Promise<number>;
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
  servicio = app.get(MensajeriaService);
}, 60_000);

afterAll(async () => {
  await app?.close();
  await admin?.end();
});

const consulta = async (sql: string, params: unknown[] = []) => (await admin.query(sql, params)).rows;

describe('comunicación', () => {
  const api = cliente();
  const otra = cliente();
  let torneoId: string;
  let canchaId: string;
  const eq: Record<string, string> = {};

  it('prepara una liga con capitanes con distintos consentimientos y deudas', async () => {
    await api('POST', '/auth/registro', {
      nombre: 'Org',
      email: 'org@com.test',
      password: 'clave-segura-1',
      organizacion: 'Liga Com',
    });
    canchaId = (await api('POST', '/canchas', { sede: 'Complejo', nombre: 'Cancha 1' })).body.id;
    torneoId = (
      await api('POST', '/torneos', {
        nombre: 'Copa Com',
        modalidad: 'F5',
        formato: 'LIGA',
        cupo: 8,
        inscripcion: 1000,
      })
    ).body.id;
    const equipos = [
      // A: acepta WhatsApp, tiene todo. B: no acepta, tiene email. C: sin ningún dato. D: acepta, solo teléfono.
      {
        n: 'A',
        capitanNombre: 'Ana',
        capitanEmail: 'ana@x.com',
        capitanTelefono: '3564000001',
        capitanOptInWhatsapp: true,
      },
      { n: 'B', capitanNombre: 'Beto', capitanEmail: 'beto@x.com', capitanTelefono: '3564000002' },
      { n: 'C', capitanNombre: 'Caro' },
      { n: 'D', capitanNombre: 'Dani', capitanTelefono: '3564000004', capitanOptInWhatsapp: true },
    ];
    for (const { n, ...datos } of equipos) {
      const e = await api('POST', '/equipos', { nombre: `Equipo ${n}`, ...datos });
      expect(e.status).toBe(201);
      eq[n] = e.body.id;
      for (let j = 1; j <= 3; j++)
        await api('POST', `/equipos/${e.body.id}/jugadores`, { nombre: `J${j}`, apellido: n, numero: j });
      const ins = await api('POST', `/torneos/${torneoId}/inscripciones`, { equipoId: e.body.id });
      // A y D pagan; B y C quedan debiendo.
      if (n === 'A' || n === 'D')
        await api('POST', `/cargos/${ins.body.cargo.id}/pagos`, { metodo: 'EFECTIVO', monto: 1000 });
    }
  });

  it('el catálogo marca qué plantillas se pueden mandar a mano', async () => {
    const r = await api('GET', '/comunicacion/plantillas');
    const manuales = r.body
      .filter((p: { manual: boolean }) => p.manual)
      .map((p: { clave: string }) => p.clave);
    expect(manuales.sort()).toEqual(['FIXTURE_PUBLICADO', 'LIBRE', 'RECORDATORIO_PAGO']);
    expect(r.body.find((p: { clave: string }) => p.clave === 'CONTINGENCIA').variables).toContain(
      'link_confirmacion',
    );
  });

  it('vista previa: WhatsApp solo con consentimiento, el resto baja a email o queda omitido, y se ve el costo', async () => {
    const r = await api('POST', '/comunicacion/vista-previa', {
      plantilla: 'FIXTURE_PUBLICADO',
      canal: 'WHATSAPP',
      segmento: { tipo: 'TORNEO', torneoId },
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      destinatarios: 4,
      entregas: 3,
      porCanal: { WHATSAPP: 2, EMAIL: 1, PUSH: 0 },
      cambiosDeCanal: 1,
      costoUsd: 0.052,
    });
    expect(r.body.omitidos).toEqual([
      { equipo: 'Equipo C', capitan: 'Caro', motivo: 'No aceptó WhatsApp y no tiene email.' },
    ]);
    expect(r.body.ejemplo).toMatchObject({ para: 'Ana', canal: 'WHATSAPP' });
    expect(r.body.ejemplo.cuerpo).toContain('Hola Ana!');
    expect(r.body.tope).toMatchObject({ tope: 200, usados: 0 });
  });

  it('por email no cuesta nada, y un mensaje libre de marketing cuesta más que uno de utilidad', async () => {
    const email = await api('POST', '/comunicacion/vista-previa', {
      plantilla: 'FIXTURE_PUBLICADO',
      canal: 'EMAIL',
      segmento: { tipo: 'TORNEO', torneoId },
    });
    expect(email.body.costoUsd).toBe(0);
    const libre = await api('POST', '/comunicacion/vista-previa', {
      plantilla: 'LIBRE',
      canal: 'WHATSAPP',
      segmento: { tipo: 'TODOS' },
      texto: 'Hola {capitán}, este sábado hay asado en el club.',
    });
    expect(libre.body.costoUsd).toBe(0.12); // 2 WhatsApp de marketing
    expect(libre.body.ejemplo.cuerpo).toBe('Hola Ana, este sábado hay asado en el club.');
  });

  it('un mensaje libre con variables que no existen se rechaza', async () => {
    const r = await api('POST', '/comunicacion/vista-previa', {
      plantilla: 'LIBRE',
      canal: 'EMAIL',
      segmento: { tipo: 'TODOS' },
      texto: 'Pagá acá: {link_pago}',
    });
    expect(r.status).toBe(422);
    expect(r.body.mensaje).toMatch(/\{link_pago\}/);
    expect(
      (
        await api('POST', '/comunicacion/enviar', {
          plantilla: 'LIBRE',
          canal: 'EMAIL',
          segmento: { tipo: 'TODOS' },
        })
      ).status,
    ).toBe(422);
  });

  it('avisa si a la plantilla le falta una variable que el destinatario no tiene', async () => {
    const r = await api('POST', '/comunicacion/vista-previa', {
      plantilla: 'LIBRE',
      canal: 'EMAIL',
      segmento: { tipo: 'TODOS' },
      texto: 'Seguí {torneo}',
    });
    expect(r.body.problemas[0]).toMatch(/\{torneo\}/);
    const enviar = await api('POST', '/comunicacion/enviar', {
      plantilla: 'LIBRE',
      canal: 'EMAIL',
      segmento: { tipo: 'TODOS' },
      texto: 'Seguí {torneo}',
    });
    expect(enviar.status).toBe(422);
    expect(await consulta('SELECT 1 FROM mensaje')).toHaveLength(0); // no quedó nada a medias
  });

  it('el recordatorio de pago a los morosos lleva su link de pago y su monto', async () => {
    const r = await api('POST', '/comunicacion/enviar', {
      plantilla: 'RECORDATORIO_PAGO',
      canal: 'EMAIL',
      segmento: { tipo: 'MOROSOS', torneoId },
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ programada: false, enviados: 1, omitidos: 1 }); // B recibe; C no tiene dónde
    const [m] = await consulta("SELECT * FROM mensaje WHERE plantilla = 'RECORDATORIO_PAGO'");
    expect(m).toMatchObject({
      canal: 'EMAIL',
      destino: 'beto@x.com',
      estado: 'ENTREGADO',
      destinatario: 'Beto',
    });
    expect(m.cuerpo).toContain('Equipo B');
    expect(m.cuerpo).toMatch(/\/pago\/SIM-PREF-/);
    expect(m.cuerpo).toContain('1.000');
  });

  it('el historial muestra el envío con sus números y se puede abrir el detalle', async () => {
    const h = await api('GET', '/comunicacion/historial');
    expect(h.body.envios).toHaveLength(1);
    expect(h.body.envios[0]).toMatchObject({
      total: 1,
      entregados: 1,
      leidos: 0,
      fallidos: 0,
      canal: 'EMAIL',
    });
    expect(h.body.envios[0].titulo).toContain('solo morosos');
    const d = await api('GET', `/comunicacion/envios/${h.body.envios[0].id}`);
    expect(d.body.mensajes).toHaveLength(1);
  });

  it('el tope de WhatsApp del plan frena un envío que se pasa', async () => {
    // Se simula que el mes ya va por 199 de 200 WhatsApp.
    const [{ id: orgId }] = await consulta("SELECT id FROM organizacion WHERE slug = 'liga-com'");
    await admin.query(
      `INSERT INTO mensaje (id, organizacion_id, plantilla, version, canal, destinatario, destino, asunto, cuerpo, estado)
       SELECT 'relleno-' || g, $1, 'LIBRE', 1, 'WHATSAPP', 'x', '1', 'x', 'x', 'ENVIADO' FROM generate_series(1, 199) g`,
      [orgId],
    );
    const previa = await api('POST', '/comunicacion/vista-previa', {
      plantilla: 'FIXTURE_PUBLICADO',
      canal: 'WHATSAPP',
      segmento: { tipo: 'TORNEO', torneoId },
    });
    expect(previa.body.tope).toMatchObject({ usados: 199, restantes: 1, excedente: 1 });
    const r = await api('POST', '/comunicacion/enviar', {
      plantilla: 'FIXTURE_PUBLICADO',
      canal: 'WHATSAPP',
      segmento: { tipo: 'TORNEO', torneoId },
    });
    expect(r.status).toBe(422);
    expect(r.body.mensaje).toMatch(/te quedan 1 este mes/);
    // Por email sí se puede.
    const email = await api('POST', '/comunicacion/enviar', {
      plantilla: 'FIXTURE_PUBLICADO',
      canal: 'EMAIL',
      segmento: { tipo: 'TORNEO', torneoId },
    });
    expect(email.status).toBe(201);
    await admin.query("DELETE FROM mensaje WHERE id LIKE 'relleno-%'");
  });

  it('un envío programado espera su hora y no se manda dos veces', async () => {
    const enUnaHora = new Date(Date.now() + 3_600_000).toISOString();
    // Si al mensaje le faltan variables (acá, el torneo), se rechaza al programarlo y no recién a la hora de salir.
    const sinTorneo = await api('POST', '/comunicacion/enviar', {
      plantilla: 'FIXTURE_PUBLICADO',
      canal: 'EMAIL',
      segmento: { tipo: 'EQUIPOS', equipoIds: [eq.A] },
      programadaPara: enUnaHora,
    });
    expect(sinTorneo.status).toBe(422);
    expect(sinTorneo.body.mensaje).toMatch(/{torneo}/);
    const r = await api('POST', '/comunicacion/enviar', {
      plantilla: 'FIXTURE_PUBLICADO',
      canal: 'EMAIL',
      segmento: { tipo: 'TORNEO', torneoId },
      programadaPara: enUnaHora,
    });
    expect(r.body).toMatchObject({ programada: true, entregas: 2 }); // Ana y Beto (Dani solo tiene teléfono)
    const antes = await consulta('SELECT count(*)::int AS n FROM mensaje WHERE difusion_id = $1', [
      r.body.difusionId,
    ]);
    expect(antes[0].n).toBe(0);
    expect(await servicio.procesarProgramadas(new Date())).toBe(0); // todavía no es la hora
    expect(await servicio.procesarProgramadas(new Date(Date.now() + 2 * 3_600_000))).toBe(1);
    expect(await servicio.procesarProgramadas(new Date(Date.now() + 2 * 3_600_000))).toBe(0);
    const despues = await consulta('SELECT count(*)::int AS n FROM mensaje WHERE difusion_id = $1', [
      r.body.difusionId,
    ]);
    expect(despues[0].n).toBe(2);
    const [dif] = await consulta('SELECT estado FROM difusion WHERE id = $1', [r.body.difusionId]);
    expect(dif.estado).toBe('ENVIADA');
  });

  it('las automatizaciones empiezan apagadas y se encienden y apagan', async () => {
    const lista = (await api('GET', '/comunicacion/automatizaciones')).body;
    expect(lista.map((a: { clave: string; activa: boolean }) => [a.clave, a.activa])).toEqual([
      ['RECORDATORIO_PARTIDO', false],
      ['COBRO_ESCALONADO', false],
      ['AVISO_SUSPENSION', false],
    ]);
    expect((await api('PATCH', '/comunicacion/automatizaciones/INEXISTENTE', { activa: true })).status).toBe(
      404,
    );
    const on = await api('PATCH', '/comunicacion/automatizaciones/RECORDATORIO_PARTIDO', {
      activa: true,
      canal: 'EMAIL',
    });
    expect(on.body).toMatchObject({ activa: true, canal: 'EMAIL' });
  });

  it('recordatorio 24 h antes: se manda una sola vez a los dos capitanes', async () => {
    const fx = await api('POST', `/torneos/${torneoId}/fixture`, {
      primerDia: '2027-03-06',
      horarios: ['19:00'],
      canchaIds: [canchaId],
    });
    expect(fx.status).toBe(201);
    // El partido más cercano arranca a las 22:00 UTC (19:00 en Argentina).
    const diezHorasAntes = new Date('2027-03-06T12:00:00Z');
    const veinticincoHorasAntes = new Date('2027-03-05T21:00:00Z');
    expect(await servicio.ejecutarAutomatizaciones(veinticincoHorasAntes)).toBe(0);
    const n = await servicio.ejecutarAutomatizaciones(diezHorasAntes);
    expect(n).toBeGreaterThan(0);
    expect(await servicio.ejecutarAutomatizaciones(diezHorasAntes)).toBe(0); // idempotente
    const [m] = await consulta("SELECT * FROM mensaje WHERE plantilla = 'RECORDATORIO_PARTIDO' LIMIT 1");
    expect(m.cuerpo).toMatch(
      /Mañana juega Equipo \w contra Equipo \w, \S+ 6\/3 · 19:00 en Complejo · Cancha 1/,
    );
    expect(m.clave).toMatch(/^rec24:/);
  });

  it('cobro escalonado: 3 días antes, el día y 2 días después del vencimiento, sin repetir', async () => {
    const v = await api('PATCH', `/torneos/${torneoId}/vencimiento`, { vence: '2027-03-10' });
    expect(v.body).toMatchObject({ vence: '2027-03-10', cargosActualizados: 2 }); // los dos morosos
    await api('PATCH', '/comunicacion/automatizaciones/COBRO_ESCALONADO', { activa: true, canal: 'EMAIL' });
    const dia = (d: string) => new Date(`${d}T15:00:00Z`); // 12:00 en Argentina
    expect(await servicio.ejecutarAutomatizaciones(dia('2027-03-08'))).toBe(0); // 2 días antes: nada
    expect(await servicio.ejecutarAutomatizaciones(dia('2027-03-07'))).toBe(1); // 3 días antes: B (C no tiene dónde)
    expect(await servicio.ejecutarAutomatizaciones(dia('2027-03-07'))).toBe(0);
    expect(await servicio.ejecutarAutomatizaciones(dia('2027-03-10'))).toBe(1); // el día
    expect(await servicio.ejecutarAutomatizaciones(dia('2027-03-12'))).toBe(1); // 2 días después
    const claves = await consulta("SELECT clave FROM mensaje WHERE clave LIKE 'cobro:%' ORDER BY clave");
    expect(claves.map((c) => c.clave.split(':')[2]).sort()).toEqual(['T+2', 'T-3', 'T0']);
  });

  it('un cargo pagado deja de recibir recordatorios', async () => {
    const [{ id }] = await consulta(
      'SELECT c.id FROM cargo c JOIN inscripcion i ON i.id = c.inscripcion_id WHERE i.equipo_id = $1',
      [eq.B],
    );
    await api('POST', `/cargos/${id}/pagos`, { metodo: 'EFECTIVO', monto: 1000 });
    expect(await servicio.ejecutarAutomatizaciones(new Date('2027-03-12T15:00:00Z'))).toBe(0);
  });

  it('aviso de suspensión: al cerrar un acta con una roja, le escribe al capitán si está encendido', async () => {
    await api('PATCH', '/comunicacion/automatizaciones/AVISO_SUSPENSION', { activa: true, canal: 'EMAIL' });
    const partidos = (await api('GET', `/torneos/${torneoId}/partidos`)).body as {
      id: string;
      localId: string;
    }[];
    const p = partidos.find((x) => [eq.A, eq.B].includes(x.localId))!;
    const acta = (await api('GET', `/partidos/${p.id}`)).body;
    await api('POST', `/partidos/${p.id}/iniciar`, {});
    await api('POST', `/partidos/${p.id}/eventos`, {
      tipo: 'ROJA',
      equipoId: acta.local.id,
      jugadorId: acta.local.jugadores[0].id,
      minuto: 30,
      clientUuid: randomUUID(),
    });
    await api('POST', `/partidos/${p.id}/cerrar`, { firmaLocal: true, firmaVisitante: true });
    const [m] = await consulta("SELECT * FROM mensaje WHERE plantilla = 'SUSPENSION'");
    expect(m.cuerpo).toMatch(/J1 \w de Equipo \w quedó suspendido 1 partido por roja directa/);
    expect(m.clave).toMatch(/^susp:/);
  });

  it('el aviso de entrega del proveedor actualiza el estado y exige firma', async () => {
    const [m] = await consulta(
      "SELECT id, proveedor_id FROM mensaje WHERE plantilla = 'RECORDATORIO_PAGO' LIMIT 1",
    );
    const cuerpo = { proveedorId: m.proveedor_id, estado: 'LEIDO' };
    const sinFirma = await api('POST', '/webhooks/mensajeria', cuerpo, { 'x-firma': 'mal'.padEnd(64, '0') });
    expect(sinFirma.status).toBe(401);
    const ok = await api('POST', '/webhooks/mensajeria', cuerpo, {
      'x-firma': firmar(JSON.stringify(cuerpo)),
    });
    expect(ok.status).toBe(200);
    const [leido] = await consulta('SELECT estado, leido_en FROM mensaje WHERE id = $1', [m.id]);
    expect(leido.estado).toBe('LEIDO');
    expect(leido.leido_en).not.toBeNull();
    const h = await api('GET', '/comunicacion/historial');
    expect(h.body.envios.find((e: { leidos: number }) => e.leidos === 1)).toBeTruthy();
  });

  it('el capitán puede darse de baja de las novedades sin dejar de recibir lo transaccional', async () => {
    expect((await api('PATCH', `/equipos/${eq.B}/contacto`, { capitanBajaMarketing: true })).status).toBe(
      200,
    );
    const libre = await api('POST', '/comunicacion/vista-previa', {
      plantilla: 'LIBRE',
      canal: 'EMAIL',
      segmento: { tipo: 'EQUIPOS', equipoIds: [eq.B] },
      texto: 'Novedades de {liga}',
    });
    expect(libre.body.entregas).toBe(0);
    expect(libre.body.omitidos[0].motivo).toMatch(/no recibir novedades/);
    const fixture = await api('POST', '/comunicacion/vista-previa', {
      plantilla: 'FIXTURE_PUBLICADO',
      canal: 'EMAIL',
      segmento: { tipo: 'EQUIPOS', equipoIds: [eq.B] },
    });
    expect(fixture.body.entregas).toBe(1);
  });

  it('otra liga no ve los mensajes ni las automatizaciones de esta', async () => {
    await otra('POST', '/auth/registro', {
      nombre: 'Otra',
      email: 'otra@com.test',
      password: 'clave-segura-1',
      organizacion: 'Otra Liga',
    });
    const h = await otra('GET', '/comunicacion/historial');
    expect(h.body.envios).toEqual([]);
    expect(h.body.automaticosDelMes).toBe(0);
    expect(
      (await otra('GET', '/comunicacion/automatizaciones')).body.every((a: { activa: boolean }) => !a.activa),
    ).toBe(true);
  });

  it('exige sesión y permiso', async () => {
    expect((await cliente()('GET', '/comunicacion/historial')).status).toBe(401);
  });
});
