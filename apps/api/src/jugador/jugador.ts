// Cuenta y panel del jugador (E20-01, E20-05, E19-02 del lado del jugador). El jugador solo ve lo suyo: el perfil sale de
// su membresía (Membresia.jugadorId), nunca del pedido, y cualquier partido o documento ajeno responde "no encontrado".
// El panel reusa la cuenta del capitán (resumenDeEquipo) y el perfil público (estadísticas y trayectoria), filtrados a él.
// El capitán invita a un jugador de su plantel desde acá (POST /capitan/plantel/:id/invitar) con el mismo mecanismo de
// invitaciones de usuarios.
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Module,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  avisosDelJugador,
  CONSENTIMIENTO_TERMINOS_JUGADOR,
  confirmarAsistenciaSchema,
  type ConfirmarAsistenciaInput,
  consentimientoVigente,
  documentacionDelJugador,
  DOCUMENTOS_QUE_SUBE_EL_JUGADOR,
  esMenor,
  type EstadoDocumentoJugador,
  estadoDeDocumento,
  invitarJugadorSchema,
  type InvitarJugadorInput,
  jugadorPublico,
  privacidadJugadorSchema,
  type PrivacidadJugadorInput,
  puedeConfirmarAsistencia,
  subirDocumentoSchema,
  type SubirDocumentoInput,
  TIPOS_DOCUMENTO,
  type TipoDocumento,
} from '@potrero/shared';
import { CapitanModule, CapitanService } from '../capitan/capitan.js';
import { auditar } from '../comun/auditoria.js';
import { type Contexto, Ctx, ErrorNegocio, noEncontrado, Permiso, Zod } from '../comun/http.js';
import { DbService, enSerie } from '../db/db.service.js';
import { DocumentacionModule, DocumentacionService } from '../documentacion/documentacion.js';
import { PaginasPublicasService } from '../publico/paginas.js';
import { estadisticasDelTorneo } from '../torneos/torneos.js';
import { UsuariosModule, UsuariosService } from '../usuarios/usuarios.js';

const CAUSA: Record<string, string> = {
  ROJA_DIRECTA: 'Roja directa',
  DOBLE_AMARILLA: 'Doble amarilla',
  ACUMULACION: 'Amarillas acumuladas',
  TRIBUNAL: 'Resolución del tribunal',
};

@Injectable()
export class JugadorService {
  constructor(
    private readonly db: DbService,
    private readonly capitan: CapitanService,
    private readonly documentacion: DocumentacionService,
    private readonly paginas: PaginasPublicasService,
    private readonly usuarios: UsuariosService,
  ) {}

  /** El perfil del jugador, leído de su membresía en cada pedido. */
  private async jugadorDe(c: Contexto) {
    const m = await this.db.app.membresia.findUnique({
      where: { usuarioId_organizacionId: { usuarioId: c.usuarioId, organizacionId: c.organizacionId } },
    });
    if (!m?.jugadorId || m.rol !== 'JUGADOR')
      throw new ErrorNegocio('Tu usuario no está vinculado a un perfil de jugador.', HttpStatus.FORBIDDEN);
    return m.jugadorId;
  }

