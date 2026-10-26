// Configuración inicial (E25-01) e importación desde Excel o CSV (E25-02).
// La web lee el archivo y manda sus tablas como texto; acá se valida con la misma función pura que usa la vista
// previa (`validarImportacion` de @potrero/shared) y se importa todo en una sola transacción o nada.
import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, HttpStatus, Injectable, Module, Patch, Post } from '@nestjs/common';
import {
  claveDeNombre,
  confirmarPasoSchema,
  type ConfirmarPasoInput,
  datosOrganizacionSchema,
  type DatosOrganizacionInput,
  describirProblema,
  importacionSchema,
  type ImportacionInput,
  marcaSchema,
  type MarcaInput,
  type PasosConfirmados,
  progresoConfiguracion,
  REGLAMENTO_POR_DEFECTO,
  validarImportacion,
} from '@potrero/shared';
import { auditar } from '../comun/auditoria.js';
import { type Contexto, Ctx, ErrorNegocio, Permiso, Zod } from '../comun/http.js';
import { DbService, enSerie, type Tx } from '../db/db.service.js';
import { cifrar, hashDeDni } from '../documentacion/seguridad.js';
import type { Prisma } from '../generated/prisma/client.js';

const confirmados = (v: unknown): PasosConfirmados =>
  v && typeof v === 'object' && 'pasos' in v ? ((v as { pasos: PasosConfirmados }).pasos ?? {}) : {};

@Injectable()
export class ConfiguracionService {
  constructor(private readonly db: DbService) {}

  /** Estado del asistente: datos de la organización, pasos completos y el reglamento por defecto. */
  estado(c: Contexto) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const [org, equipos, jugadores, canchas, torneos] = await enSerie([
        () => tx.organizacion.findUniqueOrThrow({ where: { id: c.organizacionId } }),
        () => tx.equipo.count(),
        () => tx.jugador.count(),
        () => tx.cancha.count(),
        () => tx.torneo.count(),
      ]);
      const progreso = progresoConfiguracion({
        confirmados: confirmados(org.configuracionInicial),
        mpConectado: !!org.mpCuentaId,
        tieneMarca: !!(org.colorMarca || org.logo),
        equipos,
        torneos,
      });
      return {
        organizacion: {
          nombre: org.nombre,
          slug: org.slug,
          plan: org.plan,
          colorMarca: org.colorMarca,
          logo: org.logo,
          localidad: org.localidad,
          provincia: org.provincia,
          mpConectado: !!org.mpCuentaId,
        },
        progreso,
        conteos: { equipos, jugadores, canchas, torneos },
        reglamento: REGLAMENTO_POR_DEFECTO,
      };
    });
  }

  private async marcarPaso(tx: Tx, c: Contexto, paso: ConfirmarPasoInput['paso']) {
    const org = await tx.organizacion.findUniqueOrThrow({ where: { id: c.organizacionId } });
    const pasos = { ...confirmados(org.configuracionInicial), [paso]: new Date().toISOString() };
    await tx.organizacion.update({
      where: { id: c.organizacionId },
      data: { configuracionInicial: { pasos } as Prisma.InputJsonObject },
    });
  }

  datosOrganizacion(c: Contexto, d: DatosOrganizacionInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      await tx.organizacion.update({
        where: { id: c.organizacionId },
        data: { nombre: d.nombre, localidad: d.localidad || null, provincia: d.provincia || null },
      });
      await this.marcarPaso(tx, c, 'organizacion');
      return { ok: true };
    });
  }

  marca(c: Contexto, d: MarcaInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const otra = await tx.organizacion.findFirst({
        where: { slug: d.slug, id: { not: c.organizacionId } },
        select: { id: true },
      });
      if (otra)
        throw new ErrorNegocio('Esa dirección ya la usa otra liga. Probá con otra.', HttpStatus.CONFLICT);
      const antes = await tx.organizacion.findUniqueOrThrow({ where: { id: c.organizacionId } });
      await tx.organizacion.update({
        where: { id: c.organizacionId },
        data: { slug: d.slug, colorMarca: d.colorMarca, ...(d.logo !== undefined ? { logo: d.logo } : {}) },
      });
      // Cambiar la dirección rompe los links ya compartidos del sitio público: queda registrado.
      if (antes.slug !== d.slug)
        await auditar(tx, c, 'organizacion.slug', 'organizacion', c.organizacionId, {
          antes: antes.slug,
          despues: d.slug,
        });
      await this.marcarPaso(tx, c, 'marca');
      return { ok: true };
    });
  }

  confirmarPaso(c: Contexto, d: ConfirmarPasoInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      await this.marcarPaso(tx, c, d.paso);
      return { ok: true };
    });
  }

  /** Lo que la validación necesita saber de la liga: equipos, canchas y los DNI ya cargados (por su hash). */
  private async existentes(tx: Tx) {
    const [equipos, canchas, conDni] = await enSerie([
      () => tx.equipo.findMany({ select: { id: true, nombre: true } }),
      () => tx.cancha.findMany({ select: { nombre: true, sede: { select: { nombre: true } } } }),
      () => tx.jugador.findMany({ where: { dniHash: { not: null } }, select: { id: true, dniHash: true } }),
    ]);
    const porHash = new Map<string, string[]>();
    for (const j of conDni) porHash.set(j.dniHash!, [...(porHash.get(j.dniHash!) ?? []), j.id]);
    return {
      equipos,
      porHash,
      validacion: {
        equipos: equipos.map((e) => e.nombre),
        canchas: canchas.map((c) => ({ sede: c.sede.nombre, nombre: c.nombre })),
        dniRegistrado: (dni: string) => porHash.has(hashDeDni(dni)),
      },
    };
  }

  vistaPrevia(c: Contexto, d: ImportacionInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const { validacion } = await this.existentes(tx);
      const r = validarImportacion(d.tablas, validacion);
      // Lo que se va a crear ya está en `hojas`: no hace falta devolverlo dos veces.
      return { valido: r.valido, errores: r.errores, avisos: r.avisos, hojas: r.hojas, resumen: r.resumen };
    });
  }

  /** Importa todo junto: si hay un solo error, no se crea nada (la transacción entera se deshace). */
  importar(c: Contexto, d: ImportacionInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const ex = await this.existentes(tx);
      const r = validarImportacion(d.tablas, ex.validacion);
      if (!r.valido)
        throw new ErrorNegocio(
          r.errores.length === 1
            ? `No se importó nada. ${describirProblema(r.errores[0]!)}`
            : `No se importó nada: hay ${r.errores.length} errores. El primero: ${describirProblema(r.errores[0]!)}`,
        );
      const org = c.organizacionId;

      // Equipos nuevos; los que ya existían se reutilizan por nombre.
      const idDeEquipo = new Map(ex.equipos.map((e) => [claveDeNombre(e.nombre), e.id]));
      for (const e of r.datos.equipos) {
        const id = randomUUID();
        idDeEquipo.set(claveDeNombre(e.nombre), id);
        await tx.equipo.create({ data: { id, organizacionId: org, ...e } });
      }

      // Jugadores con su DNI cifrado (ADR-025) y su lugar en el plantel.
      const jugadores = r.datos.jugadores.map((j) => ({
        ...j,
        id: randomUUID(),
        hash: j.dni ? hashDeDni(j.dni) : null,
      }));
      if (jugadores.length) {
        await tx.jugador.createMany({
          data: jugadores.map((j) => ({
            id: j.id,
            organizacionId: org,
            nombre: j.nombre,
            apellido: j.apellido,
            fechaNacimiento: j.fechaNacimiento ? new Date(`${j.fechaNacimiento}T00:00:00Z`) : null,
            dniCifrado: j.dni ? cifrar(j.dni) : null,
            dniHash: j.hash,
          })),
        });
        await tx.plantelJugador.createMany({
          data: jugadores.map((j) => ({
            organizacionId: org,
            equipoId: idDeEquipo.get(claveDeNombre(j.equipo))!,
            jugadorId: j.id,
            numero: j.numero,
          })),
        });
      }

      // Mismo DNI que un jugador que ya estaba: duplicado abierto, como al cargar la identidad a mano.
      const duplicados = jugadores.flatMap((j) =>
        j.hash
          ? (ex.porHash.get(j.hash) ?? []).map((otro) => {
              const [a, b] = [j.id, otro].sort() as [string, string];
              return { organizacionId: org, jugadorAId: a, jugadorBId: b };
            })
          : [],
      );
      if (duplicados.length) await tx.duplicadoJugador.createMany({ data: duplicados, skipDuplicates: true });

      // Canchas: la sede se crea si no existe (se compara por nombre sin mayúsculas ni acentos).
      const sedes = await tx.sede.findMany({ select: { id: true, nombre: true } });
      const idDeSede = new Map(sedes.map((s) => [claveDeNombre(s.nombre), s.id]));
      for (const ca of r.datos.canchas) {
        let sedeId = idDeSede.get(claveDeNombre(ca.sede));
        if (!sedeId) {
          sedeId = (
            await tx.sede.create({ data: { organizacionId: org, nombre: ca.sede, direccion: ca.direccion } })
          ).id;
          idDeSede.set(claveDeNombre(ca.sede), sedeId);
        }
        await tx.cancha.create({
          data: {
            organizacionId: org,
            sedeId,
            nombre: ca.nombre,
            superficie: ca.superficie,
            costoPorPartido: ca.costoPorPartido,
          },
        });
      }

      const resumen = { ...r.resumen, jugadores: { ...r.resumen.jugadores, duplicados: duplicados.length } };
      await auditar(tx, c, 'importacion.confirmar', 'organizacion', org, { despues: resumen });
      await this.marcarPaso(tx, c, 'importacion');
      return { resumen };
    });
  }
}

