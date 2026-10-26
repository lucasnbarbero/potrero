// Panel del organizador (E18, mock 01): partido en vivo, dinero, partidos de hoy, alertas accionables y sugerencias.
// Junta los datos de la liga con RLS y deja que las reglas puras de @potrero/shared decidan qué mostrar.
import { Controller, Get, Injectable, Module } from '@nestjs/common';
import {
  alertasDelPanel,
  DIAS_PROXIMA_FECHA,
  estadoDeDocumento,
  marcador,
  eventosVigentes,
  minutoDeJuego,
  type Modalidad,
  PLANTEL_MINIMO,
  sugerenciasDelPanel,
  type TipoEvento,
  type TorneoParaSugerir,
} from '@potrero/shared';
import { type Contexto, Ctx } from '../comun/http.js';
import { cuandoDe, hoyEnArgentina } from '../comun/formato.js';
import { DbService, enSerie, type Tx } from '../db/db.service.js';

const ZONA = 'America/Argentina/Buenos_Aires';
const HORA_MS = 3_600_000;
const DIA_MS = 86_400_000;
/** Un partido que empezó hace más de esto y no tiene el acta cerrada cuenta como "acta sin cargar". */
const ACTA_ATRASADA_MS = 2 * HORA_MS;

const diaDeSemana = (d: Date) =>
  new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, weekday: 'long' }).format(d);
/** Días de calendario (en Argentina) entre hoy y la fecha. */
const diasHasta = (d: Date, ahora: Date) =>
  Math.round((Date.parse(hoyEnArgentina(d)) - Date.parse(hoyEnArgentina(ahora))) / DIA_MS);

/** Partidos en juego con su marcador y goleadores: lo que muestra el panel y lo que refresca cada pocos segundos. */
async function partidosEnVivo(tx: Tx, ahora: Date) {
  const vivos = await tx.partido.findMany({
    where: { estado: 'EN_JUEGO' },
    orderBy: { inicio: 'asc' },
    include: { eventos: { orderBy: { creadoEn: 'asc' } }, torneo: true, cancha: true },
  });
  if (!vivos.length) return [];
  const [equipos, jugadores] = await enSerie([
    () =>
      tx.equipo.findMany({
        where: { id: { in: vivos.flatMap((p) => [p.localId, p.visitanteId]) } },
        select: { id: true, nombre: true },
      }),
    () =>
      tx.jugador.findMany({
        where: {
          id: { in: vivos.flatMap((p) => p.eventos.flatMap((e) => (e.jugadorId ? [e.jugadorId] : []))) },
        },
        select: { id: true, apellido: true },
      }),
  ]);
  const ne = new Map(equipos.map((e) => [e.id, e.nombre]));
  const nj = new Map(jugadores.map((j) => [j.id, j.apellido]));
  return vivos.map((p) => {
    const eventos = p.eventos.map((e) => ({ ...e, tipo: e.tipo as TipoEvento }));
    const goles = eventosVigentes(eventos).filter((e) => e.tipo === 'GOL' || e.tipo === 'GOL_EN_CONTRA');
    return {
      id: p.id,
      torneo: p.torneo.nombre,
      fecha: p.fecha,
      fase: p.fase,
      cancha: p.cancha?.nombre ?? null,
      minuto: minutoDeJuego(p.inicio, ahora),
      local: { id: p.localId, nombre: ne.get(p.localId) ?? '—' },
      visitante: { id: p.visitanteId, nombre: ne.get(p.visitanteId) ?? '—' },
      marcador: marcador(eventos, p.localId, p.visitanteId),
      goles: goles.map((e) => ({
        minuto: e.minuto,
        jugador: (e.jugadorId && nj.get(e.jugadorId)) || 'Sin nombre',
        enContra: e.tipo === 'GOL_EN_CONTRA',
        // Lado del marcador que sumó el gol.
        lado: (e.tipo === 'GOL') === (e.equipoId === p.localId) ? ('LOCAL' as const) : ('VISITANTE' as const),
      })),
    };
  });
}

@Injectable()
export class PanelService {
  constructor(private readonly db: DbService) {}

  vivo(c: Contexto) {
    return this.db.enOrg(c.organizacionId, (tx) => partidosEnVivo(tx, new Date()));
  }

