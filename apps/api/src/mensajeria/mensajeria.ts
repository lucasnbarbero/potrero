// Comunicación (E16): un solo mensaje, a quien corresponde. Plantillas con variables, reglas de canal y costo, topes por plan,
// envíos programados, automatizaciones y confirmaciones ("Confirmo" / "No puedo"). Las reglas puras viven en @potrero/shared.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Injectable,
  Logger,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  AUTOMATIZACIONES,
  automatizacionSchema,
  type AutomatizacionInput,
  type CanalMensaje,
  type ClaveAutomatizacion,
  confirmacionSchema,
  type ConfirmacionInput,
  costoUsdDeMensaje,
  type Destinatario,
  envioSchema,
  type EnvioInput,
  esRecordatorio24h,
  estimarEnvio,
  etapaDeCobro,
  evaluarTope,
  formatoPesos,
  type Plan,
  PLANTILLAS,
  planificarEnvio,
  type Plantilla,
  renderizar,
  type Segmento,
  variablesDe,
  variablesDesconocidas,
} from '@potrero/shared';
import { type Contexto, Ctx, ErrorNegocio, noEncontrado, Permiso, Publico, Zod } from '../comun/http.js';
import { cuandoDe, hoyEnArgentina } from '../comun/formato.js';
import { CobrosModule, CobrosService, firmar } from '../cobros/cobros.js';
import { config } from '../config.js';
import { DbService, type Tx } from '../db/db.service.js';
import type { Equipo, Mensaje } from '../generated/prisma/client.js';
import { crearCanales } from './canales.js';

/** Plantillas que el organizador puede mandar a mano. Las demás las manda el sistema (hablan de un partido en particular). */
const MANUALES = ['RECORDATORIO_PAGO', 'FIXTURE_PUBLICADO', 'LIBRE'];

interface Receptor extends Destinatario {
  /** Variables que se conocen de este destinatario (capitán, equipo, torneo…). */
  vars: Record<string, string>;
  cargoId?: string;
}

interface OrgInfo {
  id: string;
  nombre: string;
  slug: string;
  plan: Plan;
}

interface Emision {
  plantilla: Plantilla;
  texto?: string;
  canal: CanalMensaje;
  receptor: Receptor;
  extra?: Record<string, string>;
  difusionId?: string;
  contingenciaId?: string;
  clave?: string;
}

const inicioDeMes = (ahora: Date) => new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1));

const describirSegmento = (s: Segmento, nombres: { torneo?: string }) =>
  s.tipo === 'TODOS'
    ? 'todos los capitanes'
    : s.tipo === 'TORNEO'
      ? `capitanes de ${nombres.torneo ?? 'un torneo'}`
      : s.tipo === 'MOROSOS'
        ? 'solo morosos'
        : `${s.equipoIds.length} equipo${s.equipoIds.length > 1 ? 's' : ''}`;