@Controller()
export class ConfiguracionController {
  constructor(private readonly s: ConfiguracionService) {}

  @Get('configuracion')
  @Permiso('torneo.leer')
  estado(@Ctx() c: Contexto) {
    return this.s.estado(c);
  }

  @Patch('configuracion/organizacion')
  @Permiso('organizacion.configurar')
  organizacion(@Ctx() c: Contexto, @Body(new Zod(datosOrganizacionSchema)) d: DatosOrganizacionInput) {
    return this.s.datosOrganizacion(c, d);
  }

  @Patch('configuracion/marca')
  @Permiso('organizacion.configurar')
  marca(@Ctx() c: Contexto, @Body(new Zod(marcaSchema)) d: MarcaInput) {
    return this.s.marca(c, d);
  }

  @Post('configuracion/pasos')
  @Permiso('organizacion.configurar')
  paso(@Ctx() c: Contexto, @Body(new Zod(confirmarPasoSchema)) d: ConfirmarPasoInput) {
    return this.s.confirmarPaso(c, d);
  }

  @Post('importacion/vista-previa')
  @Permiso('equipo.escribir')
  vistaPrevia(@Ctx() c: Contexto, @Body(new Zod(importacionSchema)) d: ImportacionInput) {
    return this.s.vistaPrevia(c, d);
  }

  @Post('importacion')
  @Permiso('equipo.escribir')
  importar(@Ctx() c: Contexto, @Body(new Zod(importacionSchema)) d: ImportacionInput) {
    return this.s.importar(c, d);
  }
}

@Module({ controllers: [ConfiguracionController], providers: [ConfiguracionService] })
export class ConfiguracionModule {}
