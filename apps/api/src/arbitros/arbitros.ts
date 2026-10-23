// Árbitros y canchas (E08): el cuerpo de árbitros con su tarifa y disponibilidad, la designación de cada partido (a mano o
// automática, un árbitro por franja), el costo de las canchas y su ocupación. Las reglas puras viven en @potrero/shared.
import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Injectable,
  Module,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  actualizarArbitroSchema,
  type ActualizarArbitroInput,
  actualizarCanchaSchema,
  type ActualizarCanchaInput,
  arbitroSchema,
  type ArbitroInput,
  designacionAutomaticaSchema,
  type DesignacionAutomaticaInput,
  designarArbitroSchema,
  type DesignarArbitroInput,
  designarAutomatico,
  estaDisponible,
  type FranjaDisponible,
  ocupacionDeCanchas,
} from '@potrero/shared';
import { auditar } from '../comun/auditoria.js';
import { type Contexto, Ctx, ErrorNegocio, noEncontrado, Permiso, Zod } from '../comun/http.js';
import { DbService, type Tx } from '../db/db.service.js';
import type { Arbitro } from '../generated/prisma/client.js';

const disponibilidadDe = (a: Pick<Arbitro, 'disponibilidad'>) =>
  (a.disponibilidad as FranjaDisponible[] | null) ?? [];
const nombreDe = (a: Pick<Arbitro, 'nombre' | 'apellido'>) => `${a.nombre} ${a.apellido}`;

/** Del día AAAA-MM-DD en Argentina: desde las 00:00 hasta las 24:00. */
const rangoDelDia = (dia: string) => {
  const desde = new Date(`${dia}T00:00:00-03:00`);
  return { gte: desde, lt: new Date(desde.getTime() + 86_400_000) };
};

@Injectable()
export class ArbitrosService {
  constructor(private readonly db: DbService) {}

  // ───────────── Árbitros ─────────────

