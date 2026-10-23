// Documentación, identidad y consentimientos (E15) de punta a punta: cifrado, duplicados, revisión humana,
// habilitación (también en el acta), links firmados, consentimiento del tutor, retención y aislamiento.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
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
  const a = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error'] });
  a.useBodyParser('json', { limit: '6mb' }); // igual que main.ts
  app = a;
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

/** Un PNG mínimo válido (1x1) en base64. */
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const manana = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);

describe('documentación e identidad', () => {
  const api = cliente();
  const otra = cliente();
  let torneoId: string;
  const equipos: string[] = [];
  const jug: Record<string, string> = {};
  const doc: Record<string, string> = {};

  it('prepara una liga con 2 equipos de 3 jugadores, un torneo y un partido', async () => {
    await api('POST', '/auth/registro', {
      nombre: 'Org',
      email: 'doc@test.com',
      password: 'clave-segura-1',
      organizacion: 'Liga Documentos',
    });
    const cancha = (await api('POST', '/canchas', { sede: 'Complejo', nombre: 'Cancha 1' })).body.id;
    torneoId = (
      await api('POST', '/torneos', {
        nombre: 'Torneo',
        modalidad: 'F5',
        formato: 'LIGA',
        cupo: 4,
        inscripcion: 0,
      })
    ).body.id;
    for (const n of ['Norte', 'Sur']) {
      const e = await api('POST', '/equipos', {
        nombre: n,
        capitanNombre: `Cap ${n}`,
        capitanEmail: `${n.toLowerCase()}@test.com`,
      });
      equipos.push(e.body.id);
      for (const j of ['A', 'B', 'C']) {
        const r = await api('POST', `/equipos/${e.body.id}/jugadores`, {
          nombre: `${j}${n}`,
          apellido: 'Pérez',
          numero: j.charCodeAt(0) - 64,
        });
        jug[`${j}${n}`] = r.body.jugadorId;
      }
      await api('POST', `/torneos/${torneoId}/inscripciones`, { equipoId: e.body.id });
    }
    const fx = await api('POST', `/torneos/${torneoId}/fixture`, {
      primerDia: '2027-03-06',
      horarios: ['19:00'],
      canchaIds: [cancha],
    });
    expect(fx.status).toBe(201);
  });

  it('sin requisitos nadie queda trabado por documentación', async () => {
    const p = (await api('GET', `/documentacion?torneoId=${torneoId}`)).body;
    expect(p.resumen.total).toBe(6);
    expect(p.resumen.habilitados).toBe(6);
  });

  it('el torneo exige DNI y apto físico, y a los menores la autorización', async () => {
    const r = await api('PATCH', `/torneos/${torneoId}/documentacion`, {
      documentos: ['DNI', 'APTO_FISICO', 'AUTORIZACION_MENOR'],
    });
    expect(r.status).toBe(200);
    const p = (await api('GET', `/documentacion?torneoId=${torneoId}`)).body;
    expect(p.torneo.requeridos).toEqual(['DNI', 'APTO_FISICO', 'AUTORIZACION_MENOR']);
    expect(p.resumen.habilitados).toBe(0);
    expect(p.filas[0].motivos).toEqual(['Falta DNI', 'Falta Apto físico']);
    expect(
      (await api('PATCH', `/torneos/${torneoId}/documentacion`, { documentos: ['PASAPORTE'] })).status,
    ).toBe(400);
  });

  it('el DNI y los datos de salud se guardan cifrados y el hash detecta repetidos', async () => {
    const r = await api('PATCH', `/documentacion/jugadores/${jug.ANorte}/identidad`, {
      dni: '30.123.456',
      fechaNacimiento: '1995-04-10',
      datosMedicos: 'Asma leve',
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ dni: '•••••456', duplicados: 0 });
    const [fila] = await consulta(
      'SELECT dni_cifrado, dni_hash, datos_medicos_cifrado FROM jugador WHERE id = $1',
      [jug.ANorte],
    );
    expect(fila.dni_cifrado).not.toContain('30123456');
    expect(fila.dni_cifrado.startsWith('v1.')).toBe(true);
    expect(fila.datos_medicos_cifrado).not.toContain('Asma');
    const visto = await api('GET', `/documentacion/jugadores/${jug.ANorte}/identidad`);
    expect(visto.body).toEqual({ dni: '30123456', datosMedicos: 'Asma leve' });
    expect(
      await consulta("SELECT 1 FROM auditoria WHERE accion = 'jugador.identidad.ver' AND entidad_id = $1", [
        jug.ANorte,
      ]),
    ).toHaveLength(1);
    expect(
      (await api('PATCH', `/documentacion/jugadores/${jug.BNorte}/identidad`, { dni: '123' })).status,
    ).toBe(400);
  });

  it('el mismo DNI en otro equipo abre un duplicado que inhabilita a ambos hasta resolverlo', async () => {
    const r = await api('PATCH', `/documentacion/jugadores/${jug.ASur}/identidad`, {
      dni: '30123456',
      fechaNacimiento: '1995-04-10',
    });
    expect(r.body.duplicados).toBe(1);
    const lista = (await api('GET', '/documentacion/duplicados')).body;
    expect(lista).toHaveLength(1);
    expect(lista[0].jugadores.map((j: { dni: string }) => j.dni)).toEqual(['•••••456', '•••••456']);
    const p = (await api('GET', `/documentacion?torneoId=${torneoId}`)).body;
    expect(p.alertas.duplicados).toBe(1);
    expect(p.filas.find((f: { jugadorId: string }) => f.jugadorId === jug.ASur).motivos).toContain(
      'Posible duplicado sin resolver',
    );
    // Resolver exige elegir a uno de los dos.
    const mal = await api('POST', `/documentacion/duplicados/${lista[0].id}/resolver`, {
      accion: 'DESCARTAR',
      jugadorId: jug.BNorte,
    });
    expect(mal.status).toBe(422);
    const ok = await api('POST', `/documentacion/duplicados/${lista[0].id}/resolver`, {
      accion: 'DESCARTAR',
      jugadorId: jug.ASur,
      nota: 'Era un error de tipeo',
    });
    expect(ok.status).toBe(201);
    expect((await api('GET', '/documentacion/duplicados')).body).toHaveLength(0);
    const [{ dni_hash }] = await consulta('SELECT dni_hash FROM jugador WHERE id = $1', [jug.ASur]);
    expect(dni_hash).toBeNull();
  });

  it('un archivo que no es lo que dice ser, vacío o demasiado grande se rechaza', async () => {
    const falso = await api('POST', `/documentacion/jugadores/${jug.ANorte}/documentos`, {
      tipo: 'DNI',
      nombreArchivo: 'dni.png',
      mime: 'image/png',
      contenido: Buffer.from('esto es texto').toString('base64'),
    });
    expect(falso.status).toBe(422);
    const grande = await api('POST', `/documentacion/jugadores/${jug.ANorte}/documentos`, {
      tipo: 'DNI',
      nombreArchivo: 'dni.png',
      mime: 'image/png',
      contenido: Buffer.concat([Buffer.from(PNG, 'base64'), Buffer.alloc(2.5 * 1024 * 1024)]).toString(
        'base64',
      ),
    });
    expect(grande.status).toBe(422);
    expect(grande.body.mensaje).toContain('MB');
    const raro = await api('POST', `/documentacion/jugadores/${jug.ANorte}/documentos`, {
      tipo: 'DNI',
      nombreArchivo: 'x.exe',
      mime: 'application/x-msdownload',
      contenido: PNG,
    });
    expect(raro.status).toBe(400);
  });

  it('los documentos subidos quedan pendientes: todavía no habilitan', async () => {
    for (const tipo of ['DNI', 'APTO_FISICO'] as const) {
      const r = await api('POST', `/documentacion/jugadores/${jug.ANorte}/documentos`, {
        tipo,
        nombreArchivo: `${tipo}.png`,
        mime: 'image/png',
        contenido: PNG,
      });
      expect(r.status).toBe(201);
      expect(r.body.estado).toBe('PENDIENTE');
      doc[tipo] = r.body.id;
    }
    const f = (await api('GET', `/documentacion?torneoId=${torneoId}`)).body.filas.find(
      (x: { jugadorId: string }) => x.jugadorId === jug.ANorte,
    );
    expect(f.motivos).toEqual(['DNI pendiente de revisión', 'Apto físico pendiente de revisión']);
    expect(f.habilitado).toBe(false);
    const archivo = await consulta('SELECT archivo_clave FROM documento_jugador WHERE id = $1', [doc.DNI]);
    expect(archivo[0].archivo_clave).toMatch(/^[^/]+\/[^/]+\/[0-9a-f-]{36}$/);
  });

  it('la revisión humana aprueba o rechaza con motivo, y el apto necesita vencimiento', async () => {
    const sinMotivo = await api('POST', `/documentacion/documentos/${doc.DNI}/revisar`, {
      decision: 'RECHAZAR',
    });
    expect(sinMotivo.status).toBe(400);
    const sinFecha = await api('POST', `/documentacion/documentos/${doc.APTO_FISICO}/revisar`, {
      decision: 'APROBAR',
    });
    expect(sinFecha.status).toBe(422);
    const vencido = await api('POST', `/documentacion/documentos/${doc.APTO_FISICO}/revisar`, {
      decision: 'APROBAR',
      vencimiento: manana(-3),
    });
    expect(vencido.status).toBe(422);
    expect(
      (
        await api('POST', `/documentacion/documentos/${doc.APTO_FISICO}/revisar`, {
          decision: 'APROBAR',
          vencimiento: manana(200),
        })
      ).body.estado,
    ).toBe('APROBADO');
    expect(
      (await api('POST', `/documentacion/documentos/${doc.DNI}/revisar`, { decision: 'APROBAR' })).body
        .estado,
    ).toBe('APROBADO');
    const otraVez = await api('POST', `/documentacion/documentos/${doc.DNI}/revisar`, {
      decision: 'APROBAR',
    });
    expect(otraVez.status).toBe(422);
    const ficha = (await api('GET', `/documentacion/jugadores/${jug.ANorte}?torneoId=${torneoId}`)).body;
    expect(ficha.habilitacion.habilitado).toBe(true);
    expect(ficha.dni).toBe('•••••456');
    expect(ficha.documentos.map((d: { estado: string }) => d.estado)).toEqual(['APROBADO', 'APROBADO']);
    expect(
      await consulta("SELECT 1 FROM auditoria WHERE accion IN ('documento.aprobar','documento.rechazar')"),
    ).toHaveLength(2);
  });

  it('un rechazo guarda el motivo y el documento no habilita', async () => {
    await api('PATCH', `/documentacion/jugadores/${jug.BNorte}/identidad`, {
      dni: '31222333',
      fechaNacimiento: '1994-01-01',
    });
    const s = await api('POST', `/documentacion/jugadores/${jug.BNorte}/documentos`, {
      tipo: 'DNI',
      nombreArchivo: 'dni.png',
      mime: 'image/png',
      contenido: PNG,
    });
    const r = await api('POST', `/documentacion/documentos/${s.body.id}/revisar`, {
      decision: 'RECHAZAR',
      motivo: 'Foto de DNI ilegible',
    });
    expect(r.body.estado).toBe('RECHAZADO');
    const ficha = (await api('GET', `/documentacion/jugadores/${jug.BNorte}?torneoId=${torneoId}`)).body;
    expect(ficha.documentos[0]).toMatchObject({ estado: 'RECHAZADO', motivoRechazo: 'Foto de DNI ilegible' });
    expect(ficha.habilitacion.motivos).toContain('DNI rechazado');
    doc.rechazado = s.body.id;
  });

  it('el acta marca como no habilitado a quien tiene la documentación incompleta', async () => {
    const [{ id }] = await consulta('SELECT id FROM partido LIMIT 1');
    const acta = (await api('GET', `/partidos/${id}`)).body;
    const todos = [...acta.local.jugadores, ...acta.visitante.jugadores];
    const a = todos.find((j: { id: string }) => j.id === jug.ANorte);
    const b = todos.find((j: { id: string }) => j.id === jug.BNorte);
    expect(a.habilitado).toBe(true);
    expect(b.habilitado).toBe(false);
    expect(b.motivo).toContain('DNI rechazado');
  });

  it('link firmado: sirve el archivo sin sesión, registra el acceso y vence si se altera', async () => {
    const u = await api('POST', `/documentacion/documentos/${doc.DNI}/url`);
    expect(u.status).toBe(201);
    expect(u.body.venceEnMinutos).toBeGreaterThan(0);
    const ok = await fetch(`${base}${u.body.url}`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/png');
    expect(ok.headers.get('cache-control')).toContain('no-store');
    expect(ok.headers.get('x-content-type-options')).toBe('nosniff');
    expect(
      Buffer.from(await ok.arrayBuffer())
        .subarray(1, 4)
        .toString(),
    ).toBe('PNG');
    const alterado = await fetch(`${base}${u.body.url.slice(0, -2)}xx`);
    expect(alterado.status).toBe(410);
    const accesos = (await api('GET', `/documentacion/documentos/${doc.DNI}/accesos`)).body;
    expect(accesos.map((a: { accion: string }) => a.accion).sort()).toEqual(['DESCARGA', 'URL']);
    expect(accesos[0].usuario).toBe('Org');
  });

  it('un menor necesita la autorización del tutor, que la da en línea con un link de un solo uso', async () => {
    await api('PATCH', `/documentacion/jugadores/${jug.CNorte}/identidad`, {
      dni: '50111222',
      fechaNacimiento: `${new Date().getUTCFullYear() - 15}-06-01`,
    });
    for (const tipo of ['DNI', 'APTO_FISICO'] as const) {
      const s = await api('POST', `/documentacion/jugadores/${jug.CNorte}/documentos`, {
        tipo,
        nombreArchivo: `${tipo}.png`,
        mime: 'image/png',
        contenido: PNG,
      });
      await api('POST', `/documentacion/documentos/${s.body.id}/revisar`, {
        decision: 'APROBAR',
        vencimiento: manana(200),
      });
    }
    let ficha = (await api('GET', `/documentacion/jugadores/${jug.CNorte}?torneoId=${torneoId}`)).body;
    expect(ficha.menor).toBe(true);
    expect(ficha.habilitacion.motivos).toEqual(['Menor sin autorización del tutor']);
    // Un mayor no puede pedir consentimiento de tutor.
    expect((await api('POST', `/documentacion/jugadores/${jug.ANorte}/consentimiento-tutor`)).status).toBe(
      422,
    );

    const s = await api('POST', `/documentacion/jugadores/${jug.CNorte}/consentimiento-tutor`);
    expect(s.status).toBe(201);
    const token = s.body.link.split('/tutor/')[1];
    const sinSesion = cliente();
    const vista = await sinSesion('GET', `/consentimientos-tutor/${token}`);
    expect(vista.body.liga).toBe('Liga Documentos');
    expect(vista.body.textos.map((t: { tipo: string }) => t.tipo)).toEqual(['TUTOR_PARTICIPACION', 'IMAGEN']);
    const mal = await sinSesion('POST', `/consentimientos-tutor/${token}`, {
      tutorNombre: 'Ana',
      tutorDni: '1',
    });
    expect(mal.status).toBe(400);
    const ok = await sinSesion('POST', `/consentimientos-tutor/${token}`, {
      tutorNombre: 'Ana Gómez',
      tutorDni: '20.111.222',
      vinculo: 'MADRE',
      imagen: true,
    });
    expect(ok.status).toBe(201);
    ficha = (await api('GET', `/documentacion/jugadores/${jug.CNorte}?torneoId=${torneoId}`)).body;
    expect(ficha.habilitacion.habilitado).toBe(true);
    expect(
      ficha.consentimientos.map((c: { tipo: string; vigente: boolean }) => [c.tipo, c.vigente]).sort(),
    ).toEqual([
      ['IMAGEN', true],
      ['TUTOR_PARTICIPACION', true],
    ]);
    const [{ otorgante_dni }] = await consulta('SELECT otorgante_dni FROM consentimiento LIMIT 1');
    expect(otorgante_dni).not.toContain('20111222');
    // El link no se reutiliza.
    expect((await sinSesion('GET', `/consentimientos-tutor/${token}`)).status).toBe(410);
    expect((await sinSesion('GET', '/consentimientos-tutor/inventado')).status).toBe(410);
    // Imagen: el menor se publica solo con ambos consentimientos.
    const fila = (await api('GET', `/documentacion?torneoId=${torneoId}`)).body.filas.find(
      (f: { jugadorId: string }) => f.jugadorId === jug.CNorte,
    );
    expect(fila.imagenPublicable).toBe(true);
  });

  it('revocar el consentimiento del tutor lo deja otra vez sin habilitar', async () => {
    const ficha = (await api('GET', `/documentacion/jugadores/${jug.CNorte}?torneoId=${torneoId}`)).body;
    const tutor = ficha.consentimientos.find((c: { tipo: string }) => c.tipo === 'TUTOR_PARTICIPACION');
    expect((await api('POST', `/documentacion/consentimientos/${tutor.id}/revocar`)).status).toBe(201);
    expect((await api('POST', `/documentacion/consentimientos/${tutor.id}/revocar`)).status).toBe(422);
    const despues = (await api('GET', `/documentacion/jugadores/${jug.CNorte}?torneoId=${torneoId}`)).body;
    expect(despues.habilitacion.motivos).toEqual(['Menor sin autorización del tutor']);
  });

  it('un consentimiento de una versión vieja deja de valer', async () => {
    await consulta('UPDATE consentimiento SET version = 0, revocado_en = NULL WHERE jugador_id = $1', [
      jug.CNorte,
    ]);
    const ficha = (await api('GET', `/documentacion/jugadores/${jug.CNorte}?torneoId=${torneoId}`)).body;
    expect(ficha.consentimientos.every((c: { vigente: boolean }) => !c.vigente)).toBe(true);
    expect(ficha.habilitacion.habilitado).toBe(false);
  });

  it('pide la documentación faltante: un aviso por equipo a su capitán', async () => {
    const jugadores = Object.values(jug);
    const r = await api('POST', `/documentacion/solicitar?torneoId=${torneoId}`, { jugadorIds: jugadores });
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ enviados: 2, equipos: 2 });
    const ms = await consulta("SELECT cuerpo FROM mensaje WHERE plantilla = 'DOCUMENTACION' ORDER BY cuerpo");
    expect(ms).toHaveLength(2);
    expect(ms[0].cuerpo).toContain('falta documentación');
    // Pedir de nuevo el mismo día no repite el aviso.
    expect(
      (await api('POST', `/documentacion/solicitar?torneoId=${torneoId}`, { jugadorIds: jugadores })).body
        .enviados,
    ).toBe(0);
  });

  it('la retención borra rechazados vencidos y accesos viejos, y deja lo vigente', async () => {
    await consulta("UPDATE documento_jugador SET revisado_en = now() - interval '40 days' WHERE id = $1", [
      doc.rechazado,
    ]);
    await consulta(
      "UPDATE acceso_documento SET creado_en = now() - interval '800 days' WHERE accion = 'URL'",
    );
    const r = await api('POST', '/documentacion/retencion');
    expect(r.body).toEqual({ documentos: 1, accesos: 1 });
    expect(await consulta('SELECT 1 FROM documento_jugador WHERE id = $1', [doc.rechazado])).toHaveLength(0);
    expect(await consulta('SELECT 1 FROM documento_jugador WHERE id = $1', [doc.DNI])).toHaveLength(1);
  });

  it('otra organización no ve documentos, jugadores ni links ajenos', async () => {
    await otra('POST', '/auth/registro', {
      nombre: 'Otra',
      email: 'otra-doc@test.com',
      password: 'clave-segura-1',
      organizacion: 'Liga Ajena',
    });
    expect((await otra('GET', `/documentacion/jugadores/${jug.ANorte}`)).status).toBe(404);
    expect((await otra('POST', `/documentacion/documentos/${doc.DNI}/url`)).status).toBe(404);
    expect((await otra('GET', '/documentacion')).body.torneo).toBeNull();
    expect(
      (await otra('PATCH', `/documentacion/jugadores/${jug.ANorte}/identidad`, { dni: '30123456' })).status,
    ).toBe(404);
  });

  it('sin sesión no se accede a nada de la documentación', async () => {
    const anonimo = cliente();
    expect((await anonimo('GET', '/documentacion')).status).toBe(401);
    expect(
      (await anonimo('POST', `/documentacion/documentos/${doc.DNI}/revisar`, { decision: 'APROBAR' })).status,
    ).toBe(401);
  });
});
