// Backoffice de Gregal (E36): panel interno del equipo de Gregal Tech para ver todas las ligas.
// - Staff separado de las organizaciones (E36-01/02): tabla propia, login propio y una sesión propia (cookie
//   `potrero_staff`, firmada con otra clave). Un token de organizador no sirve acá y uno de staff no sirve en la API de
//   una liga (el guard global no lo reconoce).
// - Toda acción del staff queda en `staff_auditoria` (E36-03), inmutable.
// - Lee todas las organizaciones con `db.sistema`: es justamente la tarea de sistema que saltea RLS (ver cada consulta).
import {
  applyDecorators,
  type CanActivate,
  Controller,
  type ExecutionContext,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Module,
  Param,
  Post,
  Query,
  Req,
  Res,
  SetMetadata,
  UseGuards,
  Body,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  alertasDeSalud,
  cobrosPorMes,
  esLigaActiva,
  estadoDeSalud,
  type LigaParaSalud,
  loginSchema,
  type LoginInput,
  type PagoDePlataforma,
  porMes,
  porSemana,
  type SeccionStaff,
  staffPuedeVer,
  sumarCobros,
  tasaDeComision,
} from '@potrero/shared';
import argon2 from 'argon2';
import type { Request, Response } from 'express';
import { jwtVerify, SignJWT } from 'jose';
import { controlarIntentos, registrarIntento } from '../auth/links.js';
import { ErrorNegocio, noEncontrado, Publico, Zod } from '../comun/http.js';
import { config } from '../config.js';
import { DbService } from '../db/db.service.js';

/** Clave propia del staff: un token de organizador no verifica acá ni al revés. */
const SECRETO_STAFF = new TextEncoder().encode(`${config.JWT_SECRET}:gregal-staff`);
/** Sesión corta y sin renovación (E36-01): al vencer, se vuelve a ingresar. */
const DURACION_STAFF_SEG = 8 * 60 * 60;
export const COOKIE_STAFF = 'potrero_staff';
const ENTORNO = config.DEMO_MODE ? 'demo' : 'produccion';

export interface ContextoStaff {
  staffId: string;
  rol: string;
}
type PedidoStaff = Request & { staff?: ContextoStaff };

export async function verificarStaff(token: string): Promise<ContextoStaff | null> {
  try {
    const { payload } = await jwtVerify(token, SECRETO_STAFF, { algorithms: ['HS256'] });
    if (payload.tipo !== 'staff' || payload.ent !== ENTORNO) return null;
    return { staffId: payload.sub!, rol: String(payload.rol) };
  } catch {
    return null;
  }
}

/** Crea (o actualiza) un usuario del staff. Lo usan la semilla y los tests; no hay alta desde la web todavía. */
export async function crearStaff(
  db: DbService,
  d: {
    email: string;
    nombre: string;
    password: string;
    rol: 'SUPERADMIN' | 'SOPORTE' | 'FINANZAS' | 'DIRECCION';
  },
) {
  const passwordHash = await argon2.hash(d.password);
  // Tabla global del backoffice: sin organización, se escribe con la conexión de sistema.
  return db.sistema.staffUsuario.upsert({
    where: { email: d.email },
    create: { email: d.email, nombre: d.nombre, rol: d.rol, passwordHash },
    update: { nombre: d.nombre, rol: d.rol, passwordHash, activo: true },
  });
}

// ── Guard y auditoría ──

const SECCION = 'gregal.seccion';
const ACCION = 'gregal.accion';
/** Sección del backoffice que exige el endpoint y acción que queda en la auditoría. */
const Staff = (seccion: SeccionStaff, accion: string) =>
  applyDecorators(SetMetadata(SECCION, seccion), SetMetadata(ACCION, accion));

const CtxStaff = createParamDecorator((_: unknown, c: ExecutionContext): ContextoStaff => {
  return c.switchToHttp().getRequest<PedidoStaff>().staff!;
});

const ipDe = (req: Request) => req.ip ?? 'desconocida';