  tablero(c: Contexto) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const ahora = new Date();
      const hoy = hoyEnArgentina(ahora);
      const [
        torneos,
        inscripciones,
        pagos,
        cargos,
        partidos,
        vivo,
        expedientes,
        noPuedo,
        fallidos,
        asentados,
        avisos,
        documentos,
      ] = await enSerie([
        () =>
          tx.torneo.findMany({
            where: { estado: { in: ['INSCRIPCION', 'EN_CURSO'] } },
            orderBy: { creadoEn: 'asc' },
          }),
        () =>
          tx.inscripcion.findMany({
            where: { estado: { not: 'BAJA' }, torneo: { estado: { in: ['INSCRIPCION', 'EN_CURSO'] } } },
            include: {
              equipo: { select: { id: true, nombre: true, _count: { select: { plantel: true } } } },
            },
            orderBy: { creadoEn: 'asc' },
          }),
        () =>
          tx.pago.findMany({
            where: { estado: 'APROBADO' },
            select: {
              id: true,
              monto: true,
              comisionPlataforma: true,
              metodo: true,
              acreditadoEn: true,
              creadoEn: true,
            },
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
            where: { torneo: { estado: { in: ['INSCRIPCION', 'EN_CURSO'] } } },
            select: {
              id: true,
              torneoId: true,
              fecha: true,
              localId: true,
              visitanteId: true,
              inicio: true,
              estado: true,
              arbitroId: true,
              cancha: { select: { nombre: true } },
            },
            orderBy: [{ inicio: 'asc' }],
          }),
        () => partidosEnVivo(tx, ahora),
        () =>
          tx.expediente.findMany({
            where: { estado: 'ABIERTO' },
            orderBy: { creadoEn: 'desc' },
            select: { id: true, tipo: true, jugadorId: true, equipoId: true, partidoId: true },
          }),
        // Capitanes que respondieron "No puedo" a una reprogramación: hay que resolverlo a mano.
        () =>
          tx.mensaje.findMany({
            where: { respuesta: 'NO_PUEDO', contingenciaId: { not: null } },
            select: { contingenciaId: true },
          }),
        () =>
          tx.mensaje.count({
            where: { estado: 'FALLIDO', creadoEn: { gte: new Date(ahora.getTime() - 7 * DIA_MS) } },
          }),
        // Pagos que ya tienen su asiento en la caja (ADR-023): el resto está sin conciliar.
        () => tx.asiento.findMany({ where: { clave: { startsWith: 'pago:' } }, select: { clave: true } }),
        () =>
          tx.difusion.findMany({
            where: { plantilla: 'FIXTURE_PUBLICADO' },
            select: { segmento: true, creadoEn: true },
          }),
        () =>
          tx.documentoJugador.findMany({
            where: {
              jugador: {
                plantel: {
                  some: {
                    equipo: {
                      inscripciones: {
                        some: {
                          estado: { not: 'BAJA' },
                          torneo: { estado: { in: ['INSCRIPCION', 'EN_CURSO'] } },
                        },
                      },
                    },
                  },
                },
              },
            },
            select: { jugadorId: true, tipo: true, estado: true, vencimiento: true },
          }),
      ]);

      // Nombres de equipos y jugadores que aparecen en partidos y expedientes.
      const idsEquipo = new Set([
        ...partidos.flatMap((p) => [p.localId, p.visitanteId]),
        ...expedientes.map((e) => e.equipoId),
      ]);
      const [equipos, jugadoresExp] = await enSerie([
        () =>
          tx.equipo.findMany({ where: { id: { in: [...idsEquipo] } }, select: { id: true, nombre: true } }),
        () =>
          tx.jugador.findMany({
            where: { id: { in: expedientes.flatMap((e) => (e.jugadorId ? [e.jugadorId] : [])) } },
            select: { id: true, nombre: true, apellido: true },
          }),
      ]);
      const ne = new Map(equipos.map((e) => [e.id, e.nombre]));
      const nj = new Map(jugadoresExp.map((j) => [j.id, `${j.nombre[0]}. ${j.apellido}`]));
      const nombre = (id: string) => ne.get(id) ?? '—';
      const fechaDe = new Map(partidos.map((p) => [p.id, p.fecha]));

      // ── Dinero ──
      const deudores = cargos
        .map((x) => ({
          equipo: x.inscripcion.equipo.nombre,
          torneoId: x.inscripcion.torneoId,
          debe: x.monto - x.pagos.reduce((s, p) => s + p.monto, 0),
          vence: x.vence,
          vencido: !!x.vence && hoyEnArgentina(x.vence) < hoy,
        }))
        .filter((d) => d.debe > 0)
        .sort((a, b) => Number(b.vencido) - Number(a.vencido) || b.debe - a.debe);
      const cobrado = pagos.reduce((s, p) => s + p.monto, 0);
      const comisiones = pagos.reduce((s, p) => s + p.comisionPlataforma, 0);
      const pendiente = deudores.reduce((s, d) => s + d.debe, 0);
      const proximoVence = deudores
        .map((d) => d.vence)
        .filter((v): v is Date => !!v && hoyEnArgentina(v) >= hoy)
        .sort((a, b) => a.getTime() - b.getTime())[0];

