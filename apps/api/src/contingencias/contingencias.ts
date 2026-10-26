// Contingencias (E17): lluvia, cancha caída, equipos que no llegan. Se calcula una propuesta sin tocar nada, se aplica
// con un clic y se avisa a los capitanes con botones "Confirmo" / "No puedo". Las reglas puras viven en @potrero/shared.
import { Body, Controller, Get, HttpStatus, Injectable, Module, Param, Post } from '@nestjs/common';
import {
  type Alcance,
  contingenciaSchema,
  DATOS,
  type ContingenciaInput,
  diaArgentina,
  equiposAfectados,
  estimarEnvio,
  evaluarTope,
  type Movimiento,
  type PartidoCalendario,
  type Plan,
  PLANTILLAS,
  planificarEnvio,
  proponerReprogramacion,
  renderizar,
} from '@potrero/shared';
import { auditar } from '../comun/auditoria.js';
import { cuandoDe } from '../comun/formato.js';
import { type Contexto, Ctx, ErrorNegocio, noEncontrado, Permiso, Zod } from '../comun/http.js';
import { DbService, enSerie, type Tx } from '../db/db.service.js';
import { MensajeriaModule, MensajeriaService } from '../mensajeria/mensajeria.js';
import { sincronizarCobrosPorFecha } from '../cobros/por-fecha.js';

// ───────────── Pronóstico del clima ─────────────

export interface AlertaClima {
  /** Día del mal tiempo (AAAA-MM-DD). */
  dia: string;
  titulo: string;
  probabilidad: number;
  /** Ventana horaria del mal tiempo, en horas locales. */
  desdeHora: number;
  hastaHora: number;
  actualizadoHaceMin: number;
}

/**
 * El pronóstico viene de un proveedor externo (a elegir, E17-06). Hasta entonces hay uno simulado: marca como "lluvia fuerte"
 * el día de los próximos 7 con más partidos, así la demo y las pruebas tienen siempre una alerta para mostrar.
 */
export interface ProveedorClima {
  alerta(partidos: readonly { inicio: Date }[], ahora: Date): AlertaClima | null;
}

export class PronosticoSimulado implements ProveedorClima {
  alerta(partidos: readonly { inicio: Date }[], ahora: Date): AlertaClima | null {
    const hasta = ahora.getTime() + DATOS.contingencias.pronosticoDias * 86_400_000;
    const proximos = partidos.filter(
      (p) => p.inicio.getTime() > ahora.getTime() && p.inicio.getTime() <= hasta,
    );
    if (proximos.length === 0) return null;
    const porDia = Map.groupBy(proximos, (p) => diaArgentina(p.inicio.toISOString()));
    const [dia, delDia] = [...porDia].sort(
      (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
    )[0]!;
    const horas = delDia.map((p) => Number(cuandoDe(p.inicio).slice(-5, -3)));
    return {
      dia,
      titulo: 'Lluvia fuerte',
      probabilidad: 85,
      desdeHora: Math.min(...horas) - 1,
      hastaHora: Math.max(...horas) + 1,
      actualizadoHaceMin: 12,
    };
  }
}

// ───────────── Servicio ─────────────

const aCalendario = (p: {
  id: string;
  inicio: Date | null;
  canchaId: string | null;
  localId: string;
  visitanteId: string;
}): PartidoCalendario => ({
  id: p.id,
  inicio: p.inicio!.toISOString(),
  canchaId: p.canchaId,
  localId: p.localId,
  visitanteId: p.visitanteId,
});

@Injectable()
export class ContingenciasService {
  private readonly clima: ProveedorClima = new PronosticoSimulado();

  constructor(
    private readonly db: DbService,
    private readonly mensajeria: MensajeriaService,
  ) {}