/** Exige sesión de staff, controla la sección según el rol interno y audita la acción (también si se rechaza). */
@Injectable()
export class GuardStaff implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: DbService,
  ) {}

  async canActivate(c: ExecutionContext) {
    const req = c.switchToHttp().getRequest<PedidoStaff>();
    const token = req.cookies?.[COOKIE_STAFF];
    const ctx = token ? await verificarStaff(token) : null;
    if (!ctx) throw new ErrorNegocio('Ingresá con tu cuenta del equipo de Gregal.', HttpStatus.UNAUTHORIZED);
    // La cuenta pudo darse de baja después de emitir el token.
    const staff = await this.db.sistema.staffUsuario.findUnique({ where: { id: ctx.staffId } });
    if (!staff?.activo)
      throw new ErrorNegocio('Tu cuenta interna está desactivada.', HttpStatus.UNAUTHORIZED);
    req.staff = { staffId: staff.id, rol: staff.rol };
    const seccion = this.reflector.get<SeccionStaff>(SECCION, c.getHandler());
    const accion = this.reflector.get<string>(ACCION, c.getHandler());
    // Sin acción declarada (por ejemplo, /gregal/yo) no es una acción sobre datos: no se audita.
    if (!accion) return true;
    const permitido = !seccion || staffPuedeVer(staff.rol, seccion);
    const orgId = (req.params as Record<string, string | undefined>).id;
    await this.db.sistema.staffAuditoria.create({
      data: {
        staffId: staff.id,
        accion: permitido ? accion : `${accion}_DENEGADO`,
        entidad: orgId ? 'organizacion' : null,
        entidadId: orgId ?? null,
        organizacionId: orgId ?? null,
        detalle: {
          ruta: req.path,
          ...(Object.keys(req.query).length ? { consulta: req.query } : {}),
        } as never,
        ip: ipDe(req),
      },
    });
    if (!permitido)
      throw new ErrorNegocio('Tu rol interno no tiene acceso a esta sección.', HttpStatus.FORBIDDEN);
    return true;
  }
}

// ── Servicio ──

const MEDIO: Record<string, string> = {
  MERCADO_PAGO: 'Online',
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
};
const ACTIVOS = new Set(['INSCRIPCION', 'EN_CURSO']);
const CERRADOS = new Set(['FINALIZADO', 'WO']);

@Injectable()
export class GregalService {
  constructor(private readonly db: DbService) {}

  async ingresar(d: LoginInput, ip: string) {
    // Mismo límite de intentos que el login de organizadores, con contador propio.
    const clave = `staff:${d.email}`;
    await controlarIntentos(this.db, clave, ip);
    // Tabla global del backoffice: conexión de sistema.
    const staff = await this.db.sistema.staffUsuario.findUnique({ where: { email: d.email } });
    const ok = staff
      ? await argon2.verify(staff.passwordHash, d.password)
      : (await argon2.hash(d.password), false);
    await registrarIntento(this.db, clave, ip, !!staff && ok);
    if (!staff || !ok || !staff.activo)
      throw new ErrorNegocio('Email o contraseña incorrectos.', HttpStatus.UNAUTHORIZED);
    await this.db.sistema.staffUsuario.update({
      where: { id: staff.id },
      data: { ultimoIngresoEn: new Date() },
    });
    await this.db.sistema.staffAuditoria.create({ data: { staffId: staff.id, accion: 'INGRESO', ip } });
    return new SignJWT({ tipo: 'staff', rol: staff.rol, ent: ENTORNO })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(staff.id)
      .setIssuedAt()
      .setExpirationTime(`${DURACION_STAFF_SEG}s`)
      .sign(SECRETO_STAFF);
  }

  async salir(token: string | undefined, ip: string) {
    const ctx = token ? await verificarStaff(token) : null;
    if (ctx)
      await this.db.sistema.staffAuditoria.create({ data: { staffId: ctx.staffId, accion: 'SALIDA', ip } });
  }

  async yo(c: ContextoStaff) {
    const s = await this.db.sistema.staffUsuario.findUniqueOrThrow({
      where: { id: c.staffId },
      select: { id: true, nombre: true, email: true, rol: true, ultimoIngresoEn: true },
    });
    return s;
  }

