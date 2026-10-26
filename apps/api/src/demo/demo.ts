// Demo pública (ADR-019): una sandbox por visitante, creada desde la plantilla y eliminada al vencer.
// Este módulo solo se carga con DEMO_MODE=true (ver app.module.ts); en producción estas rutas no existen.
import { randomBytes } from 'node:crypto';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Injectable,
  Logger,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Request, Response } from 'express';
import { AuthModule, AuthService, ponerCookies, verificarAcceso } from '../auth/auth.js';
import { type Contexto, Ctx, ErrorNegocio, Publico } from '../comun/http.js';
import { config } from '../config.js';
import { DbService } from '../db/db.service.js';
import { cargarPlantilla } from './plantilla.js';

export const DURACION_SANDBOX_MS = 24 * 60 * 60 * 1000;
const CADA_CUANTO_LIMPIAR_MS = 10 * 60 * 1000;
const DOMINIO_SANDBOX = 'sandbox.potrero.app';
const VENTANA_POR_IP_MS = 60 * 60 * 1000;

/**
 * Tablas con `organizacion_id`, en orden de borrado (primero las que dependen de otras).
 * Las tablas de una organización no tienen clave foránea hacia `organizacion`, así que borrarla no arrastra
 * sus datos. Un test comprueba que no quede ninguna tabla con `organizacion_id` fuera de esta lista.
 */
export const TABLAS_DE_ORGANIZACION = [
  'linea_asiento',
  'asiento',
  'acceso_documento',
  'documento_jugador',
  'duplicado_jugador',
  'consentimiento',
  'solicitud_consentimiento',
  'mensaje',
  'difusion',
  'contingencia',
  'automatizacion',
  'evento_partido',
  'expediente',
  'levantamiento_sancion',
  'sancion',
  'pago',
  'cargo',
  'partido',
  'arbitro',
  'inscripcion',
  'cancha',
  'sede',
  'plantel_jugador',
  'jugador',
  'equipo',
  'torneo',
  'reglamento',
  'auditoria',
  // Sponsors (E23): las métricas y los espacios antes que el sponsor.
  'metrica_placement',
  'placement',
  'sponsor',
  'preferencias_sponsors',
  // Usuarios e invitaciones (E04-09) y convocatoria del capitán (E19-02).
  'invitacion',
  'convocatoria',
  // Torneos por fases (ADR-026). Se borra en cascada con el torneo; va acá por si quedara alguna suelta.
  'fase',
] as const;

