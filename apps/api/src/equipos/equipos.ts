import { Body, Controller, Get, Injectable, Module, Param, Post } from '@nestjs/common';
import {
  crearCanchaSchema,
  type CrearCanchaInput,
  crearEquipoSchema,
  type CrearEquipoInput,
  crearJugadorSchema,
  type CrearJugadorInput,
} from '@potrero/shared';
import { type Contexto, Ctx, noEncontrado, Permiso, Zod } from '../comun/http.js';
import { DbService } from '../db/db.service.js';

@Injectable()
export class EquiposService {
  constructor(private readonly db: DbService) {}

  listar(c: Contexto) {
    return this.db.enOrg(c.organizacionId, (tx) =>
      tx.equipo.findMany({ orderBy: { nombre: 'asc' }, include: { _count: { select: { plantel: true } } } }),
    );
  }

  crear(c: Contexto, d: CrearEquipoInput) {
    return this.db.enOrg(c.organizacionId, (tx) =>
      tx.equipo.create({ data: { organizacionId: c.organizacionId, ...d } }),
    );
  }

  detalle(c: Contexto, id: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const equipo = await tx.equipo.findUnique({
        where: { id },
        include: {
          plantel: { include: { jugador: true }, orderBy: { numero: 'asc' } },
          inscripciones: { include: { torneo: true } },
        },
      });
      if (!equipo) throw noEncontrado('el equipo');
      return equipo;
    });
  }

  agregarJugador(c: Contexto, equipoId: string, d: CrearJugadorInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      if (!(await tx.equipo.findUnique({ where: { id: equipoId } }))) throw noEncontrado('el equipo');
      const jugador = await tx.jugador.create({
        data: { organizacionId: c.organizacionId, nombre: d.nombre, apellido: d.apellido },
      });
      return tx.plantelJugador.create({
        data: { organizacionId: c.organizacionId, equipoId, jugadorId: jugador.id, numero: d.numero ?? null },
        include: { jugador: true },
      });
    });
  }

  canchas(c: Contexto) {
    return this.db.enOrg(c.organizacionId, (tx) =>
      tx.sede.findMany({ orderBy: { nombre: 'asc' }, include: { canchas: { orderBy: { nombre: 'asc' } } } }),
    );
  }

  /** Crea la cancha y, si no existe, la sede. */
  crearCancha(c: Contexto, d: CrearCanchaInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const sede =
        (await tx.sede.findFirst({ where: { nombre: d.sede } })) ??
        (await tx.sede.create({
          data: { organizacionId: c.organizacionId, nombre: d.sede, direccion: d.direccion ?? null },
        }));
      return tx.cancha.create({
        data: { organizacionId: c.organizacionId, sedeId: sede.id, nombre: d.nombre },
      });
    });
  }
}

@Controller()
export class EquiposController {
  constructor(private readonly s: EquiposService) {}

  @Get('equipos')
  @Permiso('torneo.leer')
  listar(@Ctx() c: Contexto) {
    return this.s.listar(c);
  }

  @Post('equipos')
  @Permiso('equipo.escribir')
  crear(@Ctx() c: Contexto, @Body(new Zod(crearEquipoSchema)) d: CrearEquipoInput) {
    return this.s.crear(c, d);
  }

  @Get('equipos/:id')
  @Permiso('torneo.leer')
  detalle(@Ctx() c: Contexto, @Param('id') id: string) {
    return this.s.detalle(c, id);
  }

  @Post('equipos/:id/jugadores')
  @Permiso('equipo.escribir')
  jugador(
    @Ctx() c: Contexto,
    @Param('id') id: string,
    @Body(new Zod(crearJugadorSchema)) d: CrearJugadorInput,
  ) {
    return this.s.agregarJugador(c, id, d);
  }

  @Get('canchas')
  @Permiso('torneo.leer')
  canchas(@Ctx() c: Contexto) {
    return this.s.canchas(c);
  }

  @Post('canchas')
  @Permiso('cancha.escribir')
  crearCancha(@Ctx() c: Contexto, @Body(new Zod(crearCanchaSchema)) d: CrearCanchaInput) {
    return this.s.crearCancha(c, d);
  }
}

@Module({ controllers: [EquiposController], providers: [EquiposService] })
export class EquiposModule {}
