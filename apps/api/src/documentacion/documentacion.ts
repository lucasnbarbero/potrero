// Documentación, identidad y consentimientos (E15, ADR-025): documentos de cada jugador con revisión humana,
// DNI y datos de salud cifrados, duplicados, habilitación y consentimientos versionados. Las reglas puras
// (estado de un documento, habilitación, retención) viven en @potrero/shared.
import {
  Body,
  Controller,
  Get,
  Injectable,
  Logger,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  CONSENTIMIENTOS,
  type ConsentimientoPublicoInput,
  consentimientoPublicoSchema,
  consentimientoVigente,
  DATOS,
  debeBorrarse,
  edadEn,
  enmascararDni,
  esMenor,
  estadoDeDocumento,
  estadoSancion,
  habilitacionDelJugador,
  type Habilitacion,
  identidadSchema,
  type IdentidadInput,
  NOMBRE_DOCUMENTO,
  normalizarDni,
  puedePublicarImagen,
  requisitosTorneoSchema,
  type RequisitosTorneoInput,
  resolverDuplicadoSchema,
  type ResolverDuplicadoInput,
  revisarDocumentoSchema,
  type RevisarDocumentoInput,
  solicitarDocumentacionSchema,
  type SolicitarDocumentacionInput,
  subirDocumentoSchema,
  type SubirDocumentoInput,
  TIPOS_DOCUMENTO,
  type TipoDocumento,
  PLANTILLAS,
  planificarEnvio,
} from '@potrero/shared';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { auditar } from '../comun/auditoria.js';
import { type Contexto, Ctx, ErrorNegocio, noEncontrado, Permiso, Publico, Zod } from '../comun/http.js';
import { config } from '../config.js';
import { DbService, enSerie, type Tx } from '../db/db.service.js';
import { MensajeriaModule, MensajeriaService } from '../mensajeria/mensajeria.js';
import { ALMACEN, type AlmacenArchivos, AlmacenLocal } from './almacen.js';
import { cifrar, descifrar, firmarToken, hashDeDni, verificarToken } from './seguridad.js';

/** Verificación por selfie (E15-11): detrás de una bandera apagada hasta que legal la apruebe (E00-05). */
const SELFIE_HABILITADA = false;

const MAGIA: Record<string, number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'application/pdf': [0x25, 0x50, 0x44, 0x46],
};
const DIA_MS = 86_400_000;
const dia = (f: Date | null) => (f ? f.toISOString().slice(0, 10) : null);
const nombreDe = (j: { nombre: string; apellido: string }) => `${j.nombre} ${j.apellido}`;

/** Suspensiones vigentes hoy en un torneo: se descuentan con partidos oficiales del equipo jugados después. */
async function sancionesActivas(tx: Tx, torneoId: string) {
  const [sanciones, partidos] = await enSerie([
    () => tx.sancion.findMany({ where: { torneoId } }),
    () =>
      tx.partido.findMany({
        where: { torneoId },
        select: { id: true, fecha: true, estado: true, localId: true, visitanteId: true },
      }),
  ]);
  const fechaDe = new Map(partidos.map((p) => [p.id, p.fecha]));
  const activas = new Set<string>();
  for (const s of sanciones) {
    const origen = fechaDe.get(s.partidoOrigenId) ?? 0;
    const jugados = partidos.filter(
      (p) =>
        p.estado === 'FINALIZADO' &&
        p.fecha > origen &&
        (p.localId === s.equipoId || p.visitanteId === s.equipoId),
    ).length;
    if (estadoSancion(s.partidos, jugados).activa) activas.add(s.jugadorId);
  }
  return activas;
}

/**
 * Motivos por los que la documentación o un duplicado impiden jugar (no incluye sanciones: el acta ya las resuelve).
 * Solo trae a los jugadores con algún motivo. Lo usa el acta.
 */
export async function motivosDeNoHabilitacion(tx: Tx, torneoId: string, jugadorIds: readonly string[]) {
  const [torneo, jugadores, duplicados] = await enSerie([
    () => tx.torneo.findUnique({ where: { id: torneoId }, select: { documentosRequeridos: true } }),
    () =>
      tx.jugador.findMany({
        where: { id: { in: [...jugadorIds] } },
        include: { documentos: true, consentimientos: true },
      }),
    () => tx.duplicadoJugador.findMany({ where: { estado: 'ABIERTO' } }),
  ]);
  const requeridos = (torneo?.documentosRequeridos ?? []) as TipoDocumento[];
  const conDuplicado = new Set(duplicados.flatMap((d) => [d.jugadorAId, d.jugadorBId]));
  const hoy = new Date();
  const motivos = new Map<string, string[]>();
  for (const j of jugadores) {
    const h = habilitacionDelJugador({
      requeridos,
      documentos: j.documentos,
      nacimiento: j.fechaNacimiento,
      tutorAutorizo: consentimientoVigente(
        j.consentimientos.map((x) => ({ ...x, tipo: x.tipo as 'TUTOR_PARTICIPACION' })),
        'TUTOR_PARTICIPACION',
      ),
      sancionActiva: false,
      duplicadoAbierto: conDuplicado.has(j.id),
      hoy,
    });
    if (!h.habilitado) motivos.set(j.id, h.motivos);
  }
  return motivos;
}