  listar(c: Contexto) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const [arbitros, partidos, pagos] = await Promise.all([
        tx.arbitro.findMany({ orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }] }),
        tx.partido.groupBy({
          by: ['arbitroId', 'estado'],
          where: { arbitroId: { not: null } },
          _count: { _all: true },
        }),
        // Lo pagado sale del libro: egresos a árbitros, ya descontadas las anulaciones.
        tx.lineaAsiento.groupBy({
          by: ['asientoId'],
          where: { cuenta: 'EGRESOS:ARBITROS', asiento: { arbitroId: { not: null } } },
          _sum: { debe: true, haber: true },
        }),
      ]);
      const asientos = await tx.asiento.findMany({
        where: { id: { in: pagos.map((p) => p.asientoId) } },
        select: { id: true, arbitroId: true },
      });
      const arbitroDe = new Map(asientos.map((a) => [a.id, a.arbitroId]));
      return arbitros.map((a) => {
        const n = (...estados: string[]) =>
          partidos
            .filter((p) => p.arbitroId === a.id && estados.includes(p.estado))
            .reduce((s, p) => s + p._count._all, 0);
        const pagado = pagos
          .filter((p) => arbitroDe.get(p.asientoId) === a.id)
          .reduce((s, p) => s + (p._sum.debe ?? 0) - (p._sum.haber ?? 0), 0);
        return {
          id: a.id,
          nombre: a.nombre,
          apellido: a.apellido,
          telefono: a.telefono,
          email: a.email,
          tarifa: a.tarifa,
          valoracion: a.valoracion,
          activo: a.activo,
          disponibilidad: disponibilidadDe(a),
          dirigidos: n('FINALIZADO'),
          proximos: n('PROGRAMADO'),
          pagado,
        };
      });
    });
  }

  crear(c: Contexto, d: ArbitroInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const a = await tx.arbitro.create({
        data: {
          organizacionId: c.organizacionId,
          nombre: d.nombre,
          apellido: d.apellido,
          telefono: d.telefono ?? null,
          email: d.email ?? null,
          tarifa: d.tarifa ?? 0,
          valoracion: d.valoracion ?? null,
          activo: d.activo ?? true,
          disponibilidad: d.disponibilidad ?? [],
        },
      });
      await auditar(tx, c, 'arbitro.crear', 'arbitro', a.id, { despues: d });
      return a;
    });
  }

  actualizar(c: Contexto, id: string, d: ActualizarArbitroInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const antes = await tx.arbitro.findUnique({ where: { id } });
      if (!antes) throw noEncontrado('el árbitro');
      const a = await tx.arbitro.update({
        where: { id },
        data: {
          ...d,
          email: d.email === undefined ? undefined : (d.email ?? null),
          disponibilidad: d.disponibilidad ?? undefined,
        },
      });
      await auditar(tx, c, 'arbitro.actualizar', 'arbitro', id, { antes, despues: a });
      return a;
    });
  }

  // ───────────── Designaciones ─────────────

  /** Los partidos de un día con su árbitro y cancha, los árbitros que podrían dirigir cada uno y la ocupación de las canchas. */
  designaciones(c: Contexto, dia: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const [partidos, arbitros, sedes] = await Promise.all([
        tx.partido.findMany({
          where: { inicio: rangoDelDia(dia) },
          orderBy: [{ inicio: 'asc' }, { id: 'asc' }],
          include: { torneo: true, cancha: { include: { sede: true } } },
        }),
        tx.arbitro.findMany({ where: { activo: true }, orderBy: [{ apellido: 'asc' }] }),
        tx.sede.findMany({
          include: { canchas: { orderBy: { nombre: 'asc' } } },
          orderBy: { nombre: 'asc' },
        }),
      ]);
      const equipos = await tx.equipo.findMany({
        where: { id: { in: partidos.flatMap((p) => [p.localId, p.visitanteId]) } },
      });
      const eq = new Map(equipos.map((e) => [e.id, e.nombre]));
      const arb = new Map(arbitros.map((a) => [a.id, a]));
      const ocupadosEn = (inicio: Date, salvo: string) =>
        new Set(
          partidos
            .filter((p) => p.id !== salvo && p.arbitroId && p.inicio?.getTime() === inicio.getTime())
            .map((p) => p.arbitroId!),
        );
      const canchas = sedes.flatMap((s) => s.canchas.map((x) => ({ ...x, sede: s.nombre })));
      const ocupacion = ocupacionDeCanchas(
        partidos.map((p) => ({ canchaId: p.canchaId, inicio: p.inicio!.toISOString() })),
        canchas.map((x) => x.id),
        dia,
      );
      return {
        dia,
        partidos: partidos.map((p) => {
          const ocupados = p.inicio ? ocupadosEn(p.inicio, p.id) : new Set<string>();
          return {
            id: p.id,
            inicio: p.inicio,
            estado: p.estado,
            torneo: p.torneo.nombre,
            local: eq.get(p.localId) ?? '—',
            visitante: eq.get(p.visitanteId) ?? '—',
            cancha: p.cancha ? `${p.cancha.sede.nombre} · ${p.cancha.nombre}` : null,
            arbitroId: p.arbitroId,
            arbitro: p.arbitroId ? nombreDe(arb.get(p.arbitroId) ?? { nombre: '—', apellido: '' }) : null,
            arbitroEstado: p.arbitroEstado,
            disponibles:
              p.estado === 'PROGRAMADO' && p.inicio
                ? arbitros
                    .filter(
                      (a) =>
                        a.id !== p.arbitroId &&
                        !ocupados.has(a.id) &&
                        estaDisponible(disponibilidadDe(a), p.inicio!.toISOString()),
                    )
                    .map((a) => ({ id: a.id, nombre: nombreDe(a), tarifa: a.tarifa }))
                : [],
          };
        }),
        sinArbitro: partidos.filter((p) => p.estado === 'PROGRAMADO' && !p.arbitroId).length,
        arbitros: arbitros.map((a) => ({
          id: a.id,
          nombre: nombreDe(a),
          tarifa: a.tarifa,
          valoracion: a.valoracion,
          partidosDelDia: partidos.filter((p) => p.arbitroId === a.id).length,
        })),
        canchas: canchas.map((x) => {
          const o = ocupacion.find((y) => y.canchaId === x.id)!;
          return {
            id: x.id,
            nombre: x.nombre,
            sede: x.sede,
            superficie: x.superficie,
            costoPorPartido: x.costoPorPartido,
            bloqueada: x.bloqueada,
            motivoBloqueo: x.motivoBloqueo,
            partidos: o.partidos,
            pct: o.pct,
          };
        }),
      };
    });
  }

  /** Designa un árbitro a mano. Un árbitro dirige un solo partido por franja; fuera de su disponibilidad solo se advierte. */
  designar(c: Contexto, partidoId: string, d: DesignarArbitroInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const p = await tx.partido.findUnique({ where: { id: partidoId } });
      if (!p) throw noEncontrado('el partido');
      if (p.estado !== 'PROGRAMADO')
        throw new ErrorNegocio(
          'Solo se puede designar árbitro a un partido programado.',
          HttpStatus.CONFLICT,
        );
      if (d.arbitroId === null) {
        await tx.partido.update({ where: { id: partidoId }, data: { arbitroId: null, arbitroEstado: null } });
        await auditar(tx, c, 'partido.arbitro', 'partido', partidoId, {
          antes: { arbitroId: p.arbitroId },
          despues: { arbitroId: null },
        });
        return { arbitroId: null, advertencia: null };
      }
      const a = await tx.arbitro.findUnique({ where: { id: d.arbitroId } });
      if (!a) throw noEncontrado('el árbitro');
      if (!a.activo) throw new ErrorNegocio('Ese árbitro está inactivo.');
      if (p.inicio) {
        const choque = await tx.partido.findFirst({
          where: { id: { not: p.id }, arbitroId: a.id, inicio: p.inicio },
        });
        if (choque)
          throw new ErrorNegocio(`${nombreDe(a)} ya dirige otro partido a esa hora.`, HttpStatus.CONFLICT);
      }
      const advertencia =
        p.inicio && !estaDisponible(disponibilidadDe(a), p.inicio.toISOString())
          ? `${nombreDe(a)} cargó que a esa hora no está disponible. Quedó designado igual.`
          : null;
      await tx.partido.update({
        where: { id: partidoId },
        data: { arbitroId: a.id, arbitroEstado: 'PENDIENTE' },
      });
      await auditar(tx, c, 'partido.arbitro', 'partido', partidoId, {
        antes: { arbitroId: p.arbitroId },
        despues: { arbitroId: a.id },
      });
      return { arbitroId: a.id, advertencia };
    });
  }

  confirmar(c: Contexto, partidoId: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const p = await tx.partido.findUnique({ where: { id: partidoId } });
      if (!p) throw noEncontrado('el partido');
      if (!p.arbitroId) throw new ErrorNegocio('El partido no tiene árbitro designado.');
      await tx.partido.update({ where: { id: partidoId }, data: { arbitroEstado: 'CONFIRMADO' } });
      return { arbitroEstado: 'CONFIRMADO' };
    });
  }

  /** Designa a todos los partidos programados sin árbitro de un día o de un torneo. Devuelve lo designado y lo que no se pudo. */
  automatico(c: Contexto, d: DesignacionAutomaticaInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const pendientes = await tx.partido.findMany({
        where: {
          estado: 'PROGRAMADO',
          arbitroId: null,
          inicio: d.dia ? rangoDelDia(d.dia) : { not: null },
          ...(d.torneoId ? { torneoId: d.torneoId } : {}),
        },
      });
      const arbitros = await tx.arbitro.findMany({ where: { activo: true } });
      const ocupados = (
        await tx.partido.findMany({ where: { arbitroId: { not: null }, inicio: { not: null } } })
      ).map((p) => ({ arbitroId: p.arbitroId!, inicio: p.inicio!.toISOString() }));
      const r = designarAutomatico(
        pendientes.map((p) => ({ id: p.id, inicio: p.inicio!.toISOString() })),
        arbitros.map((a) => ({ id: a.id, disponibilidad: disponibilidadDe(a), activo: a.activo })),
        ocupados,
      );
      for (const a of r.asignaciones)
        await tx.partido.update({
          where: { id: a.partidoId },
          data: { arbitroId: a.arbitroId, arbitroEstado: 'PENDIENTE' },
        });
      await auditar(tx, c, 'partido.arbitro.automatico', 'torneo', d.torneoId ?? 'dia', {
        despues: { ...d, designados: r.asignaciones.length, sinAsignar: r.sinAsignar.length },
      });
      return {
        designados: r.asignaciones.length,
        sinAsignar: r.sinAsignar.length,
        detalleSinAsignar: r.sinAsignar,
      };
    });
  }

  // ───────────── Canchas ─────────────

  actualizarCancha(c: Contexto, id: string, d: ActualizarCanchaInput) {
    return this.db.enOrg(c.organizacionId, async (tx: Tx) => {
      const antes = await tx.cancha.findUnique({ where: { id } });
      if (!antes) throw noEncontrado('la cancha');
      const cancha = await tx.cancha.update({
        where: { id },
        data: {
          ...d,
          // Al desbloquearla se limpia el motivo.
          ...(d.bloqueada === false ? { motivoBloqueo: null } : {}),
        },
      });
      await auditar(tx, c, 'cancha.actualizar', 'cancha', id, { antes, despues: cancha });
      return cancha;
    });
  }
}

