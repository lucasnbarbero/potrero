import { Body, Controller, Get, HttpStatus, Injectable, Module, Param, Patch, Post } from '@nestjs/common';
import {
  cantidadDeClasificados,
  cantidadDePartidos,
  clasificadosDeLiga,
  configCobrosPorFecha,
  crearTorneoSchema,
  type CrearTorneoInput,
  cuadroDeGrupos,
  cuadroDeSemillas,
  type Fecha,
  generarFixtureSchema,
  type GenerarFixtureInput,
  generarLlavesSchema,
  type GenerarLlavesInput,
  vencimientoSchema,
  type VencimientoInput,
  goleadores,
  programar,
  REGLAMENTO_POR_DEFECTO,
  repartirEnGrupos,
  sortear,
  tablaDePosiciones,
  tarjetasPorEquipo,
  todosContraTodos,
  type CausaSancion,
  type Desempate,
  type Reglamento,
} from '@potrero/shared';
import { z } from 'zod';
import { auditar } from '../comun/auditoria.js';
import { type Contexto, Ctx, ErrorNegocio, noEncontrado, Permiso, Zod } from '../comun/http.js';
import { slugUnico } from '../comun/slug.js';
import { DbService, enSerie, type Tx } from '../db/db.service.js';
import { Prisma, type Reglamento as ReglamentoDb } from '../generated/prisma/client.js';
import { acreditadosPorSancion, cumplimiento } from '../tribunal/levantar.js';
import { avanzarLlave, llaveDelTorneo, validarFranjas } from './llaves.js';
import { sincronizarCobrosPorFecha } from '../cobros/por-fecha.js';

