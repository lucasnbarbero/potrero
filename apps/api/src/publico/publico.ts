import { Body, Controller, Get, HttpStatus, Injectable, Module, Param, Post } from '@nestjs/common';
import {
  comisionPlataforma,
  DATOS,
  inscripcionPublicaSchema,
  type InscripcionPublicaInput,
  type Plan,
} from '@potrero/shared';
import { auditar } from '../comun/auditoria.js';
import { type Contexto, Ctx, ErrorNegocio, noEncontrado, Publico, Zod } from '../comun/http.js';
import { CobrosModule, CobrosService, inscribirEquipo } from '../cobros/cobros.js';
import { DbService, enSerie } from '../db/db.service.js';
import { llaveDelTorneo } from '../torneos/llaves.js';
import { vistaDeFases } from '../torneos/fases.js';
import { estadisticasDelTorneo, partidosDelTorneo } from '../torneos/torneos.js';
import { jugadoresPublicos, PaginasPublicasController, PaginasPublicasService } from './paginas.js';

/**
 * Sitio público del torneo. Principio de mínimo dato: nunca expone DNI, teléfonos, emails ni datos de pago.
 * Resuelve la organización por slug y después trabaja con RLS sobre esa organización.
 */
@Injectable()
export class PublicoService {
  constructor(
    private readonly db: DbService,
    private readonly cobros: CobrosService,
  ) {}

  private async org(slug: string) {
    const org = await this.db.app.organizacion.findUnique({ where: { slug } });
    if (!org) throw noEncontrado('la organización');
    return org;
  }

  async organizacion(slug: string) {
    const org = await this.org(slug);
    const torneos = await this.db.enOrg(org.id, (tx) =>
      tx.torneo.findMany({
        where: { estado: { not: 'BORRADOR' } },
        orderBy: { creadoEn: 'desc' },
        select: { nombre: true, slug: true, modalidad: true, estado: true },
      }),
    );
    return { organizacion: { nombre: org.nombre, slug: org.slug, colorMarca: org.colorMarca }, torneos };
  }

  async torneo(orgSlug: string, torneoSlug: string) {
    const org = await this.org(orgSlug);
    return this.db.enOrg(org.id, async (tx) => {
      const t = await tx.torneo.findFirst({ where: { slug: torneoSlug, estado: { not: 'BORRADOR' } } });
      if (!t) throw noEncontrado('el torneo');
      const [partidos, est, llave, inscriptos] = await enSerie([
        () => partidosDelTorneo(tx, t.id),
        () => estadisticasDelTorneo(tx, t.id),
        () => llaveDelTorneo(tx, t.id),
        () => tx.inscripcion.count({ where: { torneoId: t.id, estado: { not: 'BAJA' } } }),
      ]);
      // Torneos por fases (ADR-026): cada fase con sus tablas, llave y partidos (solo nombres de equipos).
      const fases =
        t.formato === 'FLEXIBLE'
          ? (await vistaDeFases(tx, t.id)).fases.map(({ puedeGenerar: _p, motivo: _m, ...f }) => f)
          : null;
      const activas = est.sanciones.filter((s) => s.activa);
      // Nombres según la privacidad de cada jugador (E20-04); el id solo va si tiene perfil público.
      const publicos = await jugadoresPublicos(tx, [
        ...est.goleadores.map((g) => g.jugadorId),
        ...activas.map((s) => s.jugadorId),
      ]);
      return {
        organizacion: { nombre: org.nombre, slug: org.slug, colorMarca: org.colorMarca },
        torneo: {
          nombre: t.nombre,
          slug: t.slug,
          modalidad: t.modalidad,
          formato: t.formato,
          estado: t.estado,
          cupo: t.cupo,
          inscripcion: t.inscripcion,
          inscriptos,
        },
        partidos: partidos.map(({ localId, visitanteId, ...p }) => p),
        tabla: est.tabla,
        grupos: est.grupos,
        llave,
        fases,
        goleadores: est.goleadores.map((g) => ({
          ...g,
          jugadorId: publicos.get(g.jugadorId)?.perfil ? g.jugadorId : null,
          jugador: publicos.get(g.jugadorId)?.nombre ?? '—',
        })),
        suspendidos: activas.map((s) => ({
          jugador: publicos.get(s.jugadorId)?.nombre ?? '—',
          equipo: s.equipo,
          restantes: s.restantes,
        })),
      };
    });
  }

