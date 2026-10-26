// Panel del organizador (E18): alertas accionables, sugerencias del próximo paso y minuto del partido en vivo.
// Reglas puras: la API junta los datos de la liga y estas funciones deciden qué mostrar y con qué botón.
import { DATOS } from '../datos.js';
import { formatoPesos } from './cobros.js';
import type { Modalidad } from './tipos.js';

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

// ───────────── Alertas accionables (E18-03) ─────────────

export const TIPOS_ALERTA = [
  'SUSPENDIDO_JUGO',
  'ACTA_SIN_CARGAR',
  'SIN_ARBITRO',
  'DOCUMENTO_VENCIDO',
  'PAGO_SIN_CONCILIAR',
  'NO_PUEDO',
  'MENSAJES_FALLIDOS',
] as const;
export type TipoAlerta = (typeof TIPOS_ALERTA)[number];
export type GravedadAlerta = 'ALTA' | 'MEDIA' | 'BAJA';

export interface AlertaPanel {
  tipo: TipoAlerta;
  gravedad: GravedadAlerta;
  titulo: string;
  detalle: string;
  /** Texto del botón que lleva a resolverla. */
  accion: string;
  href: string;
  cantidad: number;
}

interface PartidoResumido {
  partidoId: string;
  local: string;
  visitante: string;
}

export interface EntradaAlertas {
  /** Expedientes abiertos por un jugador no habilitado (suspendido) que figura en un acta. */
  suspendidosQueJugaron: { expedienteId: string; jugador: string; equipo: string; fecha: number }[];
  /** Partidos que ya se jugaron (empezaron hace más de un rato) y no tienen el acta cerrada. */
  actasSinCargar: (PartidoResumido & { fecha: number })[];
  /** Partidos de los próximos días sin árbitro designado. `cuando` viene formateado ("sáb 7/11 · 16:00"). */
  sinArbitro: (PartidoResumido & { cuando: string })[];
  /** Jugadores con algún documento vencido o por vencer, en torneos activos. */
  documentos: { vencidos: number; porVencer: number };
  /** Pagos aprobados que todavía no tienen su asiento en la caja. */
  pagosSinConciliar: { cantidad: number; monto: number };
  /** Respuestas "No puedo" a una reprogramación. */
  noPuedo: { contingenciaId: string; cantidad: number } | null;
  /** Mensajes que no se pudieron entregar en la última semana. */
  mensajesFallidos: number;
}

const ORDEN_GRAVEDAD: Record<GravedadAlerta, number> = { ALTA: 0, MEDIA: 1, BAJA: 2 };

const vs = (p: PartidoResumido) => `${p.local} vs ${p.visitante}`;
const yMas = (n: number) => (n > 1 ? ` y ${n - 1} más` : '');

/** Alertas del panel, de la más grave a la menos grave. Cada una trae el botón que lleva a resolverla. */
export function alertasDelPanel(e: EntradaAlertas): AlertaPanel[] {
  const alertas: AlertaPanel[] = [];
  const susp = e.suspendidosQueJugaron;
  if (susp.length) {
    const p = susp[0]!;
    alertas.push({
      tipo: 'SUSPENDIDO_JUGO',
      gravedad: 'ALTA',
      titulo: susp.length === 1 ? 'Jugó un suspendido' : `Jugaron ${susp.length} suspendidos`,
      detalle: `${p.jugador} (${p.equipo}) · fecha ${p.fecha}${yMas(susp.length)}`,
      accion: 'Resolver',
      href: '/panel/sanciones',
      cantidad: susp.length,
    });
  }
  const actas = e.actasSinCargar;
  if (actas.length) {
    const p = actas[0]!;
    alertas.push({
      tipo: 'ACTA_SIN_CARGAR',
      gravedad: 'ALTA',
      titulo: actas.length === 1 ? 'Acta sin cargar' : `${actas.length} actas sin cargar`,
      detalle: `Fecha ${p.fecha} · ${vs(p)}${yMas(actas.length)}`,
      accion: 'Cargar',
      href: `/panel/partidos/${p.partidoId}`,
      cantidad: actas.length,
    });
  }
  const arb = e.sinArbitro;
  if (arb.length) {
    const p = arb[0]!;
    alertas.push({
      tipo: 'SIN_ARBITRO',
      gravedad: 'MEDIA',
      titulo: arb.length === 1 ? 'Partido sin árbitro' : `${arb.length} partidos sin árbitro`,
      detalle: `${vs(p)} · ${p.cuando}${yMas(arb.length)}`,
      accion: 'Asignar',
      href: '/panel/arbitros',
      cantidad: arb.length,
    });
  }
  const { vencidos, porVencer } = e.documentos;
  if (vencidos || porVencer) {
    const dias = DATOS.documentacion.avisoVencimientoDias;
    alertas.push({
      tipo: 'DOCUMENTO_VENCIDO',
      gravedad: vencidos ? 'MEDIA' : 'BAJA',
      titulo: vencidos
        ? plural(vencidos, 'documento vencido', 'documentos vencidos')
        : `${plural(porVencer, 'documento vence', 'documentos vencen')} pronto`,
      detalle: vencidos
        ? porVencer
          ? `Y ${porVencer} por vencer en ${dias} días · sin documento al día no juegan`
          : 'Sin documento al día el jugador no queda habilitado'
        : `Vencen en los próximos ${dias} días`,
      accion: 'Revisar',
      href: '/panel/documentacion',
      cantidad: vencidos + porVencer,
    });
  }
  const pagos = e.pagosSinConciliar;
  if (pagos.cantidad) {
    alertas.push({
      tipo: 'PAGO_SIN_CONCILIAR',
      gravedad: 'MEDIA',
      titulo: plural(pagos.cantidad, 'pago sin conciliar', 'pagos sin conciliar'),
      detalle: `${formatoPesos(pagos.monto)} cobrados que todavía no están en la caja`,
      accion: 'Conciliar',
      href: '/panel/caja',
      cantidad: pagos.cantidad,
    });
  }
  if (e.noPuedo?.cantidad) {
    alertas.push({
      tipo: 'NO_PUEDO',
      gravedad: 'MEDIA',
      titulo: `${plural(e.noPuedo.cantidad, 'equipo no puede', 'equipos no pueden')} jugar`,
      detalle: 'Respondieron "No puedo" a una reprogramación',
      accion: 'Ver',
      href: `/panel/reprogramaciones/${e.noPuedo.contingenciaId}`,
      cantidad: e.noPuedo.cantidad,
    });
  }
  if (e.mensajesFallidos) {
    alertas.push({
      tipo: 'MENSAJES_FALLIDOS',
      gravedad: 'BAJA',
      titulo: plural(e.mensajesFallidos, 'mensaje sin entregar', 'mensajes sin entregar'),
      detalle: 'No se pudieron enviar esta semana',
      accion: 'Ver',
      href: '/panel/comunicacion',
      cantidad: e.mensajesFallidos,
    });
  }
  return alertas
    .map((a, i) => ({ a, i }))
    .sort((x, y) => ORDEN_GRAVEDAD[x.a.gravedad] - ORDEN_GRAVEDAD[y.a.gravedad] || x.i - y.i)
    .map((x) => x.a);
}

