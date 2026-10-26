import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Injectable,
  Logger,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { registrarPago } from '../caja/libro.js';
import {
  cobrosPorFechaSchema,
  type CobrosPorFechaInput,
  comisionPlataforma,
  DIAS_ANTICIPACION_COBRO_POR_FECHA,
  desdeFechaAlConfigurar,
  deudaPorFecha,
  inscripcionConfirmada,
  pagoManualSchema,
  type PagoManualInput,
  type Plan,
} from '@potrero/shared';
import { z } from 'zod';
import { auditar } from '../comun/auditoria.js';
import { type Contexto, Ctx, ErrorNegocio, noEncontrado, Permiso, Publico, Zod } from '../comun/http.js';
import { hoyEnArgentina } from '../comun/formato.js';
import { config } from '../config.js';
import { DbService, enSerie, type Tx } from '../db/db.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { configDelTorneo, sincronizarCobrosPorFecha } from './por-fecha.js';

// ───────────── Pasarela de pagos ─────────────

export interface Preferencia {
  preferenciaId: string;
  urlPago: string;
}

/**
 * Interfaz de la pasarela. La implementación simulada y la de Mercado Pago (split 1:1 con OAuth, E06-04/05)
 * son intercambiables por configuración (PASARELA_PAGOS).
 */
export interface Pasarela {
  crearPreferencia(d: {
    titulo: string;
    monto: number;
    comision: number;
    referencia: string;
  }): Promise<Preferencia>;
}

/** Pasarela simulada: el "checkout" es una página de la web que aprueba o rechaza el pago. Para desarrollo y demos. */
class PasarelaSimulada implements Pasarela {
  async crearPreferencia() {
    const preferenciaId = `SIM-PREF-${randomBytes(8).toString('hex')}`;
    return { preferenciaId, urlPago: `${config.WEB_URL}/pago/${preferenciaId}` };
  }
}

function crearPasarela(): Pasarela {
  if (config.PASARELA_PAGOS === 'mercadopago')
    throw new Error(
      'La integración con Mercado Pago real requiere credenciales y el acuerdo de Marketplace (backlog E06-04).',
    );
  return new PasarelaSimulada();
}

/** Firma de las notificaciones de pago (mismo esquema que valida el webhook). */
export const firmar = (cuerpo: string) =>
  createHmac('sha256', config.WEBHOOK_SECRET).update(cuerpo).digest('hex');

const notificacionSchema = z.object({
  preferenciaId: z.string().min(1),
  pasarelaPagoId: z.string().min(1),
  estado: z.enum(['aprobado', 'rechazado']),
});
type Notificacion = z.infer<typeof notificacionSchema>;

// ───────────── Servicio ─────────────

/**
 * Recalcula el estado del cargo y de la inscripción según los pagos aprobados. La inscripción se confirma cuando están
 * pagados los cargos de inscripción y seña: las cuotas por fecha, los seguros y las multas no la traban (E06-20).
 */
async function actualizarCargo(tx: Tx, cargoId: string) {
  const cargo = await tx.cargo.findUniqueOrThrow({ where: { id: cargoId }, include: { pagos: true } });
  const pagado = cargo.pagos.filter((p) => p.estado === 'APROBADO').reduce((s, p) => s + p.monto, 0);
  const estado = pagado >= cargo.monto ? 'PAGADO' : cargo.estado === 'ANULADO' ? 'ANULADO' : 'PENDIENTE';
  await tx.cargo.update({ where: { id: cargoId }, data: { estado } });
  if (estado === 'PAGADO') {
    const [inscripcion, cargos] = await enSerie([
      () => tx.inscripcion.findUniqueOrThrow({ where: { id: cargo.inscripcionId } }),
      () =>
        tx.cargo.findMany({
          where: { inscripcionId: cargo.inscripcionId },
          select: { estado: true, categoria: true, fecha: true },
        }),
    ]);
    if (inscripcion.estado === 'PENDIENTE' && inscripcionConfirmada(cargos))
      await tx.inscripcion.update({ where: { id: cargo.inscripcionId }, data: { estado: 'CONFIRMADA' } });
  }
}

