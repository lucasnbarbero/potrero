// Caja del torneo (E07): saldos, resultado en vivo, movimientos, egresos e ingresos manuales, retiros y cargos
// automáticos. Todo sale del libro de partida doble: las reglas puras viven en @potrero/shared (caja.ts).
import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Injectable,
  Module,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  AUTOMATIZACIONES_CAJA,
  anularMovimientoSchema,
  type AnularMovimientoInput,
  aCsv,
  asientoDeEgreso,
  asientoDeIngreso,
  asientoDeRetiro,
  automatizacionCajaSchema,
  type AutomatizacionCajaInput,
  type ClaveAutomatizacionCaja,
  DATOS,
  disponible,
  egresoSchema,
  type EgresoInput,
  egresosPorRubro,
  type CuentaDePlata,
  formatoPesos,
  ingresoSchema,
  type IngresoInput,
  ingresoDeCategoria,
  invertir,
  NOMBRE_CATEGORIA,
  NOMBRE_RUBRO,
  type Plan,
  resultadoDeCaja,
  retiroSchema,
  type RetiroInput,
  saldos,
} from '@potrero/shared';
import type { Response } from 'express';
import { auditar } from '../comun/auditoria.js';
import { fechaHoraAR } from '../comun/formato.js';
import { type Contexto, Ctx, ErrorNegocio, noEncontrado, Permiso, Zod } from '../comun/http.js';
import { DbService, type Tx } from '../db/db.service.js';
import type { Asiento, LineaAsiento } from '../generated/prisma/client.js';
import { conciliarPagos, crearAsiento } from './libro.js';

/** De dónde salen los cargos automáticos: al árbitro se le paga en el momento, en efectivo; a la cancha, por transferencia. */
const PAGO_AUTOMATICO: Record<'ARBITROS' | 'CANCHAS', CuentaDePlata> = {
  ARBITROS: 'EFECTIVO',
  CANCHAS: 'BANCO',
};

const NOMBRE_CUENTA: Record<string, string> = {
  MP: 'Mercado Pago',
  EFECTIVO: 'Efectivo',
  BANCO: 'Transferencia / banco',
};

type AsientoConLineas = Asiento & { lineas: LineaAsiento[] };

/** Sumas de debe − haber por cuenta de un grupo de asientos. */
const saldosDe = (lineas: readonly { cuenta: string; debe: number; haber: number }[]) => saldos(lineas);

/** A las 12 del mediodía de Argentina del día indicado: así el movimiento queda en ese día sin importar la zona. */
const fechaDelDia = (dia?: string) => (dia ? new Date(`${dia}T12:00:00-03:00`) : new Date());

@Injectable()
export class CajaService {
  constructor(private readonly db: DbService) {}

  private async org(tx: Tx, organizacionId: string) {
    return tx.organizacion.findUniqueOrThrow({ where: { id: organizacionId } });
  }

  /** Libro de la organización o de un torneo. */
  private async lineas(tx: Tx, torneoId?: string) {
    return tx.lineaAsiento.findMany({
      where: torneoId ? { asiento: { torneoId } } : {},
      select: { cuenta: true, debe: true, haber: true },
    });
  }

  // ───────────── Resumen ─────────────

