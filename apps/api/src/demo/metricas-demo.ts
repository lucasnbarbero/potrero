// Historia de la liga para que las métricas (E24) tengan sentido en la demo: dos torneos del año pasado ya terminados
// (con equipos que repiten y otros que se fueron, cobros con mezcla de medios y partidos jugados) y fechas de pago
// realistas en los torneos de la plantilla. Se llama una sola vez desde la semilla, después de `cargarPlantilla`.
import { comisionPlataforma, REGLAMENTO_POR_DEFECTO, type MetodoPago } from '@potrero/shared';
import type { Contexto } from '../comun/http.js';
import { registrarPago } from '../caja/libro.js';
import { CobrosService } from '../cobros/cobros.js';
import { DbService } from '../db/db.service.js';
import { EquiposService } from '../equipos/equipos.js';
import { TorneosService } from '../torneos/torneos.js';
import type { Resolver } from './plantilla.js';

/** Un pago del torneo histórico: medio, qué parte del arancel y cuántos días antes (+) o después (−) del inicio. */
type PagoHistorico = { metodo: MetodoPago; parte?: number; diasAntes: number };

interface TorneoHistorico {
  nombre: string;
  creado: string;
  primerDia: string;
  horarios: string[];
  inscripcion: number;
  /** Equipos y cómo pagó cada uno. */
  equipos: [nombre: string, pago: PagoHistorico][];
  /** Número de fecha con un W.O. (el visitante no se presentó). */
  fechaWO?: number;
}

const HISTORIA: TorneoHistorico[] = [
  {
    // Sábados a la tarde: 6 equipos, 3 partidos por fecha en 2 canchas y 2 horarios.
    nombre: 'Apertura 2025',
    creado: '2025-02-10',
    primerDia: '2025-03-08',
    horarios: ['15:00', '16:00'],
    inscripcion: 45000,
    equipos: [
      ['Deportivo Sur', { metodo: 'EFECTIVO', diasAntes: 12 }],
      ['Real Barrio', { metodo: 'TRANSFERENCIA', diasAntes: 9 }],
      ['Los Pibes', { metodo: 'EFECTIVO', diasAntes: 5 }],
      ['La Banda', { metodo: 'EFECTIVO', diasAntes: -6 }],
      ['Defensores del Oeste', { metodo: 'MERCADO_PAGO', diasAntes: 15 }],
      ['Unión Vecinal', { metodo: 'EFECTIVO', diasAntes: 2 }],
    ],
  },
  {
    // Domingos a la mañana: 7 equipos (uno libre por fecha). La Banda y Defensores no volvieron.
    nombre: 'Clausura 2025',
    creado: '2025-07-14',
    primerDia: '2025-08-10',
    horarios: ['10:00', '11:00'],
    inscripcion: 50000,
    fechaWO: 5,
    equipos: [
      ['Deportivo Sur', { metodo: 'EFECTIVO', diasAntes: 10 }],
      ['Real Barrio', { metodo: 'MERCADO_PAGO', diasAntes: 8 }],
      ['Los Pibes', { metodo: 'EFECTIVO', diasAntes: 3 }],
      ['Atlético Norte', { metodo: 'TRANSFERENCIA', diasAntes: 6 }],
      ['Villa Unión', { metodo: 'EFECTIVO', diasAntes: -13 }],
      ['Unión Vecinal', { metodo: 'TRANSFERENCIA', parte: 0.5, diasAntes: 4 }],
      ['Los Halcones', { metodo: 'EFECTIVO', diasAntes: 1 }],
    ],
  },
];