export const aReglamento = (r: ReglamentoDb): Reglamento => ({
  ...r,
  desempates: r.desempates as Desempate[],
  levantarSancionTipos: r.levantarSancionTipos as CausaSancion[],
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
    penalesLocal: p.penalesLocal,
    penalesVisitante: p.penalesVisitante,
    ganadorWOId: p.ganadorWOId,
    fase: p.fase,
    grupo: p.grupo,
    clave: p.clave,
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
  // La tabla solo cuenta la fase de liga o de grupos: los cruces de llave no suman puntos.
  const deTabla = cerrados.filter((p) => p.fase !== 'LLAVE');
  const reglamento = aReglamento(torneo.reglamento);
  const calcular = (ids: string[], de: typeof deTabla) =>
    tablaDePosiciones(
      ids,
      de.map((p) => ({
        id: p.id,
        localId: p.localId,
        visitanteId: p.visitanteId,
        golesLocal: p.golesLocal ?? 0,
        golesVisitante: p.golesVisitante ?? 0,
        ganadorWO: p.ganadorWOId,
        tarjetas: tarjetasPorEquipo(p.eventos),
      })),
      reglamento,
    );
  const tabla = calcular(
    equipos.map((e) => e.id),
    deTabla,
  );
  const gruposDelTorneo = (torneo.grupos as { grupo: string; equipoIds: string[] }[] | null) ?? [];
  const tablasPorGrupo = gruposDelTorneo.map((g) => ({
    grupo: g.grupo,
    equipoIds: g.equipoIds,
    tabla: calcular(
      g.equipoIds,
      deTabla.filter((p) => p.grupo === g.grupo),
    ),
  }));
  // Los goles de un W.O. no suman estadísticas individuales: solo cuentan los partidos jugados.
  const goles = goleadores(cerrados.filter((p) => p.estado === 'FINALIZADO').flatMap((p) => p.eventos));
  const jugadorIds = [...new Set([...goles.map((g) => g.jugadorId), ...sanciones.map((s) => s.jugadorId)])];
  const jugadores = await tx.jugador.findMany({ where: { id: { in: jugadorIds } } });
  const nombreJugador = new Map(jugadores.map((j) => [j.id, `${j.nombre} ${j.apellido}`]));
  const nombreEquipo = new Map(equipos.map((e) => [e.id, e.nombre]));
  const acreditados = await acreditadosPorSancion(tx, torneoId);
  return {
    tabla: tabla.map((f) => ({ ...f, equipo: nombreEquipo.get(f.equipoId) ?? '—' })),
    /** Solo en grupos + playoffs: una tabla por grupo. */
    grupos: tablasPorGrupo.map((g) => ({
      grupo: g.grupo,
      tabla: g.tabla.map((f) => ({ ...f, equipo: nombreEquipo.get(f.equipoId) ?? '—' })),
    })),
    goleadores: goles.map((g) => ({
      ...g,
      jugador: nombreJugador.get(g.jugadorId) ?? '—',
      equipo: nombreEquipo.get(g.equipoId) ?? '—',
    })),
    // Partidos oficiales del equipo jugados después del de origen (W.O. y suspendidos no descuentan) y levantados pagando.
    sanciones: sanciones.map((s) => ({
      ...s,
      jugador: nombreJugador.get(s.jugadorId) ?? '—',
      equipo: nombreEquipo.get(s.equipoId) ?? '—',
      ...cumplimiento(s, partidos, acreditados),
    })),
  };
}

/** Las canchas elegidas tienen que existir y no estar bloqueadas (mantenimiento, clima). */
async function validarCanchas(tx: Tx, ids: string[]) {
  const canchas = await tx.cancha.findMany({ where: { id: { in: ids } } });
  if (canchas.length !== new Set(ids).size) throw noEncontrado('alguna de las canchas');
  const bloqueada = canchas.find((x) => x.bloqueada);
  if (bloqueada)
    throw new ErrorNegocio(
      `La cancha ${bloqueada.nombre} está bloqueada${bloqueada.motivoBloqueo ? ` (${bloqueada.motivoBloqueo})` : ''}. Sacala de la selección.`,
    );
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
          ...(d.cobrosPorFecha
            ? { cobrosPorFecha: { ...configCobrosPorFecha(d.cobrosPorFecha) } as Prisma.InputJsonObject }
            : {}),
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

  /** Fecha límite para pagar la inscripción: la heredan los cargos nuevos y se aplica a los pendientes. */
  fijarVencimiento(c: Contexto, id: string, d: VencimientoInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      if (!(await tx.torneo.findUnique({ where: { id } }))) throw noEncontrado('el torneo');
      const vence = d.vence ? new Date(`${d.vence}T00:00:00Z`) : null;
      await tx.torneo.update({ where: { id }, data: { venceInscripcion: vence } });
      const { count } = await tx.cargo.updateMany({
        where: { estado: 'PENDIENTE', inscripcion: { torneoId: id } },
        data: { vence },
      });
      await auditar(tx, c, 'torneo.vencimiento', 'torneo', id, { despues: { vence: d.vence } });
      return { vence: d.vence, cargosActualizados: count };
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
   * Genera la fase regular del torneo con los equipos confirmados: liga (todos contra todos) o fase de grupos.
   * Rehace el fixture solo si todavía no se jugó ningún partido. La copa no tiene fase regular: va directo a las llaves.
   */
  generarFixture(c: Contexto, id: string, d: GenerarFixtureInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const torneo = await tx.torneo.findUnique({ where: { id } });
      if (!torneo) throw noEncontrado('el torneo');
      if (torneo.formato === 'COPA')
        throw new ErrorNegocio('La copa no tiene fase de liga: generá directamente las llaves.');
      const jugados = await tx.partido.count({
        where: { torneoId: id, estado: { in: ['EN_JUEGO', 'FINALIZADO', 'WO'] } },
      });
      if (jugados > 0)
        throw new ErrorNegocio(
          'El torneo ya tiene partidos jugados: no se puede rehacer el fixture.',
          HttpStatus.CONFLICT,
        );
      await validarCanchas(tx, d.canchaIds);
      const equipos = await equiposDelTorneo(tx, id, true);
      if (equipos.length < 2)
        throw new ErrorNegocio('Se necesitan al menos 2 equipos con la inscripción confirmada.');
      const ids = equipos.map((e) => e.id);
      const conGrupos = torneo.formato === 'GRUPOS_PLAYOFFS';
      let fechas: Fecha[];
      let grupos: { grupo: string; equipoIds: string[] }[] | null = null;
      const grupoDelCruce = new Map<string, string>();
      try {
        if (conGrupos) {
          grupos = repartirEnGrupos(ids, d.grupos ?? 2);
          // Todos los grupos juegan su fecha n a la vez: se juntan los cruces de cada número de fecha.
          const porGrupo = grupos.map((g) => ({
            g,
            fechas: todosContraTodos(g.equipoIds, torneo.idaYVuelta),
          }));
          for (const p of porGrupo)
            for (const f of p.fechas)
              for (const x of f.cruces) grupoDelCruce.set(`${x.localId}|${x.visitanteId}`, p.g.grupo);
          const total = Math.max(...porGrupo.map((p) => p.fechas.length));
          fechas = Array.from({ length: total }, (_, i) => ({
            numero: i + 1,
            cruces: porGrupo.flatMap((p) => p.fechas[i]?.cruces ?? []),
          }));
        } else {
          fechas = todosContraTodos(ids, torneo.idaYVuelta);
        }
      } catch (e) {
        throw new ErrorNegocio((e as Error).message);
      }
      let programados;
      try {
        programados = programar(fechas, d);
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
          fase: conGrupos ? ('GRUPOS' as const) : ('LIGA' as const),
          grupo: conGrupos ? (grupoDelCruce.get(`${p.localId}|${p.visitanteId}`) ?? null) : null,
        })),
      });
      await tx.torneo.update({
        where: { id },
        data: { estado: 'EN_CURSO', grupos: grupos ?? Prisma.DbNull, llave: Prisma.DbNull },
      });
      await auditar(tx, c, 'fixture.generar', 'torneo', id, {
        despues: { partidos: programados.length, ...d },
      });
      // Cuota por fecha y seguro (E06-20/21): los cargos de las fechas próximas se generan con el fixture nuevo.
      await sincronizarCobrosPorFecha(tx, c.organizacionId, id, { usuarioId: c.usuarioId });
      return { partidos: programados.length, fechas: Math.max(...programados.map((p) => p.fecha)) };
    });
  }

  /**
   * Arma el cuadro de playoffs. Copa: sorteo con cabezas de serie. Liga + playoffs: clasifican los primeros de la tabla.
   * Grupos + playoffs: avanzan los mejores de cada grupo. Después, cada cruce se crea cuando se conocen sus dos equipos.
   */
  generarLlaves(c: Contexto, id: string, d: GenerarLlavesInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const torneo = await tx.torneo.findUnique({ where: { id } });
      if (!torneo) throw noEncontrado('el torneo');
      if (torneo.formato === 'LIGA')
        throw new ErrorNegocio(
          'Un torneo de liga no tiene llaves. Elegí copa, liga + playoffs o grupos + playoffs.',
        );
      const jugadosEnLlave = await tx.partido.count({
        where: { torneoId: id, fase: 'LLAVE', estado: { in: ['EN_JUEGO', 'FINALIZADO', 'WO'] } },
      });
      if (jugadosEnLlave > 0)
        throw new ErrorNegocio(
          'La llave ya tiene partidos jugados: no se puede rehacer.',
          HttpStatus.CONFLICT,
        );
      await validarCanchas(tx, d.canchaIds);
      const equipos = await equiposDelTorneo(tx, id, true);
      let cuadro: (string | null)[];
      let baseFecha = 0;
      try {
        if (torneo.formato === 'COPA') {
          if (equipos.length < 2)
            throw new Error('Se necesitan al menos 2 equipos con la inscripción confirmada.');
          const semilla = d.semilla ?? Math.floor(Math.random() * 2 ** 31);
          cuadro = cuadroDeSemillas(
            sortear(
              equipos.map((e) => e.id),
              d.cabezasDeSerie,
              semilla,
            ),
          );
        } else {
          const regulares = await tx.partido.findMany({
            where: { torneoId: id, fase: { not: 'LLAVE' } },
            select: { estado: true, fecha: true },
          });
          if (regulares.length === 0)
            throw new Error('Primero generá el fixture de la fase regular y jugala.');
          const pendientes = regulares.filter((p) => p.estado !== 'FINALIZADO' && p.estado !== 'WO').length;
          if (pendientes > 0)
            throw new Error(
              `Todavía faltan jugar ${pendientes} partido${pendientes > 1 ? 's' : ''} de la fase regular.`,
            );
          baseFecha = Math.max(...regulares.map((p) => p.fecha));
          const est = await estadisticasDelTorneo(tx, id);
          if (torneo.formato === 'LIGA_PLAYOFFS') {
            const n = d.clasificados ?? cantidadDeClasificados(est.tabla.length);
            cuadro = cuadroDeSemillas(clasificadosDeLiga(est.tabla, n));
          } else {
            cuadro = cuadroDeGrupos(
              est.grupos.map((g) => g.tabla.slice(0, d.porGrupo).map((f) => f.equipoId)),
            );
          }
        }
      } catch (e) {
        if (e instanceof ErrorNegocio) throw e;
        throw new ErrorNegocio((e as Error).message);
      }
      const programacion = {
        primerDia: d.primerDia,
        diasEntreRondas: d.diasEntreRondas,
        horarios: d.horarios,
        canchaIds: d.canchaIds,
      };
      validarFranjas(cuadro, programacion);
      await tx.partido.deleteMany({ where: { torneoId: id, fase: 'LLAVE' } });
      await tx.torneo.update({
        where: { id },
        data: { llave: { cuadro, baseFecha, programacion }, estado: 'EN_CURSO' },
      });
      const { creados } = await avanzarLlave(tx, c, id);
      await sincronizarCobrosPorFecha(tx, c.organizacionId, id, { usuarioId: c.usuarioId });
      await auditar(tx, c, 'llave.generar', 'torneo', id, {
        despues: { cuadro, formato: torneo.formato, cabezasDeSerie: d.cabezasDeSerie, semilla: d.semilla },
      });
      return { equipos: cuadro.filter(Boolean).length, partidosCreados: creados };
    });
  }

  llave(c: Contexto, id: string) {
    return this.db.enOrg(c.organizacionId, (tx) => llaveDelTorneo(tx, id));
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

  @Patch(':id/vencimiento')
  @Permiso('torneo.escribir')
  vencimiento(
    @Ctx() c: Contexto,
    @Param('id') id: string,
    @Body(new Zod(vencimientoSchema)) d: VencimientoInput,
  ) {
    return this.s.fijarVencimiento(c, id, d);
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

  @Post(':id/llaves')
  @Permiso('fixture.escribir')
  llaves(
    @Ctx() c: Contexto,
    @Param('id') id: string,
    @Body(new Zod(generarLlavesSchema)) d: GenerarLlavesInput,
  ) {
    return this.s.generarLlaves(c, id, d);
  }

  @Get(':id/llave')
  @Permiso('torneo.leer')
  llave(@Ctx() c: Contexto, @Param('id') id: string) {
    return this.s.llave(c, id);
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
