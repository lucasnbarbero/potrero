// Torneos por fases (ADR-026, E10-07/08) y llaves ida y vuelta (E10-03). La API guarda y orquesta; las reglas
// (entradas de cada fase, grupos, cuadro, global y penales) viven en @potrero/shared (dominio/fases.ts).
import { Body, Controller, Get, HttpStatus, Injectable, Module, Param, Post } from '@nestjs/common';
import {
  configCobrosPorFecha,
  crearTorneoFlexibleSchema,
  type CrearTorneoFlexibleInput,
  cuadroDeFase,
  describirEntrada,
  equiposPorFase,
  rondasDeEliminacion,
  type FaseDeFormato,
  fechasDeFase,
  type FormatoFlexible,
  generarFaseSchema,
  type GenerarFaseInput,
  gruposDeFase,
  type GrupoDeFase,
  pidePenales,
  type PiernaJugada,
  programar,
  REGLAMENTO_POR_DEFECTO,
  resolverEntradas,
  resolverLlaveDeFase,
  type ResultadoDeFase,
  rondasDeLaLlave,
  sumarDias,
  tablaDePosiciones,
  tarjetasPorEquipo,
  validarFormato,
} from '@potrero/shared';
import { auditar } from '../comun/auditoria.js';
import { type Contexto, Ctx, ErrorNegocio, noEncontrado, Permiso, Zod } from '../comun/http.js';
import { exigirLimiteDelPlan } from '../comun/plan.js';
import { slugUnico } from '../comun/slug.js';
import { DbService, enSerie, type Tx } from '../db/db.service.js';
import type { Fase, Prisma } from '../generated/prisma/client.js';
import { sincronizarCobrosPorFecha } from '../cobros/por-fecha.js';
import { aReglamento, equiposDelTorneo } from './torneos.js';

/** Lo que se guarda en `Fase.llave` de una eliminación. */
interface LlaveDeFase {
  cuadro: (string | null)[];
  programacion: { primerDia: string; diasEntreRondas: number; horarios: string[]; canchaIds: string[] };
}

const definicionDe = (f: Fase) => f.definicion as unknown as FaseDeFormato;
const llaveDe = (f: Fase) => f.llave as unknown as LlaveDeFase | null;
const gruposDe = (f: Fase) => (f.grupos as unknown as GrupoDeFase[] | null) ?? [];
const formatoDe = (fases: Fase[]): FormatoFlexible => ({
  fases: [...fases].sort((a, b) => a.orden - b.orden).map(definicionDe),
});
const cerrado = (estado: string) => estado === 'FINALIZADO' || estado === 'WO';

/** Clave del partido dentro del torneo: fase, cruce y pierna ("f2:1-3:2" = vuelta del 3er cruce de la ronda 1 de f2). */
const claveDePartido = (fase: string, cruce: string, pierna: number) => `${fase}:${cruce}:${pierna}`;
const cruceDeClave = (clave: string | null) => clave?.split(':')[1] ?? null;

type PartidoConEventos = Prisma.PartidoGetPayload<{ include: { eventos: true } }>;

/** Piernas jugadas de cada cruce de una eliminación, por clave de cruce. */
function piernasPorCruce(partidos: readonly PartidoConEventos[]) {
  const r: Record<string, PiernaJugada[]> = {};
  for (const p of partidos) {
    const cruce = cruceDeClave(p.clave);
    if (!cruce) continue;
    (r[cruce] ??= []).push({
      pierna: p.pierna ?? 1,
      localId: p.localId,
      visitanteId: p.visitanteId,
      cerrado: cerrado(p.estado),
      golesLocal: p.golesLocal ?? 0,
      golesVisitante: p.golesVisitante ?? 0,
      penalesLocal: p.penalesLocal,
      penalesVisitante: p.penalesVisitante,
      ganadorWOId: p.estado === 'WO' ? p.ganadorWOId : null,
    });
  }
  return r;
}

/** Tablas de cada grupo de una fase de liga o grupos, con sus partidos cerrados. */
function tablasDeFase(
  fase: Fase,
  partidos: readonly PartidoConEventos[],
  reglamento: ReturnType<typeof aReglamento>,
) {
  return gruposDe(fase).map((g) =>
    tablaDePosiciones(
      g.equipoIds,
      partidos
        .filter((p) => cerrado(p.estado) && (p.grupo ?? null) === g.grupo)
        .map((p) => ({
          id: p.id,
          localId: p.localId,
          visitanteId: p.visitanteId,
          golesLocal: p.golesLocal ?? 0,
          golesVisitante: p.golesVisitante ?? 0,
          ganadorWO: p.ganadorWOId,
          tarjetas: tarjetasPorEquipo(p.eventos),
        })),
      reglamento,
    ),
  );
}