  async resumen(c: Contexto) {
    const jugadorId = await this.jugadorDe(c);
    const hoy = new Date();
    const base = await this.db.enOrg(c.organizacionId, async (tx) => {
      const [jugador, org, usuario] = await enSerie([
        () =>
          tx.jugador.findUnique({
            where: { id: jugadorId },
            include: {
              plantel: { include: { equipo: { select: { id: true, nombre: true } } } },
              documentos: true,
              consentimientos: true,
            },
          }),
        () =>
          tx.organizacion.findUnique({
            where: { id: c.organizacionId },
            select: { slug: true, nombre: true },
          }),
        () => tx.usuario.findUnique({ where: { id: c.usuarioId }, select: { nombre: true } }),
      ]);
      if (!jugador || !org) throw noEncontrado('tu perfil');
      return { jugador, org, usuario };
    });
    const { jugador } = base;

    // Cada equipo en el que juega: la misma cuenta que ve su capitán, y de ahí solo lo suyo.
    const equipos = [];
    for (const pl of jugador.plantel) {
      const r = await this.capitan.resumenDeEquipo(c, pl.equipoId);
      const yo = r.plantel.find((x) => x.jugadorId === jugadorId);
      equipos.push({
        equipo: r.equipo,
        torneo: r.torneo,
        posicion: r.posicion,
        requeridos: r.documentacion.requeridos,
        numero: yo?.numero ?? null,
        habilitado: yo?.habilitado ?? true,
        motivos: yo?.motivos ?? [],
        proximo: r.proximo
          ? {
              ...r.proximo,
              respuesta: yo?.convocatoria === 'VA' || yo?.convocatoria === 'NO_VA' ? yo.convocatoria : null,
              suspendido: yo?.convocatoria === 'SUSPENDIDO',
              confirmados: r.convocatoria?.va ?? 0,
              convocables: r.convocatoria?.convocables ?? 0,
            }
          : null,
        ultimos: r.ultimos,
        sanciones: r.sanciones
          .filter((s) => s.jugadorId === jugadorId)
          .map((s) => ({
            id: s.id,
            causa: CAUSA[s.causa] ?? s.causa,
            partidos: s.partidos,
            restantes: s.restantes,
            activa: s.activa,
          })),
        deuda: r.deudas,
      });
    }

    // Estadísticas y trayectoria: las del perfil público (si no tiene perfil público, por ser menor, quedan vacías).
    const perfil = await this.paginas.jugador(base.org.slug, jugadorId).catch(() => null);

    // Documentación: lo que le exigen sus torneos y en qué estado está cada cosa.
    const menor = esMenor(jugador.fechaNacimiento, hoy);
    const estados = Object.fromEntries(
      TIPOS_DOCUMENTO.map((t) => [t, estadoDeDocumento(jugador.documentos, t, hoy)]),
    ) as Record<TipoDocumento, EstadoDocumentoJugador>;
    const conTipo = jugador.consentimientos.map((x) => ({ ...x, tipo: x.tipo as 'TUTOR_PARTICIPACION' }));
    if (menor && consentimientoVigente(conTipo, 'TUTOR_PARTICIPACION'))
      estados.AUTORIZACION_MENOR = 'VIGENTE';
    const documentacion = documentacionDelJugador({
      requeridosTorneos: [...new Set(equipos.flatMap((e) => e.requeridos))] as TipoDocumento[],
      menor,
      estados,
    });

    const terminos = jugador.consentimientos
      .filter((x) => x.tipo === CONSENTIMIENTO_TERMINOS_JUGADOR && !x.revocadoEn)
      .sort((a, b) => b.otorgadoEn.getTime() - a.otorgadoEn.getTime())[0];

    const avisos = avisosDelJugador({
      hoy,
      partidos: equipos.flatMap((e) =>
        e.proximo
          ? [
              {
                equipo: e.equipo.nombre,
                rival: e.proximo.rival,
                inicio: e.proximo.inicio,
                cancha: e.proximo.cancha,
                respuesta: e.proximo.respuesta,
                suspendido: e.proximo.suspendido,
              },
            ]
          : [],
      ),
      sanciones: equipos.flatMap((e) =>
        e.sanciones
          .filter((s) => s.activa)
          .map((s) => ({ equipo: e.equipo.nombre, causa: s.causa, restantes: s.restantes })),
      ),
      documentosFaltantes: documentacion.items.filter((i) => i.requerido && !i.ok).map((i) => i.nombre),
      deudaEquipos: equipos.map((e) => ({ equipo: e.equipo.nombre, saldo: e.deuda.total })),
    });

    const vista = (nombrePublico: string) =>
      jugadorPublico({ ...jugador, nombrePublico, consentimientos: conTipo }, hoy).nombre;
    return {
      usuario: base.usuario?.nombre ?? '',
      organizacion: base.org,
      jugador: {
        id: jugador.id,
        nombre: jugador.nombre,
        apellido: jugador.apellido,
        menor,
        perfilPublico: !!perfil,
      },
      equipos: equipos.map(({ requeridos, ...e }) => e),
      estadisticas: perfil
        ? {
            totales: perfil.totales,
            trayectoria: perfil.trayectoria,
            logros: perfil.logros,
            ultimos: perfil.ultimos,
          }
        : null,
      documentacion,
      privacidad: {
        apodo: jugador.apodo,
        nombrePublico: jugador.nombrePublico,
        comoAparece: vista(jugador.nombrePublico),
        opciones: {
          INICIALES: vista('INICIALES'),
          APODO: jugador.apodo ? vista('APODO') : null,
          COMPLETO: vista('COMPLETO'),
        },
      },
      terminos: terminos ? { version: terminos.version, aceptadosEn: terminos.otorgadoEn } : null,
      avisos,
    };
  }

