// Cuenta del usuario (E04-02, E04-10, E04-14): recuperar la contraseña, verificar el email, "Mi cuenta",
// cerrar sesión en todos los dispositivos y cambiar de organización activa.
// Usuarios, membresías y sesiones son tablas globales: se usan con `db.app` (sin RLS), siempre filtrando por el usuario.
import { createHash } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Module,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  type CambiarPasswordInput,
  cambiarPasswordSchema,
  MENSAJE_LINK,
  type OrganizacionActivaInput,
  organizacionActivaSchema,
  type PerfilInput,
  perfilSchema,
  type RecuperarInput,
  recuperarSchema,
  type RestablecerInput,
  restablecerSchema,
  type VerificarEmailInput,
  verificarEmailSchema,
} from '@potrero/shared';
import argon2 from 'argon2';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { auditar } from '../comun/auditoria.js';
import { type Contexto, Ctx, ErrorNegocio, Publico, Zod } from '../comun/http.js';
import { DbService } from '../db/db.service.js';
import { AuthModule, AuthService, COOKIE_ACCESO, COOKIE_REFRESH, ponerCookies } from './auth.js';
import { buscarLink, crearLink, registrarIntento, usarLink } from './links.js';

const hash = (t: string) => createHash('sha256').update(t).digest('hex');

/** Cambiar el email pide la contraseña: con una sesión robada no alcanza para quedarse con la cuenta. */
const perfilConPasswordSchema = perfilSchema.extend({ password: z.string().optional() });

@Injectable()
export class CuentaService {
  constructor(
    private readonly db: DbService,
    private readonly auth: AuthService,
  ) {}

  /** Siempre responde lo mismo, exista o no la cuenta: no revela qué emails están registrados. */
  async recuperar(d: RecuperarInput) {
    const u = await this.db.app.usuario.findUnique({ where: { email: d.email } });
    const link = u ? await crearLink(this.db, u.id, 'RECUPERAR', u.email) : undefined;
    return { ok: true, ...(link ? { linkDev: link } : {}) };
  }

  /** Estado de un link de recuperación, para que la pantalla avise antes de pedir la contraseña nueva. */
  async estadoRecuperacion(token: string) {
    const { estado } = await buscarLink(this.db, token, 'RECUPERAR');
    return { estado, mensaje: estado === 'VALIDO' ? null : MENSAJE_LINK[estado] };
  }

  /** Cambia la contraseña con el link, cierra todas las sesiones abiertas y entra con una nueva. */
  async restablecer(d: RestablecerInput) {
    const { link, estado } = await buscarLink(this.db, d.token, 'RECUPERAR');
    if (!link || estado !== 'VALIDO')
      throw new ErrorNegocio(MENSAJE_LINK[estado as 'USADO'], HttpStatus.GONE);
    if (!(await usarLink(this.db, link.id))) throw new ErrorNegocio(MENSAJE_LINK.USADO, HttpStatus.GONE);
    const antes = await this.db.app.usuario.findUniqueOrThrow({ where: { id: link.usuarioId } });
    const u = await this.db.app.usuario.update({
      where: { id: link.usuarioId },
      data: {
        passwordHash: await argon2.hash(d.password),
        // Recibió el link en su email actual: queda verificado.
        ...(link.email === antes.email && !antes.emailVerificadoEn ? { emailVerificadoEn: new Date() } : {}),
      },
      include: { membresias: { orderBy: { creadoEn: 'asc' } } },
    });
    await this.revocarSesiones(u.id);
    // Contraseña nueva: el contador de intentos fallidos de la cuenta vuelve a cero.
    await registrarIntento(this.db, u.email, 'restablecer', true);
    const m = u.membresias[0];
    if (!m) throw new ErrorNegocio('Tu usuario no pertenece a ninguna organización.', HttpStatus.FORBIDDEN);
    return this.auth.emitirSesion({ usuarioId: u.id, organizacionId: m.organizacionId, rol: m.rol });
  }

  async enviarVerificacion(c: Contexto) {
    const u = await this.db.app.usuario.findUniqueOrThrow({ where: { id: c.usuarioId } });
    if (u.emailVerificadoEn) return { ok: true, yaVerificado: true };
    const link = await crearLink(this.db, u.id, 'VERIFICAR_EMAIL', u.email);
    return { ok: true, yaVerificado: false, ...(link ? { linkDev: link } : {}) };
  }