// ───────────── Sugerencias del próximo paso (E18-04) ─────────────

/**
 * Plantel mínimo por modalidad para considerar a un equipo "con plantel completo": los titulares más tres suplentes
 * (docs/datos.json).
 */
export const PLANTEL_MINIMO: Record<Modalidad, number> = DATOS.planteles.minimoPorModalidad;

/** Días hacia adelante que mira el panel para la próxima fecha (árbitros, avisos). */
export const DIAS_PROXIMA_FECHA: number = DATOS.panel.diasProximaFecha;

export interface TorneoParaSugerir {
  id: string;
  nombre: string;
  estado: 'BORRADOR' | 'INSCRIPCION' | 'EN_CURSO' | 'FINALIZADO';
  cupo: number;
  /** Equipos inscriptos (sin las bajas). */
  inscriptos: number;
  /** Partidos del fixture ya generados. */
  partidos: number;
  /** Equipos inscriptos con menos jugadores que el plantel mínimo de la modalidad. */
  plantelesIncompletos: number;
  plantelMinimo: number;
  deudores: number;
  deuda: number;
  /** Días que faltan para el vencimiento de la inscripción (negativo: ya venció). Nulo si no tiene. */
  venceInscripcionEnDias: number | null;
  proximaFecha: {
    numero: number;
    /** Días hasta su primer partido (0 = hoy). */
    enDias: number;
    /** "sábado", "domingo"… */
    dia: string;
    sinArbitro: number;
    /** Capitanes de los equipos que juegan esa fecha. */
    capitanes: number;
    /** Ya se les avisó el fixture de esa fecha. */
    avisada: boolean;
  } | null;
}

export interface EstadoParaSugerir {
  torneos: TorneoParaSugerir[];
  expedientesAbiertos: number;
}

export interface Sugerencia {
  clave: string;
  texto: string;
  accion: string;
  href: string;
  prioridad: number;
  /** Se resuelve en un toque desde el panel: manda este aviso a los capitanes del torneo. */
  envio?: { plantilla: 'FIXTURE_PUBLICADO'; torneoId: string };
}

const cuandoEs = (enDias: number, dia: string) =>
  enDias === 0 ? 'hoy' : enDias === 1 ? 'mañana' : `el ${dia}`;

/**
 * Próximos pasos según el estado de la liga, del más urgente al menos urgente (como mucho `max`).
 * Mira la próxima fecha (árbitros y aviso a capitanes), el armado de los torneos en inscripción, los planteles, la
 * deuda y el tribunal.
 */