/** Crea la inscripción y su cargo de inscripción. Controla cupo y que el torneo esté en inscripción. */
export async function inscribirEquipo(tx: Tx, organizacionId: string, torneoId: string, equipoId: string) {
  const torneo = await tx.torneo.findUnique({ where: { id: torneoId } });
  if (!torneo) throw noEncontrado('el torneo');
  if (torneo.estado !== 'INSCRIPCION') throw new ErrorNegocio('La inscripción de este torneo está cerrada.');
  const inscriptos = await tx.inscripcion.count({ where: { torneoId, estado: { not: 'BAJA' } } });
  if (inscriptos >= torneo.cupo)
    throw new ErrorNegocio(`El torneo completó su cupo de ${torneo.cupo} equipos.`);
  const inscripcion = await tx.inscripcion.create({
    data: {
      organizacionId,
      torneoId,
      equipoId,
      estado: torneo.inscripcion === 0 ? 'CONFIRMADA' : 'PENDIENTE',
    },
  });
  const cargo =
    torneo.inscripcion > 0
      ? await tx.cargo.create({
          data: {
            organizacionId,
            inscripcionId: inscripcion.id,
            concepto: `Inscripción ${torneo.nombre}`,
            monto: torneo.inscripcion,
            vence: torneo.venceInscripcion,
          },
        })
      : null;
  return { inscripcion, cargo };
}

@Injectable()
export class CobrosService implements OnModuleInit, OnModuleDestroy {
  private readonly pasarela = crearPasarela();
  private readonly log = new Logger('Cobros');
  private temporizador?: NodeJS.Timeout;
  private primera?: NodeJS.Timeout;
  constructor(private readonly db: DbService) {}

