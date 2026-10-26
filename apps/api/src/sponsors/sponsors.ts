// Sponsors del torneo (E23): auspiciantes, espacios vendidos por período, medición agregada y reporte.
// Las reglas puras (rubros, período, CTR) viven en @potrero/shared (sponsors.ts). Los cobros entran a la caja por el libro
// (crearAsiento) como ingresos de la categoría Sponsors, enlazados al sponsor con referenciaTipo "SPONSOR".
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Module,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  aCsv,
  asientoDeIngreso,
  type CategoriaSponsor,
  cobroSponsorSchema,
  type CobroSponsorInput,
  ctr,
  ESPACIO_SPONSOR,
  type EspacioSponsor,
  esMenor,
  estadoDelPlacement,
  estadoPlacementSchema,
  type EstadoPlacementInput,
  impresionesSponsorSchema,
  type ImpresionesSponsorInput,
  ingresoDeCategoria,
  inicialesSponsor,
  linkSeguro,
  motivoDeRechazoSponsor,
  NOMBRE_CATEGORIA_SPONSOR,
  periodosSeSuperponen,
  placementSchema,
  type PlacementInput,
  placementVisible,
  preferenciasSponsorsSchema,
  type PreferenciasSponsorsInput,
  resumenDeMetricas,
  saldos,
  sponsorSchema,
  type SponsorInput,
  sumarDias,
} from '@potrero/shared';
import type { Response } from 'express';
import { auditar } from '../comun/auditoria.js';
import { hoyEnArgentina } from '../comun/formato.js';
import { type Contexto, Ctx, ErrorNegocio, noEncontrado, Permiso, Publico, Zod } from '../comun/http.js';
import { crearAsiento } from '../caja/libro.js';
import { DbService, type Tx } from '../db/db.service.js';

/** Los cobros de un sponsor son asientos de la caja con esta referencia. */
export const REFERENCIA_SPONSOR = 'SPONSOR';

/** Ventana del panel: impresiones y clics de los últimos 30 días. */
const DIAS_PANEL = 30;

const dia = (d: Date) => d.toISOString().slice(0, 10);
const aFecha = (d: string) => new Date(`${d}T00:00:00Z`);
const delDia = (d: string) => new Date(`${d}T12:00:00-03:00`);

/** Si el torneo tiene algún jugador menor de edad inscripto (por su fecha de nacimiento). */
async function torneoConMenores(tx: Tx, torneoId: string, hoy: Date): Promise<boolean> {
  const jugadores = await tx.jugador.findMany({
    where: {
      fechaNacimiento: { not: null },
      plantel: { some: { equipo: { inscripciones: { some: { torneoId, estado: { not: 'BAJA' } } } } } },
    },
    select: { fechaNacimiento: true },
  });
  return jugadores.some((j) => esMenor(j.fechaNacimiento, hoy));
}

async function rechazadas(tx: Tx): Promise<string[]> {
  return (await tx.preferenciasSponsors.findFirst())?.categoriasRechazadas ?? [];
}

/** Suma impresiones o clics del día a los espacios indicados. Un solo UPSERT atómico por espacio. */
async function contar(
  tx: Tx,
  organizacionId: string,
  placementIds: readonly string[],
  campo: 'impresiones' | 'clics',
) {
  const hoy = hoyEnArgentina();
  for (const id of placementIds) {
    const i = campo === 'impresiones' ? 1 : 0;
    const c = campo === 'clics' ? 1 : 0;
    await tx.$executeRaw`
      INSERT INTO metrica_placement (id, organizacion_id, placement_id, dia, impresiones, clics)
      VALUES (gen_random_uuid()::text, ${organizacionId}, ${id}, ${hoy}::date, ${i}, ${c})
      ON CONFLICT (placement_id, dia) DO UPDATE SET
        impresiones = metrica_placement.impresiones + EXCLUDED.impresiones,
        clics = metrica_placement.clics + EXCLUDED.clics`;
  }
}

