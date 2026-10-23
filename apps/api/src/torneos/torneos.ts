import { Body, Controller, Get, HttpStatus, Injectable, Module, Param, Patch, Post } from '@nestjs/common';
import {
  cantidadDePartidos,
  crearTorneoSchema,
  type CrearTorneoInput,
  estadoSancion,
  generarFixtureSchema,
  type GenerarFixtureInput,
  goleadores,
  programar,
  REGLAMENTO_POR_DEFECTO,
  tablaDePosiciones,
  tarjetasPorEquipo,
  todosContraTodos,
  type Desempate,
  type Reglamento,
} from '@potrero/shared';
import { z } from 'zod';
import { auditar } from '../comun/auditoria.js';
import { type Contexto, Ctx, ErrorNegocio, noEncontrado, Permiso, Zod } from '../comun/http.js';
import { slugUnico } from '../comun/slug.js';
import { DbService, enSerie, type Tx } from '../db/db.service.js';
import type { Reglamento as ReglamentoDb } from '../generated/prisma/client.js';

export const aReglamento = (r: ReglamentoDb): Reglamento => ({
  ...r,
  desempates: r.desempates as Desempate[],
});

/** Partidos de un torneo con nombres de equipos y cancha. */
export async function partidosDelTorneo(tx: Tx, torneoId: string) {
  const [partidos, equipos] = await enSerie([
    () =>
      tx.partido.findMany({
        where: { torneoId },
        orderBy: [{ fecha: 'asc' }, { inicio: 'asc' }],
        include: { cancha: { include: { sede: true } } },
      }),
    () => equiposDelTorneo(tx, torneoId),
  ]);
  const nombre = new Map(equipos.map((e) => [e.id, e.nombre]));
  return partidos.map((p) => ({
    id: p.id,
    fecha: p.fecha,
    inicio: p.inicio,
    estado: p.estado,
    localId: p.localId,
    visitanteId: p.visitanteId,
    local: nombre.get(p.localId) ?? '—',
    visitante: nombre.get(p.visitanteId) ?? '—',
    golesLocal: p.golesLocal,
    golesVisitante: p.golesVisitante,
    ganadorWOId: p.ganadorWOId,
    cancha: p.cancha ? `${p.cancha.sede.nombre} · ${p.cancha.nombre}` : null,
  }));
}

/** Equipos con inscripción confirmada (los que juegan). */
export async function equiposDelTorneo(tx: Tx, torneoId: string, soloConfirmados = false) {
  const inscripciones = await tx.inscripcion.findMany({
    where: { torneoId, estado: soloConfirmados ? 'CONFIRMADA' : { not: 'BAJA' } },
    include: { equipo: true },
    orderBy: { creadoEn: 'asc' },
  });
  return inscripciones.map((i) => ({
    id: i.equipo.id,
    nombre: i.equipo.nombre,
    color: i.equipo.color,
    inscripcion: i.estado,
  }));
}

