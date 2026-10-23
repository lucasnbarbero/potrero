// Llaves (E10): la API solo guarda y orquesta. Las reglas (cuadro, siembra, ganador, penales) viven en @potrero/shared.
import {
  llaveDesdeCuadro,
  type LlaveResuelta,
  type Origen,
  type ResultadoLlave,
  resolverLlave,
  sumarDias,
} from '@potrero/shared';
import { auditar } from '../comun/auditoria.js';
import type { Contexto } from '../comun/http.js';
import { ErrorNegocio } from '../comun/http.js';
import { enSerie, type Tx } from '../db/db.service.js';

/** Lo que se guarda en `Torneo.llave`: el cuadro y cómo programar las rondas a medida que se completan. */
export interface LlaveGuardada {
  /** Lugares del cuadro de arriba hacia abajo; null es un pase libre. */
  cuadro: (string | null)[];
  /** Número de fecha del último partido de la fase previa (0 en una copa). Las rondas siguen a partir de ahí. */
  baseFecha: number;
  programacion: { primerDia: string; diasEntreRondas: number; horarios: string[]; canchaIds: string[] };
}

export function leerLlave(torneo: { llave: unknown }): LlaveGuardada | null {
  return (torneo.llave as LlaveGuardada | null) ?? null;
}

type PartidoDeLlave = {
  clave: string | null;
  estado: string;
  golesLocal: number | null;
  golesVisitante: number | null;
  penalesLocal: number | null;
  penalesVisitante: number | null;
  ganadorWOId: string | null;
};

function resultadosDe(partidos: readonly PartidoDeLlave[]): Record<string, ResultadoLlave> {
  const r: Record<string, ResultadoLlave> = {};
  for (const p of partidos) {
    if (!p.clave || (p.estado !== 'FINALIZADO' && p.estado !== 'WO')) continue;
    r[p.clave] = {
      golesLocal: p.golesLocal ?? 0,
      golesVisitante: p.golesVisitante ?? 0,
      penalesLocal: p.penalesLocal,
      penalesVisitante: p.penalesVisitante,
      ganadorId: p.estado === 'WO' ? p.ganadorWOId : null,
    };
  }
  return r;
}

/** Día, horario y cancha del cruce número `indice` (dentro de su ronda). */
function franjaDe(cfg: LlaveGuardada, ronda: number, indice: number) {
  const horarios = [...cfg.programacion.horarios].sort();
  const canchas = cfg.programacion.canchaIds;
  const dia = sumarDias(cfg.programacion.primerDia, (ronda - 1) * cfg.programacion.diasEntreRondas);
  const hora = horarios[Math.floor(indice / canchas.length)]!;
  return {
    canchaId: canchas[indice % canchas.length]!,
    inicio: new Date(`${dia}T${hora}:00-03:00`),
  };
}

/** Falla con un mensaje claro si alguna ronda tiene más cruces que franjas (horarios × canchas). */
export function validarFranjas(cuadro: (string | null)[], programacion: LlaveGuardada['programacion']) {
  const franjas = programacion.horarios.length * programacion.canchaIds.length;
  for (const ronda of llaveDesdeCuadro(cuadro).rondas)
    if (ronda.partidos.length > franjas)
      throw new ErrorNegocio(
        `${ronda.nombre} tiene ${ronda.partidos.length} partidos y solo hay ${franjas} franjas ` +
          `(${programacion.horarios.length} horarios × ${programacion.canchaIds.length} canchas). Sumá horarios o canchas.`,
      );
}

/**
 * Crea los partidos de la llave que ya tienen a sus dos equipos y todavía no existen.
 * Se llama al generar la llave y cada vez que se cierra un cruce (acta o W.O.): así la llave "se completa sola".
 * Cuando se define la final, el torneo pasa a FINALIZADO.
 */