@Injectable()
export class SponsorsService {
  constructor(private readonly db: DbService) {}

  // ───────────── Panel ─────────────

  /** Cobros enlazados a cada sponsor (sin los anulados) y lo cobrado en la categoría Sponsors en total. */
  private async cobros(tx: Tx, torneoId?: string) {
    const asientos = await tx.asiento.findMany({
      where: { referenciaTipo: REFERENCIA_SPONSOR, ...(torneoId ? { torneoId } : {}) },
      include: { lineas: true },
      orderBy: { fecha: 'desc' },
    });
    const anulados = new Set(
      (
        await tx.asiento.findMany({
          where: { revierteAId: { in: asientos.map((a) => a.id) } },
          select: { revierteAId: true },
        })
      ).map((a) => a.revierteAId),
    );
    return asientos.map((a) => ({
      id: a.id,
      sponsorId: a.referenciaId!,
      fecha: a.fecha,
      descripcion: a.descripcion,
      comprobante: a.comprobante,
      torneoId: a.torneoId,
      monto: a.lineas.reduce((s, l) => s + l.debe, 0),
      anulado: anulados.has(a.id),
    }));
  }

  panel(c: Contexto, torneoId?: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const ahora = new Date();
      const hoy = hoyEnArgentina(ahora);
      const desde30 = sumarDias(hoy, -(DIAS_PANEL - 1));
      const torneos = await tx.torneo.findMany({
        orderBy: { creadoEn: 'desc' },
        select: { id: true, nombre: true, slug: true, estado: true },
      });
      const conMenores = new Map<string, boolean>();
      for (const t of torneos) conMenores.set(t.id, await torneoConMenores(tx, t.id, ahora));
      const preferencias = await rechazadas(tx);
      const sponsors = await tx.sponsor.findMany({
        orderBy: { creadoEn: 'asc' },
        include: {
          placements: {
            where: torneoId ? { torneoId } : {},
            orderBy: { desde: 'asc' },
            include: { metricas: { where: { dia: { gte: aFecha(desde30) } } } },
          },
        },
      });
      const cobros = await this.cobros(tx, torneoId);
      const lineas = await tx.lineaAsiento.findMany({
        where: torneoId ? { asiento: { torneoId } } : {},
        select: { cuenta: true, debe: true, haber: true },
      });
      const cobradoEnCaja = ingresoDeCategoria(saldos(lineas), 'SPONSORS');
      const cobradoEnlazado = cobros.filter((x) => !x.anulado).reduce((s, x) => s + x.monto, 0);

      const nombreTorneo = new Map(torneos.map((t) => [t.id, t.nombre]));
      const lista = sponsors.map((s) => {
        const placements = s.placements.map((p) => {
          const periodo = { desde: dia(p.desde), hasta: dia(p.hasta) };
          const motivo = motivoDeRechazoSponsor({
            categoria: s.categoria as CategoriaSponsor,
            torneoConMenores: conMenores.get(p.torneoId) ?? false,
            categoriasRechazadas: preferencias,
          });
          const m = resumenDeMetricas(
            p.metricas.map((x) => ({ dia: dia(x.dia), impresiones: x.impresiones, clics: x.clics })),
            desde30,
            hoy,
          );
          return {
            id: p.id,
            torneoId: p.torneoId,
            torneo: nombreTorneo.get(p.torneoId) ?? '—',
            espacio: p.espacio as EspacioSponsor,
            ...periodo,
            monto: p.monto,
            activo: p.activo,
            motivoBloqueo: motivo,
            ...estadoDelPlacement({ ...periodo, activo: p.activo, bloqueado: motivo !== null, hoy }),
            impresiones: m.impresiones,
            clics: m.clics,
          };
        });
        const vigentes = placements.filter((p) => p.estado === 'ACTIVO' || p.estado === 'POR_VENCER');
        const propios = cobros.filter((x) => x.sponsorId === s.id && !x.anulado);
        return {
          id: s.id,
          nombre: s.nombre,
          iniciales: inicialesSponsor(s.nombre),
          categoria: s.categoria as CategoriaSponsor,
          categoriaNombre: NOMBRE_CATEGORIA_SPONSOR[s.categoria as CategoriaSponsor] ?? s.categoria,
          descripcion: s.descripcion,
          link: s.link,
          logoUrl: s.logoUrl,
          placements,
          activo: vigentes.length > 0,
          acordadoVigente: vigentes.reduce((t, p) => t + p.monto, 0),
          cobrado: propios.reduce((t, x) => t + x.monto, 0),
          impresiones: placements.reduce((t, p) => t + p.impresiones, 0),
          clics: placements.reduce((t, p) => t + p.clics, 0),
        };
      });
      // Si hay filtro de torneo, solo los sponsors con algo en ese torneo.
      const visibles = torneoId ? lista.filter((s) => s.placements.length > 0) : lista;
      const todos = visibles.flatMap((s) => s.placements);
      const impresiones = todos.reduce((t, p) => t + p.impresiones, 0);
      const clics = todos.reduce((t, p) => t + p.clics, 0);
      // El espacio que mejor rinde, para sugerir venderlo como premium.
      const porEspacio = new Map<string, { impresiones: number; clics: number }>();
      for (const p of todos) {
        const e = porEspacio.get(p.espacio) ?? { impresiones: 0, clics: 0 };
        e.impresiones += p.impresiones;
        e.clics += p.clics;
        porEspacio.set(p.espacio, e);
      }
      const mejor = [...porEspacio.entries()]
        .filter(([, e]) => e.impresiones >= 100)
        .map(([espacio, e]) => ({ espacio: espacio as EspacioSponsor, ctr: ctr(e.impresiones, e.clics) }))
        .sort((a, b) => b.ctr - a.ctr)[0];
      return {
        hoy,
        sponsors: visibles,
        torneos: torneos.map((t) => ({ ...t, conMenores: conMenores.get(t.id) ?? false })),
        categoriasRechazadas: preferencias,
        resumen: {
          acordadoVigente: visibles.reduce((t, s) => t + s.acordadoVigente, 0),
          sponsorsActivos: visibles.filter((s) => s.activo).length,
          cobradoEnCaja,
          cobradoSinAsignar: Math.max(0, cobradoEnCaja - cobradoEnlazado),
          impresiones,
          clics,
          ctr: ctr(impresiones, clics),
          mejorEspacio: mejor ? { ...mejor, nombre: ESPACIO_SPONSOR[mejor.espacio].nombre } : null,
        },
      };
    });
  }

  // ───────────── Altas y cambios ─────────────

  crear(c: Contexto, d: SponsorInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      if (await tx.sponsor.findFirst({ where: { nombre: { equals: d.nombre, mode: 'insensitive' } } }))
        throw new ErrorNegocio('Ya tenés un sponsor con ese nombre.', HttpStatus.CONFLICT);
      const s = await tx.sponsor.create({ data: { organizacionId: c.organizacionId, ...d } });
      await auditar(tx, c, 'sponsor.crear', 'sponsor', s.id, { despues: d });
      return s;
    });
  }

  editar(c: Contexto, id: string, d: SponsorInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const antes = await tx.sponsor.findUnique({ where: { id } });
      if (!antes) throw noEncontrado('el sponsor');
      const s = await tx.sponsor.update({
        where: { id },
        data: { ...d, descripcion: d.descripcion ?? null, link: d.link ?? null, logoUrl: d.logoUrl ?? null },
      });
      await auditar(tx, c, 'sponsor.editar', 'sponsor', id, { antes, despues: d });
      return s;
    });
  }

  /** Vende un espacio: valida el rubro (menores y rechazos de la organización) y que el espacio esté libre. */
  crearPlacement(c: Contexto, sponsorId: string, d: PlacementInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const s = await tx.sponsor.findUnique({ where: { id: sponsorId } });
      if (!s) throw noEncontrado('el sponsor');
      if (!(await tx.torneo.findUnique({ where: { id: d.torneoId } }))) throw noEncontrado('el torneo');
      const motivo = motivoDeRechazoSponsor({
        categoria: s.categoria as CategoriaSponsor,
        torneoConMenores: await torneoConMenores(tx, d.torneoId, new Date()),
        categoriasRechazadas: await rechazadas(tx),
      });
      if (motivo) throw new ErrorNegocio(motivo, HttpStatus.UNPROCESSABLE_ENTITY);
      const otros = await tx.placement.findMany({
        where: { torneoId: d.torneoId, espacio: d.espacio, activo: true },
        include: { sponsor: true },
      });
      const pisado = otros.find((o) => periodosSeSuperponen(d, { desde: dia(o.desde), hasta: dia(o.hasta) }));
      if (pisado)
        throw new ErrorNegocio(
          `El espacio "${ESPACIO_SPONSOR[d.espacio].nombre}" ya está vendido a ${pisado.sponsor.nombre} del ${dia(pisado.desde)} al ${dia(pisado.hasta)}.`,
          HttpStatus.CONFLICT,
        );
      const p = await tx.placement.create({
        data: {
          organizacionId: c.organizacionId,
          sponsorId,
          torneoId: d.torneoId,
          espacio: d.espacio,
          desde: aFecha(d.desde),
          hasta: aFecha(d.hasta),
          monto: d.monto,
        },
      });
      await auditar(tx, c, 'sponsor.placement', 'placement', p.id, { despues: d });
      return { id: p.id };
    });
  }

  estadoPlacement(c: Contexto, id: string, d: EstadoPlacementInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      if (!(await tx.placement.findUnique({ where: { id } }))) throw noEncontrado('el espacio');
      await tx.placement.update({ where: { id }, data: { activo: d.activo } });
      return { id, activo: d.activo };
    });
  }

  /** Registra un cobro al sponsor: entra a la caja como ingreso de Sponsors, enlazado al sponsor. */
  cobrar(c: Contexto, sponsorId: string, d: CobroSponsorInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const s = await tx.sponsor.findUnique({ where: { id: sponsorId } });
      if (!s) throw noEncontrado('el sponsor');
      if (d.torneoId && !(await tx.torneo.findUnique({ where: { id: d.torneoId } })))
        throw noEncontrado('el torneo');
      const a = await crearAsiento(tx, c.organizacionId, {
        tipo: 'INGRESO',
        descripcion: `${s.nombre} · sponsor`,
        fecha: d.fecha ? delDia(d.fecha) : new Date(),
        torneoId: d.torneoId,
        comprobante: d.comprobante,
        referenciaTipo: REFERENCIA_SPONSOR,
        referenciaId: s.id,
        creadoPorId: c.usuarioId,
        lineas: asientoDeIngreso({ categoria: 'SPONSORS', monto: d.monto, cobradoEn: d.cobradoEn }),
      });
      await auditar(tx, c, 'caja.ingreso', 'asiento', a!.id, { despues: { ...d, sponsorId } });
      return { id: a!.id };
    });
  }

  preferencias(c: Contexto, d: PreferenciasSponsorsInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const r = await tx.preferenciasSponsors.upsert({
        where: { organizacionId: c.organizacionId },
        create: { organizacionId: c.organizacionId, categoriasRechazadas: d.categoriasRechazadas },
        update: { categoriasRechazadas: d.categoriasRechazadas },
      });
      return { categoriasRechazadas: r.categoriasRechazadas };
    });
  }

  // ───────────── Reporte ─────────────

  /** Reporte para el sponsor: impresiones, clics y CTR del período, por espacio y por día, y lo que pagó. */
  reporte(c: Contexto, id: string, q: { desde?: string; hasta?: string }) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const s = await tx.sponsor.findUnique({
        where: { id },
        include: { placements: { include: { metricas: true }, orderBy: { desde: 'asc' } } },
      });
      if (!s) throw noEncontrado('el sponsor');
      const hoy = hoyEnArgentina();
      const inicios = s.placements.map((p) => dia(p.desde)).sort();
      const finales = s.placements.map((p) => dia(p.hasta)).sort();
      const desde = q.desde ?? inicios[0] ?? sumarDias(hoy, -(DIAS_PANEL - 1));
      const ultimo = finales.at(-1) ?? hoy;
      const hasta = q.hasta ?? (ultimo < hoy ? ultimo : hoy);
      if (desde > hasta) throw new ErrorNegocio('El período termina antes de empezar.');
      const torneos = await tx.torneo.findMany({
        where: { id: { in: s.placements.map((p) => p.torneoId) } },
        select: { id: true, nombre: true },
      });
      const filas = (p: (typeof s.placements)[number]) =>
        p.metricas.map((m) => ({ dia: dia(m.dia), impresiones: m.impresiones, clics: m.clics }));
      const total = resumenDeMetricas(s.placements.flatMap(filas), desde, hasta);
      const cobros = (await this.cobros(tx)).filter((x) => x.sponsorId === id);
      return {
        organizacion: (await tx.organizacion.findUnique({ where: { id: c.organizacionId } }))?.nombre ?? '',
        sponsor: {
          id: s.id,
          nombre: s.nombre,
          iniciales: inicialesSponsor(s.nombre),
          categoria: NOMBRE_CATEGORIA_SPONSOR[s.categoria as CategoriaSponsor] ?? s.categoria,
          descripcion: s.descripcion,
          link: s.link,
          logoUrl: s.logoUrl,
        },
        desde,
        hasta,
        impresiones: total.impresiones,
        clics: total.clics,
        ctr: total.ctr,
        serie: total.serie,
        espacios: s.placements.map((p) => {
          const r = resumenDeMetricas(filas(p), desde, hasta);
          return {
            id: p.id,
            espacio: ESPACIO_SPONSOR[p.espacio as EspacioSponsor]?.nombre ?? p.espacio,
            torneo: torneos.find((t) => t.id === p.torneoId)?.nombre ?? '—',
            desde: dia(p.desde),
            hasta: dia(p.hasta),
            monto: p.monto,
            impresiones: r.impresiones,
            clics: r.clics,
            ctr: r.ctr,
          };
        }),
        cobros,
        cobrado: cobros.filter((x) => !x.anulado).reduce((t, x) => t + x.monto, 0),
      };
    });
  }

  async reporteCsv(c: Contexto, id: string, q: { desde?: string; hasta?: string }) {
    const r = await this.reporte(c, id, q);
    return {
      nombre: r.sponsor.nombre,
      csv: aCsv([
        ['Reporte de alcance', r.sponsor.nombre],
        ['Organización', r.organizacion],
        ['Período', `${r.desde} al ${r.hasta}`],
        ['Impresiones', r.impresiones],
        ['Clics', r.clics],
        ['CTR (%)', String(r.ctr).replace('.', ',')],
        [],
        ['Espacio', 'Torneo', 'Desde', 'Hasta', 'Impresiones', 'Clics', 'CTR (%)'],
        ...r.espacios.map((e) => [
          e.espacio,
          e.torneo,
          e.desde,
          e.hasta,
          e.impresiones,
          e.clics,
          String(e.ctr).replace('.', ','),
        ]),
        [],
        ['Día', 'Impresiones', 'Clics'],
        ...r.serie.map((d) => [d.dia, d.impresiones, d.clics]),
      ]),
    };
  }

  // ───────────── Sitio público ─────────────

  private async orgPorSlug(slug: string) {
    const org = await this.db.app.organizacion.findUnique({ where: { slug } });
    if (!org) throw noEncontrado('la organización');
    return org;
  }

  /** Espacios visibles hoy en un torneo, por estricto orden de período. Sin montos ni datos internos. */
  async publicos(orgSlug: string, torneoSlug: string) {
    const org = await this.orgPorSlug(orgSlug);
    return this.db.enOrg(org.id, async (tx) => {
      const t = await tx.torneo.findFirst({ where: { slug: torneoSlug, estado: { not: 'BORRADOR' } } });
      if (!t) throw noEncontrado('el torneo');
      const ahora = new Date();
      const hoy = hoyEnArgentina(ahora);
      const [menores, rechazos, placements] = [
        await torneoConMenores(tx, t.id, ahora),
        await rechazadas(tx),
        await tx.placement.findMany({
          where: { torneoId: t.id, activo: true, desde: { lte: aFecha(hoy) }, hasta: { gte: aFecha(hoy) } },
          include: { sponsor: true },
          orderBy: { desde: 'asc' },
        }),
      ];
      return placements
        .filter((p) =>
          placementVisible({
            desde: dia(p.desde),
            hasta: dia(p.hasta),
            activo: p.activo,
            categoria: p.sponsor.categoria as CategoriaSponsor,
            torneoConMenores: menores,
            categoriasRechazadas: rechazos,
            hoy,
          }),
        )
        .map((p) => ({
          id: p.id,
          espacio: p.espacio as EspacioSponsor,
          sponsor: {
            nombre: p.sponsor.nombre,
            iniciales: inicialesSponsor(p.sponsor.nombre),
            descripcion: p.sponsor.descripcion,
            logoUrl: linkSeguro(p.sponsor.logoUrl),
            conLink: linkSeguro(p.sponsor.link) !== null,
          },
        }));
    });
  }

  /** Cuenta una impresión por espacio. Ignora ids que no son de la organización (RLS) o no están activos. */
  async impresiones(orgSlug: string, d: ImpresionesSponsorInput) {
    const org = await this.orgPorSlug(orgSlug);
    await this.db.enOrg(org.id, async (tx) => {
      const hoy = aFecha(hoyEnArgentina());
      const validos = await tx.placement.findMany({
        where: { id: { in: [...new Set(d.ids)] }, activo: true, desde: { lte: hoy }, hasta: { gte: hoy } },
        select: { id: true },
      });
      await contar(
        tx,
        org.id,
        validos.map((p) => p.id),
        'impresiones',
      );
    });
  }

  /** Cuenta el clic y devuelve a dónde redirigir (siempre el link guardado del sponsor, nunca uno que llegue en el pedido). */
  async clic(orgSlug: string, placementId: string): Promise<string | null> {
    const org = await this.orgPorSlug(orgSlug);
    return this.db.enOrg(org.id, async (tx) => {
      const p = await tx.placement.findUnique({ where: { id: placementId }, include: { sponsor: true } });
      const destino = linkSeguro(p?.sponsor.link);
      if (!p || !destino) return null;
      await contar(tx, org.id, [p.id], 'clics');
      return destino;
    });
  }
}

