// Usuarios de la organización (E04-09): miembros con su rol, invitaciones con link de un solo uso y vencimiento, y quitar
// accesos. El email todavía no sale por un proveedor: la pantalla muestra el link para copiarlo o mandarlo por WhatsApp.
// Las reglas (quién invita a quién, estado de la invitación, último dueño) son puras en @potrero/shared.
import { createHash, randomBytes } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Module,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import {
  aceptarInvitacionSchema,
  DATOS,
  type AceptarInvitacionInput,
  estadoInvitacion,
  invitarSchema,
  type InvitarInput,
  NOMBRE_ROL,
  puedeInvitar,
  puedeQuitarAcceso,
  type RolOrganizacion,
  rolesQuePuedeInvitar,
  vencimientoInvitacion,
  CONSENTIMIENTO_TERMINOS_JUGADOR,
  TERMINOS_JUGADOR,
} from '@potrero/shared';
import argon2 from 'argon2';
import type { Response } from 'express';
import { AuthModule, AuthService, ponerCookies } from '../auth/auth.js';
import { auditar } from '../comun/auditoria.js';
import { type Contexto, Ctx, ErrorNegocio, noEncontrado, Permiso, Publico, Zod } from '../comun/http.js';
import { config } from '../config.js';
import { DbService, enSerie, type Tx } from '../db/db.service.js';

const hash = (t: string) => createHash('sha256').update(t).digest('hex');
const linkDe = (token: string) => `${config.WEB_URL}/invitacion/${token}`;

/** Token nuevo para una invitación: se devuelve una sola vez y se guarda solo su hash. */
function nuevoToken() {
  const token = randomBytes(24).toString('base64url');
  return { token, tokenHash: hash(token) };
}

@Injectable()
export class UsuariosService {
  constructor(
    private readonly db: DbService,
    private readonly auth: AuthService,
  ) {}

