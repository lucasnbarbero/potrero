// Sitio público: página del partido (E21) y perfil del jugador (E20). Sin sesión y con el mínimo dato:
// de un jugador solo sale lo que devuelve `jugadorPublico` (nunca DNI, fecha de nacimiento, contacto ni datos de salud).
import { Body, Controller, Get, Injectable, Param, Patch } from '@nestjs/common';
import {
  type ConsentimientoBasico,
  cronica,
  esGoleadorDelTorneo,
  estadisticasDelJugador,
  goleadorDelPartido,
  jugadorPublico,
  type JugadorPublico,
  lineaDeTiempo,
  logrosDelJugador,
  ordenarTrayectoria,
  privacidadJugadorSchema,
  type PrivacidadJugadorInput,
  sumarEstadisticas,
} from '@potrero/shared';
import { auditar } from '../comun/auditoria.js';
import { type Contexto, Ctx, noEncontrado, Permiso, Publico, Zod } from '../comun/http.js';
import { DbService, enSerie, type Tx } from '../db/db.service.js';
import { llaveDelTorneo } from '../torneos/llaves.js';
import { estadisticasDelTorneo } from '../torneos/torneos.js';

const CERRADOS = ['FINALIZADO', 'WO'] as const;

/** Nombre público de cada jugador (y si tiene perfil), según su preferencia, su edad y los consentimientos. */
export async function jugadoresPublicos(tx: Tx, ids: readonly string[], hoy = new Date()) {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (unicos.length === 0) return new Map<string, JugadorPublico>();
  const jugadores = await tx.jugador.findMany({
    where: { id: { in: unicos } },
    select: {
      id: true,
      nombre: true,
      apellido: true,
      apodo: true,
      nombrePublico: true,
      fechaNacimiento: true,
      consentimientos: { select: { tipo: true, version: true, revocadoEn: true } },
    },
  });
  return new Map(
    jugadores.map((j) => [
      j.id,
      jugadorPublico({ ...j, consentimientos: j.consentimientos as ConsentimientoBasico[] }, hoy),
    ]),
  );
}

/** Referencia pública a un jugador: el id solo se publica si tiene perfil (si no, no hay a dónde enlazar). */
const referencia = (id: string | null, publicos: Map<string, JugadorPublico>) => {
  const j = id ? publicos.get(id) : undefined;
  return j ? { id: j.perfil ? id : null, nombre: j.nombre, iniciales: j.iniciales } : null;
};

@Injectable()
export class PaginasPublicasService {
  constructor(private readonly db: DbService) {}

  private async org(slug: string) {
    const org = await this.db.app.organizacion.findUnique({ where: { slug } });
    if (!org) throw noEncontrado('la organización');
    return org;
  }