      // Cobrado acumulado de los últimos 30 días (un punto por día), para la línea del tile.
      const DIAS_SERIE = 30;
      const desdeSerie = new Date(ahora.getTime() - (DIAS_SERIE - 1) * DIA_MS);
      const previo = pagos
        .filter((p) => hoyEnArgentina(p.acreditadoEn ?? p.creadoEn) < hoyEnArgentina(desdeSerie))
        .reduce((s, p) => s + p.monto, 0);
      let acumulado = previo;
      const serie = Array.from({ length: DIAS_SERIE }, (_, i) => {
        const dia = hoyEnArgentina(new Date(desdeSerie.getTime() + i * DIA_MS));
        acumulado += pagos
          .filter((p) => hoyEnArgentina(p.acreditadoEn ?? p.creadoEn) === dia)
          .reduce((s, p) => s + p.monto, 0);
        return { dia, cobrado: acumulado };
      });

      // ── Partidos de hoy ──
      const deHoy = partidos.filter((p) => p.inicio && hoyEnArgentina(p.inicio) === hoy);

      // ── Alertas ──
      const conAsiento = new Set(asentados.map((a) => a.clave));
      const sinConciliar = pagos.filter((p) => !conAsiento.has(`pago:${p.id}`));
      const porJugador = new Map<string, typeof documentos>();
      for (const d of documentos) porJugador.set(d.jugadorId, [...(porJugador.get(d.jugadorId) ?? []), d]);
      let vencidos = 0;
      let porVencer = 0;
      for (const docs of porJugador.values()) {
        const estados = (['DNI', 'APTO_FISICO'] as const).map((t) => estadoDeDocumento(docs, t, ahora));
        if (estados.includes('VENCIDO')) vencidos++;
        else if (estados.includes('POR_VENCER')) porVencer++;
      }
      const actasSinCargar = partidos.filter(
        (p) =>
          (p.estado === 'PROGRAMADO' || p.estado === 'EN_JUEGO') &&
          p.inicio &&
          p.inicio.getTime() < ahora.getTime() - ACTA_ATRASADA_MS,
      );
      const sinArbitro = partidos.filter(
        (p) =>
          p.estado === 'PROGRAMADO' &&
          !p.arbitroId &&
          p.inicio &&
          p.inicio >= ahora &&
          p.inicio.getTime() < ahora.getTime() + DIAS_PROXIMA_FECHA * DIA_MS,
      );
      const suspendidos = expedientes.filter((e) => e.tipo === 'JUGADOR_NO_HABILITADO');
      const alertas = alertasDelPanel({
        suspendidosQueJugaron: suspendidos.map((e) => ({
          expedienteId: e.id,
          jugador: (e.jugadorId && nj.get(e.jugadorId)) || 'Jugador',
          equipo: nombre(e.equipoId),
          fecha: (e.partidoId && fechaDe.get(e.partidoId)) || 0,
        })),
        actasSinCargar: actasSinCargar.map((p) => ({
          partidoId: p.id,
          local: nombre(p.localId),
          visitante: nombre(p.visitanteId),
          fecha: p.fecha,
        })),
        sinArbitro: sinArbitro.map((p) => ({
          partidoId: p.id,
          local: nombre(p.localId),
          visitante: nombre(p.visitanteId),
          cuando: cuandoDe(p.inicio!),
        })),
        documentos: { vencidos, porVencer },
        pagosSinConciliar: {
          cantidad: sinConciliar.length,
          monto: sinConciliar.reduce((s, p) => s + p.monto, 0),
        },
        noPuedo: noPuedo.length
          ? { contingenciaId: noPuedo[0]!.contingenciaId!, cantidad: noPuedo.length }
          : null,
        mensajesFallidos: fallidos,
      });