@Controller()
export class ArbitrosController {
  constructor(private readonly s: ArbitrosService) {}

  @Get('arbitros')
  @Permiso('torneo.leer')
  listar(@Ctx() c: Contexto) {
    return this.s.listar(c);
  }

  @Post('arbitros')
  @Permiso('arbitro.escribir')
  crear(@Ctx() c: Contexto, @Body(new Zod(arbitroSchema)) d: ArbitroInput) {
    return this.s.crear(c, d);
  }

  @Patch('arbitros/:id')
  @Permiso('arbitro.escribir')
  actualizar(
    @Ctx() c: Contexto,
    @Param('id') id: string,
    @Body(new Zod(actualizarArbitroSchema)) d: ActualizarArbitroInput,
  ) {
    return this.s.actualizar(c, id, d);
  }

  @Get('designaciones')
  @Permiso('torneo.leer')
  designaciones(@Ctx() c: Contexto, @Query('dia') dia?: string) {
    if (!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw new ErrorNegocio('Indicá el día como AAAA-MM-DD.');
    return this.s.designaciones(c, dia);
  }

  @Post('designaciones/automatico')
  @Permiso('fixture.escribir')
  automatico(@Ctx() c: Contexto, @Body(new Zod(designacionAutomaticaSchema)) d: DesignacionAutomaticaInput) {
    return this.s.automatico(c, d);
  }

  @Post('partidos/:id/arbitro')
  @Permiso('fixture.escribir')
  designar(
    @Ctx() c: Contexto,
    @Param('id') id: string,
    @Body(new Zod(designarArbitroSchema)) d: DesignarArbitroInput,
  ) {
    return this.s.designar(c, id, d);
  }

  @Post('partidos/:id/arbitro/confirmar')
  @Permiso('fixture.escribir')
  confirmar(@Ctx() c: Contexto, @Param('id') id: string) {
    return this.s.confirmar(c, id);
  }

  @Patch('canchas/:id')
  @Permiso('cancha.escribir')
  cancha(
    @Ctx() c: Contexto,
    @Param('id') id: string,
    @Body(new Zod(actualizarCanchaSchema)) d: ActualizarCanchaInput,
  ) {
    return this.s.actualizarCancha(c, id, d);
  }
}

@Module({ controllers: [ArbitrosController], providers: [ArbitrosService], exports: [ArbitrosService] })
export class ArbitrosModule {}