const periodo = (desde?: string, hasta?: string) => ({
  desde: desde && /^\d{4}-\d{2}-\d{2}$/.test(desde) ? desde : undefined,
  hasta: hasta && /^\d{4}-\d{2}-\d{2}$/.test(hasta) ? hasta : undefined,
});

@Controller('sponsors')
export class SponsorsController {
  constructor(private readonly s: SponsorsService) {}

  @Get()
  @Permiso('torneo.leer')
  panel(@Ctx() c: Contexto, @Query('torneoId') torneoId?: string) {
    return this.s.panel(c, torneoId || undefined);
  }

  @Post()
  @Permiso('torneo.escribir')
  crear(@Ctx() c: Contexto, @Body(new Zod(sponsorSchema)) d: SponsorInput) {
    return this.s.crear(c, d);
  }

  @Patch('preferencias')
  @Permiso('torneo.escribir')
  preferencias(@Ctx() c: Contexto, @Body(new Zod(preferenciasSponsorsSchema)) d: PreferenciasSponsorsInput) {
    return this.s.preferencias(c, d);
  }

  @Patch('placements/:id')
  @Permiso('torneo.escribir')
  estadoPlacement(
    @Ctx() c: Contexto,
    @Param('id') id: string,
    @Body(new Zod(estadoPlacementSchema)) d: EstadoPlacementInput,
  ) {
    return this.s.estadoPlacement(c, id, d);
  }