  /** Inscripción desde el link público: crea el equipo, la inscripción y el link de pago. */
  async inscribir(orgSlug: string, torneoSlug: string, d: InscripcionPublicaInput) {
    const org = await this.org(orgSlug);
    const r = await this.db.enOrg(org.id, async (tx) => {
      const t = await tx.torneo.findFirst({ where: { slug: torneoSlug } });
      if (!t) throw noEncontrado('el torneo');
      if (await tx.equipo.findFirst({ where: { nombre: { equals: d.equipo, mode: 'insensitive' } } }))
        throw new ErrorNegocio(
          'Ya hay un equipo con ese nombre en la liga. Si es el tuyo, pedile al organizador que lo inscriba.',
          HttpStatus.CONFLICT,
        );
      const equipo = await tx.equipo.create({
        data: {
          organizacionId: org.id,
          nombre: d.equipo,
          capitanNombre: d.capitanNombre,
          capitanEmail: d.capitanEmail,
          capitanTelefono: d.capitanTelefono,
        },
      });
      const ins = await inscribirEquipo(tx, org.id, t.id, equipo.id);
      await auditar(
        tx,
        { organizacionId: org.id },
        'inscripcion.publica',
        'inscripcion',
        ins.inscripcion.id,
        { despues: { equipo: d.equipo } },
      );
      return ins;
    });
    if (!r.cargo) return { urlPago: null, monto: 0 };
    const pref = await this.cobros.linkDePago(org.id, r.cargo.id);
    return {
      urlPago: pref.urlPago,
      monto: r.cargo.monto,
      comision: comisionPlataforma(r.cargo.monto, org.plan as Plan, 'MERCADO_PAGO'),
    };
  }
}

@Controller('publico')
export class PublicoController {
  constructor(private readonly s: PublicoService) {}

  @Publico()
  @Get(':org')
  organizacion(@Param('org') org: string) {
    return this.s.organizacion(org);
  }

  @Publico()
  @Get(':org/:torneo')
  torneo(@Param('org') org: string, @Param('torneo') torneo: string) {
    return this.s.torneo(org, torneo);
  }

  @Publico()
  @Post(':org/:torneo/inscripcion')
  inscribir(
    @Param('org') org: string,
    @Param('torneo') torneo: string,
    @Body(new Zod(inscripcionPublicaSchema)) d: InscripcionPublicaInput,
  ) {
    return this.s.inscribir(org, torneo, d);
  }
}

/** Resumen del panel del organizador: dinero, próximos partidos y alertas accionables. */
@Controller('panel')
export class PanelController {
  constructor(private readonly db: DbService) {}

