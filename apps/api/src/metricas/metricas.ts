// Métricas de la organización (E24). Solo lee: junta torneos, inscripciones, cargos, pagos, partidos y canchas
// y los cálculos salen de `calcularMetricas` (packages/shared/src/dominio/metricas.ts). No tiene tablas propias.
import { Controller, Get, HttpStatus, Injectable, Module, Query } from '@nestjs/common';
import {
  calcularMetricas,
  PERIODOS_METRICAS,
  type PeriodoMetricas,
  type TorneoParaMetricas,
} from '@potrero/shared';
import { hoyEnArgentina } from '../comun/formato.js';
import { type Contexto, Ctx, ErrorNegocio, noEncontrado, Permiso } from '../comun/http.js';
import { DbService, enSerie } from '../db/db.service.js';

@Injectable()
export class MetricasService {
  constructor(private readonly db: DbService) {}

  resumen(c: Contexto, periodo: PeriodoMetricas, torneoId?: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const [torneos, canchas] = await enSerie([
        () =>
          tx.torneo.findMany({
            select: {
              id: true,
              nombre: true,
              formato: true,
              estado: true,
              creadoEn: true,
              inscripciones: {
                where: { estado: { not: 'BAJA' } },
                select: {
                  equipo: { select: { id: true, nombre: true } },
                  cargos: {
                    select: {
                      monto: true,
                      estado: true,
                      categoria: true,
                      fecha: true,
                      pagos: { select: { metodo: true, monto: true, estado: true, creadoEn: true, acreditadoEn: true } },
                    },
                  },
                },
              },
              partidos: { select: { inicio: true, canchaId: true, estado: true } },
            },
          }),
        () =>
          tx.cancha.findMany({
            orderBy: { nombre: 'asc' },
            select: { id: true, nombre: true, bloqueada: true },
          }),
      ]);
      if (torneoId && !torneos.some((t) => t.id === torneoId)) throw noEncontrado('el torneo');
      const datos: TorneoParaMetricas[] = torneos.map((t) => ({
        id: t.id,
        nombre: t.nombre,
        formato: t.formato,
        estado: t.estado,
        creadoEn: t.creadoEn.toISOString(),
        equipos: t.inscripciones.map((i) => i.equipo),
        cargos: t.inscripciones.flatMap((i) =>
          i.cargos.map((x) => ({
            monto: x.monto,
            estado: x.estado,
            // La inscripción es el cargo sin fecha del rubro inscripciones (no la cuota por fecha, el seguro ni una multa).
            esInscripcion: x.categoria === 'INSCRIPCIONES' && x.fecha === null,
            pagos: x.pagos.map((p) => ({
              metodo: p.metodo,
              monto: p.monto,
              estado: p.estado,
              fecha: (p.acreditadoEn ?? p.creadoEn).toISOString(),
            })),
          })),
        ),
        partidos: t.partidos.map((p) => ({
          inicio: p.inicio?.toISOString() ?? null,
          canchaId: p.canchaId,
          estado: p.estado,
        })),
      }));
      return calcularMetricas(
        datos,
        canchas.map((x) => ({ id: x.id, nombre: x.nombre, bloqueada: x.bloqueada })),
        { periodo, torneoId: torneoId ?? null },
        hoyEnArgentina(),
      );
    });
  }
}

@Controller('metricas')
export class MetricasController {
  constructor(private readonly s: MetricasService) {}

  // Incluye la cobranza: la ven quienes pueden leer cobros (dueño, administrador y tesorero).
  @Get()
  @Permiso('cobro.leer')
  resumen(@Ctx() c: Contexto, @Query('periodo') periodo?: string, @Query('torneoId') torneoId?: string) {
    const p = (periodo ?? 'TEMPORADA') as PeriodoMetricas;
    if (!PERIODOS_METRICAS.includes(p)) throw new ErrorNegocio('El período tiene que ser 30D, TEMPORADA o HISTORICO.', HttpStatus.BAD_REQUEST);
    return this.s.resumen(c, p, torneoId || undefined);
  }
}

@Module({ providers: [MetricasService], controllers: [MetricasController] })
export class MetricasModule {}