  /**
   * Junta, por organización, todo lo que piden las métricas y la salud. Lee todas las ligas: usa `db.sistema` (saltea
   * RLS) a propósito, porque el backoffice es el único lugar que ve la plataforma entera. Las sandboxes de la demo
   * pública no cuentan.
   */
  private async relevar() {
    const s = this.db.sistema;
    const ahora = new Date();
    const orgs = await s.organizacion.findMany({
      where: { demoExpiraEn: null },
      select: {
        id: true,
        nombre: true,
        slug: true,
        plan: true,
        creadoEn: true,
        localidad: true,
        provincia: true,
        mpCuentaId: true,
      },
      orderBy: { creadoEn: 'asc' },
    });
    const ids = orgs.map((o) => o.id);
    const enOrgs = { organizacionId: { in: ids } };
    const [torneos, equipos, jugadores, partidos, pagos, sesiones] = await Promise.all([
      s.torneo.findMany({ where: enOrgs, select: { organizacionId: true, estado: true } }),
      s.equipo.groupBy({ by: ['organizacionId'], where: enOrgs, _count: { _all: true } }),
      s.jugador.groupBy({ by: ['organizacionId'], where: enOrgs, _count: { _all: true } }),
      s.partido.findMany({
        where: enOrgs,
        select: { organizacionId: true, estado: true, inicio: true, cerradoEn: true },
      }),
      s.pago.findMany({
        where: { ...enOrgs, estado: 'APROBADO' },
        select: {
          organizacionId: true,
          metodo: true,
          monto: true,
          comisionPlataforma: true,
          acreditadoEn: true,
          creadoEn: true,
        },
      }),
      s.sesionRefresh.groupBy({
        by: ['organizacionActivaId'],
        where: { organizacionActivaId: { in: ids } },
        _max: { creadoEn: true },
      }),
    ]);
    const cuenta = (xs: { organizacionId: string; _count: { _all: number } }[]) =>
      new Map(xs.map((x) => [x.organizacionId, x._count._all]));
    const nEquipos = cuenta(equipos);
    const nJugadores = cuenta(jugadores);
    const uso = new Map(sesiones.map((x) => [x.organizacionActivaId!, x._max.creadoEn]));
    const pagosPlataforma = (orgId?: string): PagoDePlataforma[] =>
      pagos
        .filter((p) => !orgId || p.organizacionId === orgId)
        .map((p) => ({
          metodo: p.metodo,
          monto: p.monto,
          comision: p.comisionPlataforma,
          fecha: (p.acreditadoEn ?? p.creadoEn).toISOString(),
        }));

    const ligas = orgs.map((o) => {
      const ts = torneos.filter((t) => t.organizacionId === o.id);
      const ps = partidos.filter((p) => p.organizacionId === o.id);
      const vencidos = ps.filter((p) => p.inicio && p.inicio < ahora && p.estado !== 'SUSPENDIDO');
      const cerrados = ps.filter((p) => p.cerradoEn).map((p) => p.cerradoEn!.getTime());
      const pg = pagos.filter((p) => p.organizacionId === o.id);
      const ultimoUso = uso.get(o.id) ?? null;
      const salud: LigaParaSalud = {
        creadaEn: o.creadoEn.toISOString(),
        equipos: nEquipos.get(o.id) ?? 0,
        torneosActivos: ts.filter((t) => ACTIVOS.has(t.estado)).length,
        partidosVencidos: vencidos.length,
        actasCargadas: vencidos.filter((p) => CERRADOS.has(p.estado)).length,
        pagosOnline: pg.filter((p) => p.metodo === 'MERCADO_PAGO').length,
        pagosManuales: pg.filter((p) => p.metodo !== 'MERCADO_PAGO').length,
        ultimoUso: ultimoUso?.toISOString() ?? null,
      };
      const alertas = alertasDeSalud(salud, ahora);
      const ultimoPartidoCerrado = cerrados.length ? new Date(Math.max(...cerrados)).toISOString() : null;
      const cobros = sumarCobros(pagosPlataforma(o.id));
      return {
        id: o.id,
        nombre: o.nombre,
        slug: o.slug,
        plan: o.plan,
        localidad: [o.localidad, o.provincia].filter(Boolean).join(', ') || null,
        mpConectado: !!o.mpCuentaId,
        creadaEn: o.creadoEn.toISOString(),
        activa: esLigaActiva({ torneosActivos: salud.torneosActivos, ultimoPartidoCerrado }, ahora),
        torneos: ts.length,
        torneosEnCurso: ts.filter((t) => t.estado === 'EN_CURSO').length,
        equipos: salud.equipos,
        jugadores: nJugadores.get(o.id) ?? 0,
        partidosCerrados: cerrados.length,
        actas: { cargadas: salud.actasCargadas, vencidos: salud.partidosVencidos },
        cobrado: cobros.total,
        comision: cobros.comision,
        ultimoUso: salud.ultimoUso,
        salud: estadoDeSalud(alertas),
        alertas,
      };
    });
    return { ahora, ligas, partidos, pagosPlataforma, orgs };
  }

