// Backoffice de Gregal (E36): staff de demo y dos ligas chicas con datos sintéticos, para que las métricas de la
// plataforma y las alertas de salud tengan variedad (una liga nueva sin equipos y otra con señales de abandono).
import { AuthService, verificarAcceso } from '../auth/auth.js';
import { CobrosService } from '../cobros/cobros.js';
import type { Resolver } from '../demo/plantilla.js';
import { DbService } from '../db/db.service.js';
import { EquiposService } from '../equipos/equipos.js';
import { crearStaff } from '../gregal/gregal.js';
import { TorneosService } from '../torneos/torneos.js';

export const STAFF_DEMO = { email: 'staff@gregal.tech', nombre: 'Lucía Gregal', rol: 'SUPERADMIN' as const };

const DIA = 86_400_000;
const hace = (dias: number) => new Date(Date.now() - dias * DIA);

export async function cargarGregalDemo(app: Resolver, password: string) {
  const db = app.get(DbService);
  const auth = app.get(AuthService);
  const torneos = app.get(TorneosService);
  const equipos = app.get(EquiposService);
  const cobros = app.get(CobrosService);

  await crearStaff(db, { ...STAFF_DEMO, password });
  await crearStaff(db, { email: 'soporte@gregal.tech', nombre: 'Tomás Soporte', rol: 'SOPORTE', password });

  const registrar = async (email: string, nombre: string, organizacion: string) =>
    (await verificarAcceso((await auth.registrar({ email, password, nombre, organizacion })).acceso))!;

  // ── Liga nueva que no arrancó: se dio de alta hace 10 días y no cargó equipos (alerta "sin equipos") ──
  const palermo = await registrar('palermo@potrero.app', 'Sofía Ledesma', 'Fútbol 5 Palermo');
  // Datos sintéticos de la semilla: se fechan hacia atrás con la conexión de sistema.
  await db.sistema.organizacion.update({
    where: { id: palermo.organizacionId },
    data: { creadoEn: hace(10), plan: 'TORNEO', localidad: 'Palermo', provincia: 'CABA' },
  });
  await db.sistema.sesionRefresh.updateMany({
    where: { organizacionActivaId: palermo.organizacionId },
    data: { creadoEn: hace(9) },
  });

  // ── Liga fundadora con señales de abandono: pocas actas, solo pagos manuales y el panel sin uso hace 3 semanas ──
  const quilmes = await registrar('quilmes@potrero.app', 'Raúl Benítez', 'Liga Amigos de Quilmes');
  const t = await torneos.crear(quilmes, {
    nombre: 'Clausura Veteranos',
    modalidad: 'F7',
    formato: 'LIGA',
    idaYVuelta: false,
    cupo: 8,
    inscripcion: 60_000,
    puntosVictoria: 3,
    puntosEmpate: 1,
    umbralAmarillas: 5,
  });
  const nombres = [
    'Los Pibes de Bernal',
    'Ezpeleta Juniors',
    'La Cañada FC',
    'Don Bosco Viejos',
    'Solano United',
    'Quilmes Oeste',
  ];
  const ids: string[] = [];
  for (const [i, nombre] of nombres.entries()) {
    const e = await equipos.crear(quilmes, { nombre });
    ids.push(e.id);
    const r = await cobros.inscribir(quilmes, t.id, e.id);
    await cobros.registrarPagoManual(quilmes, r.inscripcion.id, {
      metodo: i % 2 ? 'TRANSFERENCIA' : 'EFECTIVO',
      monto: 60_000,
    });
  }
  // Tres fechas ya jugadas (9 partidos) y solo 3 actas cargadas en la plataforma.
  await db.enOrg(quilmes.organizacionId, async (tx) => {
    const sede = await tx.sede.create({
      data: { organizacionId: quilmes.organizacionId, nombre: 'Club Bernal' },
    });
    const cancha = await tx.cancha.create({
      data: { organizacionId: quilmes.organizacionId, sedeId: sede.id, nombre: 'Cancha 1' },
    });
    const cruces = [
      [
        [0, 5],
        [1, 4],
        [2, 3],
      ],
      [
        [0, 4],
        [5, 3],
        [1, 2],
      ],
      [
        [0, 3],
        [4, 2],
        [5, 1],
      ],
    ];
    for (const [f, fecha] of cruces.entries())
      for (const [j, [l, v]] of fecha.entries()) {
        const inicio = new Date(hace(28 - f * 7).setUTCHours(18 + j, 0, 0, 0));
        const cerrado = f === 0;
        await tx.partido.create({
          data: {
            organizacionId: quilmes.organizacionId,
            torneoId: t.id,
            fecha: f + 1,
            localId: ids[l!]!,
            visitanteId: ids[v!]!,
            canchaId: cancha.id,
            inicio,
            ...(cerrado
              ? {
                  estado: 'FINALIZADO',
                  golesLocal: j,
                  golesVisitante: 1,
                  cerradoEn: new Date(inicio.getTime() + 3_600_000),
                }
              : {}),
          },
        });
      }
    await tx.torneo.update({ where: { id: t.id }, data: { estado: 'EN_CURSO' } });
  });
  await db.sistema.organizacion.update({
    where: { id: quilmes.organizacionId },
    data: {
      creadoEn: hace(75),
      plan: 'LIGA',
      fundadora: true,
      localidad: 'Quilmes',
      provincia: 'Buenos Aires',
    },
  });
  await db.sistema.sesionRefresh.updateMany({
    where: { organizacionActivaId: quilmes.organizacionId },
    data: { creadoEn: hace(21) },
  });

  // La plantilla cierra todas sus actas en el momento de cargar la semilla: para el gráfico de partidos cerrados por
  // semana, cada acta ya jugada se fecha una hora después de su partido, como pasaría en una liga real.
  const cerrados = await db.sistema.partido.findMany({
    where: { cerradoEn: { not: null }, inicio: { lt: hace(0) } },
    select: { id: true, inicio: true },
  });
  for (const p of cerrados)
    await db.sistema.partido.update({
      where: { id: p.id },
      data: { cerradoEn: new Date(p.inicio!.getTime() + 3_600_000) },
    });

  // Fechas de alta escalonadas de las ligas de la demo, para el gráfico de ligas nuevas por mes.
  for (const [slug, dias] of [
    ['liga-barrial-sur', 150],
    ['veteranos-del-oeste', 110],
    ['complejo-norte', 40],
  ] as const)
    await db.sistema.organizacion.updateMany({ where: { slug }, data: { creadoEn: hace(dias) } });
}