  /** Miembros, invitaciones y lo que puede hacer quien mira (roles que invita y equipos para un capitán). */
  listar(c: Contexto) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      // La membresía es global (sin RLS): siempre se filtra por la organización de la sesión.
      const [miembros, invitaciones, equipos] = await enSerie([
        () =>
          tx.membresia.findMany({
            where: { organizacionId: c.organizacionId },
            include: { usuario: { select: { id: true, nombre: true, email: true } } },
            orderBy: { creadoEn: 'asc' },
          }),
        () => tx.invitacion.findMany({ orderBy: { creadoEn: 'desc' } }),
        () => tx.equipo.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
      ]);
      const nombreEquipo = new Map(equipos.map((e) => [e.id, e.nombre]));
      const duenos = miembros.filter((m) => m.rol === 'DUENO').length;
      const ahora = new Date();
      return {
        miembros: miembros.map((m) => ({
          id: m.id,
          usuarioId: m.usuarioId,
          nombre: m.usuario.nombre,
          email: m.usuario.email,
          rol: m.rol,
          rolNombre: NOMBRE_ROL[m.rol as RolOrganizacion],
          equipo: m.equipoId ? (nombreEquipo.get(m.equipoId) ?? '—') : null,
          desde: m.creadoEn,
          esUnoMismo: m.usuarioId === c.usuarioId,
          quitar: puedeQuitarAcceso({
            actor: c.rol,
            objetivo: m.rol,
            esUnoMismo: m.usuarioId === c.usuarioId,
            duenos,
          }),
        })),
        invitaciones: invitaciones.map((i) => ({
          id: i.id,
          email: i.email,
          nombre: i.nombre,
          rol: i.rol,
          rolNombre: NOMBRE_ROL[i.rol as RolOrganizacion],
          equipo: i.equipoId ? (nombreEquipo.get(i.equipoId) ?? '—') : null,
          estado: estadoInvitacion(i, ahora),
          venceEn: i.venceEn,
          creadoEn: i.creadoEn,
          gestionable: (rolesQuePuedeInvitar(c.rol) as string[]).includes(i.rol),
        })),
        rolesInvitables: rolesQuePuedeInvitar(c.rol).map((r) => ({ rol: r, nombre: NOMBRE_ROL[r] })),
        equipos,
      };
    });
  }

  invitar(c: Contexto, d: InvitarInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const ok = puedeInvitar(c.rol, d.rol, d.equipoId);
      if (!ok.ok) throw new ErrorNegocio(ok.motivo, HttpStatus.FORBIDDEN);
      const equipoId = d.rol === 'CAPITAN' ? d.equipoId! : null;
      if (equipoId && !(await tx.equipo.findUnique({ where: { id: equipoId } })))
        throw noEncontrado('el equipo');
      const usuario = await tx.usuario.findUnique({ where: { email: d.email } });
      if (
        usuario &&
        (await tx.membresia.findUnique({
          where: { usuarioId_organizacionId: { usuarioId: usuario.id, organizacionId: c.organizacionId } },
        }))
      )
        throw new ErrorNegocio('Esa persona ya es parte de la organización.', HttpStatus.CONFLICT);
      // Una sola invitación viva por email: la anterior queda anulada.
      await tx.invitacion.updateMany({
        where: { email: d.email, aceptadaEn: null, rechazadaEn: null, anuladaEn: null },
        data: { anuladaEn: new Date() },
      });
      const { token, tokenHash } = nuevoToken();
      const inv = await tx.invitacion.create({
        data: {
          organizacionId: c.organizacionId,
          email: d.email,
          nombre: d.nombre ?? null,
          rol: d.rol,
          equipoId,
          tokenHash,
          venceEn: vencimientoInvitacion(new Date()),
          invitadoPorId: c.usuarioId,
        },
      });
      await auditar(tx, c, 'usuario.invitar', 'invitacion', inv.id, {
        despues: { email: d.email, rol: d.rol, equipoId },
      });
      return { id: inv.id, link: linkDe(token), venceEn: inv.venceEn };
    });
  }

  /**
   * Invitación de un jugador a tener cuenta (E20-01). La pide el capitán desde su plantel (ver jugador/jugador.ts, que
   * controla que el jugador sea de su equipo); al aceptarla, la cuenta queda atada a ese perfil.
   */
  invitarJugador(c: Contexto, d: { equipoId: string; jugadorId: string; email: string; nombre: string }) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      if (
        await tx.membresia.findFirst({ where: { organizacionId: c.organizacionId, jugadorId: d.jugadorId } })
      )
        throw new ErrorNegocio('Ese jugador ya tiene cuenta en la app.', HttpStatus.CONFLICT);
      // Una sola invitación viva por jugador: la anterior queda anulada.
      await tx.invitacion.updateMany({
        where: { jugadorId: d.jugadorId, aceptadaEn: null, rechazadaEn: null, anuladaEn: null },
        data: { anuladaEn: new Date() },
      });
      const { token, tokenHash } = nuevoToken();
      const inv = await tx.invitacion.create({
        data: {
          organizacionId: c.organizacionId,
          email: d.email,
          nombre: d.nombre,
          rol: 'JUGADOR',
          equipoId: d.equipoId,
          jugadorId: d.jugadorId,
          tokenHash,
          venceEn: vencimientoInvitacion(new Date()),
          invitadoPorId: c.usuarioId,
        },
      });
      await auditar(tx, c, 'jugador.invitar', 'invitacion', inv.id, {
        despues: { email: d.email, jugadorId: d.jugadorId, equipoId: d.equipoId },
      });
      return { id: inv.id, link: linkDe(token), venceEn: inv.venceEn };
    });
  }

  private async gestionable(tx: Tx, c: Contexto, id: string) {
    const inv = await tx.invitacion.findUnique({ where: { id } });
    if (!inv) throw noEncontrado('la invitación');
    if (!(rolesQuePuedeInvitar(c.rol) as string[]).includes(inv.rol))
      throw new ErrorNegocio('Tu rol no puede gestionar esta invitación.', HttpStatus.FORBIDDEN);
    return inv;
  }

  /** Genera un link nuevo (el anterior deja de valer) y renueva el vencimiento. */
  reenviar(c: Contexto, id: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const inv = await this.gestionable(tx, c, id);
      const estado = estadoInvitacion(inv, new Date());
      if (estado !== 'PENDIENTE' && estado !== 'VENCIDA')
        throw new ErrorNegocio('Esta invitación ya se usó o se anuló. Creá una nueva.', HttpStatus.CONFLICT);
      const { token, tokenHash } = nuevoToken();
      const act = await tx.invitacion.update({
        where: { id },
        data: { tokenHash, venceEn: vencimientoInvitacion(new Date()) },
      });
      await auditar(tx, c, 'usuario.invitacion.reenviar', 'invitacion', id);
      return { id, link: linkDe(token), venceEn: act.venceEn };
    });
  }

  anular(c: Contexto, id: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const inv = await this.gestionable(tx, c, id);
      if (estadoInvitacion(inv, new Date()) === 'ACEPTADA')
        throw new ErrorNegocio('La invitación ya fue aceptada: quitale el acceso desde Miembros.');
      await tx.invitacion.update({ where: { id }, data: { anuladaEn: inv.anuladaEn ?? new Date() } });
      await auditar(tx, c, 'usuario.invitacion.anular', 'invitacion', id);
      return { ok: true };
    });
  }

  /** Quita el acceso de un miembro. Nunca al último dueño. Si no le queda ninguna organización, se cierran sus sesiones. */
  quitar(c: Contexto, membresiaId: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const m = await tx.membresia.findFirst({
        where: { id: membresiaId, organizacionId: c.organizacionId },
      });
      if (!m) throw noEncontrado('el miembro');
      const duenos = await tx.membresia.count({ where: { organizacionId: c.organizacionId, rol: 'DUENO' } });
      const ok = puedeQuitarAcceso({
        actor: c.rol,
        objetivo: m.rol,
        esUnoMismo: m.usuarioId === c.usuarioId,
        duenos,
      });
      if (!ok.ok) throw new ErrorNegocio(ok.motivo, HttpStatus.FORBIDDEN);
      await tx.membresia.delete({ where: { id: m.id } });
      if (!(await tx.membresia.count({ where: { usuarioId: m.usuarioId } })))
        await tx.sesionRefresh.updateMany({
          where: { usuarioId: m.usuarioId, revocadoEn: null },
          data: { revocadoEn: new Date() },
        });
      await auditar(tx, c, 'usuario.quitar', 'membresia', m.id, {
        antes: { usuarioId: m.usuarioId, rol: m.rol, equipoId: m.equipoId },
      });
      return { ok: true };
    });
  }

  /**
   * Busca la invitación por su token. Acceso de sistema justificado: quien la abre todavía no tiene sesión en la
   * organización; el token imposible de adivinar es la credencial. Desde acá se sigue con RLS.
   */
  private async porToken(token: string) {
    const inv = await this.db.sistema.invitacion.findUnique({ where: { tokenHash: hash(token) } });
    if (!inv) throw noEncontrado('la invitación (puede que la hayan reenviado con otro link)');
    return inv;
  }

  /** Lo que ve el invitado antes de aceptar. Nunca muestra datos de otras personas. */
  async verPublica(token: string) {
    const inv = await this.porToken(token);
    const [org, equipo, usuario] = await Promise.all([
      this.db.app.organizacion.findUniqueOrThrow({
        where: { id: inv.organizacionId },
        select: { nombre: true, slug: true },
      }),
      inv.equipoId
        ? this.db.enOrg(inv.organizacionId, (tx) =>
            tx.equipo.findUnique({ where: { id: inv.equipoId! }, select: { nombre: true } }),
          )
        : null,
      this.db.app.usuario.findUnique({ where: { email: inv.email }, select: { id: true } }),
    ]);
    return {
      organizacion: org.nombre,
      email: inv.email,
      nombre: inv.nombre,
      rol: inv.rol,
      rolNombre: NOMBRE_ROL[inv.rol as RolOrganizacion],
      equipo: equipo?.nombre ?? null,
      estado: estadoInvitacion(inv, new Date()),
      venceEn: inv.venceEn,
      tieneCuenta: !!usuario,
      // Jugador (E20-01): acepta los términos con versión al reclamar su perfil.
      terminos: inv.rol === 'JUGADOR' ? TERMINOS_JUGADOR : null,
    };
  }

  private async vigente(token: string) {
    const inv = await this.porToken(token);
    const estado = estadoInvitacion(inv, new Date());
    const motivos: Record<string, string> = {
      ACEPTADA: 'Esta invitación ya se usó. Iniciá sesión con tu cuenta.',
      RECHAZADA: 'Esta invitación fue rechazada.',
      ANULADA: 'Esta invitación fue anulada. Pedile una nueva a quien te invitó.',
      VENCIDA: 'Esta invitación venció. Pedile a quien te invitó que la reenvíe.',
    };
    if (estado !== 'PENDIENTE') throw new ErrorNegocio(motivos[estado]!, HttpStatus.GONE);
    return inv;
  }

  /**
   * Acepta la invitación: crea la cuenta (o verifica la contraseña de la que ya existe), suma la membresía con el rol y
   * marca el token como usado. Devuelve la sesión.
   */
  async aceptar(token: string, d: AceptarInvitacionInput) {
    const inv = await this.vigente(token);
    if (inv.rol === 'JUGADOR' && d.terminosVersion !== TERMINOS_JUGADOR.version)
      throw new ErrorNegocio('Para crear tu cuenta tenés que aceptar los términos de uso.');
    let usuario = await this.db.app.usuario.findUnique({ where: { email: inv.email } });
    if (usuario) {
      if (!(await argon2.verify(usuario.passwordHash, d.password)))
        // 422 y no 401: no es una sesión vencida, así la web muestra el aviso en lugar de mandar a /ingresar (F20).
        throw new ErrorNegocio(
          'La contraseña no coincide con la de tu cuenta.',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
    } else {
      if (!d.nombre) throw new ErrorNegocio('Contanos tu nombre.');
      if (d.password.length < DATOS.cuentas.contrasenaMinimaCaracteres)
        throw new ErrorNegocio(
          `La contraseña necesita al menos ${DATOS.cuentas.contrasenaMinimaCaracteres} caracteres.`,
        );
      usuario = await this.db.app.usuario.create({
        data: { email: inv.email, nombre: d.nombre, passwordHash: await argon2.hash(d.password) },
      });
    }
    const usuarioId = usuario.id;
    await this.db.enOrg(inv.organizacionId, async (tx) => {
      // Marca el uso primero y condicionado: si dos pedidos llegan juntos, solo uno lo consigue.
      const usada = await tx.invitacion.updateMany({
        where: { id: inv.id, aceptadaEn: null, anuladaEn: null, rechazadaEn: null },
        data: { aceptadaEn: new Date() },
      });
      if (!usada.count) throw new ErrorNegocio('Esta invitación ya se usó.', HttpStatus.GONE);
      const ya = await tx.membresia.findUnique({
        where: { usuarioId_organizacionId: { usuarioId, organizacionId: inv.organizacionId } },
      });
      if (ya)
        throw new ErrorNegocio('Ya sos parte de esta organización. Iniciá sesión.', HttpStatus.CONFLICT);
      const m = await tx.membresia.create({
        data: {
          usuarioId,
          organizacionId: inv.organizacionId,
          rol: inv.rol,
          equipoId: inv.equipoId,
          jugadorId: inv.jugadorId,
        },
      });
      if (inv.rol === 'JUGADOR' && inv.jugadorId) {
        if (
          await tx.membresia.count({
            where: { organizacionId: inv.organizacionId, jugadorId: inv.jugadorId, NOT: { id: m.id } },
          })
        )
          throw new ErrorNegocio('Ese perfil de jugador ya tiene cuenta.', HttpStatus.CONFLICT);
        // La aceptación de los términos queda guardada con su versión, como los demás consentimientos.
        await tx.consentimiento.create({
          data: {
            organizacionId: inv.organizacionId,
            jugadorId: inv.jugadorId,
            tipo: CONSENTIMIENTO_TERMINOS_JUGADOR,
            version: TERMINOS_JUGADOR.version,
            otorgante: usuario.nombre,
            vinculo: 'PROPIO',
          },
        });
      }
      await auditar(
        tx,
        { organizacionId: inv.organizacionId, usuarioId },
        'usuario.aceptar',
        'membresia',
        m.id,
        {
          despues: { rol: inv.rol, equipoId: inv.equipoId, jugadorId: inv.jugadorId, invitacionId: inv.id },
        },
      );
    });
    // La sesión queda en la organización que invitó, con el rol de la invitación (F20).
    return this.auth.emitirSesion({ usuarioId, organizacionId: inv.organizacionId, rol: inv.rol });
  }

  rechazar(token: string) {
    return this.vigente(token).then((inv) =>
      this.db.enOrg(inv.organizacionId, async (tx) => {
        await tx.invitacion.update({ where: { id: inv.id }, data: { rechazadaEn: new Date() } });
        return { ok: true };
      }),
    );
  }
}