/** Todo lo de un torneo por fases: sus fases, partidos y lo que dejó cada una (tablas o ganadores por ronda). */
async function cargarTorneo(tx: Tx, torneoId: string) {
  const torneo = await tx.torneo.findUnique({ where: { id: torneoId }, include: { reglamento: true } });
  if (!torneo) throw noEncontrado('el torneo');
  const [fases, partidos] = await enSerie([
    () => tx.fase.findMany({ where: { torneoId }, orderBy: { orden: 'asc' } }),
    () => tx.partido.findMany({ where: { torneoId, faseId: { not: null } }, include: { eventos: true } }),
  ]);
  const reglamento = aReglamento(torneo.reglamento);
  const deFase = (id: string) => partidos.filter((p) => p.faseId === id);
  const resultados: Record<string, ResultadoDeFase> = {};
  for (const f of fases) {
    const def = definicionDe(f);
    const generada = f.estado !== 'PENDIENTE';
    if (def.tipo === 'ELIMINACION') {
      const llave = llaveDe(f);
      const r = llave ? resolverLlaveDeFase(def, llave.cuadro, piernasPorCruce(deFase(f.id))) : null;
      resultados[f.clave] = {
        tipo: def.tipo,
        generada,
        terminada: f.estado === 'FINALIZADA',
        rondas: r?.porRonda ?? [],
      };
    } else {
      resultados[f.clave] = {
        tipo: def.tipo,
        generada,
        terminada: f.estado === 'FINALIZADA',
        tablas: tablasDeFase(f, deFase(f.id), reglamento),
      };
    }
  }
  return { torneo, fases, partidos, deFase, resultados, reglamento, formato: formatoDe(fases) };
}

/** Día, horario y cancha del cruce número `indice` de una ronda, en su pierna. */
function franjaDeLlave(cfg: LlaveDeFase, fechaDeRonda: number, pierna: number, indice: number) {
  const horarios = [...cfg.programacion.horarios].sort();
  const canchas = cfg.programacion.canchaIds;
  const dia = sumarDias(
    cfg.programacion.primerDia,
    (fechaDeRonda - 1 + (pierna - 1)) * cfg.programacion.diasEntreRondas,
  );
  const franja = indice % (horarios.length * canchas.length);
  return {
    canchaId: canchas[franja % canchas.length]!,
    inicio: new Date(`${dia}T${horarios[Math.floor(franja / canchas.length)]!}:00-03:00`),
  };
}

/**
 * Después de cerrar un partido de una fase: crea los cruces que ya tienen sus dos equipos (con ida y vuelta si la
 * ronda lo pide), marca la fase como terminada cuando corresponde y, si terminaron todas, finaliza el torneo.
 */
export async function avanzarFase(tx: Tx, c: Contexto, faseId: string) {
  const fase = await tx.fase.findUnique({ where: { id: faseId } });
  if (!fase || fase.estado === 'PENDIENTE') return { creados: 0 };
  const def = definicionDe(fase);
  const partidos = await tx.partido.findMany({ where: { faseId }, include: { eventos: true } });
  let creados = 0;
  let terminada = partidos.length > 0 && partidos.every((p) => cerrado(p.estado));
  const cfg = llaveDe(fase);
  if (def.tipo === 'ELIMINACION' && cfg) {
    const r = resolverLlaveDeFase(def, cfg.cuadro, piernasPorCruce(partidos));
    const existentes = new Set(partidos.map((p) => p.clave));
    const nuevos: Prisma.PartidoCreateManyInput[] = [];
    for (const ronda of r.resuelta.rondas) {
      const prog = r.rondas.find((x) => x.numero === ronda.numero)!;
      ronda.partidos.forEach((s, indice) => {
        if (!s.localId || !s.visitanteId) return;
        for (let pierna = 1; pierna <= (prog.idaYVuelta ? 2 : 1); pierna++) {
          const clave = claveDePartido(fase.clave, s.clave, pierna);
          if (existentes.has(clave)) continue;
          // La vuelta se juega con la localía invertida: el de mejor semilla define en casa.
          const [localId, visitanteId] =
            prog.idaYVuelta && pierna === 1 ? [s.visitanteId, s.localId] : [s.localId, s.visitanteId];
          nuevos.push({
            organizacionId: c.organizacionId,
            torneoId: fase.torneoId,
            faseId,
            fase: 'LLAVE',
            clave,
            ronda: ronda.numero,
            pierna,
            fecha: fase.baseFecha + prog.fecha + pierna - 1,
            localId,
            visitanteId,
            ...franjaDeLlave(cfg, prog.fecha, pierna, indice),
          });
        }
      });
    }
    if (nuevos.length) await tx.partido.createMany({ data: nuevos });
    creados = nuevos.length;
    terminada = !!r.campeonId;
  }
  if (terminada && fase.estado !== 'FINALIZADA') {
    await tx.fase.update({ where: { id: faseId }, data: { estado: 'FINALIZADA' } });
    await auditar(tx, c, 'fase.terminar', 'fase', faseId, { despues: { fase: fase.nombre } });
    const pendientes = await tx.fase.count({
      where: { torneoId: fase.torneoId, estado: { not: 'FINALIZADA' } },
    });
    if (pendientes === 0)
      await tx.torneo.update({ where: { id: fase.torneoId }, data: { estado: 'FINALIZADO' } });
  }
  if (creados)
    await sincronizarCobrosPorFecha(tx, c.organizacionId, fase.torneoId, { usuarioId: c.usuarioId });
  return { creados };
}

