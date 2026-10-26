// Datos de demo del panel del organizador (E18) y de la cuenta (E04-10). Se cargan después de la plantilla, solo en la
// semilla local (`pnpm demo`): un partido en vivo, alertas para resolver, sugerencias y una segunda organización.
import { randomUUID } from 'node:crypto';
import { sumarDias } from '@potrero/shared';
import { ArbitrosService } from '../arbitros/arbitros.js';
import { CobrosService } from '../cobros/cobros.js';
import type { Contexto } from '../comun/http.js';
import { DbService } from '../db/db.service.js';
import { EquiposService } from '../equipos/equipos.js';
import { PartidosService } from '../partidos/partidos.js';
import { TorneosService } from '../torneos/torneos.js';
import { TribunalService } from '../tribunal/tribunal.js';
import type { Resolver } from './plantilla.js';

const MIN = 60_000;

export async function cargarPanelDemo(app: Resolver, c: Contexto, torneoId: string) {
  const db = app.get(DbService);
  const partidos = app.get(PartidosService);
  const arbitros = app.get(ArbitrosService);
  const torneos = app.get(TorneosService);
  const tribunal = app.get(TribunalService);
  const ahora = Date.now();

  const fixture = await torneos.partidos(c, torneoId);
  const fecha4 = fixture.filter((p) => p.fecha === 4 && p.estado === 'PROGRAMADO');
  // El partido en vivo no es el del expulsado de la fecha 3: su acta queda sin empezar, con él "no habilitado".
  const roja = await db.enOrg(c.organizacionId, (tx) =>
    tx.sancion.findFirst({ where: { torneoId, causa: 'ROJA_DIRECTA' } }),
  );
  const juega = (p: (typeof fecha4)[number], equipoId?: string) =>
    !!equipoId && (p.localId === equipoId || p.visitanteId === equipoId);
  const enVivo = fecha4.find((p) => !juega(p, roja?.equipoId)) ?? fecha4[0]!;
  const resto = fecha4.filter((p) => p.id !== enVivo.id);
  const [sinArbitro, sinCargar] = [resto[0]!, resto[1]!];

  const mover = (id: string, inicio: Date) =>
    db.enOrg(c.organizacionId, (tx) => tx.partido.update({ where: { id }, data: { inicio } }));

  // Un jugador del local que el tribunal suspendió una fecha por lo que pasó en la fecha 3.
  const actaPrevia = await partidos.acta(c, enVivo.id);
  const origen = fixture.find((p) => p.fecha === 3 && juega(p, enVivo.localId));
  let suspendidoId: string | undefined;
  if (origen) {
    suspendidoId = actaPrevia.local.jugadores[0]!.id;
    const exp = await tribunal.abrir(c, {
      tipo: 'AGRESION',
      torneoId,
      partidoId: origen.id,
      equipoId: enVivo.localId,
      jugadorId: suspendidoId,
      motivo: 'Insultos al árbitro',
      informeArbitro: 'Al terminar el partido increpó al árbitro en la salida del vestuario.',
    });
    await tribunal.resolver(c, exp.id, { partidos: 1, multa: 0, resolucion: 'Una fecha de suspensión.' });
  }

  // ── Partido en vivo: se adelantó a hoy y va 2 a 1 a los 32 minutos ──
  await mover(enVivo.id, new Date(ahora - 32 * MIN));
  const acta = await partidos.acta(c, enVivo.id);
  await partidos.iniciar(c, enVivo.id);
  const habil = (eq: typeof acta.local) => eq.jugadores.filter((j) => j.habilitado);
  const goles: [typeof acta.local, string, number][] = [
    [acta.local, habil(acta.local)[1]!.id, 12],
    [acta.visitante, habil(acta.visitante)[2]!.id, 25],
    // El gol del suspendido: el acta lo deja cargar, avisa y abre el expediente del tribunal.
    [acta.local, suspendidoId ?? habil(acta.local)[3]!.id, 30],
  ];
  for (const [eq, jugadorId, minuto] of goles)
    await partidos.cargarEvento(c, enVivo.id, {
      tipo: 'GOL',
      equipoId: eq.id,
      jugadorId,
      minuto,
      clientUuid: randomUUID(),
    });
  await partidos.cargarEvento(c, enVivo.id, {
    tipo: 'AMARILLA',
    equipoId: acta.visitante.id,
    jugadorId: habil(acta.visitante)[4]!.id,
    minuto: 18,
    clientUuid: randomUUID(),
  });

  // ── Otro partido hoy más tarde, todavía sin árbitro ──
  await mover(sinArbitro.id, new Date(ahora + 150 * MIN));
  await arbitros.designar(c, sinArbitro.id, { arbitroId: null });

  // ── Un partido de ayer que se jugó y nadie cargó el acta ──
  await mover(sinCargar.id, new Date(ahora - 22 * 60 * MIN));

  await db.enOrg(c.organizacionId, async (tx) => {
    // Los cobros llegaron a lo largo del último mes (la plantilla los carga todos juntos): así la línea del panel tiene historia.
    const pagos = await tx.pago.findMany({ where: { estado: 'APROBADO' }, orderBy: { creadoEn: 'asc' } });
    for (const [i, pago] of pagos.entries())
      await tx.pago.update({
        where: { id: pago.id },
        data: { acreditadoEn: new Date(ahora - (27 - Math.floor((i * 25) / pagos.length)) * 86_400_000) },
      });

    // El aviso del fixture se mandó antes de la fecha 1: la fecha que viene todavía no se avisó.
    const inicio = fixture.find((p) => p.fecha === 1)?.inicio;
    if (inicio)
      await tx.difusion.updateMany({
        where: { plantilla: 'FIXTURE_PUBLICADO' },
        data: { creadoEn: new Date(new Date(inicio).getTime() - 3 * 86_400_000) },
      });

    // Una transferencia que entró antes de abrir la caja: está cobrada pero sin asiento. Se concilia al abrir la caja.
    const deuda = await tx.cargo.findFirst({
      where: { estado: 'PENDIENTE', categoria: 'INSCRIPCIONES', inscripcion: { torneoId } },
      orderBy: { creadoEn: 'desc' },
    });
    if (deuda)
      await tx.pago.create({
        data: {
          organizacionId: c.organizacionId,
          cargoId: deuda.id,
          metodo: 'TRANSFERENCIA',
          monto: Math.round(deuda.monto / 2),
          estado: 'APROBADO',
          comprobante: 'Transferencia · seña',
          registradoPorId: c.usuarioId,
          acreditadoEn: new Date(ahora - 2 * 86_400_000),
        },
      });
  });
}