  resumen(c: Contexto, torneoId?: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      // Los pagos anteriores a la caja se asientan al mirarla: el libro siempre está al día.
      await conciliarPagos(tx, c.organizacionId);
      const org = await this.org(tx, c.organizacionId);
      const plan = DATOS.planes[org.plan as Plan];
      const [todas, delTorneo, cargos, autos] = await Promise.all([
        this.lineas(tx),
        torneoId ? this.lineas(tx, torneoId) : null,
        tx.cargo.findMany({
          where: { estado: 'PENDIENTE', ...(torneoId ? { inscripcion: { torneoId } } : {}) },
          include: { pagos: { where: { estado: 'APROBADO' } }, inscripcion: true },
        }),
        tx.automatizacion.findMany({ where: { clave: { in: Object.keys(AUTOMATIZACIONES_CAJA) } } }),
      ]);
      const sTodo = saldosDe(todas);
      const sVista = saldosDe(delTorneo ?? todas);
      // Lo que falta de cada cargo pendiente, sin contar los que los pagos ya cubrieron.
      const debe = cargos
        .map((x) => ({
          equipoId: x.inscripcion.equipoId,
          categoria: x.categoria,
          falta: x.monto - x.pagos.reduce((t, p) => t + p.monto, 0),
        }))
        .filter((x) => x.falta > 0);
      const porCobrar = debe.reduce((s, x) => s + x.falta, 0);
      return {
        plan: { nombre: plan.nombre, comisionPct: plan.comisionPct },
        // La plata disponible es de toda la organización, mire el torneo que mire.
        disponible: disponible(sTodo),
        comisionTotal: sTodo.COMISION_PLATAFORMA ?? 0,
        resultado: resultadoDeCaja(sVista),
        porRubro: egresosPorRubro(sVista).map((r) => ({ ...r, nombre: NOMBRE_RUBRO[r.rubro] })),
        porCobrar: { monto: porCobrar, equipos: new Set(debe.map((x) => x.equipoId)).size },
        // Seguro por jugador (E06-21): lo cobrado es plata que se le debe a la aseguradora.
        seguros: {
          cobrado: ingresoDeCategoria(sVista, 'SEGUROS'),
          porCobrar: debe.filter((x) => x.categoria === 'SEGUROS').reduce((s, x) => s + x.falta, 0),
        },
        automatizaciones: (Object.keys(AUTOMATIZACIONES_CAJA) as ClaveAutomatizacionCaja[]).map((clave) => ({
          clave,
          ...AUTOMATIZACIONES_CAJA[clave],
          activa: autos.find((a) => a.clave === clave)?.activa ?? false,
        })),
      };
    });
  }

  // ───────────── Movimientos ─────────────

  /** Efecto de un asiento sobre el resultado: + ingresos, − egresos y comisión, 0 los retiros (la plata solo cambia de lugar). */
  private efecto(a: AsientoConLineas, originales: Map<string, AsientoConLineas>): number {
    const total = a.lineas.reduce((s, l) => s + l.debe, 0);
    switch (a.tipo) {
      case 'COBRO':
      case 'INGRESO':
        return total;
      case 'COMISION':
      case 'EGRESO':
        return -total;
      case 'REVERSA': {
        const o = a.revierteAId ? originales.get(a.revierteAId) : undefined;
        return o ? -this.efecto(o, originales) : 0;
      }
      default:
        return 0;
    }
  }

  private detalleDe(a: AsientoConLineas): string {
    const plata = a.lineas.find((l) => NOMBRE_CUENTA[l.cuenta]);
    const lugar = plata ? NOMBRE_CUENTA[plata.cuenta] : '';
    const rubro = a.lineas.find((l) => l.cuenta.startsWith('EGRESOS:'))?.cuenta.slice(8);
    const cat = a.lineas.find((l) => l.cuenta.startsWith('INGRESOS:'))?.cuenta.slice(9);
    switch (a.tipo) {
      case 'COBRO':
        return `${lugar}${cat && cat !== 'INSCRIPCIONES' ? ` · ${NOMBRE_CATEGORIA[cat as keyof typeof NOMBRE_CATEGORIA]}` : ''}`;
      case 'COMISION':
        return 'Mercado Pago';
      case 'EGRESO':
        return `${NOMBRE_RUBRO[rubro as keyof typeof NOMBRE_RUBRO] ?? 'Egreso'} · ${lugar}`;
      case 'INGRESO':
        return `${NOMBRE_CATEGORIA[cat as keyof typeof NOMBRE_CATEGORIA] ?? 'Ingreso'} · ${lugar}`;
      case 'RETIRO':
        return 'De Mercado Pago a la cuenta bancaria';
      default:
        return 'Anulación';
    }
  }

  private async asientos(tx: Tx, torneoId?: string) {
    const lista = await tx.asiento.findMany({
      where: torneoId ? { torneoId } : {},
      include: { lineas: true },
      orderBy: [{ fecha: 'desc' }, { creadoEn: 'desc' }],
    });
    const idsOriginales = lista.flatMap((a) => (a.revierteAId ? [a.revierteAId] : []));
    const originales = new Map<string, AsientoConLineas>(lista.map((a) => [a.id, a]));
    const faltan = idsOriginales.filter((id) => !originales.has(id));
    if (faltan.length)
      for (const o of await tx.asiento.findMany({ where: { id: { in: faltan } }, include: { lineas: true } }))
        originales.set(o.id, o);
    const anulados = new Set(idsOriginales);
    return lista.map((a) => ({
      id: a.id,
      fecha: a.fecha,
      tipo: a.tipo,
      descripcion: a.descripcion,
      detalle: this.detalleDe(a),
      efecto: this.efecto(a, originales),
      monto: a.lineas.reduce((s, l) => s + l.debe, 0),
      comprobante: a.comprobante,
      anulado: anulados.has(a.id),
      torneoId: a.torneoId,
    }));
  }

  movimientos(c: Contexto, q: { torneoId?: string; tipo?: string; limite?: number }) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      await conciliarPagos(tx, c.organizacionId);
      let lista = await this.asientos(tx, q.torneoId);
      if (q.tipo === 'INGRESOS') lista = lista.filter((m) => m.efecto > 0);
      if (q.tipo === 'EGRESOS') lista = lista.filter((m) => m.efecto < 0);
      return { total: lista.length, movimientos: lista.slice(0, q.limite ?? 100) };
    });
  }

  /** Todos los movimientos en un CSV para el contador (E07-07). */
  async csv(c: Contexto, torneoId?: string) {
    const { movimientos } = await this.movimientos(c, { torneoId, limite: 100_000 });
    return aCsv([
      [
        'Fecha',
        'Tipo',
        'Descripción',
        'Detalle',
        'Efecto en el resultado ($)',
        'Monto ($)',
        'Comprobante',
        'Anulado',
      ],
      ...movimientos.map((m) => [
        fechaHoraAR(m.fecha),
        m.tipo,
        m.descripcion,
        m.detalle,
        m.efecto,
        m.monto,
        m.comprobante,
        m.anulado ? 'Sí' : 'No',
      ]),
    ]);
  }

  // ───────────── Altas ─────────────

  private async validarTorneo(tx: Tx, torneoId?: string) {
    if (torneoId && !(await tx.torneo.findUnique({ where: { id: torneoId } })))
      throw noEncontrado('el torneo');
  }

  /** Carga un egreso por rubro. */
  egreso(c: Contexto, d: EgresoInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      await this.validarTorneo(tx, d.torneoId);
      const a = await crearAsiento(tx, c.organizacionId, {
        tipo: 'EGRESO',
        descripcion: d.descripcion,
        fecha: fechaDelDia(d.fecha),
        torneoId: d.torneoId,
        comprobante: d.comprobante,
        creadoPorId: c.usuarioId,
        lineas: asientoDeEgreso({ rubro: d.rubro, monto: d.monto, pagadoCon: d.pagadoCon }),
      });
      await auditar(tx, c, 'caja.egreso', 'asiento', a!.id, { despues: d });
      return { id: a!.id };
    });
  }

  /** Carga un ingreso que no viene de un cobro (sponsors, otros). */
  ingreso(c: Contexto, d: IngresoInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      await this.validarTorneo(tx, d.torneoId);
      const a = await crearAsiento(tx, c.organizacionId, {
        tipo: 'INGRESO',
        descripcion: d.descripcion,
        fecha: fechaDelDia(d.fecha),
        torneoId: d.torneoId,
        comprobante: d.comprobante,
        creadoPorId: c.usuarioId,
        lineas: asientoDeIngreso({ categoria: d.categoria, monto: d.monto, cobradoEn: d.cobradoEn }),
      });
      await auditar(tx, c, 'caja.ingreso', 'asiento', a!.id, { despues: d });
      return { id: a!.id };
    });
  }

  /** Registra el retiro de Mercado Pago a la cuenta bancaria. Es solo un registro: el dinero lo mueve el organizador. */
  retiro(c: Contexto, d: RetiroInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const s = saldosDe(await this.lineas(tx));
      const enMp = s.MP ?? 0;
      if (d.monto > enMp)
        throw new ErrorNegocio(
          `Solo tenés ${formatoPesos(Math.max(0, enMp))} disponibles en Mercado Pago para retirar.`,
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      const a = await crearAsiento(tx, c.organizacionId, {
        tipo: 'RETIRO',
        descripcion: `Retiro${d.destino ? ` a ${d.destino}` : ' a la cuenta bancaria'}`,
        creadoPorId: c.usuarioId,
        lineas: asientoDeRetiro(d.monto),
      });
      await auditar(tx, c, 'caja.retiro', 'asiento', a!.id, { despues: d });
      return { id: a!.id, disponibleEnMp: enMp - d.monto };
    });
  }

  /** Un movimiento mal cargado no se borra: se anula con otro asiento que lo revierte. Los cobros se corrigen con reembolsos. */
  anular(c: Contexto, id: string, d: AnularMovimientoInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const a = await tx.asiento.findUnique({ where: { id }, include: { lineas: true } });
      if (!a) throw noEncontrado('el movimiento');
      if (!['EGRESO', 'INGRESO', 'RETIRO'].includes(a.tipo))
        throw new ErrorNegocio(
          'Los cobros y comisiones no se anulan desde acá: se corrigen con un reembolso del pago.',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      if (await tx.asiento.findFirst({ where: { revierteAId: id } }))
        throw new ErrorNegocio('Este movimiento ya está anulado.', HttpStatus.CONFLICT);
      if (a.tipo === 'INGRESO' || a.tipo === 'RETIRO') {
        // Anular algo que dejaría un saldo negativo tampoco tiene sentido.
        const s = saldosDe(await this.lineas(tx));
        const inv = saldosDe(invertir(a.lineas));
        for (const cuenta of ['MP', 'EFECTIVO', 'BANCO'] as const)
          if ((s[cuenta] ?? 0) + (inv[cuenta] ?? 0) < 0)
            throw new ErrorNegocio(
              `No se puede anular: la cuenta ${NOMBRE_CUENTA[cuenta]} quedaría en negativo.`,
              HttpStatus.UNPROCESSABLE_ENTITY,
            );
      }
      const r = await crearAsiento(tx, c.organizacionId, {
        tipo: 'REVERSA',
        descripcion: `Anulación: ${a.descripcion}${d.motivo ? ` (${d.motivo})` : ''}`,
        torneoId: a.torneoId,
        arbitroId: a.arbitroId,
        canchaId: a.canchaId,
        revierteAId: a.id,
        creadoPorId: c.usuarioId,
        lineas: invertir(a.lineas),
      });
      await auditar(tx, c, 'caja.anular', 'asiento', a.id, { despues: { reversa: r!.id, motivo: d.motivo } });
      return { id: r!.id };
    });
  }

  // ───────────── Automatizaciones y cargos por partido ─────────────

  configurarAutomatizacion(c: Contexto, clave: string, d: AutomatizacionCajaInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      if (!(clave in AUTOMATIZACIONES_CAJA)) throw noEncontrado('la automatización');
      return tx.automatizacion.upsert({
        where: { organizacionId_clave: { organizacionId: c.organizacionId, clave } },
        create: { organizacionId: c.organizacionId, clave, activa: d.activa },
        update: { activa: d.activa },
      });
    });
  }

  /**
   * Al cerrar un acta: paga al árbitro designado y el alquiler de la cancha, si el organizador lo tiene encendido y hay
   * tarifa o costo cargados. Es idempotente por partido.
   */
  async cargosDelPartido(tx: Tx, c: { organizacionId: string; usuarioId?: string }, partidoId: string) {
    const autos = await tx.automatizacion.findMany({
      where: { clave: { in: Object.keys(AUTOMATIZACIONES_CAJA) }, activa: true },
    });
    if (autos.length === 0) return 0;
    const p = await tx.partido.findUniqueOrThrow({
      where: { id: partidoId },
      include: { arbitro: true, cancha: { include: { sede: true } } },
    });
    const equipos = await tx.equipo.findMany({ where: { id: { in: [p.localId, p.visitanteId] } } });
    const nombre = (id: string) => equipos.find((e) => e.id === id)?.nombre ?? '—';
    const partido = `${nombre(p.localId)} vs ${nombre(p.visitanteId)}`;
    let n = 0;
    const activa = (k: ClaveAutomatizacionCaja) => autos.some((a) => a.clave === k);
    if (activa('CAJA_PAGO_ARBITROS') && p.arbitro && p.arbitro.tarifa > 0) {
      const a = await crearAsiento(tx, c.organizacionId, {
        tipo: 'EGRESO',
        descripcion: `Pago a árbitro · ${p.arbitro.nombre} ${p.arbitro.apellido} · ${partido}`,
        fecha: p.cerradoEn ?? new Date(),
        torneoId: p.torneoId,
        referenciaTipo: 'PARTIDO',
        referenciaId: p.id,
        arbitroId: p.arbitro.id,
        clave: `arb:${p.id}`,
        creadoPorId: c.usuarioId,
        lineas: asientoDeEgreso({
          rubro: 'ARBITROS',
          monto: p.arbitro.tarifa,
          pagadoCon: PAGO_AUTOMATICO.ARBITROS,
        }),
      });
      if (a) n++;
    }
    if (activa('CAJA_ALQUILER_CANCHAS') && p.cancha && p.cancha.costoPorPartido > 0) {
      const a = await crearAsiento(tx, c.organizacionId, {
        tipo: 'EGRESO',
        descripcion: `Alquiler de cancha · ${p.cancha.sede.nombre} · ${p.cancha.nombre} · ${partido}`,
        fecha: p.cerradoEn ?? new Date(),
        torneoId: p.torneoId,
        referenciaTipo: 'PARTIDO',
        referenciaId: p.id,
        canchaId: p.cancha.id,
        clave: `cancha:${p.id}`,
        creadoPorId: c.usuarioId,
        lineas: asientoDeEgreso({
          rubro: 'CANCHAS',
          monto: p.cancha.costoPorPartido,
          pagadoCon: PAGO_AUTOMATICO.CANCHAS,
        }),
      });
      if (a) n++;
    }
    return n;
  }
}