const instanteDelDia = (dia: string, dias: number, hora = '12:00') => {
  const d = new Date(`${dia}T${hora}:00-03:00`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d;
};

export async function cargarHistorialDeMetricas(app: Resolver, c: Contexto) {
  const db = app.get(DbService);
  const torneos = app.get(TorneosService);
  const equipos = app.get(EquiposService);
  const cobros = app.get(CobrosService);
  const { plan } = await db.app.organizacion.findUniqueOrThrow({ where: { id: c.organizacionId } });
  const canchas = await db.enOrg(c.organizacionId, (tx) => tx.cancha.findMany({ orderBy: { nombre: 'asc' } }));
  let azarS = 20250308;
  const azar = () => {
    azarS = (azarS * 1103515245 + 12345) % 2147483648;
    return azarS / 2147483648;
  };

  for (const h of HISTORIA) {
    const t = await torneos.crear(c, {
      nombre: h.nombre,
      modalidad: 'F5',
      formato: 'LIGA',
      idaYVuelta: false,
      cupo: 8,
      inscripcion: h.inscripcion,
      puntosVictoria: 3,
      puntosEmpate: 1,
      umbralAmarillas: 5,
    });
    const creado = instanteDelDia(h.creado, 0);
    for (const [i, [nombre, p]] of h.equipos.entries()) {
      const existente = await db.enOrg(c.organizacionId, (tx) => tx.equipo.findFirst({ where: { nombre } }));
      const equipo = existente ?? (await equipos.crear(c, { nombre }));
      const { inscripcion, cargo } = await cobros.inscribir(c, t.id, equipo.id);
      // El pago es de otra época: se registra con su fecha (y su asiento en la caja con esa fecha), no con la de hoy.
      await db.enOrg(c.organizacionId, async (tx) => {
        const cuando = instanteDelDia(h.primerDia, p.diasAntes, '18:30');
        const monto = Math.round(cargo!.monto * (p.parte ?? 1));
        const pago = await tx.pago.create({
          data: {
            organizacionId: c.organizacionId,
            cargoId: cargo!.id,
            metodo: p.metodo,
            monto,
            comisionPlataforma: comisionPlataforma(monto, plan, p.metodo),
            estado: 'APROBADO',
            pasarelaPagoId:
              p.metodo === 'MERCADO_PAGO' ? `SIM-HIST-${c.organizacionId}-${t.id}-${i}` : null,
            comprobante: p.metodo === 'EFECTIVO' ? `Recibo ${String(100 + i).padStart(4, '0')}` : null,
            registradoPorId: p.metodo === 'MERCADO_PAGO' ? null : c.usuarioId,
            creadoEn: cuando,
            acreditadoEn: cuando,
          },
        });
        await registrarPago(tx, c.organizacionId, pago.id);
        await tx.cargo.update({
          where: { id: cargo!.id },
          data: { estado: monto >= cargo!.monto ? 'PAGADO' : 'PENDIENTE', creadoEn: creado },
        });
        // Con la seña paga, la liga lo dejó jugar: la inscripción quedó confirmada.
        await tx.inscripcion.update({
          where: { id: inscripcion.id },
          data: { estado: 'CONFIRMADA', creadoEn: creado },
        });
      });
    }

    await torneos.generarFixture(c, t.id, {
      primerDia: h.primerDia,
      diasEntreFechas: 7,
      horarios: h.horarios,
      canchaIds: canchas.map((x) => x.id),
    });

    // Todo jugado. Los resultados se cargan directo (sin acta): el torneo es historia y no debe disparar avisos,
    // sanciones ni gastos automáticos de la caja de hoy.
    await db.enOrg(c.organizacionId, async (tx) => {
      const partidos = await tx.partido.findMany({ where: { torneoId: t.id }, orderBy: [{ fecha: 'asc' }, { inicio: 'asc' }] });
      for (const [i, p] of partidos.entries()) {
        const cerradoEn = new Date(p.inicio!.getTime() + 60 * 60 * 1000);
        const wo = p.fecha === h.fechaWO && partidos.findIndex((x) => x.fecha === h.fechaWO) === i;
        await tx.partido.update({
          where: { id: p.id },
          data: wo
            ? {
                estado: 'WO',
                ganadorWOId: p.localId,
                golesLocal: REGLAMENTO_POR_DEFECTO.golesWO,
                golesVisitante: 0,
                cerradoEn,
              }
            : {
                estado: 'FINALIZADO',
                golesLocal: Math.floor(azar() * 5),
                golesVisitante: Math.floor(azar() * 4),
                cerradoEn,
              },
        });
      }
      await tx.torneo.update({ where: { id: t.id }, data: { estado: 'FINALIZADO', creadoEn: creado } });
    });
  }

  // Los torneos de la plantilla cobran con la fecha de hoy. Para que "cobrado antes del inicio" sea creíble, las
  // inscripciones de los torneos que ya empezaron se pagaron días antes del primer partido; el efectivo de Apertura
  // ("Recibo 0012") llegó tarde, después de empezar. El asiento de la caja conserva la fecha en que se cargó.
  await db.enOrg(c.organizacionId, async (tx) => {
    const empezados = await tx.torneo.findMany({
      where: { nombre: { in: ['Apertura 2026', 'Copa Relámpago'] } },
      include: { partidos: { select: { inicio: true }, orderBy: { inicio: 'asc' }, take: 1 } },
    });
    for (const t of empezados) {
      const inicio = t.partidos[0]?.inicio;
      if (!inicio) continue;
      const pagos = await tx.pago.findMany({
        where: { estado: 'APROBADO', cargo: { fecha: null, categoria: 'INSCRIPCIONES', inscripcion: { torneoId: t.id } } },
        orderBy: { creadoEn: 'asc' },
      });
      for (const [i, p] of pagos.entries()) {
        const tarde = p.comprobante === 'Recibo 0012';
        const cuando = new Date(inicio.getTime() + (tarde ? 9 : -(2 + (i % 6) * 2)) * 24 * 60 * 60 * 1000);
        await tx.pago.update({ where: { id: p.id }, data: { creadoEn: cuando, acreditadoEn: cuando } });
      }
    }
  });
}