  @Patch(':id')
  @Permiso('torneo.escribir')
  editar(@Ctx() c: Contexto, @Param('id') id: string, @Body(new Zod(sponsorSchema)) d: SponsorInput) {
    return this.s.editar(c, id, d);
  }

  @Post(':id/placements')
  @Permiso('torneo.escribir')
  crearPlacement(
    @Ctx() c: Contexto,
    @Param('id') id: string,
    @Body(new Zod(placementSchema)) d: PlacementInput,
  ) {
    return this.s.crearPlacement(c, id, d);
  }

  /** Cobrar al sponsor es un movimiento de caja: lo puede hacer quien carga ingresos en la caja. */
  @Post(':id/cobros')
  @Permiso('caja.escribir')
  cobrar(
    @Ctx() c: Contexto,
    @Param('id') id: string,
    @Body(new Zod(cobroSponsorSchema)) d: CobroSponsorInput,
  ) {
    return this.s.cobrar(c, id, d);
  }

  @Get(':id/reporte')
  @Permiso('torneo.leer')
  reporte(
    @Ctx() c: Contexto,
    @Param('id') id: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.s.reporte(c, id, periodo(desde, hasta));
  }

  @Get(':id/reporte.csv')
  @Permiso('torneo.leer')
  async reporteCsv(
    @Ctx() c: Contexto,
    @Res({ passthrough: true }) res: Response,
    @Param('id') id: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    const r = await this.s.reporteCsv(c, id, periodo(desde, hasta));
    const archivo = r.nombre
      .normalize('NFD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase();
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="reporte-${archivo || 'sponsor'}.csv"`);
    return r.csv;
  }
}

/**
 * Lo que usa el sitio público: los sponsors visibles y la medición. No hay cookies ni datos del visitante: solo se suma
 * uno al contador del espacio y del día.
 */
@Controller('sponsors-publico')
export class SponsorsPublicoController {
  constructor(private readonly s: SponsorsService) {}

  @Publico()
  @Get(':org/:torneo')
  publicos(@Param('org') org: string, @Param('torneo') torneo: string) {
    return this.s.publicos(org, torneo);
  }

  @Publico()
  @Post(':org/impresiones')
  @HttpCode(HttpStatus.NO_CONTENT)
  async impresiones(
    @Param('org') org: string,
    @Body(new Zod(impresionesSponsorSchema)) d: ImpresionesSponsorInput,
  ) {
    await this.s.impresiones(org, d);
  }

  @Publico()
  @Get(':org/clic/:id')
  async clic(@Param('org') org: string, @Param('id') id: string, @Res() res: Response) {
    const destino = await this.s.clic(org, id);
    res.setHeader('cache-control', 'no-store');
    if (!destino) return res.status(HttpStatus.NOT_FOUND).json({ mensaje: 'No encontramos ese sponsor.' });
    return res.redirect(HttpStatus.FOUND, destino);
  }
}

@Module({
  controllers: [SponsorsController, SponsorsPublicoController],
  providers: [SponsorsService],
  exports: [SponsorsService],
})
export class SponsorsModule {}