@Injectable()
export class DocumentacionService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Documentacion');
  private temporizador?: NodeJS.Timeout;

  constructor(
    private readonly db: DbService,
    private readonly mensajeria: MensajeriaService,
    private readonly almacen: AlmacenArchivos,
  ) {}

  /** Una vez por día borra lo que cumplió su plazo de retención. */
  onModuleInit() {
    if (config.NODE_ENV === 'test') return;
    this.temporizador = setInterval(() => void this.retencionDeTodas(), DIA_MS);
    this.temporizador.unref();
  }

  onModuleDestroy() {
    clearInterval(this.temporizador);
  }

  private async retencionDeTodas() {
    try {
      // Acceso de sistema justificado: recorrer todas las organizaciones; cada una se procesa después con su RLS.
      const orgs = await this.db.sistema.organizacion.findMany({ select: { id: true } });
      for (const o of orgs) await this.aplicarRetencion({ organizacionId: o.id, usuarioId: null });
    } catch (e) {
      this.log.error(`La retención falló: ${e instanceof Error ? e.message : e}`);
    }
  }

  // ───────────── Panel ─────────────

  async panel(c: Contexto, torneoId?: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const torneos = await tx.torneo.findMany({
        where: { estado: { not: 'BORRADOR' } },
        orderBy: { creadoEn: 'desc' },
        select: { id: true, nombre: true, documentosRequeridos: true, estado: true },
      });
      const elegido =
        torneos.find((t) => t.id === torneoId) ??
        torneos.find((t) => t.estado === 'EN_CURSO' && t.documentosRequeridos.length > 0) ??
        torneos.find((t) => t.estado === 'EN_CURSO') ??
        torneos[0];
      if (!elegido)
        return { torneos: [], torneo: null, filas: [], resumen: null, alertas: null, selfie: this.selfie() };
      const requeridos = elegido.documentosRequeridos as TipoDocumento[];
      const hoy = new Date();
      const [inscripciones, duplicados, activas] = await enSerie([
        () =>
          tx.inscripcion.findMany({
            where: { torneoId: elegido.id, estado: { not: 'BAJA' } },
            include: {
              equipo: {
                include: {
                  plantel: {
                    include: { jugador: { include: { documentos: true, consentimientos: true } } },
                    orderBy: { numero: 'asc' },
                  },
                },
              },
            },
          }),
        () => tx.duplicadoJugador.findMany({ where: { estado: 'ABIERTO' } }),
        () => sancionesActivas(tx, elegido.id),
      ]);
      const conDuplicado = new Set(duplicados.flatMap((d) => [d.jugadorAId, d.jugadorBId]));
      const filas = inscripciones.flatMap((i) =>
        i.equipo.plantel.map((pl) => {
          const j = pl.jugador;
          const consent = j.consentimientos.map((x) => ({ ...x, tipo: x.tipo as 'IMAGEN' }));
          const menor = esMenor(j.fechaNacimiento, hoy);
          const tutorAutorizo = consentimientoVigente(
            j.consentimientos.map((x) => ({ ...x, tipo: x.tipo as 'TUTOR_PARTICIPACION' })),
            'TUTOR_PARTICIPACION',
          );
          const h = habilitacionDelJugador({
            requeridos,
            documentos: j.documentos,
            nacimiento: j.fechaNacimiento,
            tutorAutorizo,
            sancionActiva: activas.has(j.id),
            duplicadoAbierto: conDuplicado.has(j.id),
            hoy,
          });
          const estados = Object.fromEntries(
            TIPOS_DOCUMENTO.map((t) => [t, estadoDeDocumento(j.documentos, t, hoy)]),
          ) as Record<TipoDocumento, ReturnType<typeof estadoDeDocumento>>;
          if (menor && tutorAutorizo) estados.AUTORIZACION_MENOR = 'VIGENTE';
          return {
            jugadorId: j.id,
            equipoId: i.equipo.id,
            nombre: nombreDe(j),
            equipo: i.equipo.nombre,
            edad: j.fechaNacimiento ? edadEn(j.fechaNacimiento, hoy) : null,
            menor,
            dniCargado: j.dniCifrado != null,
            estados,
            habilitado: h.habilitado,
            motivos: h.motivos,
            duplicado: conDuplicado.has(j.id),
            pendientesDeRevision: j.documentos.filter((d) => d.estado === 'PENDIENTE').length,
            imagenPublicable: puedePublicarImagen(menor, [
              ...consent,
              ...j.consentimientos.map((x) => ({ ...x, tipo: x.tipo as 'TUTOR_PARTICIPACION' })),
            ]),
          };
        }),
      );
      const cuenta = (f: (x: (typeof filas)[number]) => boolean) => filas.filter(f).length;
      const vigente = (e: string) => e === 'VIGENTE' || e === 'POR_VENCER';
      return {
        torneos: torneos.map((t) => ({ id: t.id, nombre: t.nombre })),
        torneo: { id: elegido.id, nombre: elegido.nombre, requeridos },
        filas,
        resumen: {
          total: filas.length,
          habilitados: cuenta((f) => f.habilitado),
          conDni: cuenta((f) => vigente(f.estados.DNI)),
          conApto: cuenta((f) => vigente(f.estados.APTO_FISICO)),
          menores: cuenta((f) => f.menor),
        },
        alertas: {
          duplicados: duplicados.length,
          aptoVencido: cuenta((f) => f.estados.APTO_FISICO === 'VENCIDO'),
          aptoPorVencer: cuenta((f) => f.estados.APTO_FISICO === 'POR_VENCER'),
          menoresSinAutorizacion: cuenta((f) => f.menor && !vigente(f.estados.AUTORIZACION_MENOR)),
          pendientesDeRevision: cuenta((f) => f.pendientesDeRevision > 0),
        },
        selfie: this.selfie(),
      };
    });
  }

  private selfie() {
    return {
      habilitada: SELFIE_HABILITADA,
      detalle:
        'Pendiente de aprobación legal y de elegir proveedor. Por ahora la revisión de documentos es humana.',
    };
  }

  /** Ficha de un jugador: documentos, accesos, consentimientos y por qué está (o no) habilitado. */
  ficha(c: Contexto, jugadorId: string, torneoId?: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const j = await tx.jugador.findUnique({
        where: { id: jugadorId },
        include: {
          documentos: {
            orderBy: { creadoEn: 'desc' },
            include: { accesos: { orderBy: { creadoEn: 'desc' }, take: 5 } },
          },
          consentimientos: { orderBy: { otorgadoEn: 'desc' } },
        },
      });
      if (!j) throw noEncontrado('el jugador');
      const hoy = new Date();
      const torneo = torneoId ? await tx.torneo.findUnique({ where: { id: torneoId } }) : null;
      const activas = torneo ? await sancionesActivas(tx, torneo.id) : new Set<string>();
      const dups = await tx.duplicadoJugador.count({
        where: { estado: 'ABIERTO', OR: [{ jugadorAId: j.id }, { jugadorBId: j.id }] },
      });
      const consent = j.consentimientos.map((x) => ({ ...x, tipo: x.tipo as 'TUTOR_PARTICIPACION' }));
      const habilitacion: Habilitacion = habilitacionDelJugador({
        requeridos: (torneo?.documentosRequeridos ?? []) as TipoDocumento[],
        documentos: j.documentos,
        nacimiento: j.fechaNacimiento,
        tutorAutorizo: consentimientoVigente(consent, 'TUTOR_PARTICIPACION'),
        sancionActiva: activas.has(j.id),
        duplicadoAbierto: dups > 0,
        hoy,
      });
      return {
        id: j.id,
        nombre: nombreDe(j),
        fechaNacimiento: dia(j.fechaNacimiento),
        menor: esMenor(j.fechaNacimiento, hoy),
        dni: j.dniCifrado ? enmascararDni(descifrar(j.dniCifrado)) : null,
        tieneDatosMedicos: j.datosMedicosCifrado != null,
        habilitacion,
        documentos: j.documentos.map((d) => ({
          id: d.id,
          tipo: d.tipo,
          nombreTipo: NOMBRE_DOCUMENTO[d.tipo],
          estado: d.estado,
          archivoNombre: d.archivoNombre,
          mime: d.mime,
          vencimiento: dia(d.vencimiento),
          motivoRechazo: d.motivoRechazo,
          creadoEn: d.creadoEn,
          accesos: d.accesos.length,
        })),
        consentimientos: j.consentimientos.map((x) => ({
          id: x.id,
          tipo: x.tipo,
          version: x.version,
          vigente: x.revocadoEn == null && x.version === CONSENTIMIENTOS[x.tipo as 'IMAGEN'].version,
          otorgante: x.otorgante,
          vinculo: x.vinculo,
          otorgadoEn: x.otorgadoEn,
          revocadoEn: x.revocadoEn,
        })),
      };
    });
  }

  // ───────────── Requisitos del torneo ─────────────

  async requisitos(c: Contexto, torneoId: string, d: RequisitosTorneoInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const t = await tx.torneo.findUnique({ where: { id: torneoId } });
      if (!t) throw noEncontrado('el torneo');
      const documentos = [...new Set(d.documentos)];
      await tx.torneo.update({ where: { id: torneoId }, data: { documentosRequeridos: documentos } });
      await auditar(tx, c, 'documentacion.requisitos', 'torneo', torneoId, {
        antes: t.documentosRequeridos,
        despues: documentos,
      });
      return { documentos };
    });
  }

  // ───────────── Identidad ─────────────

  async identidad(c: Contexto, jugadorId: string, d: IdentidadInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      if (!(await tx.jugador.findUnique({ where: { id: jugadorId } }))) throw noEncontrado('el jugador');
      const dni = normalizarDni(d.dni);
      if (!/^\d{7,8}$/.test(dni)) throw new ErrorNegocio('El DNI son 7 u 8 números.');
      const hash = hashDeDni(dni);
      await tx.jugador.update({
        where: { id: jugadorId },
        data: {
          dniCifrado: cifrar(dni),
          dniHash: hash,
          ...(d.fechaNacimiento ? { fechaNacimiento: new Date(`${d.fechaNacimiento}T00:00:00Z`) } : {}),
          ...(d.datosMedicos !== undefined
            ? { datosMedicosCifrado: d.datosMedicos ? cifrar(d.datosMedicos) : null }
            : {}),
        },
      });
      // Duplicados: otros jugadores con el mismo DNI. Los que ya no coinciden por haber corregido el DNI se cierran.
      const otros = await tx.jugador.findMany({
        where: { dniHash: hash, id: { not: jugadorId } },
        select: { id: true },
      });
      for (const o of otros) {
        const [a, b] = [jugadorId, o.id].sort() as [string, string];
        await tx.duplicadoJugador.upsert({
          where: { jugadorAId_jugadorBId: { jugadorAId: a, jugadorBId: b } },
          create: { organizacionId: c.organizacionId, jugadorAId: a, jugadorBId: b },
          update: {},
        });
      }
      const abiertos = await tx.duplicadoJugador.findMany({
        where: { estado: 'ABIERTO', OR: [{ jugadorAId: jugadorId }, { jugadorBId: jugadorId }] },
      });
      const siguen = new Set(otros.map((o) => o.id));
      for (const dup of abiertos) {
        const otro = dup.jugadorAId === jugadorId ? dup.jugadorBId : dup.jugadorAId;
        if (!siguen.has(otro))
          await tx.duplicadoJugador.update({
            where: { id: dup.id },
            data: { estado: 'RESUELTO', resolucion: 'Se corrigió el DNI', resueltoEn: new Date() },
          });
      }
      await auditar(tx, c, 'jugador.identidad', 'jugador', jugadorId, {
        despues: {
          dni: enmascararDni(dni),
          nacimiento: d.fechaNacimiento,
          datosMedicos: d.datosMedicos != null,
        },
      });
      return { dni: enmascararDni(dni), duplicados: otros.length };
    });
  }

  /** El número completo y los datos de salud solo se descifran a pedido y queda registrado quién los vio. */
  verIdentidad(c: Contexto, jugadorId: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const j = await tx.jugador.findUnique({ where: { id: jugadorId } });
      if (!j) throw noEncontrado('el jugador');
      await auditar(tx, c, 'jugador.identidad.ver', 'jugador', jugadorId);
      return {
        dni: j.dniCifrado ? descifrar(j.dniCifrado) : null,
        datosMedicos: j.datosMedicosCifrado ? descifrar(j.datosMedicosCifrado) : null,
      };
    });
  }

  // ───────────── Documentos ─────────────

  async subir(c: Contexto, jugadorId: string, d: SubirDocumentoInput) {
    const contenido = Buffer.from(d.contenido, 'base64');
    if (contenido.length === 0) throw new ErrorNegocio('El archivo está vacío.');
    if (contenido.length > DATOS.documentacion.tamanoMaximoMb * 1024 * 1024)
      throw new ErrorNegocio(`El archivo pesa más de ${DATOS.documentacion.tamanoMaximoMb} MB.`);
    // El tipo declarado tiene que coincidir con el contenido real: no se acepta cualquier cosa renombrada.
    if (!MAGIA[d.mime]!.every((b, i) => contenido[i] === b))
      throw new ErrorNegocio('El archivo no es del tipo que dice ser. Subí una foto (JPG o PNG) o un PDF.');
    return this.db.enOrg(c.organizacionId, async (tx) => {
      if (!(await tx.jugador.findUnique({ where: { id: jugadorId } }))) throw noEncontrado('el jugador');
      const clave = `${c.organizacionId}/${jugadorId}/${randomUUID()}`;
      await this.almacen.guardar(clave, contenido);
      const doc = await tx.documentoJugador.create({
        data: {
          organizacionId: c.organizacionId,
          jugadorId,
          tipo: d.tipo,
          archivoClave: clave,
          archivoNombre: d.nombreArchivo,
          mime: d.mime,
          tamano: contenido.length,
          vencimiento: d.vencimiento ? new Date(`${d.vencimiento}T00:00:00Z`) : null,
        },
      });
      await auditar(tx, c, 'documento.subir', 'documento', doc.id, { despues: { tipo: d.tipo, jugadorId } });
      return { id: doc.id, estado: doc.estado };
    });
  }

  revisar(c: Contexto, documentoId: string, d: RevisarDocumentoInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const doc = await tx.documentoJugador.findUnique({ where: { id: documentoId } });
      if (!doc) throw noEncontrado('el documento');
      if (doc.estado !== 'PENDIENTE')
        throw new ErrorNegocio('Ese documento ya fue revisado. Pedí que suban uno nuevo.');
      const aprobar = d.decision === 'APROBAR';
      const vencimiento = d.vencimiento ? new Date(`${d.vencimiento}T00:00:00Z`) : doc.vencimiento;
      if (aprobar && doc.tipo === 'APTO_FISICO' && !vencimiento)
        throw new ErrorNegocio('Para aprobar el apto físico cargá hasta cuándo vale.');
      if (aprobar && vencimiento && vencimiento.getTime() < Date.now())
        throw new ErrorNegocio('Ese documento ya está vencido: no se puede aprobar.');
      const nuevo = await tx.documentoJugador.update({
        where: { id: documentoId },
        data: {
          estado: aprobar ? 'APROBADO' : 'RECHAZADO',
          motivoRechazo: aprobar ? null : d.motivo!,
          vencimiento,
          revisadoPorId: c.usuarioId,
          revisadoEn: new Date(),
        },
      });
      await auditar(tx, c, aprobar ? 'documento.aprobar' : 'documento.rechazar', 'documento', documentoId, {
        antes: { estado: doc.estado },
        despues: { estado: nuevo.estado, motivo: d.motivo },
      });
      return { id: nuevo.id, estado: nuevo.estado };
    });
  }

  /** Link firmado y de vida corta para ver el archivo. Pedirlo queda registrado. */
  urlFirmada(c: Contexto, documentoId: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const doc = await tx.documentoJugador.findUnique({ where: { id: documentoId } });
      if (!doc) throw noEncontrado('el documento');
      await tx.accesoDocumento.create({
        data: { organizacionId: c.organizacionId, documentoId, usuarioId: c.usuarioId, accion: 'URL' },
      });
      const minutos = DATOS.documentacion.vencimientoUrlFirmadaMinutos;
      const token = firmarToken(
        { d: documentoId, o: c.organizacionId, u: c.usuarioId ?? '' },
        minutos * 60_000,
      );
      return { url: `/api/documentos/archivo/${token}`, venceEnMinutos: minutos };
    });
  }

  /** Entrega el archivo a quien tenga un link firmado vigente. */
  async archivo(token: string) {
    const t = verificarToken(token);
    if (!t) throw new ErrorNegocio('El link venció. Pedí uno nuevo desde el panel.', 410);
    const organizacionId = String(t.o);
    const doc = await this.db.enOrg(organizacionId, async (tx) => {
      const d = await tx.documentoJugador.findUnique({ where: { id: String(t.d) } });
      if (!d) throw noEncontrado('el documento');
      await tx.accesoDocumento.create({
        data: {
          organizacionId,
          documentoId: d.id,
          usuarioId: t.u ? String(t.u) : null,
          accion: 'DESCARGA',
        },
      });
      return d;
    });
    if (doc.archivoClave.startsWith('demo:'))
      return { mime: 'image/svg+xml', nombre: doc.archivoNombre, datos: muestra(doc) };
    return { mime: doc.mime, nombre: doc.archivoNombre, datos: await this.almacen.leer(doc.archivoClave) };
  }

  accesos(c: Contexto, documentoId: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const lista = await tx.accesoDocumento.findMany({
        where: { documentoId },
        orderBy: { creadoEn: 'desc' },
        take: 50,
      });
      const usuarios = await tx.usuario.findMany({
        where: { id: { in: lista.flatMap((a) => (a.usuarioId ? [a.usuarioId] : [])) } },
        select: { id: true, nombre: true },
      });
      const nombres = new Map(usuarios.map((u) => [u.id, u.nombre]));
      return lista.map((a) => ({
        id: a.id,
        accion: a.accion,
        usuario: a.usuarioId ? (nombres.get(a.usuarioId) ?? 'usuario') : 'sistema',
        cuando: a.creadoEn,
      }));
    });
  }

  // ───────────── Duplicados ─────────────

  duplicados(c: Contexto) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const abiertos = await tx.duplicadoJugador.findMany({
        where: { estado: 'ABIERTO' },
        orderBy: { creadoEn: 'asc' },
      });
      const ids = [...new Set(abiertos.flatMap((d) => [d.jugadorAId, d.jugadorBId]))];
      const jugadores = await tx.jugador.findMany({
        where: { id: { in: ids } },
        include: { plantel: { include: { equipo: { select: { id: true, nombre: true } } } } },
      });
      const porId = new Map(jugadores.map((j) => [j.id, j]));
      const vista = (id: string) => {
        const j = porId.get(id)!;
        return {
          id: j.id,
          nombre: nombreDe(j),
          dni: j.dniCifrado ? enmascararDni(descifrar(j.dniCifrado)) : null,
          equipos: j.plantel.map((p) => p.equipo),
        };
      };
      return abiertos.map((d) => ({ id: d.id, jugadores: [vista(d.jugadorAId), vista(d.jugadorBId)] }));
    });
  }

  resolverDuplicado(c: Contexto, id: string, d: ResolverDuplicadoInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const dup = await tx.duplicadoJugador.findUnique({ where: { id } });
      if (!dup) throw noEncontrado('el duplicado');
      if (dup.estado === 'RESUELTO') throw new ErrorNegocio('Ese duplicado ya está resuelto.');
      if (d.jugadorId !== dup.jugadorAId && d.jugadorId !== dup.jugadorBId)
        throw new ErrorNegocio('Elegí a uno de los dos jugadores del duplicado.');
      if (d.accion === 'QUITAR_DEL_PLANTEL')
        await tx.plantelJugador.deleteMany({ where: { jugadorId: d.jugadorId } });
      else await tx.jugador.update({ where: { id: d.jugadorId }, data: { dniCifrado: null, dniHash: null } });
      await tx.duplicadoJugador.update({
        where: { id },
        data: {
          estado: 'RESUELTO',
          resolucion:
            (d.accion === 'QUITAR_DEL_PLANTEL'
              ? 'Se lo sacó del plantel repetido'
              : 'Se descartó el DNI mal cargado') + (d.nota ? `: ${d.nota}` : ''),
          resueltoPorId: c.usuarioId,
          resueltoEn: new Date(),
        },
      });
      await auditar(tx, c, 'duplicado.resolver', 'duplicado', id, { despues: d });
      return { ok: true };
    });
  }

  // ───────────── Pedidos de documentación ─────────────

  /** Le avisa a cada capitán qué le falta a sus jugadores (un mensaje por equipo, por el canal que le corresponde). */
  solicitar(c: Contexto, d: SolicitarDocumentacionInput, torneoId?: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const org = await tx.organizacion.findUniqueOrThrow({ where: { id: c.organizacionId } });
      const torneo = torneoId ? await tx.torneo.findUnique({ where: { id: torneoId } }) : null;
      const requeridos = (torneo?.documentosRequeridos ?? []) as TipoDocumento[];
      const jugadores = await tx.jugador.findMany({
        where: { id: { in: d.jugadorIds } },
        include: { documentos: true, consentimientos: true, plantel: { include: { equipo: true } } },
      });
      const hoy = new Date();
      const porEquipo = new Map<
        string,
        { equipo: (typeof jugadores)[number]['plantel'][number]['equipo']; lineas: string[] }
      >();
      for (const j of jugadores) {
        const h = habilitacionDelJugador({
          requeridos: requeridos.length ? requeridos : ['DNI', 'APTO_FISICO', 'AUTORIZACION_MENOR'],
          documentos: j.documentos,
          nacimiento: j.fechaNacimiento,
          tutorAutorizo: consentimientoVigente(
            j.consentimientos.map((x) => ({ ...x, tipo: x.tipo as 'TUTOR_PARTICIPACION' })),
            'TUTOR_PARTICIPACION',
          ),
          sancionActiva: false,
          duplicadoAbierto: false,
          hoy,
        });
        if (h.habilitado) continue;
        for (const pl of j.plantel) {
          const g = porEquipo.get(pl.equipoId) ?? { equipo: pl.equipo, lineas: [] };
          g.lineas.push(`${nombreDe(j)} (${h.motivos.join(', ').toLowerCase()})`);
          porEquipo.set(pl.equipoId, g);
        }
      }
      let enviados = 0;
      for (const [equipoId, g] of porEquipo) {
        const receptor = this.mensajeria.receptorDe(g.equipo, {
          id: org.id,
          nombre: org.nombre,
          slug: org.slug,
          plan: org.plan as never,
        });
        const { entregas } = planificarEnvio([receptor], 'WHATSAPP', PLANTILLAS.DOCUMENTACION!.tipo);
        if (!entregas[0]) continue;
        const m = await this.mensajeria.emitir(tx, c.organizacionId, {
          plantilla: PLANTILLAS.DOCUMENTACION!,
          canal: entregas[0].canal,
          receptor,
          extra: { faltantes: g.lineas.join('; ') },
          clave: `documentacion:${equipoId}:${hoy.toISOString().slice(0, 10)}`,
        });
        if (m) enviados++;
      }
      await auditar(tx, c, 'documentacion.solicitar', 'equipo', torneoId ?? 'liga', {
        despues: { enviados },
      });
      return { enviados, equipos: porEquipo.size };
    });
  }

  // ───────────── Consentimientos ─────────────

  solicitarConsentimiento(c: Contexto, jugadorId: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const j = await tx.jugador.findUnique({ where: { id: jugadorId } });
      if (!j) throw noEncontrado('el jugador');
      if (!j.fechaNacimiento) throw new ErrorNegocio('Cargá primero la fecha de nacimiento del jugador.');
      if (!esMenor(j.fechaNacimiento, new Date()))
        throw new ErrorNegocio('El jugador es mayor de edad: no necesita tutor.');
      const token = randomBytes(18).toString('base64url');
      const venceEn = new Date(Date.now() + DATOS.documentacion.vencimientoLinkTutorDias * DIA_MS);
      await tx.solicitudConsentimiento.create({
        data: { organizacionId: c.organizacionId, jugadorId, token, venceEn },
      });
      await auditar(tx, c, 'consentimiento.solicitar', 'jugador', jugadorId);
      return { link: `${config.WEB_URL}/tutor/${token}`, token, venceEn };
    });
  }

  /** La solicitud se identifica por el token (sin sesión): se busca como sistema y desde ahí se trabaja con RLS. */
  private async solicitudPorToken(token: string) {
    // Acceso de sistema justificado: el tutor no tiene sesión; el token imposible de adivinar es la credencial.
    const s = await this.db.sistema.solicitudConsentimiento.findUnique({ where: { token } });
    if (!s || s.usadaEn || s.venceEn.getTime() < Date.now())
      throw new ErrorNegocio('Este link ya se usó o venció. Pedile a la liga que te mande uno nuevo.', 410);
    return s;
  }

  async consentimientoPublico(token: string) {
    const s = await this.solicitudPorToken(token);
    return this.db.enOrg(s.organizacionId, async (tx) => {
      const [j, o] = await enSerie([
        () => tx.jugador.findUniqueOrThrow({ where: { id: s.jugadorId } }),
        () => tx.organizacion.findUniqueOrThrow({ where: { id: s.organizacionId } }),
      ]);
      return {
        liga: o.nombre,
        jugador: nombreDe(j),
        textos: (['TUTOR_PARTICIPACION', 'IMAGEN'] as const).map((t) => ({ tipo: t, ...CONSENTIMIENTOS[t] })),
      };
    });
  }

  async otorgarConsentimiento(token: string, d: ConsentimientoPublicoInput) {
    const s = await this.solicitudPorToken(token);
    return this.db.enOrg(s.organizacionId, async (tx) => {
      const base = {
        organizacionId: s.organizacionId,
        jugadorId: s.jugadorId,
        otorgante: d.tutorNombre,
        otorganteDni: cifrar(normalizarDni(d.tutorDni)),
        vinculo: d.vinculo,
      };
      await tx.consentimiento.create({
        data: { ...base, tipo: 'TUTOR_PARTICIPACION', version: CONSENTIMIENTOS.TUTOR_PARTICIPACION.version },
      });
      if (d.imagen)
        await tx.consentimiento.create({
          data: { ...base, tipo: 'IMAGEN', version: CONSENTIMIENTOS.IMAGEN.version },
        });
      await tx.solicitudConsentimiento.update({ where: { id: s.id }, data: { usadaEn: new Date() } });
      await auditar(
        tx,
        { organizacionId: s.organizacionId },
        'consentimiento.otorgar',
        'jugador',
        s.jugadorId,
        {
          despues: { vinculo: d.vinculo, imagen: d.imagen },
        },
      );
      return { ok: true };
    });
  }

  revocarConsentimiento(c: Contexto, id: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const x = await tx.consentimiento.findUnique({ where: { id } });
      if (!x) throw noEncontrado('el consentimiento');
      if (x.revocadoEn) throw new ErrorNegocio('Ese consentimiento ya estaba revocado.');
      await tx.consentimiento.update({ where: { id }, data: { revocadoEn: new Date() } });
      await auditar(tx, c, 'consentimiento.revocar', 'consentimiento', id, { antes: { tipo: x.tipo } });
      return { ok: true };
    });
  }

  // ───────────── Retención ─────────────

  /** Borra rechazados, vencidos hace tiempo y registros de acceso viejos (plazos en datos.json). */
  aplicarRetencion(c: { organizacionId: string; usuarioId?: string | null }, hoy = new Date()) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const docs = await tx.documentoJugador.findMany({
        where: { OR: [{ estado: 'RECHAZADO' }, { estado: 'APROBADO', vencimiento: { not: null } }] },
      });
      const borrar = docs.filter((d) =>
        d.estado === 'RECHAZADO'
          ? debeBorrarse('RECHAZADO', d.revisadoEn ?? d.creadoEn, hoy)
          : debeBorrarse('VENCIDO', d.vencimiento!, hoy),
      );
      for (const d of borrar)
        if (!d.archivoClave.startsWith('demo:')) await this.almacen.borrar(d.archivoClave);
      if (borrar.length)
        await tx.documentoJugador.deleteMany({ where: { id: { in: borrar.map((d) => d.id) } } });
      const limite = new Date(hoy.getTime() - DATOS.documentacion.retencionDias.ACCESO * DIA_MS);
      const accesos = await tx.accesoDocumento.deleteMany({ where: { creadoEn: { lt: limite } } });
      if (borrar.length || accesos.count)
        await auditar(tx, c, 'documentacion.retencion', 'organizacion', c.organizacionId, {
          despues: { documentos: borrar.length, accesos: accesos.count },
        });
      return { documentos: borrar.length, accesos: accesos.count };
    });
  }
}

