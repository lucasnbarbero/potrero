// Fixture a mano (E09-07): mover un partido a otro día, cancha u horario, o intercambiar el lugar de dos partidos de la
// misma fecha. Se calcula una propuesta con cada conflicto y su causa; aplicar nunca bloquea, pero hay que confirmar que
// se vieron los conflictos (como en Reprogramaciones). Las reglas puras viven en @potrero/shared (fixture.ts).
import { Body, Controller, Get, HttpStatus, Injectable, Module, Param, Post } from '@nestjs/common';
import {
  type CambioDeProgramacion,
  estimarEnvio,
  evaluarCambioDeProgramacion,
  evaluarTope,
  type FranjaDisponible,
  moverPartidoSchema,
  type MoverPartidoInput,
  type PartidoDeLaGrilla,
  type Plan,
  PLANTILLAS,
  planificarEnvio,
} from '@potrero/shared';
import { sincronizarCobrosPorFecha } from '../cobros/por-fecha.js';
import { auditar } from '../comun/auditoria.js';
import { cuandoDe } from '../comun/formato.js';
import { type Contexto, Ctx, ErrorNegocio, noEncontrado, Permiso, Zod } from '../comun/http.js';
import { DbService, enSerie, type Tx } from '../db/db.service.js';
import type { Partido } from '../generated/prisma/client.js';
import { MensajeriaModule, MensajeriaService } from '../mensajeria/mensajeria.js';

/** Por qué no se puede mover un partido, o nulo si se puede. */
const motivoNoMovible = (p: Pick<Partido, 'estado' | 'inicio'>) =>
  p.estado === 'EN_JUEGO'
    ? 'El partido tiene el acta en curso.'
    : p.estado !== 'PROGRAMADO'
      ? 'El partido ya se jugó o está cerrado.'
      : !p.inicio
        ? 'El partido todavía no tiene horario.'
        : null;

const aGrilla = (p: Partido): PartidoDeLaGrilla => ({
  id: p.id,
  torneoId: p.torneoId,
  fecha: p.fecha,
  inicio: p.inicio!.toISOString(),
  canchaId: p.canchaId,
  localId: p.localId,
  visitanteId: p.visitanteId,
  arbitroId: p.arbitroId,
});

@Injectable()
export class FixtureService {
  constructor(
    private readonly db: DbService,
    private readonly mensajeria: MensajeriaService,
  ) {}