  async verificarEmail(d: VerificarEmailInput) {
    const { link, estado } = await buscarLink(this.db, d.token, 'VERIFICAR_EMAIL');
    if (!link || estado !== 'VALIDO')
      throw new ErrorNegocio(MENSAJE_LINK[estado as 'USADO'], HttpStatus.GONE);
    const u = await this.db.app.usuario.findUniqueOrThrow({ where: { id: link.usuarioId } });
    // El link se mandó a otro email (lo cambió después): no verifica el actual.
    if (u.email !== link.email)
      throw new ErrorNegocio(
        'Este link era para otro email. Pedí uno nuevo desde "Mi cuenta".',
        HttpStatus.GONE,
      );
    if (!(await usarLink(this.db, link.id))) throw new ErrorNegocio(MENSAJE_LINK.USADO, HttpStatus.GONE);
    await this.db.app.usuario.update({ where: { id: u.id }, data: { emailVerificadoEn: new Date() } });
    return { ok: true, email: u.email };
  }

  async cuenta(c: Contexto) {
    const u = await this.db.app.usuario.findUniqueOrThrow({
      where: { id: c.usuarioId },
      include: {
        membresias: { include: { organizacion: true }, orderBy: { creadoEn: 'asc' } },
      },
    });
    const sesionesActivas = await this.db.app.sesionRefresh.count({
      where: { usuarioId: u.id, revocadoEn: null, expiraEn: { gt: new Date() } },
    });
    return {
      usuario: { id: u.id, nombre: u.nombre, email: u.email, emailVerificado: !!u.emailVerificadoEn },
      organizaciones: u.membresias.map((m) => ({
        id: m.organizacionId,
        nombre: m.organizacion.nombre,
        slug: m.organizacion.slug,
        rol: m.rol,
        activa: m.organizacionId === c.organizacionId,
      })),
      sesionesActivas,
    };
  }

  async actualizarPerfil(c: Contexto, d: PerfilInput & { password?: string }) {
    const u = await this.db.app.usuario.findUniqueOrThrow({ where: { id: c.usuarioId } });
    const cambiaEmail = d.email !== u.email;
    if (cambiaEmail) {
      if (!d.password || !(await argon2.verify(u.passwordHash, d.password)))
        throw new ErrorNegocio('Para cambiar el email, ingresá tu contraseña actual.', HttpStatus.FORBIDDEN);
      if (await this.db.app.usuario.findUnique({ where: { email: d.email } }))
        throw new ErrorNegocio('Ya hay una cuenta con ese email.', HttpStatus.CONFLICT);
    }
    await this.db.app.usuario.update({
      where: { id: u.id },
      data: { nombre: d.nombre, ...(cambiaEmail ? { email: d.email, emailVerificadoEn: null } : {}) },
    });
    await auditar(this.db.app, c, 'cuenta.perfil', 'usuario', u.id, {
      antes: { nombre: u.nombre, email: u.email },
      despues: { nombre: d.nombre, email: d.email },
    });
    // Email nuevo: hay que verificarlo de nuevo.
    const link = cambiaEmail ? await crearLink(this.db, u.id, 'VERIFICAR_EMAIL', d.email) : undefined;
    return { ok: true, verificacionEnviada: cambiaEmail, ...(link ? { linkDev: link } : {}) };
  }

  /** Cambia la contraseña y cierra las otras sesiones; la actual sigue abierta. */
  async cambiarPassword(c: Contexto, d: CambiarPasswordInput, refresh: string | undefined) {
    const u = await this.db.app.usuario.findUniqueOrThrow({ where: { id: c.usuarioId } });
    if (!(await argon2.verify(u.passwordHash, d.actual)))
      throw new ErrorNegocio('La contraseña actual no es correcta.', HttpStatus.FORBIDDEN);
    await this.db.app.usuario.update({
      where: { id: u.id },
      data: { passwordHash: await argon2.hash(d.nueva) },
    });
    const actual = refresh
      ? await this.db.app.sesionRefresh.findUnique({ where: { tokenHash: hash(refresh) } })
      : null;
    await this.revocarSesiones(u.id, actual?.familia);
    await auditar(this.db.app, c, 'cuenta.password', 'usuario', u.id);
    return { ok: true };
  }

  /** Cierra la sesión en todos los dispositivos (incluido este). */
  async cerrarSesiones(c: Contexto) {
    const n = await this.revocarSesiones(c.usuarioId);
    await auditar(this.db.app, c, 'cuenta.cerrar_sesiones', 'usuario', c.usuarioId, {
      despues: { sesiones: n },
    });
    return { ok: true, cerradas: n };
  }

