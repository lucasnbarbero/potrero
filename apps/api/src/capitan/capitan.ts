// Panel del capitán (E19): su equipo y nada más. Próximo partido con convocatoria (E19-02), tabla, plantel con altas y
// bajas (E19-01), documentación que falta y de quién (E19-04), sanciones y descargos en el expediente del tribunal
// (E19-05) y deudas del equipo, solo para ver. El equipo sale de la membresía (Membresia.equipoId), nunca del pedido:
// cualquier id de otro equipo responde "no encontrado".
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
  Query,
} from '@nestjs/common';
import {
  altaJugadorCapitanSchema,
  type AltaJugadorCapitanInput,
  descargoExpedienteSchema,
  type DescargoExpedienteInput,
  dniValido,
  faltantesDelEquipo,
  NOMBRE_TIPO_EXPEDIENTE,
  puedeDarDeBaja,
  respuestaConvocatoriaSchema,
  type RespuestaConvocatoriaInput,
  resumenConvocatoria,
  textoPedidoDeFaltantes,
  type TipoDocumento,
  type TipoExpediente,
} from '@potrero/shared';
import { auditar } from '../comun/auditoria.js';
import { type Contexto, Ctx, ErrorNegocio, noEncontrado, Permiso, Zod } from '../comun/http.js';
import { DbService, enSerie } from '../db/db.service.js';
import { DocumentacionModule, DocumentacionService } from '../documentacion/documentacion.js';
import { estadisticasDelTorneo, partidosDelTorneo } from '../torneos/torneos.js';
import { TribunalModule, TribunalService } from '../tribunal/tribunal.js';

const ORDEN_ESTADO_TORNEO: Record<string, number> = {
  EN_CURSO: 0,
  INSCRIPCION: 1,
  FINALIZADO: 2,
  BORRADOR: 3,
};

@Injectable()
export class CapitanService {
  constructor(
    private readonly db: DbService,
    private readonly documentacion: DocumentacionService,
    private readonly tribunal: TribunalService,
  ) {}

  /** El equipo del capitán, leído de su membresía en cada pedido (si le quitan el acceso, deja de ver al instante). */
  private async equipoDe(c: Contexto) {
    const m = await this.db.app.membresia.findUnique({
      where: { usuarioId_organizacionId: { usuarioId: c.usuarioId, organizacionId: c.organizacionId } },
    });
    if (!m?.equipoId || m.rol !== 'CAPITAN')
      throw new ErrorNegocio('Tu usuario no es capitán de ningún equipo.', HttpStatus.FORBIDDEN);
    return m.equipoId;
  }