  async inicio() {
    const { ahora, ligas, partidos, pagosPlataforma, orgs } = await this.relevar();
    const cobros = sumarCobros(pagosPlataforma());
    return {
      ligas: { total: ligas.length, activas: ligas.filter((l) => l.activa).length },
      torneosEnCurso: ligas.reduce((a, l) => a + l.torneosEnCurso, 0),
      equipos: ligas.reduce((a, l) => a + l.equipos, 0),
      jugadores: ligas.reduce((a, l) => a + l.jugadores, 0),
      cobros,
      tasa: tasaDeComision(cobros),
      partidosPorSemana: porSemana(
        partidos.filter((p) => p.cerradoEn).map((p) => p.cerradoEn!.toISOString()),
        ahora,
        8,
      ),
      ligasPorMes: porMes(
        orgs.map((o) => o.creadoEn.toISOString()),
        ahora,
        6,
      ),
      enRiesgo: ligas
        .filter((l) => l.alertas.length)
        .sort((a, b) => b.alertas.length - a.alertas.length)
        .slice(0, 5)
        .map((l) => ({ id: l.id, nombre: l.nombre, salud: l.salud, alertas: l.alertas })),
    };
  }

  async organizaciones(q?: string) {
    const { ligas } = await this.relevar();
    const busqueda = q?.trim().toLowerCase();
    return busqueda
      ? ligas.filter((l) => `${l.nombre} ${l.slug} ${l.localidad ?? ''}`.toLowerCase().includes(busqueda))
      : ligas;
  }

  async organizacion(id: string) {
    const { ahora, ligas, pagosPlataforma } = await this.relevar();
    const liga = ligas.find((l) => l.id === id);
    if (!liga) throw noEncontrado('esa organización');
    const s = this.db.sistema;
    // Detalle de una liga desde el backoffice: conexión de sistema (lectura auditada por el guard).
    const [torneos, usuarios, ultimosPagos] = await Promise.all([
      s.torneo.findMany({
        where: { organizacionId: id },
        orderBy: { creadoEn: 'desc' },
        select: {
          id: true,
          nombre: true,
          slug: true,
          estado: true,
          modalidad: true,
          formato: true,
          creadoEn: true,
          _count: { select: { inscripciones: { where: { estado: { not: 'BAJA' } } }, partidos: true } },
          partidos: { where: { estado: { in: ['FINALIZADO', 'WO'] } }, select: { id: true } },
        },
      }),
      s.membresia.findMany({
        where: { organizacionId: id },
        orderBy: { creadoEn: 'asc' },
        select: { rol: true, creadoEn: true, usuario: { select: { nombre: true, email: true } } },
      }),
      s.pago.findMany({
        where: { organizacionId: id, estado: 'APROBADO' },
        orderBy: { creadoEn: 'desc' },
        take: 10,
        select: {
          id: true,
          metodo: true,
          monto: true,
          comisionPlataforma: true,
          acreditadoEn: true,
          creadoEn: true,
          cargo: {
            select: { concepto: true, inscripcion: { select: { equipo: { select: { nombre: true } } } } },
          },
        },
      }),
    ]);
    return {
      ...liga,
      torneos: torneos.map((t) => ({
        id: t.id,
        nombre: t.nombre,
        slug: t.slug,
        estado: t.estado,
        modalidad: t.modalidad,
        formato: t.formato,
        equipos: t._count.inscripciones,
        partidos: t._count.partidos,
        jugados: t.partidos.length,
      })),
      usuarios: usuarios.map((u) => ({
        nombre: u.usuario.nombre,
        email: u.usuario.email,
        rol: u.rol,
        desde: u.creadoEn,
      })),
      cobros: sumarCobros(pagosPlataforma(id)),
      cobrosPorMes: cobrosPorMes(pagosPlataforma(id), ahora, 6),
      ultimosPagos: ultimosPagos.map((p) => ({
        id: p.id,
        medio: MEDIO[p.metodo],
        monto: p.monto,
        comision: p.comisionPlataforma,
        fecha: p.acreditadoEn ?? p.creadoEn,
        concepto: p.cargo.concepto,
        equipo: p.cargo.inscripcion.equipo.nombre,
      })),
    };
  }