@Injectable()
export class MensajeriaService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Mensajeria');
  private readonly canales = crearCanales();
  private temporizador?: NodeJS.Timeout;

  constructor(
    private readonly db: DbService,
    private readonly cobros: CobrosService,
  ) {}

  /** Cada minuto: envía lo programado y corre las automatizaciones. En los tests se llaman a mano. */
  onModuleInit() {
    if (config.NODE_ENV === 'test') return;
    this.temporizador = setInterval(() => void this.ciclo(), 60_000);
    this.temporizador.unref();
  }

  onModuleDestroy() {
    clearInterval(this.temporizador);
  }

  async ciclo(ahora = new Date()) {
    try {
      await this.procesarProgramadas(ahora);
      await this.ejecutarAutomatizaciones(ahora);
    } catch (e) {
      this.log.error(`El ciclo de mensajería falló: ${e instanceof Error ? e.message : e}`);
    }
  }

  // ───────────── Catálogo ─────────────

  plantillas() {
    return Object.values(PLANTILLAS).map((p) => ({
      clave: p.clave,
      nombre: p.nombre,
      tipo: p.tipo,
      categoriaWhatsapp: p.categoriaWhatsapp,
      version: p.version,
      cuerpo: p.cuerpo,
      variables: variablesDe(p.cuerpo),
      manual: MANUALES.includes(p.clave),
    }));
  }

  private plantillaManual(clave: string, texto?: string): Plantilla {
    const p = PLANTILLAS[clave];
    if (!p || !MANUALES.includes(clave)) throw new ErrorNegocio('Esa plantilla no se puede mandar a mano.');
    if (clave === 'LIBRE') {
      if (!texto) throw new ErrorNegocio('Escribí el mensaje.');
      const raras = variablesDesconocidas(texto);
      if (raras.length)
        throw new ErrorNegocio(
          `Estas variables no existen en un mensaje libre: ${raras.map((v) => `{${v}}`).join(', ')}.`,
        );
    }
    return p;
  }

  // ───────────── Destinatarios ─────────────

  private async org(tx: Tx, organizacionId: string): Promise<OrgInfo> {
    const o = await tx.organizacion.findUniqueOrThrow({ where: { id: organizacionId } });
    return { id: o.id, nombre: o.nombre, slug: o.slug, plan: o.plan as Plan };
  }

  receptorDe(e: Equipo, org: OrgInfo, extra: Record<string, string> = {}): Receptor {
    return {
      equipoId: e.id,
      nombre: e.capitanNombre ?? 'capitán',
      email: e.capitanEmail,
      telefono: e.capitanTelefono,
      optInWhatsapp: e.capitanOptInWhatsapp,
      bajaMarketing: e.capitanBajaMarketing,
      vars: { capitán: e.capitanNombre ?? 'capitán', equipo: e.nombre, liga: org.nombre, ...extra },
    };
  }

  private linkTorneo(org: OrgInfo, torneoSlug: string) {
    return `${config.WEB_URL}/t/${org.slug}/${torneoSlug}`;
  }

  /** A quién va un envío, con las variables de cada uno. */
  private async receptores(
    tx: Tx,
    org: OrgInfo,
    seg: Segmento,
  ): Promise<{ receptores: Receptor[]; torneo?: string }> {
    if (seg.tipo === 'TODOS' || seg.tipo === 'EQUIPOS') {
      const equipos = await tx.equipo.findMany({
        where: seg.tipo === 'EQUIPOS' ? { id: { in: seg.equipoIds } } : {},
        orderBy: { nombre: 'asc' },
      });
      if (seg.tipo === 'EQUIPOS' && equipos.length === 0) throw noEncontrado('los equipos elegidos');
      return { receptores: equipos.map((e) => this.receptorDe(e, org)) };
    }
    if (seg.tipo === 'TORNEO') {
      const torneo = await tx.torneo.findUnique({ where: { id: seg.torneoId } });
      if (!torneo) throw noEncontrado('el torneo');
      const inscripciones = await tx.inscripcion.findMany({
        where: { torneoId: torneo.id, estado: { not: 'BAJA' } },
        include: { equipo: true },
        orderBy: { equipo: { nombre: 'asc' } },
      });
      return {
        torneo: torneo.nombre,
        receptores: inscripciones.map((i) =>
          this.receptorDe(i.equipo, org, {
            torneo: torneo.nombre,
            link_torneo: this.linkTorneo(org, torneo.slug),
          }),
        ),
      };
    }
    // MOROSOS: equipos con algún cargo pendiente (de un torneo o de todos).
    const inscripciones = await tx.inscripcion.findMany({
      where: {
        ...(seg.torneoId ? { torneoId: seg.torneoId } : {}),
        estado: { not: 'BAJA' },
        cargos: { some: { estado: 'PENDIENTE' } },
      },
      include: {
        equipo: true,
        torneo: true,
        cargos: { where: { estado: 'PENDIENTE' }, orderBy: { creadoEn: 'asc' } },
      },
      orderBy: { equipo: { nombre: 'asc' } },
    });
    return {
      torneo: seg.torneoId ? inscripciones[0]?.torneo.nombre : undefined,
      receptores: inscripciones.map((i) => ({
        ...this.receptorDe(i.equipo, org, {
          torneo: i.torneo.nombre,
          link_torneo: this.linkTorneo(org, i.torneo.slug),
          monto: formatoPesos(i.cargos.reduce((s, c) => s + c.monto, 0)),
        }),
        cargoId: i.cargos[0]!.id,
      })),
    };
  }

  // ───────────── Vista previa y envío ─────────────

  async usadosWhatsapp(tx: Tx, ahora: Date) {
    return tx.mensaje.count({
      where: { canal: 'WHATSAPP', estado: { not: 'FALLIDO' }, creadoEn: { gte: inicioDeMes(ahora) } },
    });
  }

  private async preparar(tx: Tx, organizacionId: string, d: EnvioInput) {
    const plantilla = this.plantillaManual(d.plantilla, d.texto);
    const org = await this.org(tx, organizacionId);
    const { receptores, torneo } = await this.receptores(tx, org, d.segmento);
    const plan = planificarEnvio(receptores, d.canal, plantilla.tipo);
    const estimacion = estimarEnvio(plan.entregas, plantilla.categoriaWhatsapp);
    const tope = evaluarTope(
      org.plan,
      await this.usadosWhatsapp(tx, new Date()),
      estimacion.porCanal.WHATSAPP,
    );
    // Si a la plantilla le falta alguna variable para algún destinatario, se avisa ahora y no a la hora de salir.
    const faltantes = new Set<string>();
    for (const e of plan.entregas) {
      const r = e.destinatario as Receptor;
      const vars = { ...(r.cargoId ? { link_pago: 'x' } : {}), ...r.vars };
      for (const f of renderizar(d.texto ?? plantilla.cuerpo, vars).faltantes) faltantes.add(f);
    }
    const problemas = faltantes.size
      ? [
          `Falta completar ${[...faltantes].map((f) => `{${f}}`).join(', ')}: elegí a quién va (un torneo, o solo morosos para el link de pago) o cambiá el texto.`,
        ]
      : [];
    return { plantilla, org, receptores, torneo, plan, estimacion, tope, problemas };
  }

  /** Lo que va a pasar si se envía: cuántos reciben, por qué canal, cuánto cuesta y cómo les llega el mensaje. */
  vistaPrevia(c: Contexto, d: EnvioInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const p = await this.preparar(tx, c.organizacionId, d);
      const primero = p.plan.entregas[0];
      let ejemplo: {
        para: string;
        equipo: string;
        canal: CanalMensaje;
        asunto: string;
        cuerpo: string;
      } | null = null;
      if (primero) {
        const r = primero.destinatario as Receptor;
        const vars = { ...(r.cargoId ? { link_pago: `${config.WEB_URL}/pago/…` } : {}), ...r.vars };
        const cuerpo = renderizar(d.texto ?? p.plantilla.cuerpo, vars);
        const asunto = renderizar(p.plantilla.asunto, vars);
        ejemplo = {
          para: r.nombre,
          equipo: r.vars.equipo!,
          canal: primero.canal,
          asunto: asunto.texto,
          cuerpo: cuerpo.texto,
        };
      }
      return {
        plantilla: {
          clave: p.plantilla.clave,
          nombre: p.plantilla.nombre,
          tipo: p.plantilla.tipo,
          version: p.plantilla.version,
        },
        destinatarios: p.receptores.length,
        entregas: p.plan.entregas.length,
        porCanal: p.estimacion.porCanal,
        cambiosDeCanal: p.plan.entregas.filter((e) => e.pedido).length,
        omitidos: p.plan.omitidos.map((o) => ({
          equipo: (o.destinatario as Receptor).vars.equipo,
          capitan: o.destinatario.nombre,
          motivo: o.motivo,
        })),
        costoUsd: p.estimacion.costoUsd,
        costoArs: p.estimacion.costoArs,
        tope: p.tope,
        plan: p.org.plan,
        problemas: p.problemas,
        ejemplo,
      };
    });
  }

  /** Envía ahora o deja programado. Si el envío se pasa del tope de WhatsApp del plan, no sale nada. */
  enviar(c: Contexto, d: EnvioInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const p = await this.preparar(tx, c.organizacionId, d);
      if (p.plan.entregas.length === 0)
        throw new ErrorNegocio('No hay a quién enviárselo. Revisá los destinatarios y los canales.');
      if (p.problemas.length) throw new ErrorNegocio(p.problemas[0]!);
      if (p.tope.excedente > 0)
        throw new ErrorNegocio(
          `Este envío usa ${p.estimacion.porCanal.WHATSAPP} WhatsApp y te quedan ${p.tope.restantes} este mes en tu plan. Elegí email o achicá los destinatarios.`,
        );
      const titulo = `${p.plantilla.nombre} · ${describirSegmento(d.segmento, { torneo: p.torneo })}`;
      const programada = d.programadaPara ? new Date(d.programadaPara) : null;
      const base = {
        organizacionId: c.organizacionId,
        plantilla: d.plantilla,
        canal: d.canal,
        titulo,
        segmento: d.segmento,
        texto: d.texto ?? null,
        creadaPorId: c.usuarioId,
      };
      if (programada && programada.getTime() > Date.now() + 30_000) {
        const dif = await tx.difusion.create({
          data: { ...base, programadaPara: programada, estado: 'PROGRAMADA' },
        });
        return { programada: true, difusionId: dif.id, para: programada, entregas: p.plan.entregas.length };
      }
      const dif = await tx.difusion.create({ data: base });
      return { programada: false, ...(await this.despacharDifusion(tx, p, dif.id, d)) };
    });
  }

  private async despacharDifusion(
    tx: Tx,
    p: Awaited<ReturnType<MensajeriaService['preparar']>>,
    difusionId: string,
    d: EnvioInput,
  ) {
    let enviados = 0;
    let fallidos = 0;
    const usaLinkPago = variablesDe(d.texto ?? p.plantilla.cuerpo).includes('link_pago');
    for (const e of p.plan.entregas) {
      const receptor = e.destinatario as Receptor;
      const extra: Record<string, string> = {};
      if (usaLinkPago) {
        if (!receptor.cargoId)
          throw new ErrorNegocio('El link de pago solo se puede usar al escribirle a los morosos.');
        extra.link_pago = (await this.cobros.linkDePago(p.org.id, receptor.cargoId)).urlPago;
      }
      const m = await this.emitir(tx, p.org.id, {
        plantilla: p.plantilla,
        texto: d.texto,
        canal: e.canal,
        receptor,
        extra,
        difusionId,
      });
      if (m?.estado === 'FALLIDO') fallidos++;
      else enviados++;
    }
    return {
      difusionId,
      enviados,
      fallidos,
      omitidos: p.plan.omitidos.length,
      costoUsd: p.estimacion.costoUsd,
    };
  }

  /** Envíos programados que ya llegaron a su hora. Se toma cada uno con un cambio de estado para no mandarlo dos veces. */
  async procesarProgramadas(ahora = new Date()) {
    const vencidas = await this.db.sistema.difusion.findMany({
      where: { estado: 'PROGRAMADA', programadaPara: { lte: ahora } },
    });
    let procesadas = 0;
    for (const dif of vencidas) {
      try {
        await this.db.enOrg(dif.organizacionId, async (tx) => {
          const tomada = await tx.difusion.updateMany({
            where: { id: dif.id, estado: 'PROGRAMADA' },
            data: { estado: 'ENVIADA' },
          });
          if (tomada.count === 0) return;
          const d: EnvioInput = {
            plantilla: dif.plantilla,
            canal: dif.canal,
            segmento: dif.segmento as Segmento,
            ...(dif.texto ? { texto: dif.texto } : {}),
          };
          const p = await this.preparar(tx, dif.organizacionId, d);
          await this.despacharDifusion(tx, p, dif.id, d);
          procesadas++;
        });
      } catch (e) {
        this.log.error(`No se pudo enviar la difusión ${dif.id}: ${e instanceof Error ? e.message : e}`);
      }
    }
    return procesadas;
  }

  // ───────────── Emisión de un mensaje ─────────────

  /**
   * Arma, guarda y despacha un mensaje a una persona. Con `clave` es idempotente: si ya existe, no hace nada.
   * Devuelve null si ya estaba enviado.
   */
  async emitir(tx: Tx, organizacionId: string, e: Emision): Promise<Mensaje | null> {
    if (e.clave && (await tx.mensaje.findFirst({ where: { clave: e.clave } }))) return null;
    const { plantilla, canal, receptor } = e;
    const token = plantilla.conConfirmacion ? randomBytes(18).toString('base64url') : null;
    const vars = {
      ...receptor.vars,
      ...e.extra,
      ...(token ? { link_confirmacion: `${config.WEB_URL}/c/${token}` } : {}),
    };
    const cuerpo = renderizar(e.texto ?? plantilla.cuerpo, vars);
    const asunto = renderizar(plantilla.asunto, vars);
    if (cuerpo.faltantes.length)
      throw new ErrorNegocio(
        `Al mensaje le falta completar: ${cuerpo.faltantes.map((f) => `{${f}}`).join(', ')}.`,
      );
    const destino = canal === 'EMAIL' ? receptor.email : canal === 'WHATSAPP' ? receptor.telefono : 'push';
    const m = await tx.mensaje.create({
      data: {
        organizacionId,
        difusionId: e.difusionId ?? null,
        contingenciaId: e.contingenciaId ?? null,
        equipoId: receptor.equipoId,
        clave: e.clave ?? null,
        plantilla: plantilla.clave,
        version: plantilla.version,
        canal,
        destinatario: receptor.nombre,
        destino: destino ?? '',
        asunto: asunto.texto,
        cuerpo: cuerpo.texto,
        costoUsd: costoUsdDeMensaje(canal, plantilla.categoriaWhatsapp),
        token,
      },
    });
    return this.despachar(tx, m);
  }

  private async despachar(tx: Tx, m: Mensaje): Promise<Mensaje> {
    try {
      const r = await this.canales[m.canal].despachar({
        canal: m.canal,
        destino: m.destino,
        asunto: m.asunto,
        cuerpo: m.cuerpo,
      });
      const ahora = new Date();
      return tx.mensaje.update({
        where: { id: m.id },
        data: {
          estado: r.estado,
          proveedorId: r.proveedorId,
          enviadoEn: ahora,
          ...(r.estado === 'ENTREGADO' ? { entregadoEn: ahora } : {}),
        },
      });
    } catch (e) {
      return tx.mensaje.update({
        where: { id: m.id },
        data: { estado: 'FALLIDO', error: e instanceof Error ? e.message : String(e) },
      });
    }
  }

  // ───────────── Historial ─────────────

  historial(c: Contexto) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const org = await this.org(tx, c.organizacionId);
      const difusiones = await tx.difusion.findMany({ orderBy: { creadoEn: 'desc' }, take: 20 });
      const grupos = await tx.mensaje.groupBy({
        by: ['difusionId', 'estado'],
        where: { difusionId: { in: difusiones.map((d) => d.id) } },
        _count: { _all: true },
        _sum: { costoUsd: true },
      });
      const envios = difusiones.map((d) => {
        const g = grupos.filter((x) => x.difusionId === d.id);
        const n = (...estados: string[]) =>
          g.filter((x) => estados.includes(x.estado)).reduce((s, x) => s + x._count._all, 0);
        const total = n('PENDIENTE', 'ENVIADO', 'ENTREGADO', 'LEIDO', 'FALLIDO');
        return {
          id: d.id,
          titulo: d.titulo,
          plantilla: d.plantilla,
          canal: d.canal,
          estado: d.estado,
          programadaPara: d.programadaPara,
          creadoEn: d.creadoEn,
          total,
          entregados: n('ENTREGADO', 'LEIDO'),
          leidos: n('LEIDO'),
          fallidos: n('FALLIDO'),
          costoUsd: Math.round(g.reduce((s, x) => s + (x._sum.costoUsd ?? 0), 0) * 1000) / 1000,
        };
      });
      const ahora = new Date();
      const [usados, automaticos] = await Promise.all([
        this.usadosWhatsapp(tx, ahora),
        tx.mensaje.count({ where: { difusionId: null, creadoEn: { gte: inicioDeMes(ahora) } } }),
      ]);
      return {
        envios,
        automaticosDelMes: automaticos,
        tope: evaluarTope(org.plan, usados, 0),
        plan: org.plan,
      };
    });
  }

  detalleDifusion(c: Contexto, id: string) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const dif = await tx.difusion.findUnique({ where: { id } });
      if (!dif) throw noEncontrado('el envío');
      const mensajes = await tx.mensaje.findMany({
        where: { difusionId: id },
        orderBy: { destinatario: 'asc' },
        take: 300,
      });
      return {
        id: dif.id,
        titulo: dif.titulo,
        mensajes: mensajes.map((m) => ({
          id: m.id,
          destinatario: m.destinatario,
          canal: m.canal,
          estado: m.estado,
          costoUsd: m.costoUsd,
          error: m.error,
          cuerpo: m.cuerpo,
        })),
      };
    });
  }

  // ───────────── Automatizaciones ─────────────

  automatizaciones(c: Contexto) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      const guardadas = await tx.automatizacion.findMany();
      return (Object.keys(AUTOMATIZACIONES) as ClaveAutomatizacion[]).map((clave) => {
        const g = guardadas.find((x) => x.clave === clave);
        return {
          clave,
          ...AUTOMATIZACIONES[clave],
          activa: g?.activa ?? false,
          canal: g?.canal ?? 'WHATSAPP',
        };
      });
    });
  }

  configurarAutomatizacion(c: Contexto, clave: string, d: AutomatizacionInput) {
    return this.db.enOrg(c.organizacionId, async (tx) => {
      if (!(clave in AUTOMATIZACIONES)) throw noEncontrado('la automatización');
      return tx.automatizacion.upsert({
        where: { organizacionId_clave: { organizacionId: c.organizacionId, clave } },
        create: { organizacionId: c.organizacionId, clave, activa: d.activa, canal: d.canal ?? 'WHATSAPP' },
        update: { activa: d.activa, ...(d.canal ? { canal: d.canal } : {}) },
      });
    });
  }

  /** Las automatizaciones por tiempo (recordatorios de partido y de cobro). Idempotentes por clave de mensaje. */
  async ejecutarAutomatizaciones(ahora = new Date()) {
    const activas = await this.db.sistema.automatizacion.findMany({ where: { activa: true } });
    let enviados = 0;
    for (const [organizacionId, lista] of Map.groupBy(activas, (a) => a.organizacionId)) {
      await this.db.enOrg(organizacionId, async (tx) => {
        const org = await this.org(tx, organizacionId);
        for (const a of lista) {
          if (a.clave === 'RECORDATORIO_PARTIDO')
            enviados += await this.recordatoriosDePartido(tx, org, a.canal, ahora);
          if (a.clave === 'COBRO_ESCALONADO')
            enviados += await this.recordatoriosDeCobro(tx, org, a.canal, ahora);
        }
      });
    }
    return enviados;
  }

  /** Planifica y emite para un solo destinatario con el canal de la automatización (con sus cambios de canal). */
  private async emitirAutomatico(
    tx: Tx,
    org: OrgInfo,
    plantilla: Plantilla,
    canal: CanalMensaje,
    receptor: Receptor,
    clave: string,
    extra: Record<string, string> = {},
  ) {
    const { entregas } = planificarEnvio([receptor], canal, plantilla.tipo);
    if (!entregas[0]) return 0;
    const m = await this.emitir(tx, org.id, { plantilla, canal: entregas[0].canal, receptor, extra, clave });
    return m ? 1 : 0;
  }

  private async recordatoriosDePartido(tx: Tx, org: OrgInfo, canal: CanalMensaje, ahora: Date) {
    const proximos = await tx.partido.findMany({
      where: { estado: 'PROGRAMADO', inicio: { gt: ahora, lte: new Date(ahora.getTime() + 24 * 3_600_000) } },
      include: { cancha: { include: { sede: true } }, torneo: true },
    });
    const equipos = await tx.equipo.findMany({
      where: { id: { in: proximos.flatMap((p) => [p.localId, p.visitanteId]) } },
    });
    const porId = new Map(equipos.map((e) => [e.id, e]));
    let n = 0;
    for (const p of proximos) {
      if (!p.inicio || !esRecordatorio24h(p.inicio, ahora)) continue;
      for (const [propio, rival] of [
        [p.localId, p.visitanteId],
        [p.visitanteId, p.localId],
      ] as const) {
        const e = porId.get(propio);
        const r = porId.get(rival);
        if (!e || !r) continue;
        n += await this.emitirAutomatico(
          tx,
          org,
          PLANTILLAS.RECORDATORIO_PARTIDO!,
          canal,
          this.receptorDe(e, org, { torneo: p.torneo.nombre }),
          `rec24:${p.id}:${e.id}`,
          {
            rival: r.nombre,
            cuando: cuandoDe(p.inicio),
            cancha: p.cancha ? `${p.cancha.sede.nombre} · ${p.cancha.nombre}` : 'cancha a confirmar',
          },
        );
      }
    }
    return n;
  }

  private async recordatoriosDeCobro(tx: Tx, org: OrgInfo, canal: CanalMensaje, ahora: Date) {
    const hoy = hoyEnArgentina(ahora);
    const cargos = await tx.cargo.findMany({
      where: { estado: 'PENDIENTE', vence: { not: null } },
      include: { inscripcion: { include: { equipo: true, torneo: true } } },
    });
    let n = 0;
    for (const cargo of cargos) {
      const etapa = etapaDeCobro(hoy, cargo.vence!.toISOString().slice(0, 10));
      if (!etapa) continue;
      const { equipo, torneo } = cargo.inscripcion;
      const link = (await this.cobros.linkDePago(org.id, cargo.id)).urlPago;
      n += await this.emitirAutomatico(
        tx,
        org,
        PLANTILLAS.RECORDATORIO_PAGO!,
        canal,
        this.receptorDe(equipo, org, {
          torneo: torneo.nombre,
          monto: formatoPesos(cargo.monto),
          link_torneo: this.linkTorneo(org, torneo.slug),
        }),
        `cobro:${cargo.id}:${etapa}`,
        { link_pago: link },
      );
    }
    return n;
  }

  /** Al cerrar un acta: avisa al capitán de cada jugador sancionado, si el organizador lo tiene encendido. */
  async avisarSuspensiones(
    tx: Tx,
    organizacionId: string,
    partidoId: string,
    sanciones: readonly { jugadorId: string; equipoId: string; causa: string; partidos: number }[],
  ) {
    if (sanciones.length === 0) return 0;
    const auto = await tx.automatizacion.findUnique({
      where: { organizacionId_clave: { organizacionId, clave: 'AVISO_SUSPENSION' } },
    });
    if (!auto?.activa) return 0;
    const org = await this.org(tx, organizacionId);
    const partido = await tx.partido.findUniqueOrThrow({
      where: { id: partidoId },
      include: { torneo: true },
    });
    const [equipos, jugadores] = [
      await tx.equipo.findMany({ where: { id: { in: sanciones.map((s) => s.equipoId) } } }),
      await tx.jugador.findMany({ where: { id: { in: sanciones.map((s) => s.jugadorId) } } }),
    ];
    const causa: Record<string, string> = {
      ROJA_DIRECTA: 'roja directa',
      DOBLE_AMARILLA: 'doble amarilla',
      ACUMULACION: 'acumulación de amarillas',
    };
    let n = 0;
    for (const s of sanciones) {
      const e = equipos.find((x) => x.id === s.equipoId);
      const j = jugadores.find((x) => x.id === s.jugadorId);
      if (!e || !j) continue;
      n += await this.emitirAutomatico(
        tx,
        org,
        PLANTILLAS.SUSPENSION!,
        auto.canal,
        this.receptorDe(e, org, {
          torneo: partido.torneo.nombre,
          link_torneo: this.linkTorneo(org, partido.torneo.slug),
        }),
        `susp:${partidoId}:${s.jugadorId}:${s.causa}`,
        {
          jugador: `${j.nombre} ${j.apellido}`,
          partidos: `${s.partidos} partido${s.partidos > 1 ? 's' : ''}`,
          causa: causa[s.causa] ?? s.causa,
        },
      );
    }
    return n;
  }

  // ───────────── Confirmaciones públicas ("Confirmo" / "No puedo") ─────────────

  /** El mensaje se identifica por un token imposible de adivinar: se busca sin sesión y, desde ahí, se trabaja con RLS. */
  private async porToken(token: string) {
    // Acceso de sistema justificado: la persona que confirma no tiene sesión, el token es la credencial.
    const m = await this.db.sistema.mensaje.findUnique({ where: { token } });
    if (!m) throw noEncontrado('la confirmación');
    return m;
  }

  async confirmacion(token: string) {
    const m = await this.porToken(token);
    return this.db.enOrg(m.organizacionId, async (tx) => {
      const org = await this.org(tx, m.organizacionId);
      // Abrir el link cuenta como lectura.
      const leido = m.leidoEn
        ? m
        : await tx.mensaje.update({ where: { id: m.id }, data: { estado: 'LEIDO', leidoEn: new Date() } });
      return {
        liga: org.nombre,
        destinatario: leido.destinatario,
        mensaje: leido.cuerpo,
        respuesta: leido.respuesta,
        respondidoEn: leido.respondidoEn,
      };
    });
  }

  async responder(token: string, d: ConfirmacionInput) {
    const m = await this.porToken(token);
    return this.db.enOrg(m.organizacionId, async (tx) => {
      const ahora = new Date();
      await tx.mensaje.update({
        where: { id: m.id },
        data: { respuesta: d.respuesta, respondidoEn: ahora, estado: 'LEIDO', leidoEn: m.leidoEn ?? ahora },
      });
      return { respuesta: d.respuesta };
    });
  }

  /** Aviso de entrega del proveedor (E16-11): marca el mensaje como entregado, leído o fallido. */
  async entrega(d: { proveedorId: string; estado: 'ENTREGADO' | 'LEIDO' | 'FALLIDO'; error?: string }) {
    // Acceso de sistema justificado: el proveedor no conoce la organización, solo el id que él mismo asignó.
    const m = await this.db.sistema.mensaje.findFirst({ where: { proveedorId: d.proveedorId } });
    if (!m) throw noEncontrado('el mensaje');
    const ahora = new Date();
    await this.db.enOrg(m.organizacionId, (tx) =>
      tx.mensaje.update({
        where: { id: m.id },
        data:
          d.estado === 'FALLIDO'
            ? { estado: 'FALLIDO', error: d.error ?? 'El proveedor no pudo entregarlo.' }
            : d.estado === 'LEIDO'
              ? { estado: 'LEIDO', leidoEn: ahora, entregadoEn: m.entregadoEn ?? ahora }
              : { estado: m.estado === 'LEIDO' ? 'LEIDO' : 'ENTREGADO', entregadoEn: m.entregadoEn ?? ahora },
      }),
    );
    return { ok: true };
  }
}