  /** "Voy" / "No voy" al próximo partido de uno de sus equipos (E19-02): es la misma convocatoria que ve el capitán. */
  async confirmar(c: Contexto, partidoId: string, d: ConfirmarAsistenciaInput) {
    const jugadorId = await this.jugadorDe(c);
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const p = await tx.partido.findUnique({ where: { id: partidoId } });
      const pl = p
        ? await tx.plantelJugador.findFirst({
            where: { jugadorId, equipoId: { in: [p.localId, p.visitanteId] } },
          })
        : null;
      if (!p || !pl) throw noEncontrado('el partido');
      const est = await estadisticasDelTorneo(tx, p.torneoId);
      const suspendido = est.sanciones.some((s) => s.jugadorId === jugadorId && s.activa);
      const ok = puedeConfirmarAsistencia({ estadoPartido: p.estado, suspendido, respuesta: d.respuesta });
      if (!ok.ok) throw new ErrorNegocio(ok.motivo, HttpStatus.CONFLICT);
      await tx.convocatoria.upsert({
        where: { partidoId_jugadorId: { partidoId, jugadorId } },
        create: {
          organizacionId: c.organizacionId,
          partidoId,
          equipoId: pl.equipoId,
          jugadorId,
          respuesta: d.respuesta,
        },
        update: { respuesta: d.respuesta, respondidoEn: new Date() },
      });
      return { ok: true, respuesta: d.respuesta };
    });
  }

  /** El jugador sube su DNI o su apto físico (la autorización del menor la firma el tutor por su link). */
  async subir(c: Contexto, d: SubirDocumentoInput) {
    const jugadorId = await this.jugadorDe(c);
    if (!DOCUMENTOS_QUE_SUBE_EL_JUGADOR.includes(d.tipo))
      throw new ErrorNegocio('Ese documento lo carga la liga o lo firma tu tutor.', HttpStatus.FORBIDDEN);
    return this.documentacion.subir(c, jugadorId, d);
  }

  /** Cómo aparece su nombre en el sitio público (E20-04), elegido por él mismo. */
  privacidad(c: Contexto, d: PrivacidadJugadorInput) {
    return this.jugadorDe(c).then((jugadorId) =>
      this.db.enOrg(c.organizacionId, async (tx) => {
        const antes = await tx.jugador.findUnique({
          where: { id: jugadorId },
          select: { apodo: true, nombrePublico: true },
        });
        if (!antes) throw noEncontrado('tu perfil');
        const apodo = d.apodo === undefined ? antes.apodo : d.apodo || null;
        if (d.nombrePublico === 'APODO' && !apodo) throw new ErrorNegocio('Escribí tu apodo para usarlo.');
        const despues = await tx.jugador.update({
          where: { id: jugadorId },
          data: { apodo, nombrePublico: d.nombrePublico },
          select: { apodo: true, nombrePublico: true },
        });
        await auditar(tx, c, 'jugador.privacidad.propia', 'jugador', jugadorId, { antes, despues });
        return despues;
      }),
    );
  }

  /** El capitán invita a un jugador de su plantel a tener cuenta (E20-01). Devuelve el link para mandarlo. */
  async invitarDesdeCapitan(c: Contexto, jugadorId: string, d: InvitarJugadorInput) {
    const m = await this.db.app.membresia.findUnique({
      where: { usuarioId_organizacionId: { usuarioId: c.usuarioId, organizacionId: c.organizacionId } },
    });
    if (!m?.equipoId || m.rol !== 'CAPITAN')
      throw new ErrorNegocio('Tu usuario no es capitán de ningún equipo.', HttpStatus.FORBIDDEN);
    const equipoId = m.equipoId;
    const pl = await this.db.enOrg(c.organizacionId, (tx) =>
      tx.plantelJugador.findUnique({
        where: { equipoId_jugadorId: { equipoId, jugadorId } },
        include: {
          jugador: { select: { nombre: true, apellido: true } },
          equipo: { select: { nombre: true } },
        },
      }),
    );
    if (!pl) throw noEncontrado('el jugador en tu plantel');
    const nombre = `${pl.jugador.nombre} ${pl.jugador.apellido}`;
    const inv = await this.usuarios.invitarJugador(c, { equipoId, jugadorId, email: d.email, nombre });
    return {
      ...inv,
      texto: `¡Hola ${pl.jugador.nombre}! Te sumé a ${pl.equipo.nombre} en la app de la liga: confirmás si vas a los partidos y ves tus goles y sanciones. Creá tu cuenta acá: ${inv.link}`,
    };
  }
}

@Controller()
export class JugadorController {
  constructor(private readonly s: JugadorService) {}

  @Get('jugador')
  @Permiso('jugador.cuenta')
  resumen(@Ctx() c: Contexto) {
    return this.s.resumen(c);
  }

  @Post('jugador/partidos/:id/asistencia')
  @Permiso('jugador.cuenta')
  @HttpCode(200)
  confirmar(
    @Ctx() c: Contexto,
    @Param('id') id: string,
    @Body(new Zod(confirmarAsistenciaSchema)) d: ConfirmarAsistenciaInput,
  ) {
    return this.s.confirmar(c, id, d);
  }

  @Post('jugador/documentos')
  @Permiso('jugador.cuenta')
  subir(@Ctx() c: Contexto, @Body(new Zod(subirDocumentoSchema)) d: SubirDocumentoInput) {
    return this.s.subir(c, d);
  }

  @Patch('jugador/privacidad')
  @Permiso('jugador.cuenta')
  privacidad(@Ctx() c: Contexto, @Body(new Zod(privacidadJugadorSchema)) d: PrivacidadJugadorInput) {
    return this.s.privacidad(c, d);
  }

  @Post('capitan/plantel/:jugadorId/invitar')
  @Permiso('capitan.equipo')
  invitar(
    @Ctx() c: Contexto,
    @Param('jugadorId') jugadorId: string,
    @Body(new Zod(invitarJugadorSchema)) d: InvitarJugadorInput,
  ) {
    return this.s.invitarDesdeCapitan(c, jugadorId, d);
  }
}

@Module({
  imports: [CapitanModule, DocumentacionModule, UsuariosModule],
  controllers: [JugadorController],
  providers: [JugadorService, PaginasPublicasService],
})
export class JugadorModule {}
