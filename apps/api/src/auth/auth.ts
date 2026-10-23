import { createHash, randomBytes } from 'node:crypto';
import {
  Body,
  type CanActivate,
  Controller,
  type ExecutionContext,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Module,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { loginSchema, registroSchema, type LoginInput, type RegistroInput } from '@potrero/shared';
import argon2 from 'argon2';
import type { Request, Response } from 'express';
import { jwtVerify, SignJWT } from 'jose';
import { config } from '../config.js';
import {
  type Contexto,
  Ctx,
  ErrorNegocio,
  PERMISO,
  type PedidoAutenticado,
  PUBLICO,
  Publico,
  Zod,
} from '../comun/http.js';
import { tienePermiso } from '../comun/permisos.js';
import { slugUnico } from '../comun/slug.js';
import { DbService } from '../db/db.service.js';

const SECRETO = new TextEncoder().encode(config.JWT_SECRET);
const DURACION_ACCESO_SEG = 15 * 60;
const DURACION_REFRESH_DIAS = 30;
export const COOKIE_ACCESO = 'potrero_at';
export const COOKIE_REFRESH = 'potrero_rt';

const hash = (t: string) => createHash('sha256').update(t).digest('hex');

/** Entorno que emite el token: una sesión de la demo no vale en producción ni al revés (ADR-019). */
const ENTORNO = config.DEMO_MODE ? 'demo' : 'produccion';

async function firmarAcceso(c: Contexto) {
  return new SignJWT({ org: c.organizacionId, rol: c.rol, ent: ENTORNO })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(c.usuarioId)
    .setIssuedAt()
    .setExpirationTime(`${DURACION_ACCESO_SEG}s`)
    .sign(SECRETO);
}

export async function verificarAcceso(token: string): Promise<Contexto | null> {
  try {
    const { payload } = await jwtVerify(token, SECRETO, { algorithms: ['HS256'] });
    if (payload.ent !== ENTORNO) return null;
    return { usuarioId: payload.sub!, organizacionId: String(payload.org), rol: String(payload.rol) };
  } catch {
    return null;
  }
}

@Injectable()
export class AuthService {
  constructor(private readonly db: DbService) {}

  async registrar(d: RegistroInput) {
    const existe = await this.db.app.usuario.findUnique({ where: { email: d.email } });
    if (existe)
      throw new ErrorNegocio('Ya hay una cuenta con ese email. Probá iniciar sesión.', HttpStatus.CONFLICT);
    const passwordHash = await argon2.hash(d.password);
    const slug = await slugUnico(
      d.organizacion,
      async (s) => !!(await this.db.app.organizacion.findUnique({ where: { slug: s } })),
    );
    const usuario = await this.db.app.usuario.create({
      data: {
        email: d.email,
        nombre: d.nombre,
        passwordHash,
        membresias: { create: { rol: 'DUENO', organizacion: { create: { nombre: d.organizacion, slug } } } },
      },
      include: { membresias: true },
    });
    const m = usuario.membresias[0]!;
    return this.emitirSesion({ usuarioId: usuario.id, organizacionId: m.organizacionId, rol: m.rol });
  }

  async ingresar(d: LoginInput) {
    const usuario = await this.db.app.usuario.findUnique({
      where: { email: d.email },
      include: { membresias: { orderBy: { creadoEn: 'asc' } } },
    });
    // Mismo mensaje y verificación de hash aunque el usuario no exista, para no revelar qué emails están registrados.
    const ok = usuario
      ? await argon2.verify(usuario.passwordHash, d.password)
      : (await argon2.hash(d.password), false);
    if (!usuario || !ok) throw new ErrorNegocio('Email o contraseña incorrectos.', HttpStatus.UNAUTHORIZED);
    const m = usuario.membresias[0];
    if (!m) throw new ErrorNegocio('Tu usuario no pertenece a ninguna organización.', HttpStatus.FORBIDDEN);
    return this.emitirSesion({ usuarioId: usuario.id, organizacionId: m.organizacionId, rol: m.rol });
  }

  /** Rota el token de renovación. Si se presenta uno ya usado, se revoca toda la familia (posible robo). */
  async renovar(tokenRefresh: string | undefined) {
    if (!tokenRefresh) throw new ErrorNegocio('Iniciá sesión para continuar.', HttpStatus.UNAUTHORIZED);
    const sesion = await this.db.app.sesionRefresh.findUnique({ where: { tokenHash: hash(tokenRefresh) } });
    if (!sesion || sesion.expiraEn < new Date())
      throw new ErrorNegocio('Tu sesión venció. Iniciá sesión de nuevo.', HttpStatus.UNAUTHORIZED);
    if (sesion.revocadoEn) {
      await this.db.app.sesionRefresh.updateMany({
        where: { familia: sesion.familia, revocadoEn: null },
        data: { revocadoEn: new Date() },
      });
      throw new ErrorNegocio(
        'Por seguridad cerramos tu sesión. Iniciá sesión de nuevo.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    await this.db.app.sesionRefresh.update({ where: { id: sesion.id }, data: { revocadoEn: new Date() } });
    const m = await this.db.app.membresia.findFirst({
      where: { usuarioId: sesion.usuarioId },
      orderBy: { creadoEn: 'asc' },
    });
    if (!m) throw new ErrorNegocio('Tu usuario no pertenece a ninguna organización.', HttpStatus.FORBIDDEN);
    return this.emitirSesion(
      { usuarioId: sesion.usuarioId, organizacionId: m.organizacionId, rol: m.rol },
      sesion.familia,
    );
  }

  async salir(tokenRefresh: string | undefined) {
    if (!tokenRefresh) return;
    const sesion = await this.db.app.sesionRefresh.findUnique({ where: { tokenHash: hash(tokenRefresh) } });
    if (sesion)
      await this.db.app.sesionRefresh.updateMany({
        where: { familia: sesion.familia },
        data: { revocadoEn: new Date() },
      });
  }

  async yo(c: Contexto) {
    const [usuario, organizacion] = await Promise.all([
      this.db.app.usuario.findUniqueOrThrow({
        where: { id: c.usuarioId },
        select: { id: true, nombre: true, email: true },
      }),
      this.db.app.organizacion.findUniqueOrThrow({
        where: { id: c.organizacionId },
        select: { id: true, nombre: true, slug: true, plan: true },
      }),
    ]);
    return { usuario, organizacion, rol: c.rol };
  }

  private async emitirSesion(c: Contexto, familia: string = randomBytes(16).toString('hex')) {
    const refresh = randomBytes(32).toString('base64url');
    await this.db.app.sesionRefresh.create({
      data: {
        usuarioId: c.usuarioId,
        familia,
        tokenHash: hash(refresh),
        expiraEn: new Date(Date.now() + DURACION_REFRESH_DIAS * 86_400_000),
      },
    });
    return { acceso: await firmarAcceso(c), refresh };
  }
}

export function ponerCookies(res: Response, s: { acceso: string; refresh: string }) {
  const base = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.NODE_ENV === 'production',
    path: '/',
  };
  res.cookie(COOKIE_ACCESO, s.acceso, { ...base, maxAge: DURACION_ACCESO_SEG * 1000 });
  res.cookie(COOKIE_REFRESH, s.refresh, { ...base, maxAge: DURACION_REFRESH_DIAS * 86_400_000 });
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Publico()
  @Post('registro')
  async registro(@Body(new Zod(registroSchema)) d: RegistroInput, @Res({ passthrough: true }) res: Response) {
    // En la demo las cuentas nacen solo como sandboxes (con vencimiento): un registro abierto dejaría cuentas eternas.
    if (config.DEMO_MODE)
      throw new ErrorNegocio(
        'En la demo no se crean cuentas. Entrá con "Probá la demo".',
        HttpStatus.FORBIDDEN,
      );
    ponerCookies(res, await this.auth.registrar(d));
    return { ok: true };
  }

  @Publico()
  @Post('ingresar')
  @HttpCode(200)
  async ingresar(@Body(new Zod(loginSchema)) d: LoginInput, @Res({ passthrough: true }) res: Response) {
    ponerCookies(res, await this.auth.ingresar(d));
    return { ok: true };
  }

  /** Devuelve los tokens también en el cuerpo: lo usa el proxy de la web para renovar la sesión del lado del servidor. */
  @Publico()
  @Post('renovar')
  @HttpCode(200)
  async renovar(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const s = await this.auth.renovar(req.cookies?.[COOKIE_REFRESH]);
    ponerCookies(res, s);
    return { ok: true, ...s, accesoSeg: DURACION_ACCESO_SEG, refreshDias: DURACION_REFRESH_DIAS };
  }

  @Publico()
  @Post('salir')
  @HttpCode(200)
  async salir(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.salir(req.cookies?.[COOKIE_REFRESH]);
    res.clearCookie(COOKIE_ACCESO, { path: '/' });
    res.clearCookie(COOKIE_REFRESH, { path: '/' });
    return { ok: true };
  }

  @Get('yo')
  yo(@Ctx() c: Contexto) {
    return this.auth.yo(c);
  }
}

/** Guard global: exige sesión salvo en rutas @Publico() y verifica el permiso de @Permiso(). */
@Injectable()
export class GuardSesion implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(c: ExecutionContext) {
    const req = c.switchToHttp().getRequest<PedidoAutenticado>();
    const token = req.cookies?.[COOKIE_ACCESO] ?? req.headers.authorization?.replace(/^Bearer /, '');
    if (token) {
      const ctx = await verificarAcceso(token);
      if (ctx) req.ctx = ctx;
    }
    const objetivos = [c.getHandler(), c.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLICO, objetivos)) return true;
    if (!req.ctx) throw new ErrorNegocio('Iniciá sesión para continuar.', HttpStatus.UNAUTHORIZED);
    const permiso = this.reflector.getAllAndOverride<string>(PERMISO, objetivos);
    if (permiso && !tienePermiso(req.ctx.rol, permiso))
      throw new ErrorNegocio('Tu rol no tiene permiso para esta acción.', HttpStatus.FORBIDDEN);
    return true;
  }
}

@Module({ controllers: [AuthController], providers: [AuthService], exports: [AuthService] })
export class AuthModule {}