/**
 * ¿El acta de este partido tiene que pedir penales con ese marcador? Fuera de las fases, lo de siempre (cruce de llave
 * empatado). En una serie de ida y vuelta, solo la vuelta y solo si el global queda empatado.
 */
export async function serieDelPartido(
  tx: Tx,
  p: {
    faseId: string | null;
    fase: string;
    clave: string | null;
    pierna: number | null;
    localId: string;
    torneoId: string;
  },
) {
  if (!p.faseId || p.fase !== 'LLAVE') return null;
  const fase = await tx.fase.findUnique({ where: { id: p.faseId } });
  const cfg = fase ? llaveDe(fase) : null;
  if (!fase || !cfg) return null;
  const cruce = cruceDeClave(p.clave)!;
  const ronda = rondasDeLaLlave(definicionDe(fase), cfg.cuadro).rondas.find(
    (r) => r.numero === Number(cruce.split('-')[0]),
  );
  const idaYVuelta = ronda?.idaYVuelta ?? false;
  let ida: { golesLocal: number; golesVisitante: number } | null = null;
  if (idaYVuelta && p.pierna === 2) {
    const x = await tx.partido.findFirst({
      where: { torneoId: p.torneoId, clave: claveDePartido(fase.clave, cruce, 1) },
    });
    if (x && cerrado(x.estado))
      ida =
        x.localId === p.localId
          ? { golesLocal: x.golesLocal ?? 0, golesVisitante: x.golesVisitante ?? 0 }
          : { golesLocal: x.golesVisitante ?? 0, golesVisitante: x.golesLocal ?? 0 };
  }
  return { idaYVuelta, pierna: p.pierna, ida, ronda: ronda?.nombre ?? null };
}

/** Si el acta de este partido pide penales con ese marcador. */
export async function pidePenalesEnActa(
  tx: Tx,
  p: Parameters<typeof serieDelPartido>[1],
  m: { local: number; visitante: number },
) {
  const serie = await serieDelPartido(tx, p);
  const marcador = { golesLocal: m.local, golesVisitante: m.visitante };
  if (!serie) return p.fase === 'LLAVE' && m.local === m.visitante;
  return pidePenales(marcador, { ...serie, ida: serie.ida ?? undefined });
}

@Injectable()
export class FasesService {
  constructor(private readonly db: DbService) {}

