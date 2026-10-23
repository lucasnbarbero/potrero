import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Injectable,
  Module,
  Param,
  Post,
} from '@nestjs/common';
import { registrarPago } from '../caja/libro.js';
import { comisionPlataforma, pagoManualSchema, type PagoManualInput, type Plan } from '@potrero/shared';
import { z } from 'zod';
import { auditar } from '../comun/auditoria.js';
import { type Contexto, Ctx, ErrorNegocio, noEncontrado, Permiso, Publico, Zod } from '../comun/http.js';
import { config } from '../config.js';
import { DbService, type Tx } from '../db/db.service.js';

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

/** Recalcula el estado del cargo y de la inscripción según los pagos aprobados. */
async function actualizarCargo(tx: Tx, cargoId: string) {
  const cargo = await tx.cargo.findUniqueOrThrow({ where: { id: cargoId }, include: { pagos: true } });
  const pagado = cargo.pagos.filter((p) => p.estado === 'APROBADO').reduce((s, p) => s + p.monto, 0);
  const estado = pagado >= cargo.monto ? 'PAGADO' : 'PENDIENTE';
  await tx.cargo.update({ where: { id: cargoId }, data: { estado } });
  if (estado === 'PAGADO') {
    const pendientes = await tx.cargo.count({
      where: { inscripcionId: cargo.inscripcionId, estado: 'PENDIENTE' },
    });
    if (pendientes === 0)
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
export class CobrosService {
  private readonly pasarela = crearPasarela();
  constructor(private readonly db: DbService) {}

  /** Estado de inscripciones y pagos de un torneo (pantalla de inscripciones). */
  inscripciones(c: Contexto, torneoId: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const lista = await tx.inscripcion.findMany({
        where: { torneoId },
        orderBy: { creadoEn: 'asc' },
        include: {
          equipo: { include: { _count: { select: { plantel: true } } } },
          cargos: { include: { pagos: true } },
        },
      });
      return lista.map((i) => {
        const total = i.cargos.reduce((s, x) => s + x.monto, 0);
        const pagos = i.cargos.flatMap((x) => x.pagos);
        const pagado = pagos.filter((p) => p.estado === 'APROBADO').reduce((s, p) => s + p.monto, 0);
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
          cargos: i.cargos.map((x) => ({ id: x.id, concepto: x.concepto, monto: x.monto, estado: x.estado })),
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