  async resumen(c: Contexto, torneoId?: string) {
    const equipoId = await this.equipoDe(c);
    const base = await this.db.enOrg(c.organizacionId, async (tx) => {
      const [equipo, usuario] = await enSerie([
        () =>
          tx.equipo.findUnique({
            where: { id: equipoId },
            include: {
              plantel: { include: { jugador: true }, orderBy: [{ numero: 'asc' }] },
              inscripciones: { where: { estado: { not: 'BAJA' } }, include: { torneo: true } },
            },
          }),
        () => tx.usuario.findUnique({ where: { id: c.usuarioId }, select: { nombre: true } }),
      ]);
      if (!equipo) throw noEncontrado('tu equipo');
      // Torneo que se muestra (si no se eligió uno): el que está en juego y donde el equipo tiene un partido por jugar,
      // primero los de tabla (liga, grupos) antes que una copa; si no, el de inscripción abierta; si no, el último.
      const conPartido = new Set(
        (
          await tx.partido.findMany({
            where: { estado: 'PROGRAMADO', OR: [{ localId: equipoId }, { visitanteId: equipoId }] },
            select: { torneoId: true },
          })
        ).map((x) => x.torneoId),
      );
      const torneos = [...equipo.inscripciones]
        .map((i) => i.torneo)
        .sort(
          (a, b) =>
            (ORDEN_ESTADO_TORNEO[a.estado] ?? 9) - (ORDEN_ESTADO_TORNEO[b.estado] ?? 9) ||
            Number(conPartido.has(b.id)) - Number(conPartido.has(a.id)) ||
            Number(a.formato === 'COPA') - Number(b.formato === 'COPA') ||
            a.creadoEn.getTime() - b.creadoEn.getTime(),
        );
      const torneo = torneos.find((t) => t.id === torneoId) ?? torneos[0] ?? null;
      const jugadorIds = equipo.plantel.map((p) => p.jugadorId);
      const [est, partidos, expedientes, cargos, eventos] = await enSerie([
        () => (torneo ? estadisticasDelTorneo(tx, torneo.id) : Promise.resolve(null)),
        () => (torneo ? partidosDelTorneo(tx, torneo.id) : Promise.resolve([])),
        () => tx.expediente.findMany({ where: { equipoId }, orderBy: { creadoEn: 'desc' } }),
        () =>
          tx.cargo.findMany({
            where: { inscripcion: { equipoId }, estado: { not: 'ANULADO' } },
            include: { pagos: { where: { estado: 'APROBADO' } }, inscripcion: { include: { torneo: true } } },
            orderBy: [{ vence: 'asc' }, { creadoEn: 'asc' }],
          }),
        () =>
          tx.eventoPartido.findMany({
            where: {
              jugadorId: { in: jugadorIds },
              tipo: { in: ['GOL', 'AMARILLA', 'ROJA'] },
              partido: { torneo: { estado: 'EN_CURSO' } },
            },
            select: { jugadorId: true },
          }),
      ]);
      const delEquipo = (p: { localId: string; visitanteId: string }) =>
        p.localId === equipoId || p.visitanteId === equipoId;
      const proximo = partidos.find((p) => delEquipo(p) && p.estado === 'PROGRAMADO') ?? null;
      const respuestas = proximo
        ? await tx.convocatoria.findMany({ where: { partidoId: proximo.id, equipoId } })
        : [];
      const jugadoresExp = await tx.jugador.findMany({
        where: { id: { in: expedientes.flatMap((e) => (e.jugadorId ? [e.jugadorId] : [])) } },
        select: { id: true, nombre: true, apellido: true },
      });
      return {
        equipo,
        usuario,
        torneos,
        torneo,
        est,
        partidos,
        proximo,
        respuestas,
        expedientes,
        cargos,
        eventos,
        jugadoresExp,
      };
    });
    const { equipo, torneo, est, partidos, proximo } = base;

    // Documentación y habilitación: la misma cuenta que ve el organizador, filtrada a este equipo.
    const doc = torneo ? await this.documentacion.panel(c, torneo.id) : null;
    const filas =
      (doc?.torneo?.id === torneo?.id ? doc?.filas : [])?.filter((f) => f.equipoId === equipoId) ?? [];
    const filaDe = new Map(filas.map((f) => [f.jugadorId, f]));
    const requeridos = (doc?.torneo?.requeridos ?? []) as TipoDocumento[];
    const faltantes = faltantesDelEquipo(filas, requeridos);

    const sanciones = (est?.sanciones ?? []).filter((s) => s.equipoId === equipoId);
    const suspendidos = new Map(sanciones.filter((s) => s.activa).map((s) => [s.jugadorId, s.restantes]));
    const goles = new Map(
      (est?.goleadores ?? []).filter((g) => g.equipoId === equipoId).map((g) => [g.jugadorId, g.goles]),
    );
    const eventosPorJugador = new Map<string, number>();
    for (const e of base.eventos)
      eventosPorJugador.set(e.jugadorId!, (eventosPorJugador.get(e.jugadorId!) ?? 0) + 1);
    const respuesta = new Map(base.respuestas.map((r) => [r.jugadorId, r.respuesta as 'VA' | 'NO_VA']));
    const convocatoria = proximo
      ? resumenConvocatoria(
          equipo.plantel.map((p) => ({
            jugadorId: p.jugadorId,
            suspendido: suspendidos.has(p.jugadorId),
            respuesta: respuesta.get(p.jugadorId) ?? null,
          })),
        )
      : null;
    const estadoConvocado = new Map(convocatoria?.jugadores.map((j) => [j.jugadorId, j.estado]) ?? []);

    // Tabla: la del grupo del equipo si el torneo tiene grupos; si no, la general.
    const grupo = est?.grupos.find((g) => g.tabla.some((f) => f.equipoId === equipoId));
    const tabla = grupo?.tabla ?? est?.tabla ?? [];
    const fila = tabla.find((f) => f.equipoId === equipoId) ?? null;
    const nombreJugador = new Map(base.jugadoresExp.map((j) => [j.id, `${j.nombre} ${j.apellido}`]));
    const pagado = (x: { pagos: { monto: number }[] }) => x.pagos.reduce((a, p) => a + p.monto, 0);
    const deudas = base.cargos
      .filter((x) => x.estado === 'PENDIENTE')
      .map((x) => ({
        id: x.id,
        concepto: x.concepto,
        torneo: x.inscripcion.torneo.nombre,
        monto: x.monto,
        saldo: Math.max(0, x.monto - pagado(x)),
        vence: x.vence,
        categoria: x.categoria,
      }));

    return {
      capitan: base.usuario?.nombre ?? '',
      equipo: { id: equipo.id, nombre: equipo.nombre, color: equipo.color },
      torneo: torneo ? { id: torneo.id, nombre: torneo.nombre, estado: torneo.estado } : null,
      torneos: base.torneos.map((t) => ({ id: t.id, nombre: t.nombre, estado: t.estado })),
      posicion: fila ? { posicion: fila.posicion, pts: fila.pts, grupo: grupo?.grupo ?? null } : null,
      tabla: tabla.map((f) => ({
        posicion: f.posicion,
        equipo: f.equipo,
        propio: f.equipoId === equipoId,
        pj: f.pj,
        dg: f.dg,
        pts: f.pts,
      })),
      proximo: proximo
        ? {
            id: proximo.id,
            fecha: proximo.fecha,
            inicio: proximo.inicio,
            cancha: proximo.cancha,
            local: proximo.localId === equipoId,
            rival: proximo.localId === equipoId ? proximo.visitante : proximo.local,
          }
        : null,
      ultimos: partidos
        .filter(
          (p) =>
            (p.localId === equipoId || p.visitanteId === equipoId) &&
            (p.estado === 'FINALIZADO' || p.estado === 'WO'),
        )
        .slice(-3)
        .reverse()
        .map((p) => {
          const local = p.localId === equipoId;
          const gf = (local ? p.golesLocal : p.golesVisitante) ?? 0;
          const gc = (local ? p.golesVisitante : p.golesLocal) ?? 0;
          return {
            id: p.id,
            fecha: p.fecha,
            rival: local ? p.visitante : p.local,
            gf,
            gc,
            resultado: p.ganadorWOId
              ? p.ganadorWOId === equipoId
                ? 'G'
                : 'P'
              : gf > gc
                ? 'G'
                : gf < gc
                  ? 'P'
                  : 'E',
          };
        }),
      convocatoria: convocatoria && {
        va: convocatoria.va,
        noVa: convocatoria.noVa,
        pendientes: convocatoria.pendientes,
        suspendidos: convocatoria.suspendidos,
        convocables: convocatoria.convocables,
      },
      plantel: equipo.plantel.map((p) => {
        const f = filaDe.get(p.jugadorId);
        const eventosEnCurso = eventosPorJugador.get(p.jugadorId) ?? 0;
        return {
          jugadorId: p.jugadorId,
          nombre: `${p.jugador.nombre} ${p.jugador.apellido}`,
          numero: p.numero,
          goles: goles.get(p.jugadorId) ?? 0,
          habilitado: f ? f.habilitado : !suspendidos.has(p.jugadorId),
          motivos: f?.motivos ?? (suspendidos.has(p.jugadorId) ? ['Suspendido'] : []),
          suspendidoPor: suspendidos.get(p.jugadorId) ?? 0,
          convocatoria: estadoConvocado.get(p.jugadorId) ?? null,
          baja: puedeDarDeBaja({ eventosEnTorneoEnCurso: eventosEnCurso }),
        };
      }),
      documentacion: {
        requeridos,
        habilitados: filas.filter((f) => f.habilitado).length,
        total: filas.length,
        faltantes,
        textoWhatsapp: textoPedidoDeFaltantes(equipo.nombre, faltantes),
      },
      sanciones: sanciones.map((s) => ({
        id: s.id,
        jugador: s.jugador,
        causa: s.causa,
        partidos: s.partidos,
        restantes: s.restantes,
        activa: s.activa,
      })),
      expedientes: base.expedientes.map((e) => ({
        id: e.id,
        tipo: e.tipo,
        tipoNombre: NOMBRE_TIPO_EXPEDIENTE[e.tipo as TipoExpediente],
        motivo: e.motivo,
        jugador: e.jugadorId ? (nombreJugador.get(e.jugadorId) ?? '—') : null,
        informeArbitro: e.informeArbitro,
        descargo: e.descargo,
        descargoEn: e.descargoEn,
        estado: e.estado,
        sugeridos: e.sugeridos,
        partidosResueltos: e.partidosResueltos,
        multa: e.multa,
        veredicto: e.veredicto,
        resolucion: e.resolucion,
        creadoEn: e.creadoEn,
      })),
      deudas: { total: deudas.reduce((a, d) => a + d.saldo, 0), cargos: deudas },
    };
  }