@Controller('comunicacion')
export class ComunicacionController {
  constructor(private readonly s: MensajeriaService) {}

  @Get('plantillas')
  @Permiso('comunicacion.leer')
  plantillas() {
    return this.s.plantillas();
  }

  @Post('vista-previa')
  @HttpCode(HttpStatus.OK)
  @Permiso('comunicacion.leer')
  vistaPrevia(@Ctx() c: Contexto, @Body(new Zod(envioSchema)) d: EnvioInput) {
    return this.s.vistaPrevia(c, d);
  }

  @Post('enviar')
  @Permiso('comunicacion.escribir')
  enviar(@Ctx() c: Contexto, @Body(new Zod(envioSchema)) d: EnvioInput) {
    return this.s.enviar(c, d);
  }

  @Get('historial')
  @Permiso('comunicacion.leer')
  historial(@Ctx() c: Contexto) {
    return this.s.historial(c);
  }

  @Get('envios/:id')
  @Permiso('comunicacion.leer')
  detalle(@Ctx() c: Contexto, @Param('id') id: string) {
    return this.s.detalleDifusion(c, id);
  }

  @Get('automatizaciones')
  @Permiso('comunicacion.leer')
  automatizaciones(@Ctx() c: Contexto) {
    return this.s.automatizaciones(c);
  }