      // ── Torneos y sugerencias ──
      const resumenTorneos = torneos.map((t) => {
        const ins = inscripciones.filter((i) => i.torneoId === t.id);
        const delTorneo = partidos.filter((p) => p.torneoId === t.id);
        const jugadas = delTorneo.filter((p) => p.estado === 'FINALIZADO' || p.estado === 'WO');
        const fechas = Math.max(0, ...delTorneo.map((p) => p.fecha));
        const fechaActual = Math.max(0, ...jugadas.map((p) => p.fecha));
        const minimo = PLANTEL_MINIMO[t.modalidad as Modalidad];
        const deudoresT = deudores.filter((d) => d.torneoId === t.id);
        // Próxima fecha: la del primer partido programado de hoy en adelante.
        const proximo = delTorneo.find(
          (p) => p.estado === 'PROGRAMADO' && p.inicio && hoyEnArgentina(p.inicio) >= hoy,
        );
        const deLaFecha = proximo
          ? delTorneo.filter((p) => p.fecha === proximo.fecha && p.estado === 'PROGRAMADO')
          : [];
        const ultimaJugada = jugadas.reduce<Date | null>(
          (m, p) => (p.inicio && (!m || p.inicio > m) ? p.inicio : m),
          null,
        );
        const avisada = avisos.some(
          (a) =>
            (a.segmento as { torneoId?: string } | null)?.torneoId === t.id &&
            (!ultimaJugada || a.creadoEn > ultimaJugada),
        );
        const sugerir: TorneoParaSugerir = {
          id: t.id,
          nombre: t.nombre,
          estado: t.estado,
          cupo: t.cupo,
          inscriptos: ins.length,
          partidos: delTorneo.length,
          plantelesIncompletos: ins.filter((i) => i.equipo._count.plantel < minimo).length,
          plantelMinimo: minimo,
          deudores: deudoresT.length,
          deuda: deudoresT.reduce((s, d) => s + d.debe, 0),
          venceInscripcionEnDias: t.venceInscripcion ? diasHasta(t.venceInscripcion, ahora) : null,
          proximaFecha: proximo
            ? {
                numero: proximo.fecha,
                enDias: diasHasta(proximo.inicio!, ahora),
                dia: diaDeSemana(proximo.inicio!),
                sinArbitro: deLaFecha.filter((p) => !p.arbitroId).length,
                capitanes: new Set(deLaFecha.flatMap((p) => [p.localId, p.visitanteId])).size,
                avisada,
              }
            : null,
        };
        return {
          sugerir,
          tile: {
            id: t.id,
            nombre: t.nombre,
            modalidad: t.modalidad,
            formato: t.formato,
            estado: t.estado,
            inscriptos: ins.length,
            cupo: t.cupo,
            fechaActual,
            fechas,
          },
        };
      });
      const sugerencias = sugerenciasDelPanel(
        { torneos: resumenTorneos.map((t) => t.sugerir), expedientesAbiertos: expedientes.length },
        4,
      );

      // Equipos distintos en torneos activos (un equipo puede jugar varios).
      const equiposActivos = new Map(inscripciones.map((i) => [i.equipo.id, i.equipo.nombre]));
      const nuevos = new Set(
        inscripciones
          .filter((i) => i.creadoEn.getTime() > ahora.getTime() - 7 * DIA_MS)
          .map((i) => i.equipo.id),
      );

      return {
        hoy,
        vivo,
        dinero: {
          cobrado,
          comisiones,
          neto: cobrado - comisiones,
          pendiente,
          online: pagos.filter((p) => p.metodo === 'MERCADO_PAGO').reduce((s, p) => s + p.monto, 0),
          porcentajeCobrado: cobrado + pendiente ? Math.round((cobrado / (cobrado + pendiente)) * 100) : 100,
          proximoVence,
          serie,
        },
        deudores: deudores.map(({ vence, ...d }) => d),
        equipos: {
          total: equiposActivos.size,
          nuevos: nuevos.size,
          torneos: torneos.length,
          muestra: [...equiposActivos.values()].slice(0, 4),
        },
        hoyPartidos: {
          total: deHoy.length,
          enJuego: deHoy.filter((p) => p.estado === 'EN_JUEGO').length,
          sinArbitro: deHoy.filter((p) => p.estado === 'PROGRAMADO' && !p.arbitroId).length,
          lista: deHoy
            .filter((p) => p.estado === 'PROGRAMADO')
            .slice(0, 3)
            .map((p) => ({
              id: p.id,
              inicio: p.inicio,
              local: nombre(p.localId),
              visitante: nombre(p.visitanteId),
            })),
        },
        proximos: partidos
          .filter((p) => p.estado === 'PROGRAMADO' && p.inicio && p.inicio >= ahora)
          .slice(0, 5)
          .map((p) => ({
            id: p.id,
            torneoId: p.torneoId,
            inicio: p.inicio,
            local: nombre(p.localId),
            visitante: nombre(p.visitanteId),
            cancha: p.cancha?.nombre ?? null,
            sinArbitro: !p.arbitroId,
          })),
        torneos: resumenTorneos.map((t) => t.tile),
        alertas,
        sugerencias,
      };
    });
  }
}

@Controller('panel')
export class TableroController {
  constructor(private readonly s: PanelService) {}

  @Get('tablero')
  tablero(@Ctx() c: Contexto) {
    return this.s.tablero(c);
  }

  /** Solo los partidos en juego: la web lo consulta cada pocos segundos para el marcador en vivo. */
  @Get('vivo')
  vivo(@Ctx() c: Contexto) {
    return this.s.vivo(c);
  }
}

@Module({ controllers: [TableroController], providers: [PanelService] })
export class PanelModule {}