  /** Alta de un jugador al plantel. Con DNI, pasa por la misma carga cifrada y detección de duplicados del organizador. */
  async alta(c: Contexto, d: AltaJugadorCapitanInput) {
    const equipoId = await this.equipoDe(c);
    if (d.dni && !dniValido(d.dni)) throw new ErrorNegocio('El DNI son 7 u 8 números.');
    const pl = await this.db.enOrg(c.organizacionId, async (tx) => {
      if (d.numero != null && (await tx.plantelJugador.findFirst({ where: { equipoId, numero: d.numero } })))
        throw new ErrorNegocio(
          `El número ${d.numero} ya lo usa otro jugador del equipo.`,
          HttpStatus.CONFLICT,
        );
      const jugador = await tx.jugador.create({
        data: {
          organizacionId: c.organizacionId,
          nombre: d.nombre,
          apellido: d.apellido,
          ...(d.fechaNacimiento && !d.dni
            ? { fechaNacimiento: new Date(`${d.fechaNacimiento}T00:00:00Z`) }
            : {}),
        },
      });
      const creado = await tx.plantelJugador.create({
        data: { organizacionId: c.organizacionId, equipoId, jugadorId: jugador.id, numero: d.numero ?? null },
      });
      await auditar(tx, c, 'capitan.plantel.alta', 'jugador', jugador.id, { despues: { equipoId } });
      return creado;
    });
    const identidad = d.dni
      ? await this.documentacion.identidad(c, pl.jugadorId, {
          dni: d.dni,
          ...(d.fechaNacimiento ? { fechaNacimiento: d.fechaNacimiento } : {}),
        })
      : null;
    return { jugadorId: pl.jugadorId, duplicados: identidad?.duplicados ?? 0 };
  }