  /** Crea un torneo por fases desde "Armá el formato". El formato se valida en el servidor: un error lo impide. */
  crear(c: Contexto, d: CrearTorneoFlexibleInput) {
    const errores = validarFormato(d.formato, d.cupo).filter((p) => p.nivel === 'ERROR');
    if (errores.length)
      throw new ErrorNegocio(`El formato tiene errores: ${errores.map((e) => e.mensaje).join(' ')}`);
    return this.db.enOrg(c.organizacionId, async (tx) => {
      await exigirLimiteDelPlan(tx, c.organizacionId, 'torneosActivos');
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
          formato: 'FLEXIBLE',
          cupo: d.cupo,
          inscripcion: d.inscripcion,
          reglamentoId: reglamento.id,
          estado: 'INSCRIPCION',
          ...(d.cobrosPorFecha
            ? { cobrosPorFecha: { ...configCobrosPorFecha(d.cobrosPorFecha) } as Prisma.InputJsonObject }
            : {}),
        },
      });
      await tx.fase.createMany({
        data: d.formato.fases.map((f, orden) => ({
          organizacionId: c.organizacionId,
          torneoId: torneo.id,
          clave: f.id,
          orden,
          nombre: f.nombre,
          tipo: f.tipo,
          definicion: f as unknown as Prisma.InputJsonObject,
        })),
      });
      await auditar(tx, c, 'torneo.crear', 'torneo', torneo.id, {
        despues: { ...torneo, formato: d.formato },
      });
      return torneo;
    });
  }

  /** Arma una fase cuando sus entradas están resueltas: grupos y fixture, o el cuadro y los primeros cruces. */
  generar(c: Contexto, torneoId: string, faseId: string, d: GenerarFaseInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const t = await cargarTorneo(tx, torneoId);
      const fase = t.fases.find((f) => f.id === faseId);
      if (!fase) throw noEncontrado('la fase');
      if (fase.estado !== 'PENDIENTE')
        throw new ErrorNegocio(`${fase.nombre} ya está generada.`, HttpStatus.CONFLICT);
      const def = definicionDe(fase);
      const inscriptos = (await equiposDelTorneo(tx, torneoId, true)).map((e) => e.id);
      const entradas = resolverEntradas(t.formato, fase.clave, inscriptos, t.resultados);
      if (!entradas.ok) throw new ErrorNegocio(entradas.motivo);
      const canchas = await tx.cancha.findMany({ where: { id: { in: d.canchaIds } } });
      if (canchas.length !== new Set(d.canchaIds).size) throw noEncontrado('alguna de las canchas');
      const bloqueada = canchas.find((x) => x.bloqueada);
      if (bloqueada)
        throw new ErrorNegocio(`La cancha ${bloqueada.nombre} está bloqueada. Sacala de la selección.`);
      const baseFecha = baseFechaDe(def, t);
      const datos: Prisma.FaseUpdateInput = { estado: 'EN_CURSO', equipoIds: entradas.equipoIds, baseFecha };
      let partidos = 0;
      try {
        if (def.tipo === 'ELIMINACION') {
          const cuadro = cuadroDeFase(def, entradas.equipoIds, entradas.porGrupo);
          const franjas = d.horarios.length * d.canchaIds.length;
          const { llave } = rondasDeLaLlave(def, cuadro);
          const mayor = llave.rondas.reduce((m, r) => (r.partidos.length > m.partidos.length ? r : m));
          if (mayor.partidos.length > franjas)
            throw new Error(
              `${mayor.nombre} tiene ${mayor.partidos.length} cruces y solo hay ${franjas} franjas. Sumá horarios o canchas.`,
            );
          datos.llave = {
            cuadro,
            programacion: {
              primerDia: d.primerDia,
              diasEntreRondas: d.diasEntreFechas,
              horarios: d.horarios,
              canchaIds: d.canchaIds,
            },
          } as unknown as Prisma.InputJsonObject;
        } else {
          const grupos = gruposDeFase(def, entradas.equipoIds);
          const { fechas, grupoDe } = fechasDeFase(def, grupos);
          const programados = programar(fechas, d);
          await tx.partido.createMany({
            data: programados.map((p) => ({
              organizacionId: c.organizacionId,
              torneoId,
              faseId,
              fase: def.tipo === 'GRUPOS' ? ('GRUPOS' as const) : ('LIGA' as const),
              grupo: grupoDe.get(`${p.localId}|${p.visitanteId}`) ?? null,
              fecha: baseFecha + p.fecha,
              localId: p.localId,
              visitanteId: p.visitanteId,
              canchaId: p.canchaId,
              inicio: new Date(p.inicio),
            })),
          });
          partidos = programados.length;
          datos.grupos = grupos as unknown as Prisma.InputJsonArray;
        }
      } catch (e) {
        throw new ErrorNegocio((e as Error).message);
      }
      await tx.fase.update({ where: { id: faseId }, data: datos });
      await tx.torneo.update({ where: { id: torneoId }, data: { estado: 'EN_CURSO' } });
      if (def.tipo === 'ELIMINACION') partidos = (await avanzarFase(tx, c, faseId)).creados;
      else await sincronizarCobrosPorFecha(tx, c.organizacionId, torneoId, { usuarioId: c.usuarioId });
      await auditar(tx, c, 'fase.generar', 'fase', faseId, {
        despues: { fase: fase.nombre, equipos: entradas.equipoIds.length, partidos, ...d },
      });
      return { equipos: entradas.equipoIds.length, partidos };
    });
  }

  /** El torneo por fases listo para mostrar: cada fase con su estado, tablas por grupo, llave y partidos. */
  vista(c: Contexto, torneoId: string) {
    return this.db.enOrg(c.organizacionId, (tx) => vistaDeFases(tx, torneoId));
  }
}