/** Imagen de muestra para los documentos de la demo (no hay archivo real). */
function muestra(d: { tipo: string; archivoNombre: string }) {
  const nombre = NOMBRE_DOCUMENTO[d.tipo as TipoDocumento] ?? d.tipo;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" fill="#f4f4ef"/><rect x="24" y="24" width="592" height="352" rx="18" fill="none" stroke="#111" stroke-width="3" stroke-dasharray="10 8"/><text x="320" y="180" font-family="sans-serif" font-size="34" font-weight="700" text-anchor="middle" fill="#111">${nombre}</text><text x="320" y="228" font-family="sans-serif" font-size="20" text-anchor="middle" fill="#555">Documento de muestra de la demo</text></svg>`,
  );
}

@Controller()
export class DocumentacionController {
  constructor(private readonly s: DocumentacionService) {}

  @Get('documentacion')
  @Permiso('documentacion.leer')
  panel(@Ctx() c: Contexto, @Query('torneoId') torneoId?: string) {
    return this.s.panel(c, torneoId);
  }

  @Patch('torneos/:id/documentacion')
  @Permiso('documentacion.escribir')
  requisitos(
    @Ctx() c: Contexto,
    @Param('id') id: string,
    @Body(new Zod(requisitosTorneoSchema)) d: RequisitosTorneoInput,
  ) {
    return this.s.requisitos(c, id, d);
  }