  /** Estado de inscripciones y pagos de un torneo (pantalla de inscripciones). */
  inscripciones(c: Contexto, torneoId: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const lista = await tx.inscripcion.findMany({
        where: { torneoId },
        orderBy: { creadoEn: 'asc' },
        include: {
          equipo: { include: { _count: { select: { plantel: true } } } },
          cargos: { include: { pagos: true }, orderBy: [{ vence: 'asc' }, { creadoEn: 'asc' }] },
        },
      });
      const hoy = hoyEnArgentina();
      const aprobado = (pagos: { estado: string; monto: number }[]) =>
        pagos.filter((p) => p.estado === 'APROBADO').reduce((s, p) => s + p.monto, 0);
      return lista.map((i) => {
        // Los cargos anulados (por ejemplo, la cuota de un partido suspendido) no suman deuda.
        const vigentes = i.cargos.filter((x) => x.estado !== 'ANULADO');
        const total = vigentes.reduce((s, x) => s + x.monto, 0);
        const pagos = vigentes.flatMap((x) => x.pagos);
        const pagado = aprobado(pagos);
        const cargos = i.cargos.map((x) => ({
          id: x.id,
          concepto: x.concepto,
          monto: x.monto,
          estado: x.estado,
          categoria: x.categoria,
          fecha: x.fecha,
          vence: x.vence ? x.vence.toISOString().slice(0, 10) : null,
          pagado: aprobado(x.pagos),
        }));
        return {
          id: i.id,
          estado: i.estado,
          equipo: {
            id: i.equipo.id,
            nombre: i.equipo.nombre,
            capitan: i.equipo.capitanNombre,
            jugadores: i.equipo._count.plantel,
          },
          total,
          pagado,
          debe: Math.max(0, total - pagado),
          /** Cuotas y seguros que vencen hasta hoy y siguen impagos (E06-20). */
          deudaPorFecha: deudaPorFecha(cargos, hoy),
          cargos,
          pagos: pagos.map((p) => ({
            id: p.id,
            metodo: p.metodo,
            monto: p.monto,
            estado: p.estado,
            comision: p.comisionPlataforma,
            fecha: p.acreditadoEn ?? p.creadoEn,
          })),
        };
      });
    });
  }

  inscribir(c: Contexto, torneoId: string, equipoId: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      if (!(await tx.equipo.findUnique({ where: { id: equipoId } }))) throw noEncontrado('el equipo');
      const r = await inscribirEquipo(tx, c.organizacionId, torneoId, equipoId);
      await auditar(tx, c, 'inscripcion.crear', 'inscripcion', r.inscripcion.id, { despues: r });
      return r;
    });
  }

  // ───────────── Cuota por fecha y seguro por jugador (E06-20, E06-21) ─────────────

  /** Cada hora genera los cargos de las fechas que se acercan. En los tests se llama a mano. */
  onModuleInit() {
    if (config.NODE_ENV === 'test') return;
    this.temporizador = setInterval(() => void this.generarCobrosPorFecha(), 3_600_000);
    this.temporizador.unref();
    this.primera = setTimeout(() => void this.generarCobrosPorFecha(), 10_000);
    this.primera.unref();
  }

  onModuleDestroy() {
    clearInterval(this.temporizador);
    clearTimeout(this.primera);
  }

  /** Recorre los torneos en curso de todas las organizaciones y sincroniza sus cargos por fecha. */
  async generarCobrosPorFecha(ahora = new Date()) {
    try {
      // Tarea de sistema: hay que saber qué organizaciones tienen torneos en curso antes de entrar a cada una con RLS.
      const torneos = await this.db.sistema.torneo.findMany({
        where: { estado: 'EN_CURSO', cobrosPorFecha: { not: Prisma.DbNull } },
        select: { id: true, organizacionId: true },
      });
      let creados = 0;
      for (const t of torneos)
        creados += (
          await this.db.enOrg(t.organizacionId, (tx) =>
            sincronizarCobrosPorFecha(tx, t.organizacionId, t.id, { ahora }),
          )
        ).creados;
      return creados;
    } catch (e) {
      this.log.error(`La generación de cuotas por fecha falló: ${e instanceof Error ? e.message : e}`);
      return 0;
    }
  }

  /** Configuración y cargos por fecha del torneo, con los totales de cuotas y de seguros. */
  cobrosPorFecha(c: Contexto, torneoId: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const torneo = await tx.torneo.findUnique({ where: { id: torneoId } });
      if (!torneo) throw noEncontrado('el torneo');
      const cargos = await tx.cargo.findMany({
        where: { inscripcion: { torneoId }, fecha: { not: null } },
        include: { pagos: { where: { estado: 'APROBADO' } }, inscripcion: { include: { equipo: true } } },
        orderBy: [{ fecha: 'asc' }, { creadoEn: 'asc' }],
      });
      const lista = cargos.map((x) => ({
        id: x.id,
        fecha: x.fecha!,
        tipo: x.categoria === 'SEGUROS' ? ('SEGURO' as const) : ('CUOTA' as const),
        equipo: { id: x.inscripcion.equipoId, nombre: x.inscripcion.equipo.nombre },
        concepto: x.concepto,
        monto: x.monto,
        pagado: x.pagos.reduce((s, p) => s + p.monto, 0),
        estado: x.estado,
        vence: x.vence ? x.vence.toISOString().slice(0, 10) : null,
      }));
      const totales = (tipo: 'CUOTA' | 'SEGURO') => {
        const vigentes = lista.filter((x) => x.tipo === tipo && x.estado !== 'ANULADO');
        const total = vigentes.reduce((s, x) => s + x.monto, 0);
        const cobrado = vigentes.reduce((s, x) => s + x.pagado, 0);
        return { total, cobrado, pendiente: Math.max(0, total - cobrado) };
      };
      return {
        config: configDelTorneo(torneo),
        anticipacionDias: DIAS_ANTICIPACION_COBRO_POR_FECHA,
        totales: { cuotas: totales('CUOTA'), seguros: totales('SEGURO') },
        cargos: lista,
      };
    });
  }

  /** Guarda la cuota por fecha y el seguro del torneo y ajusta los cargos pendientes sin pagos a los montos nuevos. */
  configurarCobrosPorFecha(c: Contexto, torneoId: string, d: CobrosPorFechaInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const antes = await tx.torneo.findUnique({ where: { id: torneoId } });
      if (!antes) throw noEncontrado('el torneo');
      // Con el torneo empezado, lo que se activa ahora se cobra desde la próxima fecha: nunca las ya jugadas.
      const partidos = await tx.partido.findMany({
        where: { torneoId },
        select: { fecha: true, estado: true },
      });
      const config = { ...d, ...desdeFechaAlConfigurar(configDelTorneo(antes), d, partidos) };
      await tx.torneo.update({ where: { id: torneoId }, data: { cobrosPorFecha: config } });
      await auditar(tx, c, 'torneo.cobros_por_fecha', 'torneo', torneoId, {
        antes: configDelTorneo(antes),
        despues: config,
      });
      const r = await sincronizarCobrosPorFecha(tx, c.organizacionId, torneoId, {
        repreciar: true,
        usuarioId: c.usuarioId,
      });
      return { config, ...r };
    });
  }

  /** Genera ya los cargos de las fechas próximas (lo mismo que hace la tarea de cada hora). */
  generarCobrosDelTorneo(c: Contexto, torneoId: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      if (!(await tx.torneo.findUnique({ where: { id: torneoId } }))) throw noEncontrado('el torneo');
      return sincronizarCobrosPorFecha(tx, c.organizacionId, torneoId, { usuarioId: c.usuarioId });
    });
  }

  /**
   * Deuda de cuotas y seguros de los dos equipos de un partido, para el acta. Con `deudaBloqueaJugar` encendido, el que
   * tiene cuotas vencidas impagas figura como no habilitado (por ahora es una alerta: el acta no impide cargarlo).
   */
  deudaDelPartido(c: Contexto, partidoId: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const p = await tx.partido.findUnique({ where: { id: partidoId }, include: { torneo: true } });
      if (!p) throw noEncontrado('el partido');
      const config = configDelTorneo(p.torneo);
      const hoy = hoyEnArgentina();
      const [equipos, cargos] = await enSerie([
        () => tx.equipo.findMany({ where: { id: { in: [p.localId, p.visitanteId] } } }),
        () =>
          tx.cargo.findMany({
            where: {
              inscripcion: { torneoId: p.torneoId, equipoId: { in: [p.localId, p.visitanteId] } },
              fecha: { not: null },
              estado: 'PENDIENTE',
            },
            include: { pagos: { where: { estado: 'APROBADO' } }, inscripcion: true },
          }),
      ]);
      const deEquipo = (equipoId: string) => {
        const d = deudaPorFecha(
          cargos
            .filter((x) => x.inscripcion.equipoId === equipoId)
            .map((x) => ({
              concepto: x.concepto,
              estado: x.estado,
              fecha: x.fecha,
              vence: x.vence ? x.vence.toISOString().slice(0, 10) : null,
              monto: x.monto,
              pagado: x.pagos.reduce((s, pg) => s + pg.monto, 0),
            })),
          hoy,
        );
        return {
          equipoId,
          nombre: equipos.find((e) => e.id === equipoId)?.nombre ?? '—',
          ...d,
          habilitado: !(config.deudaBloqueaJugar && d.vencido > 0),
        };
      };
      return {
        deudaBloqueaJugar: config.deudaBloqueaJugar,
        local: deEquipo(p.localId),
        visitante: deEquipo(p.visitanteId),
      };
    });
  }

  /** Genera el link de pago de un cargo. La comisión de Potrero depende del plan de la organización. */
  async linkDePago(organizacionId: string, cargoId: string): Promise<Preferencia> {
    return this.db.enOrg(organizacionId, async (tx) => {
      const cargo = await tx.cargo.findUnique({ where: { id: cargoId }, include: { pagos: true } });
      if (!cargo) throw noEncontrado('el cargo');
      if (cargo.estado !== 'PENDIENTE') throw new ErrorNegocio('Este cargo ya está pagado.');
      const pagado = cargo.pagos.filter((p) => p.estado === 'APROBADO').reduce((s, p) => s + p.monto, 0);
      const monto = cargo.monto - pagado;
      const org = await tx.organizacion.findUniqueOrThrow({ where: { id: organizacionId } });
      const comision = comisionPlataforma(monto, org.plan as Plan, 'MERCADO_PAGO');
      const pref = await this.pasarela.crearPreferencia({
        titulo: cargo.concepto,
        monto,
        comision,
        referencia: cargo.id,
      });
      await tx.pago.create({
        data: {
          organizacionId,
          cargoId,
          metodo: 'MERCADO_PAGO',
          monto,
          comisionPlataforma: comision,
          preferenciaId: pref.preferenciaId,
        },
      });
      return pref;
    });
  }

  /** Pago en efectivo o transferencia registrado por el organizador. No paga comisión. */
  pagoManual(c: Contexto, cargoId: string, d: PagoManualInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const cargo = await tx.cargo.findUnique({ where: { id: cargoId } });
      if (!cargo) throw noEncontrado('el cargo');
      const pago = await tx.pago.create({
        data: {
          organizacionId: c.organizacionId,
          cargoId,
          metodo: d.metodo,
          monto: d.monto,
          comisionPlataforma: 0,
          estado: 'APROBADO',
          comprobante: d.comprobante ?? null,
          registradoPorId: c.usuarioId,
          acreditadoEn: new Date(),
        },
      });
      await actualizarCargo(tx, cargoId);
      await registrarPago(tx, c.organizacionId, pago.id);
      await auditar(tx, c, 'pago.manual', 'pago', pago.id, { despues: pago });
      return pago;
    });
  }

  /** Datos públicos del checkout simulado. */
  async checkout(preferenciaId: string) {
    const pago = await this.db.sistema.pago.findUnique({
      where: { preferenciaId },
      include: { cargo: { include: { inscripcion: { include: { equipo: true, torneo: true } } } } },
    });
    if (!pago) throw noEncontrado('el pago');
    const org = await this.db.sistema.organizacion.findUniqueOrThrow({ where: { id: pago.organizacionId } });
    const t = pago.cargo.inscripcion.torneo;
    return {
      estado: pago.estado,
      concepto: pago.cargo.concepto,
      monto: pago.monto,
      equipo: pago.cargo.inscripcion.equipo.nombre,
      organizacion: org.nombre,
      volverA: `/t/${org.slug}/${t.slug}`,
    };
  }

  /**
   * Procesa una notificación de la pasarela. Es idempotente: si la misma notificación llega dos veces,
   * la segunda no cambia nada. Se busca la organización con el rol de sistema y después se trabaja con RLS.
   */
  async procesarNotificacion(n: Notificacion) {
    const ref = await this.db.sistema.pago.findUnique({
      where: { preferenciaId: n.preferenciaId },
      select: { organizacionId: true },
    });
    if (!ref) throw noEncontrado('el pago');
    return this.db.enOrg(ref.organizacionId, async (tx) => {
      const pago = await tx.pago.findUniqueOrThrow({ where: { preferenciaId: n.preferenciaId } });
      if (pago.estado !== 'PENDIENTE') return { procesado: false, estado: pago.estado };
      const estado = n.estado === 'aprobado' ? 'APROBADO' : 'RECHAZADO';
      const actualizado = await tx.pago.update({
        where: { id: pago.id },
        data: {
          estado,
          pasarelaPagoId: n.pasarelaPagoId,
          acreditadoEn: estado === 'APROBADO' ? new Date() : null,
        },
      });
      if (estado === 'APROBADO') {
        await actualizarCargo(tx, pago.cargoId);
        await registrarPago(tx, ref.organizacionId, pago.id);
      }
      await auditar(tx, { organizacionId: ref.organizacionId }, `pago.${n.estado}`, 'pago', pago.id, {
        antes: { estado: pago.estado },
        despues: { estado },
      });
      return { procesado: true, estado: actualizado.estado };
    });
  }
}