/** Desde qué número de fecha se cuentan las fechas de la fase: después de lo que necesita de sus fases de origen. */
function baseFechaDe(def: FaseDeFormato, t: Awaited<ReturnType<typeof cargarTorneo>>) {
  let base = 0;
  for (const e of def.entradas) {
    if (e.tipo === 'INSCRIPTOS') continue;
    const origen = t.fases.find((f) => f.clave === e.fase);
    if (!origen) continue;
    const cfg = llaveDe(origen);
    if ((e.tipo === 'GANADORES' || e.tipo === 'PERDEDORES') && cfg) {
      const ronda = rondasDeLaLlave(definicionDe(origen), cfg.cuadro).rondas[e.ronda - 1];
      if (ronda) base = Math.max(base, origen.baseFecha + ronda.fecha + (ronda.idaYVuelta ? 1 : 0));
      continue;
    }
    base = Math.max(base, ...t.deFase(origen.id).map((p) => p.fecha));
  }
  return base;
}

export async function vistaDeFases(tx: Tx, torneoId: string) {
  const t = await cargarTorneo(tx, torneoId);
  const [equipos, canchas] = await enSerie([
    () => equiposDelTorneo(tx, torneoId),
    () => tx.cancha.findMany({ include: { sede: true } }),
  ]);
  const inscriptos = equipos.filter((e) => e.inscripcion === 'CONFIRMADA').map((e) => e.id);
  const nombre = new Map(equipos.map((e) => [e.id, e.nombre]));
  const lugar = new Map(canchas.map((x) => [x.id, `${x.sede.nombre} · ${x.nombre}`]));
  const n = (id: string | undefined | null) => (id ? (nombre.get(id) ?? '—') : '—');
  return {
    torneoId,
    fases: t.fases.map((f) => {
      const def = definicionDe(f);
      const partidos = t
        .deFase(f.id)
        .sort((a, b) => a.fecha - b.fecha || (a.inicio?.getTime() ?? 0) - (b.inicio?.getTime() ?? 0));
      const entradas =
        f.estado === 'PENDIENTE' ? resolverEntradas(t.formato, f.clave, inscriptos, t.resultados) : null;
      const cfg = llaveDe(f);
      let llave = null;
      if (cfg) {
        const r = resolverLlaveDeFase(def, cfg.cuadro, piernasPorCruce(partidos));
        const etiqueta = new Map(
          r.llave.rondas.flatMap((ro) =>
            ro.partidos.map((p, i) => [p.clave, `Ganador de ${ro.nombre.toLowerCase()} ${i + 1}`] as const),
          ),
        );
        llave = {
          rondas: r.resuelta.rondas.map((ro) => {
            const prog = r.rondas.find((x) => x.numero === ro.numero)!;
            return {
              numero: ro.numero,
              nombre: ro.nombre,
              idaYVuelta: prog.idaYVuelta,
              partidos: ro.partidos.map((s) => {
                const piernas = partidos
                  .filter((p) => cruceDeClave(p.clave) === s.clave)
                  .sort((a, b) => (a.pierna ?? 1) - (b.pierna ?? 1));
                const proxima = piernas.find((p) => !cerrado(p.estado)) ?? piernas.at(-1);
                const lado = (o: (typeof s)['local'], id: string | undefined) =>
                  id ? n(id) : o.tipo === 'ganador' ? (etiqueta.get(o.de) ?? 'A definir') : '—';
                const definida = s.estado === 'DEFINIDO' || s.estado === 'EMPATE_SIN_DEFINIR';
                return {
                  clave: s.clave,
                  estado: s.estado,
                  partidoId: proxima?.id ?? null,
                  localId: s.localId ?? null,
                  visitanteId: s.visitanteId ?? null,
                  local: lado(s.local, s.localId),
                  visitante: lado(s.visitante, s.visitanteId),
                  // En ida y vuelta, el global; los penales, los de la vuelta.
                  golesLocal: s.resultado?.golesLocal ?? null,
                  golesVisitante: s.resultado?.golesVisitante ?? null,
                  penalesLocal: s.resultado?.penalesLocal ?? null,
                  penalesVisitante: s.resultado?.penalesVisitante ?? null,
                  ganadorId: s.ganadorId ?? null,
                  partidoEstado: definida
                    ? s.resultado?.ganadorId
                      ? 'WO'
                      : 'FINALIZADO'
                    : (proxima?.estado ?? null),
                  inicio: proxima?.inicio ?? null,
                  cancha: proxima?.canchaId ? (lugar.get(proxima.canchaId) ?? null) : null,
                  piernas: piernas.map((p) => ({
                    id: p.id,
                    pierna: p.pierna ?? 1,
                    local: n(p.localId),
                    visitante: n(p.visitanteId),
                    golesLocal: p.golesLocal,
                    golesVisitante: p.golesVisitante,
                    penalesLocal: p.penalesLocal,
                    penalesVisitante: p.penalesVisitante,
                    estado: p.estado,
                    inicio: p.inicio,
                  })),
                };
              }),
            };
          }),
          campeon: r.campeonId ? { id: r.campeonId, nombre: n(r.campeonId) } : null,
        };
      }
      const tablas = t.resultados[f.clave]?.tablas ?? [];
      // Lo que se espera de la fase según el formato (para mostrarla antes de generarla).
      const previstos = equiposPorFase(t.formato, t.torneo.cupo)[f.clave] ?? 0;
      return {
        id: f.id,
        clave: f.clave,
        orden: f.orden,
        nombre: f.nombre,
        tipo: def.tipo,
        estado: f.estado,
        inicio: def.inicio,
        entradas: def.entradas.map((e) => describirEntrada(e, t.formato, t.torneo.cupo)),
        idaYVuelta: def.tipo === 'ELIMINACION' ? def.idaYVuelta : null,
        equipos: f.equipoIds.length || (entradas?.ok ? entradas.equipoIds.length : 0),
        previstos,
        rondasPrevistas:
          def.tipo === 'ELIMINACION'
            ? rondasDeEliminacion(def, previstos).map((r) => ({
                nombre: r.nombre,
                idaYVuelta: r.idaYVuelta,
                partidos: r.partidos,
              }))
            : [],
        puedeGenerar: f.estado === 'PENDIENTE' && !!entradas?.ok,
        motivo: entradas && !entradas.ok ? entradas.motivo : null,
        jugados: partidos.filter((p) => cerrado(p.estado)).length,
        grupos: gruposDe(f).map((g, i) => ({
          grupo: g.grupo,
          tabla: (tablas[i] ?? []).map((fila) => ({ ...fila, equipo: n(fila.equipoId) })),
        })),
        llave,
        partidos: partidos.map((p) => ({
          id: p.id,
          fecha: p.fecha - f.baseFecha,
          grupo: p.grupo,
          ronda: p.ronda,
          pierna: p.pierna,
          inicio: p.inicio,
          estado: p.estado,
          local: n(p.localId),
          visitante: n(p.visitanteId),
          golesLocal: p.golesLocal,
          golesVisitante: p.golesVisitante,
          penalesLocal: p.penalesLocal,
          penalesVisitante: p.penalesVisitante,
          cancha: p.canchaId ? (lugar.get(p.canchaId) ?? null) : null,
        })),
      };
    }),
  };
}

@Controller('torneos')
export class FasesController {
  constructor(private readonly s: FasesService) {}

  @Post('flexible')
  @Permiso('torneo.escribir')
  crear(@Ctx() c: Contexto, @Body(new Zod(crearTorneoFlexibleSchema)) d: CrearTorneoFlexibleInput) {
    return this.s.crear(c, d);
  }

  @Get(':id/fases')
  @Permiso('torneo.leer')
  vista(@Ctx() c: Contexto, @Param('id') id: string) {
    return this.s.vista(c, id);
  }

  @Post(':id/fases/:faseId/generar')
  @Permiso('fixture.escribir')
  generar(
    @Ctx() c: Contexto,
    @Param('id') id: string,
    @Param('faseId') faseId: string,
    @Body(new Zod(generarFaseSchema)) d: GenerarFaseInput,
  ) {
    return this.s.generar(c, id, faseId, d);
  }
}

@Module({ controllers: [FasesController], providers: [FasesService] })
export class FasesModule {}