export function sugerenciasDelPanel(estado: EstadoParaSugerir, max = 3): Sugerencia[] {
  const s: Sugerencia[] = [];
  const activos = estado.torneos.filter((t) => t.estado === 'INSCRIPCION' || t.estado === 'EN_CURSO');
  if (!activos.length) {
    s.push({
      clave: 'CREAR_TORNEO',
      texto: 'Creá tu próximo torneo y abrí la inscripción con un link para que se anoten los equipos.',
      accion: 'Crear torneo',
      href: '/panel/torneos/nuevo',
      prioridad: 100,
    });
  }
  for (const t of activos) {
    const f = t.proximaFecha;
    if (t.estado === 'EN_CURSO' && f && f.enDias <= DIAS_PROXIMA_FECHA) {
      if (f.sinArbitro > 0)
        s.push({
          clave: `ARBITROS:${t.id}`,
          texto: `Designá árbitros para ${cuandoEs(f.enDias, f.dia)}: ${plural(f.sinArbitro, 'partido', 'partidos')} de la fecha ${f.numero} de ${t.nombre} ${f.sinArbitro === 1 ? 'no tiene' : 'no tienen'} árbitro.`,
          accion: 'Designar árbitros',
          href: '/panel/arbitros',
          prioridad: 90 - f.enDias,
        });
      if (!f.avisada && f.capitanes > 0)
        s.push({
          clave: `AVISAR:${t.id}`,
          texto: `Publicá el fixture de la fecha ${f.numero} de ${t.nombre} y avisá a ${plural(f.capitanes, 'capitán', 'capitanes')} por WhatsApp.`,
          accion: 'Avisar a los capitanes',
          href: '/panel/comunicacion',
          prioridad: 80 - f.enDias,
          envio: { plantilla: 'FIXTURE_PUBLICADO', torneoId: t.id },
        });
    }
    if (t.estado === 'INSCRIPCION' && t.partidos === 0) {
      const lleno = t.inscriptos >= t.cupo;
      const vencida = t.venceInscripcionEnDias != null && t.venceInscripcionEnDias < 0;
      if (t.inscriptos >= 2 && (lleno || vencida))
        s.push({
          clave: `FIXTURE:${t.id}`,
          texto: `${t.nombre} ya tiene ${plural(t.inscriptos, 'equipo', 'equipos')}${lleno ? ' y el cupo completo' : ''}: generá el fixture y arrancá.`,
          accion: 'Generar fixture',
          href: `/panel/torneos/${t.id}?tab=fixture`,
          prioridad: 85,
        });
      else if (!lleno)
        s.push({
          clave: `INSCRIPCION:${t.id}`,
          texto: `Faltan ${plural(t.cupo - t.inscriptos, 'equipo', 'equipos')} para llenar ${t.nombre}${t.venceInscripcionEnDias != null && t.venceInscripcionEnDias >= 0 ? ` y la inscripción cierra en ${plural(t.venceInscripcionEnDias, 'día', 'días')}` : ''}. Compartí el link de inscripción.`,
          accion: 'Compartir inscripción',
          href: `/panel/torneos/${t.id}`,
          prioridad: 50,
        });
    }
    if (t.plantelesIncompletos > 0)
      s.push({
        clave: `PLANTELES:${t.id}`,
        texto: `${plural(t.plantelesIncompletos, 'equipo', 'equipos')} de ${t.nombre} ${t.plantelesIncompletos === 1 ? 'no tiene' : 'no tienen'} el plantel completo (mínimo ${t.plantelMinimo} jugadores). Pediles que lo carguen.`,
        accion: 'Ver equipos',
        href: '/panel/equipos',
        prioridad: t.estado === 'EN_CURSO' ? 65 : 60,
      });
    if (t.deudores > 0)
      s.push({
        clave: `DEUDA:${t.id}`,
        texto: `Recordale el pago a ${plural(t.deudores, 'equipo', 'equipos')} de ${t.nombre}: ${t.deudores === 1 ? 'debe' : 'deben'} ${formatoPesos(t.deuda)}.`,
        accion: 'Ver deudores',
        href: `/panel/torneos/${t.id}?tab=inscripciones`,
        prioridad: 55,
      });
  }
  if (estado.expedientesAbiertos > 0)
    s.push({
      clave: 'TRIBUNAL',
      texto: `El tribunal tiene ${plural(estado.expedientesAbiertos, 'expediente abierto', 'expedientes abiertos')}: resolvelos antes de la próxima fecha.`,
      accion: 'Ir al tribunal',
      href: '/panel/sanciones',
      prioridad: 70,
    });
  return s
    .map((x, i) => ({ x, i }))
    .sort((a, b) => b.x.prioridad - a.x.prioridad || a.i - b.i)
    .slice(0, max)
    .map((a) => a.x);
}

// ───────────── Partido en vivo (E18-01) ─────────────

/** Minutos que muestra el panel como máximo: después, el partido figura "en juego" sin minuto (alguien se olvidó de cerrarlo). */
export const MINUTO_MAXIMO_EN_VIVO = 120;

/** Minuto de juego a partir de la hora de inicio. Nulo si todavía no empezó o si pasó demasiado tiempo. */
export function minutoDeJuego(inicio: Date | string | null, ahora: Date): number | null {
  if (!inicio) return null;
  const min = Math.floor((ahora.getTime() - new Date(inicio).getTime()) / 60_000);
  if (min < 0 || min > MINUTO_MAXIMO_EN_VIVO) return null;
  return Math.max(1, min);
}