  /** Página del partido: resultado, línea de tiempo, crónica y planteles (E21-01, E21-02). */
  async partido(orgSlug: string, torneoSlug: string, partidoId: string) {
    const org = await this.org(orgSlug);
    return this.db.enOrg(org.id, async (tx) => {
      const t = await tx.torneo.findFirst({ where: { slug: torneoSlug, estado: { not: 'BORRADOR' } } });
      if (!t) throw noEncontrado('el torneo');
      const p = await tx.partido.findFirst({
        where: { id: partidoId, torneoId: t.id },
        include: { cancha: { include: { sede: true } }, eventos: { orderBy: { creadoEn: 'asc' } } },
      });
      if (!p) throw noEncontrado('el partido');
      const [equipos, est, llave] = await enSerie([
        () =>
          tx.equipo.findMany({
            where: { id: { in: [p.localId, p.visitanteId] } },
            select: { id: true, nombre: true, plantel: { select: { jugadorId: true, numero: true } } },
          }),
        async () =>
          p.fase !== 'LLAVE' && p.estado === 'FINALIZADO' ? estadisticasDelTorneo(tx, t.id) : null,
        async () => (p.fase === 'LLAVE' ? llaveDelTorneo(tx, t.id) : null),
      ]);
      const local = equipos.find((e) => e.id === p.localId);
      const visitante = equipos.find((e) => e.id === p.visitanteId);
      const jugado = p.estado === 'FINALIZADO';
      const linea = jugado ? lineaDeTiempo(p.eventos, p.localId, p.visitanteId) : [];
      const publicos = await jugadoresPublicos(tx, [
        ...linea.map((e) => e.jugadorId ?? ''),
        ...equipos.flatMap((e) => e.plantel.map((x) => x.jugadorId)),
      ]);
      const nombres = Object.fromEntries([...publicos].map(([id, j]) => [id, j.nombre]));

      const ronda = llave?.rondas.find((r) => r.partidos.some((c) => c.partidoId === p.id))?.nombre;
      const instancia =
        p.fase === 'LLAVE'
          ? ronda === 'Final'
            ? 'en la final'
            : ronda
              ? `en ${ronda.toLowerCase()}`
              : undefined
          : `por la fecha ${p.fecha}${p.grupo ? ` del grupo ${p.grupo}` : ''}`;
      const tablaDe = p.grupo ? est?.grupos.find((g) => g.grupo === p.grupo)?.tabla : est?.tabla;
      const filaL = tablaDe?.find((f) => f.equipoId === p.localId);
      const filaV = tablaDe?.find((f) => f.equipoId === p.visitanteId);
      const ganadorWO = p.ganadorWOId ? (p.ganadorWOId === p.localId ? 'LOCAL' : 'VISITANTE') : null;
      const figura = goleadorDelPartido(linea);
      const plantel = (e: typeof local) =>
        (e?.plantel ?? [])
          .flatMap((x) => {
            const r = referencia(x.jugadorId, publicos);
            return r ? [{ numero: x.numero, ...r }] : [];
          })
          .sort((a, b) => (a.numero ?? 99) - (b.numero ?? 99));

      return {
        organizacion: { nombre: org.nombre, slug: org.slug },
        torneo: { nombre: t.nombre, slug: t.slug, modalidad: t.modalidad },
        partido: {
          id: p.id,
          fecha: p.fecha,
          fase: p.fase,
          grupo: p.grupo,
          ronda: ronda ?? null,
          estado: p.estado,
          inicio: p.inicio,
          cancha: p.cancha ? `${p.cancha.sede.nombre} · ${p.cancha.nombre}` : null,
          local: local?.nombre ?? '—',
          visitante: visitante?.nombre ?? '—',
          golesLocal: p.estado === 'FINALIZADO' || p.estado === 'WO' ? p.golesLocal : null,
          golesVisitante: p.estado === 'FINALIZADO' || p.estado === 'WO' ? p.golesVisitante : null,
          penalesLocal: p.penalesLocal,
          penalesVisitante: p.penalesVisitante,
          ganadorWO,
        },
        lineaDeTiempo: linea.map(({ jugadorId, ...e }) => ({
          ...e,
          jugador: referencia(jugadorId, publicos),
        })),
        cronica: cronica({
          id: p.id,
          local: local?.nombre ?? '—',
          visitante: visitante?.nombre ?? '—',
          estado: p.estado,
          golesLocal: p.golesLocal,
          golesVisitante: p.golesVisitante,
          penalesLocal: p.penalesLocal,
          penalesVisitante: p.penalesVisitante,
          ganadorWO,
          instancia,
          lineaDeTiempo: linea,
          nombres,
          tabla:
            filaL && filaV
              ? {
                  local: { posicion: filaL.posicion, pts: filaL.pts },
                  visitante: { posicion: filaV.posicion, pts: filaV.pts },
                }
              : null,
        }),
        figura: figura
          ? { jugador: referencia(figura.jugadorId, publicos), lado: figura.lado, goles: figura.goles }
          : null,
        planteles: { local: plantel(local), visitante: plantel(visitante) },
      };
    });
  }