  @Get('documentacion/jugadores/:id')
  @Permiso('documentacion.leer')
  ficha(@Ctx() c: Contexto, @Param('id') id: string, @Query('torneoId') torneoId?: string) {
    return this.s.ficha(c, id, torneoId);
  }

  @Patch('documentacion/jugadores/:id/identidad')
  @Permiso('documentacion.escribir')
  identidad(@Ctx() c: Contexto, @Param('id') id: string, @Body(new Zod(identidadSchema)) d: IdentidadInput) {
    return this.s.identidad(c, id, d);
  }

  @Get('documentacion/jugadores/:id/identidad')
  @Permiso('documentacion.revisar')
  verIdentidad(@Ctx() c: Contexto, @Param('id') id: string) {
    return this.s.verIdentidad(c, id);
  }

  @Post('documentacion/jugadores/:id/documentos')
  @Permiso('documentacion.escribir')
  subir(
    @Ctx() c: Contexto,
    @Param('id') id: string,
    @Body(new Zod(subirDocumentoSchema)) d: SubirDocumentoInput,
  ) {
    return this.s.subir(c, id, d);
  }

  @Post('documentacion/documentos/:id/revisar')
  @Permiso('documentacion.revisar')
  revisar(
    @Ctx() c: Contexto,
    @Param('id') id: string,
    @Body(new Zod(revisarDocumentoSchema)) d: RevisarDocumentoInput,
  ) {
    return this.s.revisar(c, id, d);
  }