/** Tabla, goleadores y sanciones: todo derivado de los partidos cerrados (nunca se edita a mano). */
export async function estadisticasDelTorneo(tx: Tx, torneoId: string) {
  const torneo = await tx.torneo.findUnique({ where: { id: torneoId }, include: { reglamento: true } });
  if (!torneo) throw noEncontrado('el torneo');
  const [equipos, partidos, sanciones] = await enSerie([
    () => equiposDelTorneo(tx, torneoId, true),
    () => tx.partido.findMany({ where: { torneoId }, include: { eventos: true } }),
    () => tx.sancion.findMany({ where: { torneoId }, orderBy: { creadoEn: 'desc' } }),
  ]);
  const cerrados = partidos.filter((p) => p.estado === 'FINALIZADO' || p.estado === 'WO');
  const tabla = tablaDePosiciones(
    equipos.map((e) => e.id),
    cerrados.map((p) => ({
      id: p.id,
      localId: p.localId,
      visitanteId: p.visitanteId,
      golesLocal: p.golesLocal ?? 0,
      golesVisitante: p.golesVisitante ?? 0,
      ganadorWO: p.ganadorWOId,
      tarjetas: tarjetasPorEquipo(p.eventos),
    })),
    aReglamento(torneo.reglamento),
  );
  // Los goles de un W.O. no suman estadísticas individuales: solo cuentan los partidos jugados.
  const goles = goleadores(cerrados.filter((p) => p.estado === 'FINALIZADO').flatMap((p) => p.eventos));
  const jugadorIds = [...new Set([...goles.map((g) => g.jugadorId), ...sanciones.map((s) => s.jugadorId)])];
  const jugadores = await tx.jugador.findMany({ where: { id: { in: jugadorIds } } });
  const nombreJugador = new Map(jugadores.map((j) => [j.id, `${j.nombre} ${j.apellido}`]));
  const nombreEquipo = new Map(equipos.map((e) => [e.id, e.nombre]));
  const fechaDe = new Map(partidos.map((p) => [p.id, p.fecha]));
  return {
    tabla: tabla.map((f) => ({ ...f, equipo: nombreEquipo.get(f.equipoId) ?? '—' })),
    goleadores: goles.map((g) => ({
      ...g,
      jugador: nombreJugador.get(g.jugadorId) ?? '—',
      equipo: nombreEquipo.get(g.equipoId) ?? '—',
    })),
    sanciones: sanciones.map((s) => {
      const origen = fechaDe.get(s.partidoOrigenId) ?? 0;
      // Cuenta partidos oficiales del equipo jugados después del partido de origen (W.O. y suspendidos no descuentan).
      const jugadosDespues = partidos.filter(
        (p) =>
          p.estado === 'FINALIZADO' &&
          p.fecha > origen &&
          (p.localId === s.equipoId || p.visitanteId === s.equipoId),
      ).length;
      return {
        ...s,
        jugador: nombreJugador.get(s.jugadorId) ?? '—',
        equipo: nombreEquipo.get(s.equipoId) ?? '—',
        ...estadoSancion(s.partidos, jugadosDespues),
      };
    }),
  };
}

@Injectable()
export class TorneosService {
  constructor(private readonly db: DbService) {}

  listar(c: Contexto) {
    return this.db.enOrg(c.organizacionId, (tx) =>
      tx.torneo.findMany({
        orderBy: { creadoEn: 'desc' },
        include: { _count: { select: { inscripciones: true, partidos: true } } },
      }),
    );
  }