  /** La grilla del fixture: partidos con cancha, árbitro y si se pueden mover, y las canchas de la organización. */
  programacion(c: Contexto, torneoId: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      if (!(await tx.torneo.findUnique({ where: { id: torneoId } }))) throw noEncontrado('el torneo');
      const [partidos, canchas] = await enSerie([
        () =>
          tx.partido.findMany({
            where: { torneoId },
            orderBy: [{ fecha: 'asc' }, { inicio: 'asc' }],
            include: { arbitro: true },
          }),
        () =>
          tx.cancha.findMany({
            include: { sede: true },
            orderBy: [{ sede: { nombre: 'asc' } }, { nombre: 'asc' }],
          }),
      ]);
      const equipos = await tx.equipo.findMany({
        where: { id: { in: [...new Set(partidos.flatMap((p) => [p.localId, p.visitanteId]))] } },
        select: { id: true, nombre: true },
      });
      const nombre = new Map(equipos.map((e) => [e.id, e.nombre]));
      return {
        partidos: partidos.map((p) => ({
          id: p.id,
          fecha: p.fecha,
          fase: p.fase,
          grupo: p.grupo,
          inicio: p.inicio,
          canchaId: p.canchaId,
          estado: p.estado,
          local: nombre.get(p.localId) ?? '—',
          visitante: nombre.get(p.visitanteId) ?? '—',
          golesLocal: p.golesLocal,
          golesVisitante: p.golesVisitante,
          arbitro: p.arbitro ? `${p.arbitro.nombre} ${p.arbitro.apellido}` : null,
          noMovible: motivoNoMovible(p),
        })),
        canchas: canchas.map((x) => ({
          id: x.id,
          nombre: `${x.sede.nombre} · ${x.nombre}`,
          superficie: x.superficie,
          bloqueada: x.bloqueada,
          motivoBloqueo: x.motivoBloqueo,
        })),
      };
    });
  }

  /** Evalúa el cambio sin guardar nada: movimientos, conflictos con nombres y a quién se avisaría. */
  private async calcular(tx: Tx, c: Contexto, partidoId: string, d: MoverPartidoInput) {
    const p = await tx.partido.findUnique({ where: { id: partidoId } });
    if (!p) throw noEncontrado('el partido');
    const noMovible = motivoNoMovible(p);
    if (noMovible) throw new ErrorNegocio(`${noMovible} No se puede mover.`, HttpStatus.CONFLICT);
    let cambio: CambioDeProgramacion;
    if (d.cambio.tipo === 'MOVER') {
      if (!(await tx.cancha.findUnique({ where: { id: d.cambio.canchaId } })))
        throw noEncontrado('la cancha');
      cambio = {
        tipo: 'MOVER',
        partidoId,
        a: { inicio: `${d.cambio.dia}T${d.cambio.hora}:00-03:00`, canchaId: d.cambio.canchaId },
      };
    } else {
      const otro = await tx.partido.findUnique({ where: { id: d.cambio.conPartidoId } });
      if (!otro) throw noEncontrado('el otro partido');
      const motivo = motivoNoMovible(otro);
      if (motivo)
        throw new ErrorNegocio(
          `El otro partido no se puede mover: ${motivo.toLowerCase()}`,
          HttpStatus.CONFLICT,
        );
      cambio = { tipo: 'INTERCAMBIAR', partidoId, conPartidoId: otro.id };
    }
    // El calendario de toda la organización: canchas, equipos y árbitros se comparten entre torneos.
    const calendario = await tx.partido.findMany({
      where: { inicio: { not: null }, estado: { not: 'SUSPENDIDO' } },
    });
    const arbitroIds = [...new Set(calendario.flatMap((x) => (x.arbitroId ? [x.arbitroId] : [])))];
    const [arbitros, canchas] = await enSerie([
      () => tx.arbitro.findMany({ where: { id: { in: arbitroIds } } }),
      () => tx.cancha.findMany({ include: { sede: true } }),
    ]);
    let evaluacion;
    try {
      evaluacion = evaluarCambioDeProgramacion(calendario.map(aGrilla), cambio, {
        arbitros: arbitros.map((a) => ({
          id: a.id,
          nombre: `${a.nombre} ${a.apellido}`,
          disponibilidad: (a.disponibilidad as FranjaDisponible[] | null) ?? [],
        })),
        canchas: canchas.map((x) => ({
          id: x.id,
          nombre: x.nombre,
          bloqueada: x.bloqueada,
          motivoBloqueo: x.motivoBloqueo,
        })),
      });
    } catch (e) {
      throw new ErrorNegocio((e as Error).message);
    }
    const involucrados = calendario.filter(
      (x) =>
        evaluacion.movimientos.some((m) => m.partidoId === x.id) ||
        evaluacion.conflictos.some((k) => k.conPartidoId === x.id),
    );
    const [equipos, torneos, org] = await enSerie([
      () =>
        tx.equipo.findMany({
          where: { id: { in: involucrados.flatMap((x) => [x.localId, x.visitanteId]) } },
        }),
      () => tx.torneo.findMany({ where: { id: { in: involucrados.map((x) => x.torneoId) } } }),
      () => tx.organizacion.findUniqueOrThrow({ where: { id: c.organizacionId } }),
    ]);
    const equipo = new Map(equipos.map((e) => [e.id, e]));
    const torneo = new Map(torneos.map((t) => [t.id, t.nombre]));
    const cancha = new Map(canchas.map((x) => [x.id, `${x.sede.nombre} · ${x.nombre}`]));
    const partido = new Map(involucrados.map((x) => [x.id, x]));
    const etiqueta = (id: string) => {
      const x = partido.get(id)!;
      return `${equipo.get(x.localId)?.nombre ?? '—'} vs ${equipo.get(x.visitanteId)?.nombre ?? '—'}`;
    };
    const lugar = (l: { inicio: string; canchaId: string | null }) => ({
      inicio: l.inicio,
      cancha: l.canchaId ? (cancha.get(l.canchaId) ?? '—') : null,
    });
    const vista = {
      movimientos: evaluacion.movimientos.map((m) => {
        const x = partido.get(m.partidoId)!;
        return {
          partidoId: m.partidoId,
          torneo: torneo.get(x.torneoId) ?? '—',
          local: equipo.get(x.localId)?.nombre ?? '—',
          visitante: equipo.get(x.visitanteId)?.nombre ?? '—',
          de: lugar(m.de),
          a: lugar(m.a),
        };
      }),
      conflictos: evaluacion.conflictos.map((k) => ({
        tipo: k.tipo,
        mensaje: k.mensaje,
        partido: etiqueta(k.partidoId),
        con: k.conPartidoId ? etiqueta(k.conPartidoId) : null,
      })),
    };
    // Un aviso por capitán de cada equipo de un partido movido.
    const orgInfo = { id: org.id, nombre: org.nombre, slug: org.slug, plan: org.plan as Plan };
    const avisos = evaluacion.movimientos.flatMap((m) => {
      const x = partido.get(m.partidoId)!;
      return (
        [
          [x.localId, x.visitanteId],
          [x.visitanteId, x.localId],
        ] as const
      ).map(([propio, rival]) => ({
        equipoId: propio,
        partidoId: x.id,
        rival: equipo.get(rival)?.nombre ?? '—',
        receptor: this.mensajeria.receptorDe(equipo.get(propio)!, orgInfo),
      }));
    });
    const plan = planificarEnvio(
      avisos.map((a) => a.receptor),
      d.canal,
      'TRANSACCIONAL',
    );
    const estimacion = estimarEnvio(plan.entregas, 'UTILIDAD');
    const tope = evaluarTope(
      orgInfo.plan,
      await this.mensajeria.usadosWhatsapp(tx, new Date()),
      estimacion.porCanal.WHATSAPP,
    );
    return { evaluacion, vista, avisos, plan, estimacion, tope };
  }

  propuesta(c: Contexto, partidoId: string, d: MoverPartidoInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const r = await this.calcular(tx, c, partidoId, d);
      return {
        ...r.vista,
        aviso: {
          mensajes: r.plan.entregas.length,
          porCanal: r.estimacion.porCanal,
          omitidos: r.plan.omitidos.length,
          costoUsd: r.estimacion.costoUsd,
          costoArs: r.estimacion.costoArs,
          tope: r.tope,
        },
      };
    });
  }

  /** Mueve (o intercambia) y lo audita. Con `avisar`, registra el cambio como reprogramación y avisa a los capitanes. */
  aplicar(c: Contexto, partidoId: string, d: MoverPartidoInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const r = await this.calcular(tx, c, partidoId, d);
      const n = r.evaluacion.conflictos.length;
      if (n > 0 && !d.aceptarConflictos)
        throw new ErrorNegocio(
          `El cambio tiene ${n} conflicto${n > 1 ? 's' : ''}. Revisalos y confirmá que querés seguir.`,
          HttpStatus.CONFLICT,
        );
      if (d.avisar && r.tope.excedente > 0)
        throw new ErrorNegocio(
          `El aviso usa ${r.estimacion.porCanal.WHATSAPP} WhatsApp y te quedan ${r.tope.restantes} este mes en tu plan. Elegí email para avisar.`,
        );
      for (const m of r.evaluacion.movimientos) {
        await tx.partido.update({
          where: { id: m.partidoId },
          data: { inicio: new Date(m.a.inicio), canchaId: m.a.canchaId },
        });
        await auditar(
          tx,
          c,
          d.cambio.tipo === 'MOVER' ? 'partido.mover' : 'partido.intercambiar',
          'partido',
          m.partidoId,
          {
            antes: m.de,
            despues: { ...m.a, conflictosAceptados: r.vista.conflictos },
          },
        );
      }
      // Las cuotas y seguros de la fecha vencen el día del partido: acompañan el cambio.
      const movidos = await tx.partido.findMany({
        where: { id: { in: r.evaluacion.movimientos.map((m) => m.partidoId) } },
        select: { torneoId: true },
      });
      for (const torneoId of new Set(movidos.map((m) => m.torneoId)))
        await sincronizarCobrosPorFecha(tx, c.organizacionId, torneoId);

      let contingenciaId: string | null = null;
      let avisados = 0;
      if (d.avisar) {
        const motivo = d.motivo || 'Cambio de horario';
        // Queda como una reprogramación más: el historial muestra quién confirmó y quién no puede.
        const contingencia = await tx.contingencia.create({
          data: {
            organizacionId: c.organizacionId,
            motivo,
            accion: d.cambio.tipo === 'MOVER' ? 'MOVER_A_MANO' : 'INTERCAMBIAR',
            aplicadaPorId: c.usuarioId,
            detalle: {
              alcance: { tipo: 'PARTIDOS', partidoIds: r.evaluacion.movimientos.map((m) => m.partidoId) },
              accion: d.cambio,
              movimientos: r.vista.movimientos,
              conflictosAceptados: r.vista.conflictos,
              sinResolver: [],
            },
          },
        });
        contingenciaId = contingencia.id;
        for (const e of r.plan.entregas) {
          const aviso = r.avisos.find((a) => a.receptor === e.destinatario)!;
          const mov = r.vista.movimientos.find((m) => m.partidoId === aviso.partidoId)!;
          const msg = await this.mensajeria.emitir(tx, c.organizacionId, {
            plantilla: PLANTILLAS.CONTINGENCIA!,
            canal: e.canal,
            receptor: aviso.receptor,
            contingenciaId,
            clave: `cont:${contingenciaId}:${aviso.partidoId}:${aviso.equipoId}`,
            extra: {
              motivo,
              cuando: cuandoDe(new Date(mov.a.inicio)),
              cancha: mov.a.cancha ?? 'cancha a confirmar',
              rival: aviso.rival,
            },
          });
          if (msg) avisados++;
        }
      }
      return {
        movidos: r.evaluacion.movimientos.length,
        conflictos: r.vista.conflictos.length,
        contingenciaId,
        avisados,
        sinAviso: d.avisar ? r.plan.omitidos.length : 0,
      };
    });
  }
}

@Controller()
export class FixtureController {
  constructor(private readonly s: FixtureService) {}

  @Get('torneos/:id/programacion')
  @Permiso('torneo.leer')
  programacion(@Ctx() c: Contexto, @Param('id') id: string) {
    return this.s.programacion(c, id);
  }

  @Post('partidos/:id/programacion/propuesta')
  @Permiso('fixture.escribir')
  propuesta(
    @Ctx() c: Contexto,
    @Param('id') id: string,
    @Body(new Zod(moverPartidoSchema)) d: MoverPartidoInput,
  ) {
    return this.s.propuesta(c, id, d);
  }

  @Post('partidos/:id/programacion')
  @Permiso('fixture.escribir')
  aplicar(
    @Ctx() c: Contexto,
    @Param('id') id: string,
    @Body(new Zod(moverPartidoSchema)) d: MoverPartidoInput,
  ) {
    return this.s.aplicar(c, id, d);
  }
}

@Module({
  imports: [MensajeriaModule],
  controllers: [FixtureController],
  providers: [FixtureService],
})
export class FixtureModule {}