  @Get('resumen')
  resumen(@Ctx() c: Contexto) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const ahora = new Date();
      const [torneos, pagos, cargos, proximos, sinCerrar, sanciones, equipos, noPuedo, sinArbitro, fallidos] =
        await enSerie([
          () =>
            tx.torneo.findMany({
              where: { estado: { in: ['INSCRIPCION', 'EN_CURSO'] } },
              select: { id: true, nombre: true, estado: true },
            }),
          () =>
            tx.pago.findMany({
              where: { estado: 'APROBADO' },
              select: { monto: true, comisionPlataforma: true, metodo: true },
            }),
          () =>
            tx.cargo.findMany({
              where: { estado: 'PENDIENTE' },
              include: {
                pagos: { where: { estado: 'APROBADO' } },
                inscripcion: { include: { equipo: true } },
              },
            }),
          () =>
            tx.partido.findMany({
              where: { estado: 'PROGRAMADO', inicio: { gte: ahora } },
              orderBy: { inicio: 'asc' },
              take: 6,
              include: { cancha: true },
            }),
          () =>
            tx.partido.findMany({
              where: {
                estado: { in: ['PROGRAMADO', 'EN_JUEGO'] },
                inicio: { lt: new Date(ahora.getTime() - 2 * 3600_000) },
              },
              select: { id: true },
            }),
          () => tx.sancion.count(),
          () => tx.equipo.findMany({ select: { id: true, nombre: true } }),
          // Capitanes que respondieron "No puedo" a una reprogramación: hay que resolverlo a mano.
          () =>
            tx.mensaje.findMany({
              where: { respuesta: 'NO_PUEDO', contingenciaId: { not: null } },
              select: { contingenciaId: true },
            }),
          () =>
            tx.partido.count({
              where: {
                estado: 'PROGRAMADO',
                arbitroId: null,
                inicio: {
                  gte: ahora,
                  lt: new Date(ahora.getTime() + DATOS.panel.diasProximaFecha * 86_400_000),
                },
              },
            }),
          () =>
            tx.mensaje.count({
              where: {
                estado: 'FALLIDO',
                creadoEn: { gte: new Date(ahora.getTime() - DATOS.panel.mensajesFallidosDias * 86_400_000) },
              },
            }),
        ]);
      const nombre = new Map(equipos.map((e) => [e.id, e.nombre]));
      const deudores = cargos.map((x) => ({
        equipo: x.inscripcion.equipo.nombre,
        torneoId: x.inscripcion.torneoId,
        debe: x.monto - x.pagos.reduce((s, p) => s + p.monto, 0),
      }));
      const cobrado = pagos.reduce((s, p) => s + p.monto, 0);
      const comisiones = pagos.reduce((s, p) => s + p.comisionPlataforma, 0);
      const alertas = [
        ...(sinCerrar.length
          ? [
              {
                tipo: 'ACTA_SIN_CERRAR',
                mensaje: `${sinCerrar.length} partido(s) ya jugados sin acta cerrada.`,
              },
            ]
          : []),
        ...(deudores.length
          ? [{ tipo: 'DEUDA', mensaje: `${deudores.length} equipo(s) con pagos pendientes.` }]
          : []),
        ...(sinArbitro
          ? [
              {
                tipo: 'SIN_ARBITRO',
                mensaje: `${sinArbitro} partido(s) de la semana sin árbitro designado.`,
                href: '/panel/arbitros',
              },
            ]
          : []),
        ...(noPuedo.length
          ? [
              {
                tipo: 'NO_PUEDO',
                mensaje: `${noPuedo.length} equipo(s) respondieron "No puedo" a una reprogramación.`,
                href: `/panel/reprogramaciones/${noPuedo[0]!.contingenciaId}`,
              },
            ]
          : []),
        ...(fallidos
          ? [
              {
                tipo: 'MENSAJES_FALLIDOS',
                mensaje: `${fallidos} mensaje(s) no se pudieron enviar esta semana.`,
                href: '/panel/comunicacion',
              },
            ]
          : []),
      ];
      return {
        torneos,
        dinero: {
          cobrado,
          comisiones,
          neto: cobrado - comisiones,
          pendiente: deudores.reduce((s, d) => s + d.debe, 0),
          online: pagos.filter((p) => p.metodo === 'MERCADO_PAGO').reduce((s, p) => s + p.monto, 0),
        },
        deudores,
        proximos: proximos.map((p) => ({
          id: p.id,
          torneoId: p.torneoId,
          inicio: p.inicio,
          local: nombre.get(p.localId),
          visitante: nombre.get(p.visitanteId),
          cancha: p.cancha?.nombre ?? null,
        })),
        alertas,
        sanciones,
      };
    });
  }
}

@Module({
  imports: [CobrosModule],
  controllers: [PublicoController, PanelController, PaginasPublicasController],
  providers: [PublicoService, PaginasPublicasService],
})
export class PublicoModule {}