  crear(c: Contexto, d: CrearTorneoInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const slug = await slugUnico(
        d.nombre,
        async (s) => !!(await tx.torneo.findFirst({ where: { slug: s } })),
      );
      const r = REGLAMENTO_POR_DEFECTO;
      const reglamento = await tx.reglamento.create({
        data: {
          organizacionId: c.organizacionId,
          nombre: `Reglamento ${d.nombre}`,
          ...r,
          desempates: [...r.desempates],
          puntosVictoria: d.puntosVictoria,
          puntosEmpate: d.puntosEmpate,
          umbralAmarillas: d.umbralAmarillas,
        },
      });
      const torneo = await tx.torneo.create({
        data: {
          organizacionId: c.organizacionId,
          nombre: d.nombre,
          slug,
          modalidad: d.modalidad,
          formato: d.formato,
          idaYVuelta: d.idaYVuelta,
          cupo: d.cupo,
          inscripcion: d.inscripcion,
          reglamentoId: reglamento.id,
          estado: 'INSCRIPCION',
        },
      });
      await auditar(tx, c, 'torneo.crear', 'torneo', torneo.id, { despues: torneo });
      return torneo;
    });
  }

  detalle(c: Contexto, id: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const torneo = await tx.torneo.findUnique({ where: { id }, include: { reglamento: true } });
      if (!torneo) throw noEncontrado('el torneo');
      const organizacion = await tx.organizacion.findUniqueOrThrow({
        where: { id: c.organizacionId },
        select: { slug: true },
      });
      return {
        ...torneo,
        organizacionSlug: organizacion.slug,
        partidosEstimados: cantidadDePartidos(torneo.cupo, torneo.formato, torneo.idaYVuelta),
      };
    });
  }

  cambiarEstado(c: Contexto, id: string, estado: 'INSCRIPCION' | 'EN_CURSO' | 'FINALIZADO') {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const antes = await tx.torneo.findUnique({ where: { id } });
      if (!antes) throw noEncontrado('el torneo');
      const despues = await tx.torneo.update({ where: { id }, data: { estado } });
      await auditar(tx, c, 'torneo.estado', 'torneo', id, {
        antes: { estado: antes.estado },
        despues: { estado },
      });
      return despues;
    });
  }

  /**
   * Genera el fixture de la fase de liga con los equipos confirmados.
   * Rehace el fixture solo si todavía no se jugó ningún partido.
   */
  generarFixture(c: Contexto, id: string, d: GenerarFixtureInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const torneo = await tx.torneo.findUnique({ where: { id } });
      if (!torneo) throw noEncontrado('el torneo');
      if (torneo.formato === 'COPA' || torneo.formato === 'GRUPOS_PLAYOFFS')
        throw new ErrorNegocio(
          'Por ahora el fixture automático arma la fase de liga. Copa y grupos llegan con las llaves (backlog E10).',
        );
      const jugados = await tx.partido.count({
        where: { torneoId: id, estado: { in: ['EN_JUEGO', 'FINALIZADO', 'WO'] } },
      });
      if (jugados > 0)
        throw new ErrorNegocio(
          'El torneo ya tiene partidos jugados: no se puede rehacer el fixture.',
          HttpStatus.CONFLICT,
        );
      const canchas = await tx.cancha.count({ where: { id: { in: d.canchaIds } } });
      if (canchas !== d.canchaIds.length) throw noEncontrado('alguna de las canchas');
      const equipos = await equiposDelTorneo(tx, id, true);
      if (equipos.length < 2)
        throw new ErrorNegocio('Se necesitan al menos 2 equipos con la inscripción confirmada.');
      let programados;
      try {
        programados = programar(
          todosContraTodos(
            equipos.map((e) => e.id),
            torneo.idaYVuelta,
          ),
          d,
        );
      } catch (e) {
        throw new ErrorNegocio((e as Error).message);
      }
      await tx.partido.deleteMany({ where: { torneoId: id } });
      await tx.partido.createMany({
        data: programados.map((p) => ({
          organizacionId: c.organizacionId,
          torneoId: id,
          fecha: p.fecha,
          localId: p.localId,
          visitanteId: p.visitanteId,
          canchaId: p.canchaId,
          inicio: new Date(p.inicio),
        })),
      });
      await tx.torneo.update({ where: { id }, data: { estado: 'EN_CURSO' } });
      await auditar(tx, c, 'fixture.generar', 'torneo', id, {
        despues: { partidos: programados.length, ...d },
      });
      return { partidos: programados.length, fechas: Math.max(...programados.map((p) => p.fecha)) };
    });
  }

  partidos(c: Contexto, id: string) {
    return this.db.enOrg(c.organizacionId, (tx) => partidosDelTorneo(tx, id));
  }

  estadisticas(c: Contexto, id: string) {
    return this.db.enOrg(c.organizacionId, (tx) => estadisticasDelTorneo(tx, id));
  }
}

const estadoSchema = z.object({ estado: z.enum(['INSCRIPCION', 'EN_CURSO', 'FINALIZADO']) });

@Controller('torneos')
export class TorneosController {
  constructor(private readonly s: TorneosService) {}

  @Get()
  @Permiso('torneo.leer')
  listar(@Ctx() c: Contexto) {
    return this.s.listar(c);
  }

  @Post()
  @Permiso('torneo.escribir')
  crear(@Ctx() c: Contexto, @Body(new Zod(crearTorneoSchema)) d: CrearTorneoInput) {
    return this.s.crear(c, d);
  }

  @Get(':id')
  @Permiso('torneo.leer')
  detalle(@Ctx() c: Contexto, @Param('id') id: string) {
    return this.s.detalle(c, id);
  }

  @Patch(':id/estado')
  @Permiso('torneo.escribir')
  estado(
    @Ctx() c: Contexto,
    @Param('id') id: string,
    @Body(new Zod(estadoSchema)) d: z.infer<typeof estadoSchema>,
  ) {
    return this.s.cambiarEstado(c, id, d.estado);
  }

  @Post(':id/fixture')
  @Permiso('fixture.escribir')
  fixture(
    @Ctx() c: Contexto,
    @Param('id') id: string,
    @Body(new Zod(generarFixtureSchema)) d: GenerarFixtureInput,
  ) {
    return this.s.generarFixture(c, id, d);
  }

  @Get(':id/partidos')
  @Permiso('torneo.leer')
  partidos(@Ctx() c: Contexto, @Param('id') id: string) {
    return this.s.partidos(c, id);
  }

  @Get(':id/estadisticas')
  @Permiso('torneo.leer')
  estadisticas(@Ctx() c: Contexto, @Param('id') id: string) {
    return this.s.estadisticas(c, id);
  }
}

@Module({ controllers: [TorneosController], providers: [TorneosService] })
export class TorneosModule {}