  /** Cambia la organización activa (E04-10): emite una sesión nueva para esa organización y revoca la anterior. */
  async cambiarOrganizacion(c: Contexto, d: OrganizacionActivaInput, refresh: string | undefined) {
    const m = await this.db.app.membresia.findUnique({
      where: { usuarioId_organizacionId: { usuarioId: c.usuarioId, organizacionId: d.organizacionId } },
    });
    if (!m) throw new ErrorNegocio('No sos miembro de esa organización.', HttpStatus.FORBIDDEN);
    if (refresh) {
      const s = await this.db.app.sesionRefresh.findUnique({ where: { tokenHash: hash(refresh) } });
      if (s && s.usuarioId === c.usuarioId)
        await this.db.app.sesionRefresh.updateMany({
          where: { familia: s.familia, revocadoEn: null },
          data: { revocadoEn: new Date() },
        });
    }
    return this.auth.emitirSesion({ usuarioId: c.usuarioId, organizacionId: m.organizacionId, rol: m.rol });
  }

  private async revocarSesiones(usuarioId: string, salvoFamilia?: string) {
    const r = await this.db.app.sesionRefresh.updateMany({
      where: { usuarioId, revocadoEn: null, ...(salvoFamilia ? { familia: { not: salvoFamilia } } : {}) },
      data: { revocadoEn: new Date() },
    });
    return r.count;
  }
}

const limpiarCookies = (res: Response) => {
  res.clearCookie(COOKIE_ACCESO, { path: '/' });
  res.clearCookie(COOKIE_REFRESH, { path: '/' });
};

@Controller()
export class CuentaController {
  constructor(private readonly s: CuentaService) {}

  @Publico()
  @Post('auth/recuperar')
  @HttpCode(200)
  recuperar(@Body(new Zod(recuperarSchema)) d: RecuperarInput) {
    return this.s.recuperar(d);
  }

  @Publico()
  @Post('auth/recuperar/estado')
  @HttpCode(200)
  estadoRecuperacion(@Body(new Zod(verificarEmailSchema)) d: VerificarEmailInput) {
    return this.s.estadoRecuperacion(d.token);
  }

  @Publico()
  @Post('auth/restablecer')
  @HttpCode(200)
  async restablecer(
    @Body(new Zod(restablecerSchema)) d: RestablecerInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    ponerCookies(res, await this.s.restablecer(d));
    return { ok: true };
  }

  @Publico()
  @Post('auth/verificar-email')
  @HttpCode(200)
  verificarEmail(@Body(new Zod(verificarEmailSchema)) d: VerificarEmailInput) {
    return this.s.verificarEmail(d);
  }

  @Get('cuenta')
  cuenta(@Ctx() c: Contexto) {
    return this.s.cuenta(c);
  }

  @Patch('cuenta')
  perfil(@Ctx() c: Contexto, @Body(new Zod(perfilConPasswordSchema)) d: PerfilInput & { password?: string }) {
    return this.s.actualizarPerfil(c, d);
  }

  @Post('cuenta/verificacion')
  @HttpCode(200)
  verificacion(@Ctx() c: Contexto) {
    return this.s.enviarVerificacion(c);
  }

  @Post('cuenta/password')
  @HttpCode(200)
  password(
    @Ctx() c: Contexto,
    @Body(new Zod(cambiarPasswordSchema)) d: CambiarPasswordInput,
    @Req() req: Request,
  ) {
    return this.s.cambiarPassword(c, d, req.cookies?.[COOKIE_REFRESH]);
  }

  @Post('cuenta/cerrar-sesiones')
  @HttpCode(200)
  async cerrarSesiones(@Ctx() c: Contexto, @Res({ passthrough: true }) res: Response) {
    const r = await this.s.cerrarSesiones(c);
    limpiarCookies(res);
    return r;
  }

  @Post('cuenta/organizacion')
  @HttpCode(200)
  async organizacion(
    @Ctx() c: Contexto,
    @Body(new Zod(organizacionActivaSchema)) d: OrganizacionActivaInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    ponerCookies(res, await this.s.cambiarOrganizacion(c, d, req.cookies?.[COOKIE_REFRESH]));
    return { ok: true };
  }
}

@Module({ imports: [AuthModule], controllers: [CuentaController], providers: [CuentaService] })
export class CuentaModule {}