@Controller()
export class UsuariosController {
  constructor(private readonly s: UsuariosService) {}

  @Get('usuarios')
  @Permiso('usuario.gestionar')
  listar(@Ctx() c: Contexto) {
    return this.s.listar(c);
  }

  @Post('usuarios/invitaciones')
  @Permiso('usuario.gestionar')
  invitar(@Ctx() c: Contexto, @Body(new Zod(invitarSchema)) d: InvitarInput) {
    return this.s.invitar(c, d);
  }

  @Post('usuarios/invitaciones/:id/reenviar')
  @Permiso('usuario.gestionar')
  @HttpCode(200)
  reenviar(@Ctx() c: Contexto, @Param('id') id: string) {
    return this.s.reenviar(c, id);
  }

  @Post('usuarios/invitaciones/:id/anular')
  @Permiso('usuario.gestionar')
  @HttpCode(200)
  anular(@Ctx() c: Contexto, @Param('id') id: string) {
    return this.s.anular(c, id);
  }

  @Post('usuarios/miembros/:id/quitar')
  @Permiso('usuario.gestionar')
  @HttpCode(200)
  quitar(@Ctx() c: Contexto, @Param('id') id: string) {
    return this.s.quitar(c, id);
  }

  @Publico()
  @Get('invitaciones/:token')
  ver(@Param('token') token: string) {
    return this.s.verPublica(token);
  }

  @Publico()
  @Post('invitaciones/:token/aceptar')
  @HttpCode(200)
  async aceptar(
    @Param('token') token: string,
    @Body(new Zod(aceptarInvitacionSchema)) d: AceptarInvitacionInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (config.DEMO_MODE)
      throw new ErrorNegocio('En la demo no se crean cuentas por invitación.', HttpStatus.FORBIDDEN);
    ponerCookies(res, await this.s.aceptar(token, d));
    return { ok: true };
  }

  @Publico()
  @Post('invitaciones/:token/rechazar')
  @HttpCode(200)
  rechazar(@Param('token') token: string) {
    return this.s.rechazar(token);
  }
}

@Module({
  imports: [AuthModule],
  controllers: [UsuariosController],
  providers: [UsuariosService],
  exports: [UsuariosService],
})
export class UsuariosModule {}