  @Patch('automatizaciones/:clave')
  @Permiso('comunicacion.escribir')
  configurar(
    @Ctx() c: Contexto,
    @Param('clave') clave: string,
    @Body(new Zod(automatizacionSchema)) d: AutomatizacionInput,
  ) {
    return this.s.configurarAutomatizacion(c, clave, d);
  }
}

/** Páginas y avisos sin sesión: la confirmación de asistencia y el aviso de entrega del proveedor. */
@Controller()
export class ConfirmacionesController {
  constructor(private readonly s: MensajeriaService) {}

  @Publico()
  @Get('confirmaciones/:token')
  ver(@Param('token') token: string) {
    return this.s.confirmacion(token);
  }

  @Publico()
  @Post('confirmaciones/:token')
  @HttpCode(HttpStatus.OK)
  responder(@Param('token') token: string, @Body(new Zod(confirmacionSchema)) d: ConfirmacionInput) {
    return this.s.responder(token, d);
  }

  /** Webhook de entrega: valida la firma igual que el de pagos. */
  @Publico()
  @Post('webhooks/mensajeria')
  @HttpCode(HttpStatus.OK)
  entrega(@Headers('x-firma') firma: string | undefined, @Body() cuerpo: unknown) {
    const esperado = firmar(JSON.stringify(cuerpo));
    if (
      !firma ||
      firma.length !== esperado.length ||
      !timingSafeEqual(Buffer.from(firma), Buffer.from(esperado))
    )
      throw new ErrorNegocio('Firma inválida.', HttpStatus.UNAUTHORIZED);
    const c = cuerpo as { proveedorId?: string; estado?: string; error?: string };
    if (!c.proveedorId || !['ENTREGADO', 'LEIDO', 'FALLIDO'].includes(c.estado ?? ''))
      throw new ErrorNegocio('Aviso de entrega inválido.');
    return this.s.entrega({
      proveedorId: c.proveedorId,
      estado: c.estado as 'ENTREGADO' | 'LEIDO' | 'FALLIDO',
      error: c.error,
    });
  }
}

@Module({
  imports: [CobrosModule],
  controllers: [ComunicacionController, ConfirmacionesController],
  providers: [MensajeriaService],
  exports: [MensajeriaService],
})
export class MensajeriaModule {}