  async baja(c: Contexto, jugadorId: string) {
    const equipoId = await this.equipoDe(c);
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const pl = await tx.plantelJugador.findUnique({
        where: { equipoId_jugadorId: { equipoId, jugadorId } },
      });
      if (!pl) throw noEncontrado('el jugador en tu plantel');
      const eventos = await tx.eventoPartido.count({
        where: {
          jugadorId,
          tipo: { in: ['GOL', 'AMARILLA', 'ROJA'] },
          partido: { torneo: { estado: 'EN_CURSO' } },
        },
      });
      const ok = puedeDarDeBaja({ eventosEnTorneoEnCurso: eventos });
      if (!ok.ok) throw new ErrorNegocio(ok.motivo, HttpStatus.CONFLICT);
      await tx.plantelJugador.delete({ where: { id: pl.id } });
      await tx.convocatoria.deleteMany({ where: { equipoId, jugadorId } });
      await auditar(tx, c, 'capitan.plantel.baja', 'jugador', jugadorId, { antes: { equipoId } });
      return { ok: true };
    });
  }

  /** Respuesta de un jugador a la convocatoria del próximo partido. PENDIENTE borra la respuesta. */
  async convocar(c: Contexto, partidoId: string, d: RespuestaConvocatoriaInput) {
    const equipoId = await this.equipoDe(c);
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const p = await tx.partido.findUnique({ where: { id: partidoId } });
      if (!p || (p.localId !== equipoId && p.visitanteId !== equipoId)) throw noEncontrado('el partido');
      if (p.estado !== 'PROGRAMADO')
        throw new ErrorNegocio(
          'La convocatoria se arma antes de que empiece el partido.',
          HttpStatus.CONFLICT,
        );
      if (
        !(await tx.plantelJugador.findUnique({
          where: { equipoId_jugadorId: { equipoId, jugadorId: d.jugadorId } },
        }))
      )
        throw noEncontrado('el jugador en tu plantel');
      if (d.respuesta === 'PENDIENTE') {
        await tx.convocatoria.deleteMany({ where: { partidoId, jugadorId: d.jugadorId } });
        return { ok: true };
      }
      await tx.convocatoria.upsert({
        where: { partidoId_jugadorId: { partidoId, jugadorId: d.jugadorId } },
        create: {
          organizacionId: c.organizacionId,
          partidoId,
          equipoId,
          jugadorId: d.jugadorId,
          respuesta: d.respuesta,
        },
        update: { respuesta: d.respuesta, respondidoEn: new Date() },
      });
      return { ok: true };
    });
  }

  /** Descargo del capitán en un expediente de su equipo: queda en el mismo expediente que resuelve el tribunal. */
  async descargo(c: Contexto, expedienteId: string, d: DescargoExpedienteInput) {
    const equipoId = await this.equipoDe(c);
    const e = await this.db.enOrg(c.organizacionId, (tx) =>
      tx.expediente.findUnique({ where: { id: expedienteId }, select: { equipoId: true } }),
    );
    if (!e || e.equipoId !== equipoId) throw noEncontrado('el expediente');
    return this.tribunal.descargo(c, expedienteId, d);
  }
}