export async function avanzarLlave(tx: Tx, c: Contexto, torneoId: string) {
  const torneo = await tx.torneo.findUnique({ where: { id: torneoId } });
  const cfg = torneo ? leerLlave(torneo) : null;
  if (!torneo || !cfg) return { creados: 0, campeonId: undefined as string | undefined };
  const llave = llaveDesdeCuadro(cfg.cuadro);
  const partidos = await tx.partido.findMany({ where: { torneoId, fase: 'LLAVE' } });
  const resuelta = resolverLlave(llave, resultadosDe(partidos));
  const existentes = new Set(partidos.map((p) => p.clave));
  const nuevos = resuelta.rondas.flatMap((ronda) =>
    ronda.partidos.flatMap((p, indice) =>
      p.localId && p.visitanteId && !existentes.has(p.clave)
        ? [
            {
              organizacionId: c.organizacionId,
              torneoId,
              fase: 'LLAVE' as const,
              clave: p.clave,
              fecha: cfg.baseFecha + ronda.numero,
              localId: p.localId,
              visitanteId: p.visitanteId,
              ...franjaDe(cfg, ronda.numero, indice),
            },
          ]
        : [],
    ),
  );
  if (nuevos.length) await tx.partido.createMany({ data: nuevos });
  if (resuelta.campeonId && torneo.estado !== 'FINALIZADO') {
    await tx.torneo.update({ where: { id: torneoId }, data: { estado: 'FINALIZADO' } });
    await auditar(tx, c, 'torneo.campeon', 'torneo', torneoId, {
      despues: { campeonId: resuelta.campeonId },
    });
  }
  return { creados: nuevos.length, campeonId: resuelta.campeonId };
}

export interface CruceVista {
  clave: string;
  estado: LlaveResuelta['rondas'][number]['partidos'][number]['estado'];
  partidoId: string | null;
  localId: string | null;
  visitanteId: string | null;
  /** Nombre del equipo o, si todavía no se sabe, "Ganador de Cuartos de final 2". */
  local: string;
  visitante: string;
  golesLocal: number | null;
  golesVisitante: number | null;
  penalesLocal: number | null;
  penalesVisitante: number | null;
  ganadorId: string | null;
  partidoEstado: string | null;
  inicio: Date | null;
  cancha: string | null;
}

export interface LlaveVista {
  rondas: { numero: number; nombre: string; partidos: CruceVista[] }[];
  campeon: { id: string; nombre: string } | null;
}

/** La llave de un torneo lista para mostrar, con nombres, resultados y quién avanza. Nulo si el torneo no tiene llave. */
export async function llaveDelTorneo(tx: Tx, torneoId: string): Promise<LlaveVista | null> {
  const torneo = await tx.torneo.findUnique({ where: { id: torneoId } });
  const cfg = torneo ? leerLlave(torneo) : null;
  if (!cfg) return null;
  const llave = llaveDesdeCuadro(cfg.cuadro);
  const [partidos, equipos] = await enSerie([
    () =>
      tx.partido.findMany({
        where: { torneoId, fase: 'LLAVE' },
        include: { cancha: { include: { sede: true } } },
      }),
    () => tx.equipo.findMany({ where: { id: { in: cfg.cuadro.filter((x): x is string => !!x) } } }),
  ]);
  const resuelta = resolverLlave(llave, resultadosDe(partidos));
  const nombre = new Map(equipos.map((e) => [e.id, e.nombre]));
  const porClave = new Map(partidos.map((p) => [p.clave, p]));
  // "Ganador de Cuartos de final 2": nombre de la ronda y posición dentro de ella.
  const etiqueta = new Map(
    llave.rondas.flatMap((r) =>
      r.partidos.map((p, i) => [p.clave, `Ganador de ${r.nombre.toLowerCase()} ${i + 1}`] as const),
    ),
  );
  const lado = (o: Origen, id: string | undefined) =>
    id ? (nombre.get(id) ?? '—') : o.tipo === 'ganador' ? (etiqueta.get(o.de) ?? 'A definir') : '—';
  return {
    rondas: resuelta.rondas.map((r) => ({
      numero: r.numero,
      nombre: r.nombre,
      partidos: r.partidos.map((p) => {
        const real = porClave.get(p.clave);
        return {
          clave: p.clave,
          estado: p.estado,
          partidoId: real?.id ?? null,
          localId: p.localId ?? null,
          visitanteId: p.visitanteId ?? null,
          local: lado(p.local, p.localId),
          visitante: lado(p.visitante, p.visitanteId),
          golesLocal: real?.golesLocal ?? null,
          golesVisitante: real?.golesVisitante ?? null,
          penalesLocal: real?.penalesLocal ?? null,
          penalesVisitante: real?.penalesVisitante ?? null,
          ganadorId: p.ganadorId ?? null,
          partidoEstado: real?.estado ?? null,
          inicio: real?.inicio ?? null,
          cancha: real?.cancha ? `${real.cancha.sede.nombre} · ${real.cancha.nombre}` : null,
        };
      }),
    })),
    campeon: resuelta.campeonId
      ? { id: resuelta.campeonId, nombre: nombre.get(resuelta.campeonId) ?? '—' }
      : null,
  };
}
