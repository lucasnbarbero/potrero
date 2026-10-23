// Datos de demo local. La organización principal sale de la plantilla compartida con las sandboxes (ADR-019).
// Ejecutar con `pnpm db:seed` (o `pnpm db:reset` para empezar de cero).
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { AuthService, verificarAcceso } from '../auth/auth.js';
import { CobrosService } from '../cobros/cobros.js';
import type { Contexto } from '../comun/http.js';
import { cargarPlantilla } from '../demo/plantilla.js';
import { DbService } from '../db/db.service.js';
import { EquiposService } from '../equipos/equipos.js';
import { TorneosService } from '../torneos/torneos.js';

export const DEMO = {
  email: 'demo@potrero.app',
  password: 'potrero-demo-2026',
  organizacion: 'Liga Barrial Sur',
};

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const db = app.get(DbService);
  if (await db.app.usuario.findUnique({ where: { email: DEMO.email } })) {
    console.log('La demo ya está cargada. Para recrearla: pnpm db:reset');
    return app.close();
  }
  const auth = app.get(AuthService);
  const torneos = app.get(TorneosService);
  const equipos = app.get(EquiposService);
  const cobros = app.get(CobrosService);

  const sesion = async (
    email: string,
    password: string,
    nombre: string,
    organizacion: string,
  ): Promise<Contexto> =>
    (await verificarAcceso((await auth.registrar({ email, password, nombre, organizacion })).acceso))!;

  // ── Organización principal ──
  const c = await sesion(DEMO.email, DEMO.password, 'Carla Organizadora', DEMO.organizacion);
  await cargarPlantilla(app, c);

  // ── Otra organización: sirve para comprobar el aislamiento entre ligas (RLS) ──
  const otra = await sesion('norte@potrero.app', 'potrero-demo-2026', 'Organizador Norte', 'Complejo Norte');
  const tn = await torneos.crear(otra, {
    nombre: 'Copa Nocturna',
    modalidad: 'F7',
    formato: 'LIGA',
    idaYVuelta: false,
    cupo: 8,
    inscripcion: 50000,
    puntosVictoria: 3,
    puntosEmpate: 1,
    umbralAmarillas: 5,
  });
  const en = await equipos.crear(otra, { nombre: 'Norte FC' });
  await cobros.inscribir(otra, tn.id, en.id);

  console.log('Demo cargada.');
  console.log(`  Organizador: ${DEMO.email} / ${DEMO.password}`);
  console.log(`  Sitio público: /t/liga-barrial-sur/apertura-2026`);
  await app.close();
}

await main();