/** Segunda organización del usuario de la demo, para mostrar el selector de organización activa (E04-10). */
export async function cargarSegundaOrganizacion(app: Resolver, usuarioId: string) {
  const db = app.get(DbService);
  const torneos = app.get(TorneosService);
  const equipos = app.get(EquiposService);
  const cobros = app.get(CobrosService);
  const org = await db.app.organizacion.create({
    data: {
      nombre: 'Veteranos del Oeste',
      slug: 'veteranos-del-oeste',
      plan: 'LIGA',
      membresias: { create: { usuarioId, rol: 'ADMINISTRADOR' } },
    },
  });
  const c: Contexto = { usuarioId, organizacionId: org.id, rol: 'ADMINISTRADOR' };
  const t = await torneos.crear(c, {
    nombre: 'Senior +40',
    modalidad: 'F11',
    formato: 'LIGA',
    idaYVuelta: false,
    cupo: 10,
    inscripcion: 90000,
    puntosVictoria: 3,
    puntosEmpate: 1,
    umbralAmarillas: 5,
  });
  await torneos.fijarVencimiento(c, t.id, { vence: sumarDias(new Date().toISOString().slice(0, 10), 10) });
  for (const nombre of ['Los Históricos', 'Club Haedo', 'Ramos Mejía FC', 'La Vieja Guardia']) {
    const e = await equipos.crear(c, { nombre, capitanNombre: 'Capitán de ' + nombre });
    const { cargo } = await cobros.inscribir(c, t.id, e.id);
    if (cargo && nombre !== 'La Vieja Guardia')
      await cobros.pagoManual(c, cargo.id, {
        metodo: 'EFECTIVO',
        monto: cargo.monto,
        comprobante: 'Efectivo',
      });
  }
  return org;
}