  /** Alerta de clima con lo que afecta: partidos, torneos y jugadores. Nulo si no hay nada a la vista. */
  alertaDeClima(c: Contexto, ahora: Date = new Date()) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const programados = await tx.partido.findMany({
        where: { estado: 'PROGRAMADO', inicio: { not: null } },
        select: { id: true, inicio: true, localId: true, visitanteId: true, torneoId: true },
      });
      const alerta = this.clima.alerta(
        programados.map((p) => ({ inicio: p.inicio! })),
        ahora,
      );
      if (!alerta) return null;
      const afectados = programados.filter((p) => diaArgentina(p.inicio!.toISOString()) === alerta.dia);
      const equipos = equiposAfectados(afectados);
      const jugadores = await tx.plantelJugador.count({ where: { equipoId: { in: equipos } } });
      return {
        ...alerta,
        partidos: afectados.length,
        torneos: new Set(afectados.map((p) => p.torneoId)).size,
        jugadores,
      };
    });
  }

  private async afectados(tx: Tx, a: Alcance) {
    const base = { estado: 'PROGRAMADO' as const, inicio: { not: null } };
    if (a.tipo === 'PARTIDOS') {
      const ps = await tx.partido.findMany({ where: { id: { in: a.partidoIds }, ...base } });
      if (ps.length !== new Set(a.partidoIds).size)
        throw new ErrorNegocio('Alguno de los partidos ya se jugó o no tiene horario.');
      return ps;
    }
    if (a.tipo === 'FECHA')
      return tx.partido.findMany({ where: { torneoId: a.torneoId, fecha: a.fecha, ...base } });
    const desde = new Date(`${a.dia}T00:00:00-03:00`);
    const hasta = new Date(desde.getTime() + 86_400_000);
    return tx.partido.findMany({
      where: { ...base, inicio: { gte: desde, lt: hasta }, ...(a.torneoId ? { torneoId: a.torneoId } : {}) },
    });
  }

  /** Calcula todo lo que pasaría, sin guardar nada: movimientos, conflictos, a quién se avisa y cuánto cuesta. */
  private async calcular(tx: Tx, c: Contexto, d: ContingenciaInput) {
    const afectados = await this.afectados(tx, d.alcance);
    if (afectados.length === 0) throw new ErrorNegocio('No hay partidos programados para ese alcance.');
    const ids = new Set(afectados.map((p) => p.id));
    const resto = (
      await tx.partido.findMany({ where: { estado: 'PROGRAMADO', inicio: { not: null } } })
    ).filter((p) => !ids.has(p.id));
    let accion = d.accion;
    if (accion.tipo === 'CAMBIAR_CANCHA') {
      const libres = await tx.cancha.findMany({
        where: { id: { in: accion.canchaIds }, bloqueada: false },
        select: { id: true },
      });
      if (libres.length === 0) throw new ErrorNegocio('Las canchas elegidas no existen o están bloqueadas.');
      accion = { tipo: 'CAMBIAR_CANCHA', canchaIds: libres.map((x) => x.id) };
    }
    let propuesta;
    try {
      propuesta = proponerReprogramacion(afectados.map(aCalendario), resto.map(aCalendario), accion);
    } catch (e) {
      throw new ErrorNegocio((e as Error).message);
    }
    const [equipos, canchas, torneos, org] = await enSerie([
      () =>
        tx.equipo.findMany({
          where: { id: { in: equiposAfectados(afectados) } },
        }),
      () =>
        tx.cancha.findMany({
          where: {
            id: {
              in: [
                ...afectados.flatMap((p) => (p.canchaId ? [p.canchaId] : [])),
                ...propuesta.movimientos.flatMap((m) => (m.a.canchaId ? [m.a.canchaId] : [])),
              ],
            },
          },
          include: { sede: true },
        }),
      () => tx.torneo.findMany({ where: { id: { in: afectados.map((p) => p.torneoId) } } }),
      () => tx.organizacion.findUniqueOrThrow({ where: { id: c.organizacionId } }),
    ]);
    const nombreEquipo = new Map(equipos.map((e) => [e.id, e]));
    const nombreCancha = new Map(canchas.map((x) => [x.id, `${x.sede.nombre} · ${x.nombre}`]));
    const torneoDe = new Map(torneos.map((t) => [t.id, t.nombre]));
    const partido = new Map(afectados.map((p) => [p.id, p]));
    const etiqueta = (id: string) => {
      const p = partido.get(id) ?? resto.find((x) => x.id === id)!;
      return `${nombreEquipo.get(p.localId)?.nombre ?? '—'} vs ${nombreEquipo.get(p.visitanteId)?.nombre ?? '—'}`;
    };
    const jugadores = await tx.plantelJugador.count({
      where: { equipoId: { in: equipos.map((e) => e.id) } },
    });
    return { afectados, propuesta, nombreEquipo, nombreCancha, torneoDe, etiqueta, jugadores, org, resto };
  }

  private vista(r: Awaited<ReturnType<ContingenciasService['calcular']>>) {
    const lugar = (l: { inicio: string; canchaId: string | null }) => ({
      inicio: l.inicio,
      cancha: l.canchaId ? (r.nombreCancha.get(l.canchaId) ?? '—') : null,
    });
    const p = (id: string) => r.afectados.find((x) => x.id === id)!;
    return {
      movimientos: r.propuesta.movimientos.map((m) => ({
        partidoId: m.partidoId,
        torneo: r.torneoDe.get(p(m.partidoId).torneoId) ?? '—',
        local: r.nombreEquipo.get(p(m.partidoId).localId)?.nombre ?? '—',
        visitante: r.nombreEquipo.get(p(m.partidoId).visitanteId)?.nombre ?? '—',
        de: lugar(m.de),
        a: lugar(m.a),
      })),
      conflictos: r.propuesta.conflictos.map((x) => ({
        tipo: x.tipo,
        mensaje: x.mensaje,
        partido: r.etiqueta(x.partidoId),
        con: r.etiqueta(x.conPartidoId),
      })),
      sinResolver: r.propuesta.sinResolver.map((x) => ({
        partido: r.etiqueta(x.partidoId),
        motivo: x.motivo,
      })),
    };
  }

  /** Qué recibe cada capitán de los equipos con un partido movido. */
  private avisos(r: Awaited<ReturnType<ContingenciasService['calcular']>>) {
    const lista: { equipoId: string; partidoId: string; rival: string; movimiento: Movimiento }[] = [];
    for (const m of r.propuesta.movimientos) {
      const p = r.afectados.find((x) => x.id === m.partidoId)!;
      for (const [propio, rival] of [
        [p.localId, p.visitanteId],
        [p.visitanteId, p.localId],
      ] as const)
        lista.push({
          equipoId: propio,
          partidoId: p.id,
          rival: r.nombreEquipo.get(rival)?.nombre ?? '—',
          movimiento: m,
        });
    }
    return lista;
  }

  propuesta(c: Contexto, d: ContingenciaInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const r = await this.calcular(tx, c, d);
      const avisos = this.avisos(r);
      const receptores = avisos.map((a) =>
        this.mensajeria.receptorDe(r.nombreEquipo.get(a.equipoId)!, {
          id: r.org.id,
          nombre: r.org.nombre,
          slug: r.org.slug,
          plan: r.org.plan as Plan,
        }),
      );
      const plan = planificarEnvio(receptores, d.canal, 'TRANSACCIONAL');
      const estimacion = estimarEnvio(plan.entregas, 'UTILIDAD');
      const usados = await this.mensajeria.usadosWhatsapp(tx, new Date());
      const primero = avisos[0];
      const vista = this.vista(r);
      let ejemplo: string | null = null;
      if (primero) {
        const m = vista.movimientos.find((x) => x.partidoId === primero.partidoId)!;
        const e = r.nombreEquipo.get(primero.equipoId)!;
        ejemplo = renderizar(PLANTILLAS.CONTINGENCIA!.cuerpo, {
          liga: r.org.nombre,
          motivo: d.motivo,
          cuando: cuandoDe(new Date(m.a.inicio)),
          cancha: m.a.cancha ?? 'cancha a confirmar',
          rival: primero.rival,
          link_confirmacion: '…/c/tu-link',
          capitán: e.capitanNombre ?? 'capitán',
        }).texto;
      }
      return {
        ...vista,
        resumen: {
          partidos: r.afectados.length,
          mueve: r.propuesta.movimientos.length,
          equipos: equiposAfectados(r.afectados).length,
          jugadores: r.jugadores,
          canchas: new Set(r.afectados.flatMap((p) => (p.canchaId ? [p.canchaId] : []))).size,
        },
        aviso: {
          mensajes: plan.entregas.length,
          porCanal: estimacion.porCanal,
          omitidos: plan.omitidos.length,
          costoUsd: estimacion.costoUsd,
          costoArs: estimacion.costoArs,
          tope: evaluarTope(r.org.plan as Plan, usados, estimacion.porCanal.WHATSAPP),
          ejemplo,
        },
      };
    });
  }

  /** Aplica los movimientos, registra la contingencia y avisa a los capitanes. Todo o nada. */
  aplicar(c: Contexto, d: ContingenciaInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const r = await this.calcular(tx, c, d);
      if (r.propuesta.movimientos.length === 0)
        throw new ErrorNegocio('Con esa acción no se puede mover ningún partido.');
      if (r.propuesta.conflictos.length > 0 && !d.aceptarConflictos)
        throw new ErrorNegocio(
          `La propuesta tiene ${r.propuesta.conflictos.length} conflicto${r.propuesta.conflictos.length > 1 ? 's' : ''}. Revisalos y confirmá que querés seguir.`,
          HttpStatus.CONFLICT,
        );
      const org = {
        id: r.org.id,
        nombre: r.org.nombre,
        slug: r.org.slug,
        plan: r.org.plan as Plan,
      };
      const avisos = this.avisos(r);
      const receptores = avisos.map((a) => ({
        aviso: a,
        receptor: this.mensajeria.receptorDe(r.nombreEquipo.get(a.equipoId)!, org),
      }));
      const plan = planificarEnvio(
        receptores.map((x) => x.receptor),
        d.canal,
        'TRANSACCIONAL',
      );
      const estimacion = estimarEnvio(plan.entregas, 'UTILIDAD');
      const tope = evaluarTope(
        org.plan,
        await this.mensajeria.usadosWhatsapp(tx, new Date()),
        estimacion.porCanal.WHATSAPP,
      );
      if (tope.excedente > 0)
        throw new ErrorNegocio(
          `El aviso usa ${estimacion.porCanal.WHATSAPP} WhatsApp y te quedan ${tope.restantes} este mes en tu plan. Elegí email para avisar.`,
        );

      const vista = this.vista(r);
      const contingencia = await tx.contingencia.create({
        data: {
          organizacionId: c.organizacionId,
          motivo: d.motivo,
          accion: d.accion.tipo,
          aplicadaPorId: c.usuarioId,
          detalle: {
            alcance: d.alcance,
            accion: d.accion,
            movimientos: vista.movimientos,
            conflictosAceptados: vista.conflictos,
            sinResolver: vista.sinResolver,
          },
        },
      });
      for (const m of r.propuesta.movimientos)
        await tx.partido.update({
          where: { id: m.partidoId },
          data: { inicio: new Date(m.a.inicio), canchaId: m.a.canchaId },
        });
      await auditar(tx, c, 'contingencia.aplicar', 'contingencia', contingencia.id, {
        despues: { motivo: d.motivo, accion: d.accion, partidos: r.propuesta.movimientos.length },
      });
      // El vencimiento de la cuota por fecha acompaña al partido movido (E06-20).
      const torneosMovidos = await tx.partido.findMany({
        where: { id: { in: r.propuesta.movimientos.map((m) => m.partidoId) } },
        distinct: ['torneoId'],
        select: { torneoId: true },
      });
      for (const t of torneosMovidos) await sincronizarCobrosPorFecha(tx, c.organizacionId, t.torneoId);

      let avisados = 0;
      for (const e of plan.entregas) {
        const x = receptores.find((y) => y.receptor === e.destinatario)!;
        const mov = vista.movimientos.find((m) => m.partidoId === x.aviso.partidoId)!;
        const msg = await this.mensajeria.emitir(tx, c.organizacionId, {
          plantilla: PLANTILLAS.CONTINGENCIA!,
          canal: e.canal,
          receptor: x.receptor,
          contingenciaId: contingencia.id,
          clave: `cont:${contingencia.id}:${x.aviso.partidoId}:${x.aviso.equipoId}`,
          extra: {
            motivo: d.motivo,
            cuando: cuandoDe(new Date(mov.a.inicio)),
            cancha: mov.a.cancha ?? 'cancha a confirmar',
            rival: x.aviso.rival,
          },
        });
        if (msg) avisados++;
      }
      return {
        contingenciaId: contingencia.id,
        movidos: r.propuesta.movimientos.length,
        avisados,
        sinAviso: plan.omitidos.length,
        sinResolver: vista.sinResolver,
      };
    });
  }

  listar(c: Contexto) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const lista = await tx.contingencia.findMany({ orderBy: { creadoEn: 'desc' }, take: 20 });
      const respuestas = await tx.mensaje.groupBy({
        by: ['contingenciaId', 'respuesta'],
        where: { contingenciaId: { in: lista.map((x) => x.id) } },
        _count: { _all: true },
      });
      return lista.map((x) => {
        const delas = respuestas.filter((r) => r.contingenciaId === x.id);
        const n = (resp: string | null) =>
          delas.filter((r) => r.respuesta === resp).reduce((s, r) => s + r._count._all, 0);
        return {
          id: x.id,
          motivo: x.motivo,
          accion: x.accion,
          creadoEn: x.creadoEn,
          partidos: ((x.detalle as { movimientos?: unknown[] }).movimientos ?? []).length,
          confirmados: n('CONFIRMO'),
          noPuedo: n('NO_PUEDO'),
          sinResponder: n(null),
        };
      });
    });
  }

  detalle(c: Contexto, id: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const x = await tx.contingencia.findUnique({ where: { id } });
      if (!x) throw noEncontrado('la reprogramación');
      const mensajes = await tx.mensaje.findMany({
        where: { contingenciaId: id },
        orderBy: { destinatario: 'asc' },
      });
      const equipos = await tx.equipo.findMany({
        where: { id: { in: mensajes.flatMap((m) => (m.equipoId ? [m.equipoId] : [])) } },
      });
      const nombre = new Map(equipos.map((e) => [e.id, e.nombre]));
      const detalle = x.detalle as {
        movimientos?: unknown[];
        conflictosAceptados?: unknown[];
        sinResolver?: unknown[];
      };
      return {
        id: x.id,
        motivo: x.motivo,
        accion: x.accion,
        creadoEn: x.creadoEn,
        movimientos: detalle.movimientos ?? [],
        conflictosAceptados: detalle.conflictosAceptados ?? [],
        sinResolver: detalle.sinResolver ?? [],
        resumen: {
          confirmados: mensajes.filter((m) => m.respuesta === 'CONFIRMO').length,
          noPuedo: mensajes.filter((m) => m.respuesta === 'NO_PUEDO').length,
          sinResponder: mensajes.filter((m) => !m.respuesta).length,
        },
        respuestas: mensajes.map((m) => ({
          equipo: m.equipoId ? (nombre.get(m.equipoId) ?? '—') : '—',
          capitan: m.destinatario,
          canal: m.canal,
          estado: m.estado,
          respuesta: m.respuesta,
          respondidoEn: m.respondidoEn,
          cuerpo: m.cuerpo,
        })),
      };
    });
  }
}

@Controller('contingencias')
export class ContingenciasController {
  constructor(private readonly s: ContingenciasService) {}

  @Get('clima')
  @Permiso('torneo.leer')
  clima(@Ctx() c: Contexto) {
    return this.s.alertaDeClima(c);
  }

  @Post('propuesta')
  @Permiso('fixture.escribir')
  propuesta(@Ctx() c: Contexto, @Body(new Zod(contingenciaSchema)) d: ContingenciaInput) {
    return this.s.propuesta(c, d);
  }

  @Post('aplicar')
  @Permiso('fixture.escribir')
  aplicar(@Ctx() c: Contexto, @Body(new Zod(contingenciaSchema)) d: ContingenciaInput) {
    return this.s.aplicar(c, d);
  }

  @Get()
  @Permiso('torneo.leer')
  listar(@Ctx() c: Contexto) {
    return this.s.listar(c);
  }

  @Get(':id')
  @Permiso('torneo.leer')
  detalle(@Ctx() c: Contexto, @Param('id') id: string) {
    return this.s.detalle(c, id);
  }
}

@Module({
  imports: [MensajeriaModule],
  controllers: [ContingenciasController],
  providers: [ContingenciasService],
})
export class ContingenciasModule {}
