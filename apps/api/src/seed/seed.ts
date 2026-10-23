// Datos de demo. Usa los mismos servicios que la API, así las reglas (cobros, fixture, acta, sanciones) son las reales.
// Ejecutar con `pnpm db:seed` (o `pnpm db:reset` para empezar de cero).
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { AuthService, verificarAcceso } from '../auth/auth.js';
import { CobrosService } from '../cobros/cobros.js';
import type { Contexto } from '../comun/http.js';
import { DbService } from '../db/db.service.js';
import { EquiposService } from '../equipos/equipos.js';
import { PartidosService } from '../partidos/partidos.js';
import { TorneosService } from '../torneos/torneos.js';

export const DEMO = {
  email: 'demo@potrero.app',
  password: 'potrero-demo-2026',
  organizacion: 'Liga Barrial Sur',
};

// Generador pseudoaleatorio con semilla: la demo sale igual cada vez.
let semilla = 20261022;
const azar = () => {
  semilla = (semilla + 0x6d2b79f5) | 0;
  let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const elegir = <T>(xs: readonly T[]) => xs[Math.floor(azar() * xs.length)]!;

const NOMBRES = [
  'Matías',
  'Juan',
  'Lucas',
  'Nicolás',
  'Facundo',
  'Agustín',
  'Tomás',
  'Franco',
  'Gonzalo',
  'Martín',
  'Santiago',
  'Ezequiel',
  'Diego',
  'Pablo',
  'Leandro',
  'Brian',
  'Kevin',
  'Ramiro',
  'Emiliano',
  'Joaquín',
];
const APELLIDOS = [
  'Pérez',
  'Luna',
  'Gómez',
  'Fernández',
  'Rodríguez',
  'Sosa',
  'Díaz',
  'Romero',
  'Benítez',
  'Acosta',
  'Medina',
  'Herrera',
  'Suárez',
  'Castro',
  'Ríos',
  'Molina',
  'Ortiz',
  'Silva',
  'Ledesma',
  'Vera',
];
const EQUIPOS = [
  'Deportivo Sur',
  'Real Barrio',
  'Los Pibes',
  'La Banda',
  'Atlético Norte',
  'Villa Unión',
  'Estrella Roja',
  'Juventud Unida',
];

/** Sábado de hace tres semanas: así las fechas 1 a 3 ya se jugaron y la 4 es la próxima, sin importar cuándo se cargue la demo. */
function primerSabado() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7) - 21);
  return d.toISOString().slice(0, 10);
}

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
  const partidos = app.get(PartidosService);

  const sesion = async (
    email: string,
    password: string,
    nombre: string,
    organizacion: string,
  ): Promise<Contexto> =>
    (await verificarAcceso((await auth.registrar({ email, password, nombre, organizacion })).acceso))!;

  // ── Organización principal (plan de ligas fundadoras) ──
  const c = await sesion(DEMO.email, DEMO.password, 'Carla Organizadora', DEMO.organizacion);
  await db.app.organizacion.update({
    where: { id: c.organizacionId },
    data: { plan: 'FUNDADORA', mpCuentaId: 'SIM-CUENTA-DEMO' },
  });

  const canchas = [
    await equipos.crearCancha(c, {
      sede: 'Complejo El Potrero',
      nombre: 'Cancha 1',
      direccion: 'Av. San Martín 1450',
    }),
    await equipos.crearCancha(c, { sede: 'Complejo El Potrero', nombre: 'Cancha 2' }),
  ];

  const crearEquipo = async (nombre: string) => {
    const e = await equipos.crear(c, {
      nombre,
      capitanNombre: `${elegir(NOMBRES)} ${elegir(APELLIDOS)}`,
      capitanTelefono: '3564 555000',
    });
    for (let n = 1; n <= 9; n++)
      await equipos.agregarJugador(c, e.id, {
        nombre: elegir(NOMBRES),
        apellido: elegir(APELLIDOS),
        numero: n,
      });
    return e;
  };

  // ── Torneo en curso: Apertura 2026, 8 equipos, 3 fechas jugadas ──
  const apertura = await torneos.crear(c, {
    nombre: 'Apertura 2026',
    modalidad: 'F5',
    formato: 'LIGA',
    idaYVuelta: false,
    cupo: 10,
    inscripcion: 60000,
    puntosVictoria: 3,
    puntosEmpate: 1,
    umbralAmarillas: 5,
  });
  const lista = [];
  for (const nombre of EQUIPOS) lista.push(await crearEquipo(nombre));
  for (const [i, e] of lista.entries()) {
    const { cargo } = await cobros.inscribir(c, apertura.id, e.id);
    if (!cargo) continue;
    if (i === 6) {
      await cobros.pagoManual(c, cargo.id, {
        metodo: 'EFECTIVO',
        monto: cargo.monto,
        comprobante: 'Recibo 0012',
      });
    } else {
      // Pago online: link de pago y notificación aprobada de la pasarela (simulada).
      const pref = await cobros.linkDePago(c.organizacionId, cargo.id);
      await cobros.procesarNotificacion({
        preferenciaId: pref.preferenciaId,
        pasarelaPagoId: `SIM-PAGO-SEED-${i}`,
        estado: 'aprobado',
      });
    }
  }
  // Un noveno equipo que se anotó y todavía debe la inscripción.
  const moroso = await crearEquipo('Sportivo Barrio');
  await cobros.inscribir(c, apertura.id, moroso.id);
  await db.enOrg(c.organizacionId, (tx) =>
    tx.inscripcion.updateMany({ where: { equipoId: moroso.id }, data: { estado: 'PENDIENTE' } }),
  );

  await torneos.generarFixture(c, apertura.id, {
    primerDia: primerSabado(),
    diasEntreFechas: 7,
    horarios: ['19:00', '20:00'],
    canchaIds: canchas.map((x) => x.id),
  });

  const fixture = await torneos.partidos(c, apertura.id);
  for (const p of fixture.filter((x) => x.fecha <= 3)) {
    const acta = await partidos.acta(c, p.id);
    await partidos.iniciar(c, p.id);
    const evento = (tipo: 'GOL' | 'AMARILLA' | 'ROJA', eq: typeof acta.local, minuto: number) =>
      partidos.cargarEvento(c, p.id, {
        tipo,
        equipoId: eq.id,
        jugadorId: elegir(eq.jugadores.filter((j) => j.habilitado)).id,
        minuto,
        clientUuid: randomUUID(),
      });
    for (const eq of [acta.local, acta.visitante]) {
      const goles = Math.floor(azar() * 4);
      for (let g = 0; g < goles; g++) await evento('GOL', eq, 3 + Math.floor(azar() * 45));
      if (azar() < 0.7) await evento('AMARILLA', eq, 5 + Math.floor(azar() * 40));
    }
    // En la fecha 3 hay una roja directa: el jugador queda suspendido para la fecha 4.
    if (p.fecha === 3 && p === fixture.find((x) => x.fecha === 3)) await evento('ROJA', acta.local, 38);
    await partidos.cerrar(c, p.id, { firmaLocal: true, firmaVisitante: true });
  }

  // ── Torneo con inscripción abierta: Clausura 2026 (para probar el link público) ──
  const clausura = await torneos.crear(c, {
    nombre: 'Clausura 2026',
    modalidad: 'F7',
    formato: 'LIGA',
    idaYVuelta: false,
    cupo: 12,
    inscripcion: 75000,
    puntosVictoria: 3,
    puntosEmpate: 1,
    umbralAmarillas: 5,
  });
  for (const e of lista.slice(0, 3)) {
    const { cargo } = await cobros.inscribir(c, clausura.id, e.id);
    if (cargo)
      await cobros.pagoManual(c, cargo.id, {
        metodo: 'TRANSFERENCIA',
        monto: cargo.monto,
        comprobante: 'Transferencia',
      });
  }

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