@Injectable()
export class DemoService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Demo');
  private temporizador?: NodeJS.Timeout;
  /** Cuándo creó sandboxes cada IP en la última hora. En memoria: alcanza para una sola instancia de la demo. */
  private readonly creadasPorIp = new Map<string, number[]>();

  constructor(
    private readonly db: DbService,
    private readonly auth: AuthService,
    private readonly modulos: ModuleRef,
  ) {}

  onModuleInit() {
    void this.limpiarVencidas();
    this.temporizador = setInterval(() => void this.limpiarVencidas(), CADA_CUANTO_LIMPIAR_MS);
    this.temporizador.unref();
  }

  onModuleDestroy() {
    clearInterval(this.temporizador);
  }

  /**
   * Antes de crear una sandbox: captcha (si está configurado), tope de sandboxes activas y tope por IP.
   * Cada rechazo queda en el log con la IP, para ver intentos de abuso.
   */
  async admitir(ip: string, captcha?: string) {
    if (config.TURNSTILE_SECRET && !(await this.captchaValido(ip, captcha))) {
      this.log.warn(`Captcha rechazado desde ${ip}`);
      throw new ErrorNegocio(
        'No pudimos verificar que sos una persona. Probá de nuevo.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const ahora = Date.now();
    const recientes = (this.creadasPorIp.get(ip) ?? []).filter((t) => ahora - t < VENTANA_POR_IP_MS);
    if (recientes.length >= config.DEMO_MAX_POR_IP_HORA) {
      this.log.warn(`Límite por IP superado desde ${ip}`);
      throw new ErrorNegocio(
        'Ya creaste varias demos en la última hora. Esperá un rato o seguí con la que tenés.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const activas = await this.db.sistema.organizacion.count({ where: { demoExpiraEn: { not: null } } });
    if (activas >= config.DEMO_MAX_SANDBOXES) {
      this.log.warn(`Tope de sandboxes activas alcanzado (${activas})`);
      throw new ErrorNegocio(
        'La demo está con mucha demanda. Probá de nuevo en unos minutos.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    this.creadasPorIp.set(ip, [...recientes, ahora]);
  }

  private async captchaValido(ip: string, token?: string) {
    if (!token) return false;
    try {
      const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: new URLSearchParams({ secret: config.TURNSTILE_SECRET!, response: token, remoteip: ip }),
      });
      return ((await r.json()) as { success?: boolean }).success === true;
    } catch {
      return false;
    }
  }

  /** Crea el usuario, la organización y los datos de la plantilla de un visitante. Devuelve su sesión. */
  async crearSandbox() {
    const id = randomBytes(6).toString('hex');
    const sesion = await this.auth.registrar({
      email: `visitante-${id}@${DOMINIO_SANDBOX}`,
      password: randomBytes(24).toString('base64url'),
      nombre: 'Visitante de la demo',
      organizacion: 'Liga Barrial Sur',
    });
    const c = (await verificarAcceso(sesion.acceso))!;
    // El vencimiento se fija antes de cargar los datos: si la carga falla, el job igual la limpia.
    await this.db.app.organizacion.update({
      where: { id: c.organizacionId },
      data: { demoExpiraEn: new Date(Date.now() + DURACION_SANDBOX_MS) },
    });
    try {
      await cargarPlantilla({ get: (t) => this.modulos.get(t, { strict: false }) }, c);
    } catch (e) {
      await this.eliminar(c.organizacionId);
      throw e;
    }
    const org = await this.db.app.organizacion.findUniqueOrThrow({
      where: { id: c.organizacionId },
      select: { slug: true },
    });
    return { sesion, urlPublica: `/t/${org.slug}/apertura-2026` };
  }

  /** Descarta la sandbox del visitante y le arma una nueva con los datos originales. */
  async reiniciar(c: Contexto, ip: string) {
    const org = await this.db.app.organizacion.findUnique({
      where: { id: c.organizacionId },
      select: { demoExpiraEn: true },
    });
    // Nunca se borra una liga real: solo las organizaciones marcadas como sandbox.
    if (!org?.demoExpiraEn)
      throw new ErrorNegocio('Solo se puede reiniciar una cuenta de demo.', HttpStatus.FORBIDDEN);
    await this.admitir(ip);
    const nueva = await this.crearSandbox();
    await this.eliminar(c.organizacionId);
    return nueva;
  }

  /** Elimina las sandboxes vencidas con todos sus datos. Devuelve cuántas borró. */
  async limpiarVencidas(ahora = new Date()) {
    try {
      const vencidas = await this.db.sistema.organizacion.findMany({
        where: { demoExpiraEn: { lt: ahora } },
        select: { id: true },
      });
      for (const o of vencidas) await this.eliminar(o.id);
      if (vencidas.length) this.log.log(`Sandboxes vencidas eliminadas: ${vencidas.length}`);
      return vencidas.length;
    } catch (e) {
      this.log.error(`No se pudo limpiar las sandboxes vencidas: ${e instanceof Error ? e.message : e}`);
      return 0;
    }
  }

  /** Borra una sandbox entera: datos de la organización, usuarios que solo pertenecían a ella y la organización. */
  private async eliminar(organizacionId: string) {
    const org = await this.db.sistema.organizacion.findUnique({
      where: { id: organizacionId },
      select: { demoExpiraEn: true },
    });
    // Defensa en profundidad: este método jamás toca una organización que no sea de demo.
    if (!org?.demoExpiraEn) throw new Error(`La organización ${organizacionId} no es una sandbox`);
    const miembros = await this.db.sistema.membresia.findMany({
      where: { organizacionId },
      select: { usuarioId: true },
    });
    await this.db.sistema.$transaction(async (tx) => {
      // El libro de caja no se puede borrar salvo así: es la limpieza de una organización de demo.
      await tx.$executeRawUnsafe("SELECT set_config('potrero.permitir_borrado_libro', 'on', true)");
      for (const tabla of TABLAS_DE_ORGANIZACION)
        await tx.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE organizacion_id = $1`, organizacionId);
      await tx.organizacion.delete({ where: { id: organizacionId } });
      // Los usuarios de sandbox son de una sola organización; el borrado arrastra membresías y sesiones.
      await tx.usuario.deleteMany({
        where: {
          id: { in: miembros.map((m) => m.usuarioId) },
          email: { endsWith: `@${DOMINIO_SANDBOX}` },
          membresias: { none: {} },
        },
      });
    });
  }
}

@Controller('demo')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Publico()
  @Post('sandbox')
  @HttpCode(HttpStatus.CREATED)
  async sandbox(
    @Req() req: Request,
    @Body() cuerpo: { captcha?: string } | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.demo.admitir(req.ip ?? 'desconocida', cuerpo?.captcha);
    const { sesion, urlPublica } = await this.demo.crearSandbox();
    ponerCookies(res, sesion);
    return { ok: true, urlPublica, venceEnHoras: DURACION_SANDBOX_MS / 3_600_000 };
  }

  @Post('reiniciar')
  @HttpCode(HttpStatus.OK)
  async reiniciar(@Ctx() c: Contexto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { sesion, urlPublica } = await this.demo.reiniciar(c, req.ip ?? 'desconocida');
    ponerCookies(res, sesion);
    return { ok: true, urlPublica };
  }
}

@Module({ imports: [AuthModule], controllers: [DemoController], providers: [DemoService] })
export class DemoModule {}