// ───────────── Controladores ─────────────

const inscribirSchema = z.object({ equipoId: z.string().min(1) });

@Controller()
export class CobrosController {
  constructor(private readonly s: CobrosService) {}

  @Get('torneos/:id/inscripciones')
  @Permiso('torneo.leer')
  inscripciones(@Ctx() c: Contexto, @Param('id') id: string) {
    return this.s.inscripciones(c, id);
  }

  @Post('torneos/:id/inscripciones')
  @Permiso('equipo.escribir')
  inscribir(
    @Ctx() c: Contexto,
    @Param('id') id: string,
    @Body(new Zod(inscribirSchema)) d: z.infer<typeof inscribirSchema>,
  ) {
    return this.s.inscribir(c, id, d.equipoId);
  }

  @Get('torneos/:id/cobros-por-fecha')
  @Permiso('torneo.leer')
  cobrosPorFecha(@Ctx() c: Contexto, @Param('id') id: string) {
    return this.s.cobrosPorFecha(c, id);
  }

  @Patch('torneos/:id/cobros-por-fecha')
  @Permiso('torneo.escribir')
  configurarCobrosPorFecha(
    @Ctx() c: Contexto,
    @Param('id') id: string,
    @Body(new Zod(cobrosPorFechaSchema)) d: CobrosPorFechaInput,
  ) {
    return this.s.configurarCobrosPorFecha(c, id, d);
  }