  async dinero() {
    const { ahora, ligas, pagosPlataforma } = await this.relevar();
    const total = sumarCobros(pagosPlataforma());
    return {
      total,
      tasa: tasaDeComision(total),
      porMes: cobrosPorMes(pagosPlataforma(), ahora, 6),
      porLiga: ligas
        .map((l) => ({ id: l.id, nombre: l.nombre, plan: l.plan, ...sumarCobros(pagosPlataforma(l.id)) }))
        .sort((a, b) => b.total - a.total),
    };
  }

  async auditoria() {
    const filas = await this.db.sistema.staffAuditoria.findMany({
      orderBy: { creadoEn: 'desc' },
      take: 200,
      include: { staff: { select: { nombre: true, email: true, rol: true } } },
    });
    const ids = [...new Set(filas.map((f) => f.organizacionId).filter(Boolean))] as string[];
    const orgs = await this.db.sistema.organizacion.findMany({
      where: { id: { in: ids } },
      select: { id: true, nombre: true },
    });
    const nombre = new Map(orgs.map((o) => [o.id, o.nombre]));
    return filas.map((f) => ({
      id: f.id,
      creadoEn: f.creadoEn,
      accion: f.accion,
      staff: f.staff,
      organizacion: f.organizacionId
        ? { id: f.organizacionId, nombre: nombre.get(f.organizacionId) ?? null }
        : null,
      detalle: f.detalle,
      ip: f.ip,
    }));
  }
}

// ── Controladores ──

const opcionesCookie = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: config.NODE_ENV === 'production',
  path: '/',
});

/** Ingreso y salida del staff: fuera del guard de organizadores (@Publico) y del de staff. */
@Controller('gregal/sesion')
export class GregalSesionController {
  constructor(private readonly gregal: GregalService) {}

  @Publico()
  @Post('ingresar')
  @HttpCode(200)
  async ingresar(
    @Body(new Zod(loginSchema)) d: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = await this.gregal.ingresar(d, ipDe(req));
    res.cookie(COOKIE_STAFF, token, { ...opcionesCookie(), maxAge: DURACION_STAFF_SEG * 1000 });
    return { ok: true };
  }

  @Publico()
  @Post('salir')
  @HttpCode(200)
  async salir(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.gregal.salir(req.cookies?.[COOKIE_STAFF], ipDe(req));
    res.clearCookie(COOKIE_STAFF, { path: '/' });
    return { ok: true };
  }
}

/** Rutas del backoffice: @Publico() las saca del guard de organizadores; las protege GuardStaff. */
@Publico()
@UseGuards(GuardStaff)
@Controller('gregal')
export class GregalController {
  constructor(private readonly gregal: GregalService) {}

  @Get('yo')
  yo(@CtxStaff() c: ContextoStaff) {
    return this.gregal.yo(c);
  }

  @Get('inicio')
  @Staff('inicio', 'VER_METRICAS')
  inicio() {
    return this.gregal.inicio();
  }

  @Get('organizaciones')
  @Staff('organizaciones', 'LISTAR_ORGANIZACIONES')
  organizaciones(@Query('q') q?: string) {
    return this.gregal.organizaciones(q);
  }

  @Get('organizaciones/:id')
  @Staff('organizaciones', 'VER_ORGANIZACION')
  organizacion(@Param('id') id: string) {
    return this.gregal.organizacion(id);
  }

  @Get('dinero')
  @Staff('dinero', 'VER_DINERO')
  dinero() {
    return this.gregal.dinero();
  }

  @Get('auditoria')
  @Staff('auditoria', 'VER_AUDITORIA')
  auditoria() {
    return this.gregal.auditoria();
  }
}

@Module({ controllers: [GregalSesionController, GregalController], providers: [GregalService, GuardStaff] })
export class GregalModule {}