@Controller('capitan')
export class CapitanController {
  constructor(private readonly s: CapitanService) {}

  @Get()
  @Permiso('capitan.equipo')
  resumen(@Ctx() c: Contexto, @Query('torneoId') torneoId?: string) {
    return this.s.resumen(c, torneoId);
  }

  @Post('plantel')
  @Permiso('capitan.equipo')
  alta(@Ctx() c: Contexto, @Body(new Zod(altaJugadorCapitanSchema)) d: AltaJugadorCapitanInput) {
    return this.s.alta(c, d);
  }

  @Post('plantel/:jugadorId/baja')
  @Permiso('capitan.equipo')
  @HttpCode(200)
  baja(@Ctx() c: Contexto, @Param('jugadorId') jugadorId: string) {
    return this.s.baja(c, jugadorId);
  }

  @Post('partidos/:id/convocatoria')
  @Permiso('capitan.equipo')
  @HttpCode(200)
  convocar(
    @Ctx() c: Contexto,
    @Param('id') id: string,
    @Body(new Zod(respuestaConvocatoriaSchema)) d: RespuestaConvocatoriaInput,
  ) {
    return this.s.convocar(c, id, d);
  }

  @Post('expedientes/:id/descargo')
  @Permiso('capitan.equipo')
  @HttpCode(200)
  descargo(
    @Ctx() c: Contexto,
    @Param('id') id: string,
    @Body(new Zod(descargoExpedienteSchema)) d: DescargoExpedienteInput,
  ) {
    return this.s.descargo(c, id, d);
  }
}

@Module({
  imports: [DocumentacionModule, TribunalModule],
  controllers: [CapitanController],
  providers: [CapitanService],
})
export class CapitanModule {}