  @Post('documentacion/documentos/:id/url')
  @Permiso('documentacion.revisar')
  url(@Ctx() c: Contexto, @Param('id') id: string) {
    return this.s.urlFirmada(c, id);
  }

  @Get('documentacion/documentos/:id/accesos')
  @Permiso('documentacion.revisar')
  accesos(@Ctx() c: Contexto, @Param('id') id: string) {
    return this.s.accesos(c, id);
  }

  /** El link firmado es la credencial: se abre desde el navegador sin más. */
  @Get('documentos/archivo/:token')
  @Publico()
  async archivo(@Param('token') token: string, @Res() res: Response) {
    const a = await this.s.archivo(token);
    res.setHeader('Content-Type', a.mime);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(a.nombre)}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:");
    res.send(a.datos);
  }

  @Get('documentacion/duplicados')
  @Permiso('documentacion.leer')
  duplicados(@Ctx() c: Contexto) {
    return this.s.duplicados(c);
  }

  @Post('documentacion/duplicados/:id/resolver')
  @Permiso('documentacion.revisar')
  resolver(
    @Ctx() c: Contexto,
    @Param('id') id: string,
    @Body(new Zod(resolverDuplicadoSchema)) d: ResolverDuplicadoInput,
  ) {
    return this.s.resolverDuplicado(c, id, d);
  }

  @Post('documentacion/solicitar')
  @Permiso('documentacion.escribir')
  solicitar(
    @Ctx() c: Contexto,
    @Body(new Zod(solicitarDocumentacionSchema)) d: SolicitarDocumentacionInput,
    @Query('torneoId') torneoId?: string,
  ) {
    return this.s.solicitar(c, d, torneoId);
  }

  @Post('documentacion/jugadores/:id/consentimiento-tutor')
  @Permiso('documentacion.escribir')
  solicitarConsentimiento(@Ctx() c: Contexto, @Param('id') id: string) {
    return this.s.solicitarConsentimiento(c, id);
  }

  @Post('documentacion/consentimientos/:id/revocar')
  @Permiso('documentacion.escribir')
  revocar(@Ctx() c: Contexto, @Param('id') id: string) {
    return this.s.revocarConsentimiento(c, id);
  }

  @Post('documentacion/retencion')
  @Permiso('documentacion.revisar')
  retencion(@Ctx() c: Contexto) {
    return this.s.aplicarRetencion(c);
  }

  // Sin sesión: el tutor entra con el link que le mandó la liga.
  @Get('consentimientos-tutor/:token')
  @Publico()
  verConsentimiento(@Param('token') token: string) {
    return this.s.consentimientoPublico(token);
  }

  @Post('consentimientos-tutor/:token')
  @Publico()
  otorgar(
    @Param('token') token: string,
    @Body(new Zod(consentimientoPublicoSchema)) d: ConsentimientoPublicoInput,
  ) {
    return this.s.otorgarConsentimiento(token, d);
  }
}

@Module({
  imports: [MensajeriaModule],
  controllers: [DocumentacionController],
  providers: [
    { provide: ALMACEN, useClass: AlmacenLocal },
    {
      provide: DocumentacionService,
      useFactory: (db: DbService, m: MensajeriaService, a: AlmacenArchivos) =>
        new DocumentacionService(db, m, a),
      inject: [DbService, MensajeriaService, ALMACEN],
    },
  ],
  exports: [DocumentacionService],
})
export class DocumentacionModule {}