@Controller('caja')
export class CajaController {
  constructor(private readonly s: CajaService) {}

  @Get()
  @Permiso('caja.leer')
  resumen(@Ctx() c: Contexto, @Query('torneoId') torneoId?: string) {
    return this.s.resumen(c, torneoId || undefined);
  }

  @Get('movimientos')
  @Permiso('caja.leer')
  movimientos(
    @Ctx() c: Contexto,
    @Query('torneoId') torneoId?: string,
    @Query('tipo') tipo?: string,
    @Query('limite') limite?: string,
  ) {
    return this.s.movimientos(c, {
      torneoId: torneoId || undefined,
      tipo,
      limite: limite ? Number(limite) : undefined,
    });
  }

  @Get('movimientos.csv')
  @Permiso('caja.leer')
  async csv(
    @Ctx() c: Contexto,
    @Res({ passthrough: true }) res: Response,
    @Query('torneoId') torneoId?: string,
  ) {
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', 'attachment; filename="movimientos-caja.csv"');
    return this.s.csv(c, torneoId || undefined);
  }

  @Post('egresos')
  @Permiso('caja.escribir')
  egreso(@Ctx() c: Contexto, @Body(new Zod(egresoSchema)) d: EgresoInput) {
    return this.s.egreso(c, d);
  }