  /** Perfil del jugador: estadísticas, trayectoria entre los torneos de la liga y equipo actual (E20-02, E20-04). */
  async jugador(orgSlug: string, jugadorId: string) {
    const org = await this.org(orgSlug);
    return this.db.enOrg(org.id, async (tx) => {
      const pub = (await jugadoresPublicos(tx, [jugadorId])).get(jugadorId);
      // Un menor sin consentimiento no tiene perfil: se responde igual que si no existiera.
      if (!pub?.perfil) throw noEncontrado('el jugador');
      const plantel = await tx.plantelJugador.findMany({
        where: { jugadorId },
        select: { equipoId: true, numero: true, equipo: { select: { nombre: true } } },
      });
      const equipoIds = plantel.map((x) => x.equipoId);
      const inscripciones = await tx.inscripcion.findMany({
        where: {
          equipoId: { in: equipoIds },
          estado: { not: 'BAJA' },
          torneo: { estado: { not: 'BORRADOR' } },
        },
        select: {
          equipoId: true,
          torneo: {
            select: { id: true, nombre: true, slug: true, modalidad: true, estado: true, creadoEn: true },
          },
        },
      });
      const torneoIds = [...new Set(inscripciones.map((i) => i.torneo.id))];
      const [partidos, equipos] = await enSerie([
        () =>
          tx.partido.findMany({
            where: { torneoId: { in: torneoIds }, estado: { in: [...CERRADOS] } },
            select: {
              id: true,
              torneoId: true,
              fecha: true,
              inicio: true,
              estado: true,
              localId: true,
              visitanteId: true,
              golesLocal: true,
              golesVisitante: true,
              eventos: {
                select: { id: true, tipo: true, equipoId: true, jugadorId: true, minuto: true, anulaA: true },
              },
            },
            orderBy: { inicio: 'desc' },
          }),
        () => tx.equipo.findMany({ select: { id: true, nombre: true } }),
      ]);
      const nombreEquipo = new Map(equipos.map((e) => [e.id, e.nombre]));
      const delEquipo = (torneoId: string, equipoId: string) =>
        partidos.filter(
          (p) => p.torneoId === torneoId && (p.localId === equipoId || p.visitanteId === equipoId),
        );

      const trayectoria = ordenarTrayectoria(
        inscripciones.map((i) => {
          const suyos = delEquipo(i.torneo.id, i.equipoId);
          return {
            estadoTorneo: i.torneo.estado,
            creadoEn: i.torneo.creadoEn,
            torneo: {
              nombre: i.torneo.nombre,
              slug: i.torneo.slug,
              modalidad: i.torneo.modalidad,
              estado: i.torneo.estado,
            },
            equipo: nombreEquipo.get(i.equipoId) ?? '—',
            estadisticas: estadisticasDelJugador(jugadorId, suyos),
            goleador:
              i.torneo.estado !== 'INSCRIPCION' &&
              esGoleadorDelTorneo(
                jugadorId,
                partidos.filter((p) => p.torneoId === i.torneo.id),
              ),
          };
        }),
      );
      const totales = sumarEstadisticas(trayectoria.map((x) => x.estadisticas));
      const actual = trayectoria[0];
      const slugDe = new Map(inscripciones.map((i) => [i.torneo.id, i.torneo.slug]));

      // Últimos partidos jugados por su equipo, con lo que hizo él en cada uno.
      const suyos = new Set(inscripciones.map((i) => `${i.torneo.id}:${i.equipoId}`));
      const ultimos = partidos
        .filter((p) => p.estado === 'FINALIZADO')
        .filter((p) => suyos.has(`${p.torneoId}:${p.localId}`) || suyos.has(`${p.torneoId}:${p.visitanteId}`))
        .slice(0, 6)
        .map((p) => {
          const esLocal = suyos.has(`${p.torneoId}:${p.localId}`);
          const [a, b] = esLocal
            ? [p.golesLocal ?? 0, p.golesVisitante ?? 0]
            : [p.golesVisitante ?? 0, p.golesLocal ?? 0];
          const e = estadisticasDelJugador(jugadorId, [p]);
          return {
            id: p.id,
            torneoSlug: slugDe.get(p.torneoId)!,
            inicio: p.inicio,
            rival: nombreEquipo.get(esLocal ? p.visitanteId : p.localId) ?? '—',
            resultado: a > b ? 'G' : a < b ? 'P' : 'E',
            marcador: `${a}-${b}`,
            goles: e.goles,
            amarillas: e.amarillas,
            rojas: e.rojas,
          };
        });

      return {
        organizacion: { nombre: org.nombre, slug: org.slug },
        jugador: { nombre: pub.nombre, iniciales: pub.iniciales },
        equipoActual: actual
          ? {
              nombre: actual.equipo,
              torneo: actual.torneo.nombre,
              torneoSlug: actual.torneo.slug,
              modalidad: actual.torneo.modalidad,
              numero: plantel.find((x) => x.equipo.nombre === actual.equipo)?.numero ?? null,
            }
          : plantel[0]
            ? {
                nombre: plantel[0].equipo.nombre,
                torneo: null,
                torneoSlug: null,
                modalidad: null,
                numero: plantel[0].numero,
              }
            : null,
        totales,
        trayectoria: trayectoria.map(({ estadoTorneo, creadoEn, ...x }) => x),
        logros: logrosDelJugador(
          totales,
          trayectoria.filter((x) => x.goleador).map((x) => x.torneo.nombre),
        ),
        ultimos,
      };
    });
  }

  /** El organizador carga el apodo y cómo se lo nombra en el sitio público (E20-04). */
  privacidad(c: Contexto, jugadorId: string, d: PrivacidadJugadorInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const antes = await tx.jugador.findUnique({
        where: { id: jugadorId },
        select: { apodo: true, nombrePublico: true },
      });
      if (!antes) throw noEncontrado('el jugador');
      const despues = await tx.jugador.update({
        where: { id: jugadorId },
        data: { apodo: d.apodo ?? null, nombrePublico: d.nombrePublico },
        select: { id: true, apodo: true, nombrePublico: true },
      });
      await auditar(tx, c, 'jugador.privacidad', 'jugador', jugadorId, { antes, despues });
      return despues;
    });
  }
}

@Controller()
export class PaginasPublicasController {
  constructor(private readonly s: PaginasPublicasService) {}

  @Publico()
  @Get('publico/:org/jugadores/:id')
  jugador(@Param('org') org: string, @Param('id') id: string) {
    return this.s.jugador(org, id);
  }

  @Publico()
  @Get('publico/:org/:torneo/partidos/:id')
  partido(@Param('org') org: string, @Param('torneo') torneo: string, @Param('id') id: string) {
    return this.s.partido(org, torneo, id);
  }

  @Permiso('equipo.escribir')
  @Patch('jugadores/:id/privacidad')
  privacidad(
    @Ctx() c: Contexto,
    @Param('id') id: string,
    @Body(new Zod(privacidadJugadorSchema)) d: PrivacidadJugadorInput,
  ) {
    return this.s.privacidad(c, id, d);
  }
}