  @Post('torneos/:id/cobros-por-fecha/generar')
  @Permiso('torneo.escribir')
  generarCobrosPorFecha(@Ctx() c: Contexto, @Param('id') id: string) {
    return this.s.generarCobrosDelTorneo(c, id);
  }

  @Get('partidos/:id/deuda')
  @Permiso('torneo.leer')
  deudaDelPartido(@Ctx() c: Contexto, @Param('id') id: string) {
    return this.s.deudaDelPartido(c, id);
  }

  @Post('cargos/:id/link')
  @Permiso('cobro.leer')
  link(@Ctx() c: Contexto, @Param('id') id: string) {
    return this.s.linkDePago(c.organizacionId, id);
  }

  @Post('cargos/:id/pagos')
  @Permiso('cobro.registrar')
  pagoManual(
    @Ctx() c: Contexto,
    @Param('id') id: string,
    @Body(new Zod(pagoManualSchema)) d: PagoManualInput,
  ) {
    return this.s.pagoManual(c, id, d);
  }

  /** Webhook de la pasarela: valida la firma antes de procesar. */
  @Publico()
  @Post('webhooks/pagos')
  @HttpCode(200)
  async webhook(@Headers('x-firma') firma: string | undefined, @Body() cuerpo: unknown) {
    const esperado = firmar(JSON.stringify(cuerpo));
    if (
      !firma ||
      firma.length !== esperado.length ||
      !timingSafeEqual(Buffer.from(firma), Buffer.from(esperado))
    )
      throw new ErrorNegocio('Firma inválida.', HttpStatus.UNAUTHORIZED);
    return this.s.procesarNotificacion(notificacionSchema.parse(cuerpo));
  }

  @Publico()
  @Get('pagos/simulado/:pref')
  checkout(@Param('pref') pref: string) {
    if (config.PASARELA_PAGOS !== 'simulada') throw noEncontrado('el pago');
    return this.s.checkout(pref);
  }

  /** Checkout simulado: genera la misma notificación que mandaría la pasarela real y la procesa por el mismo camino. */
  @Publico()
  @Post('pagos/simulado/:pref/:resultado')
  @HttpCode(200)
  simular(@Param('pref') pref: string, @Param('resultado') resultado: string) {
    if (config.PASARELA_PAGOS !== 'simulada') throw noEncontrado('el pago');
    const estado = resultado === 'aprobar' ? 'aprobado' : 'rechazado';
    return this.s.procesarNotificacion({
      preferenciaId: pref,
      pasarelaPagoId: `SIM-PAGO-${randomBytes(6).toString('hex')}`,
      estado,
    });
  }
}

@Module({ controllers: [CobrosController], providers: [CobrosService], exports: [CobrosService] })
export class CobrosModule {}