  @Post('ingresos')
  @Permiso('caja.escribir')
  ingreso(@Ctx() c: Contexto, @Body(new Zod(ingresoSchema)) d: IngresoInput) {
    return this.s.ingreso(c, d);
  }

  /** Solo el dueño retira (y, cuando exista la verificación en dos pasos, con ella: E04-11). */
  @Post('retiros')
  @Permiso('caja.retirar')
  retiro(@Ctx() c: Contexto, @Body(new Zod(retiroSchema)) d: RetiroInput) {
    return this.s.retiro(c, d);
  }

  @Post('movimientos/:id/anular')
  @Permiso('caja.escribir')
  anular(
    @Ctx() c: Contexto,
    @Param('id') id: string,
    @Body(new Zod(anularMovimientoSchema)) d: AnularMovimientoInput,
  ) {
    return this.s.anular(c, id, d);
  }

  @Patch('automatizaciones/:clave')
  @Permiso('caja.escribir')
  automatizacion(
    @Ctx() c: Contexto,
    @Param('clave') clave: string,
    @Body(new Zod(automatizacionCajaSchema)) d: AutomatizacionCajaInput,
  ) {
    return this.s.configurarAutomatizacion(c, clave, d);
  }
}

@Module({ controllers: [CajaController], providers: [CajaService], exports: [CajaService] })
export class CajaModule {}
