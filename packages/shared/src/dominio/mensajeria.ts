// Mensajería (E16): plantillas con variables, reglas de canal y costo, topes por plan y etapas de automatización.
// Todo es lógica pura; los canales reales (email, WhatsApp, push) viven en la API detrás de una interfaz (ADR-022).
import { DATOS } from '../datos.js';
import type { Plan } from './tipos.js';

export const CANALES = ['EMAIL', 'WHATSAPP', 'PUSH'] as const;
export type CanalMensaje = (typeof CANALES)[number];

/** Transaccional (cobro, partido, sanción) o de marketing (novedades): el segundo respeta la baja del destinatario. */
export type TipoMensaje = 'TRANSACCIONAL' | 'MARKETING';

export interface Plantilla {
  clave: string;
  nombre: string;
  tipo: TipoMensaje;
  /** Categoría de cobro de WhatsApp (Meta): utilidad o marketing. */
  categoriaWhatsapp: 'UTILIDAD' | 'MARKETING';
  /** Se sube al cambiar el texto: WhatsApp exige plantillas aprobadas, así que cada versión se identifica. */
  version: number;
  asunto: string;
  cuerpo: string;
  /** Si lleva botones "Confirmo" / "No puedo" (contingencias). */
  conConfirmacion?: boolean;
}

export const PLANTILLAS: Record<string, Plantilla> = {
  RECORDATORIO_PAGO: {
    clave: 'RECORDATORIO_PAGO',
    nombre: 'Recordatorio de pago',
    tipo: 'TRANSACCIONAL',
    categoriaWhatsapp: 'UTILIDAD',
    version: 1,
    asunto: 'Pago pendiente de {equipo}',
    cuerpo:
      'Hola {capitán}! Te recordamos que la inscripción de {equipo} en {torneo} está pendiente ({monto}). Pagala acá y asegurá tu lugar: {link_pago}',
  },
  FIXTURE_PUBLICADO: {
    clave: 'FIXTURE_PUBLICADO',
    nombre: 'Fixture publicado',
    tipo: 'TRANSACCIONAL',
    categoriaWhatsapp: 'UTILIDAD',
    version: 1,
    asunto: 'Ya está el fixture de {torneo}',
    cuerpo:
      'Hola {capitán}! Ya está publicado el fixture de {torneo}. Mirá los partidos de {equipo}: {link_torneo}',
  },
  CAMBIO_CANCHA: {
    clave: 'CAMBIO_CANCHA',
    nombre: 'Cambio de cancha',
    tipo: 'TRANSACCIONAL',
    categoriaWhatsapp: 'UTILIDAD',
    version: 1,
    asunto: 'Cambio de cancha para {equipo}',
    cuerpo: 'Hola {capitán}! Cambio de cancha: {equipo} juega contra {rival} en {cancha}, {cuando}.',
  },
  SUSPENSION: {
    clave: 'SUSPENSION',
    nombre: 'Suspensión',
    tipo: 'TRANSACCIONAL',
    categoriaWhatsapp: 'UTILIDAD',
    version: 1,
    asunto: 'Suspensión de {jugador}',
    cuerpo:
      'Hola {capitán}! {jugador} de {equipo} quedó suspendido {partidos} por {causa}. Detalle y reglamento: {link_torneo}',
  },
  RECORDATORIO_PARTIDO: {
    clave: 'RECORDATORIO_PARTIDO',
    nombre: 'Recordatorio de partido',
    tipo: 'TRANSACCIONAL',
    categoriaWhatsapp: 'UTILIDAD',
    version: 1,
    asunto: 'Mañana juega {equipo}',
    cuerpo:
      'Hola {capitán}! Mañana juega {equipo} contra {rival}, {cuando} en {cancha}. Confirmá a tu plantel.',
  },
  CONTINGENCIA: {
    clave: 'CONTINGENCIA',
    nombre: 'Reprogramación',
    tipo: 'TRANSACCIONAL',
    categoriaWhatsapp: 'UTILIDAD',
    version: 1,
    asunto: 'Cambio de horario: {motivo}',
    cuerpo:
      '{liga} · {motivo}. Tu partido ahora es {cuando} en {cancha} vs {rival}. ¿Podés jugar? Respondé acá: {link_confirmacion}',
    conConfirmacion: true,
  },
  DOCUMENTACION: {
    clave: 'DOCUMENTACION',
    nombre: 'Documentación pendiente',
    tipo: 'TRANSACCIONAL',
    categoriaWhatsapp: 'UTILIDAD',
    version: 1,
    asunto: 'Falta documentación de {equipo}',
    cuerpo:
      'Hola {capitán}! Para habilitar a los jugadores de {equipo} en {liga} falta documentación: {faltantes}. Mandala a la liga antes de la próxima fecha.',
  },
  RESULTADO: {
    clave: 'RESULTADO',
    nombre: 'Resultado del partido',
    tipo: 'TRANSACCIONAL',
    categoriaWhatsapp: 'UTILIDAD',
    version: 1,
    asunto: 'Resultado de {equipo}',
    cuerpo: '{equipo}: {resultado}. Tabla actualizada de {torneo}: {link_torneo}',
  },
  LIBRE: {
    clave: 'LIBRE',
    nombre: 'Mensaje libre',
    tipo: 'MARKETING',
    categoriaWhatsapp: 'MARKETING',
    version: 1,
    asunto: 'Aviso de {liga}',
    cuerpo: '',
  },
};

/** Variables que se pueden usar en un mensaje libre: las que se conocen de todo equipo. */
export const VARIABLES_LIBRES = ['capitán', 'equipo', 'liga', 'torneo'] as const;

const VARIABLE = /\{([\p{L}_0-9]+)\}/gu;

/** Nombres de las variables que usa un texto, sin repetir. */
export function variablesDe(texto: string): string[] {
  return [...new Set([...texto.matchAll(VARIABLE)].map((m) => m[1]!))];
}

/** Completa las variables de un texto. Devuelve también las que faltaron, sin tocarlas en el texto. */
export function renderizar(texto: string, valores: Readonly<Record<string, string>>) {
  const faltantes = new Set<string>();
  const resultado = texto.replace(VARIABLE, (completo, nombre: string) => {
    const v = valores[nombre];
    if (v === undefined) {
      faltantes.add(nombre);
      return completo;
    }
    return v;
  });
  return { texto: resultado, faltantes: [...faltantes] };
}

/** Variables de un mensaje libre que no existen (para avisar antes de enviar). */
export function variablesDesconocidas(texto: string): string[] {
  return variablesDe(texto).filter((v) => !(VARIABLES_LIBRES as readonly string[]).includes(v));
}

// ───────────── Destinatarios, canales y costo ─────────────

export interface Destinatario {
  equipoId: string;
  /** Nombre de quien recibe (el capitán). */
  nombre: string;
  email?: string | null;
  telefono?: string | null;
  /** Aceptó recibir WhatsApp. Sin esto, no se le escribe por ahí (regla de costo y de consentimiento). */
  optInWhatsapp: boolean;
  /** Pidió no recibir novedades (solo frena los mensajes de marketing). */
  bajaMarketing: boolean;
  /** Tiene notificaciones push activadas (pendiente E16-04). */
  push?: boolean;
}

export interface Entrega {
  destinatario: Destinatario;
  canal: CanalMensaje;
  /** Canal que se pidió, si hubo que cambiarlo (por ejemplo, de WhatsApp a email por falta de opt-in). */
  pedido?: CanalMensaje;
}

export interface Omitido {
  destinatario: Destinatario;
  motivo: string;
}

/**
 * Decide por qué canal le llega el mensaje a cada destinatario.
 * WhatsApp solo con opt-in y teléfono; si no, baja a email y después a push. Email y push por defecto son gratis.
 * Un mensaje de marketing no le llega a quien se dio de baja.
 */
export function planificarEnvio(
  destinatarios: readonly Destinatario[],
  canalPedido: CanalMensaje,
  tipo: TipoMensaje,
): { entregas: Entrega[]; omitidos: Omitido[] } {
  const entregas: Entrega[] = [];
  const omitidos: Omitido[] = [];
  for (const d of destinatarios) {
    if (tipo === 'MARKETING' && d.bajaMarketing) {
      omitidos.push({ destinatario: d, motivo: 'Pidió no recibir novedades.' });
      continue;
    }
    const disponible: Record<CanalMensaje, boolean> = {
      WHATSAPP: d.optInWhatsapp && !!d.telefono,
      EMAIL: !!d.email,
      PUSH: !!d.push,
    };
    // Orden de preferencia: el pedido y, si no se puede, email y push.
    const orden: CanalMensaje[] = [
      canalPedido,
      ...(['EMAIL', 'PUSH'] as const).filter((c) => c !== canalPedido),
    ];
    const canal = orden.find((c) => disponible[c]);
    if (!canal) {
      omitidos.push({
        destinatario: d,
        motivo:
          canalPedido === 'WHATSAPP' && !d.optInWhatsapp
            ? 'No aceptó WhatsApp y no tiene email.'
            : 'No tiene un canal para avisarle.',
      });
      continue;
    }
    entregas.push({ destinatario: d, canal, ...(canal !== canalPedido ? { pedido: canalPedido } : {}) });
  }
  return { entregas, omitidos };
}

/** Costo en dólares de un mensaje por ese canal (WhatsApp según la categoría de la plantilla). */
export function costoUsdDeMensaje(canal: CanalMensaje, categoriaWhatsapp: 'UTILIDAD' | 'MARKETING'): number {
  const c = DATOS.mensajeria.costoUsdPorMensaje;
  if (canal === 'EMAIL') return c.EMAIL;
  if (canal === 'PUSH') return c.PUSH;
  return categoriaWhatsapp === 'UTILIDAD' ? c.WHATSAPP_UTILIDAD : c.WHATSAPP_MARKETING;
}

export interface EstimacionEnvio {
  porCanal: Record<CanalMensaje, number>;
  costoUsd: number;
  /** Costo en pesos con el tipo de cambio de referencia, para mostrarlo al organizador. */
  costoArs: number;
}

export function estimarEnvio(
  entregas: readonly Entrega[],
  categoriaWhatsapp: 'UTILIDAD' | 'MARKETING',
): EstimacionEnvio {
  const porCanal: Record<CanalMensaje, number> = { EMAIL: 0, WHATSAPP: 0, PUSH: 0 };
  let costoUsd = 0;
  for (const e of entregas) {
    porCanal[e.canal]++;
    costoUsd += costoUsdDeMensaje(e.canal, categoriaWhatsapp);
  }
  costoUsd = Math.round(costoUsd * 1000) / 1000;
  return { porCanal, costoUsd, costoArs: Math.round(costoUsd * DATOS.tipoDeCambioReferencia) };
}

export interface EstadoTope {
  /** WhatsApp incluidos en el plan por mes. */
  tope: number;
  usados: number;
  restantes: number;
  /** Cuántos WhatsApp se pasan del tope con este envío (0 si entra). */
  excedente: number;
}

/** Topes mensuales de WhatsApp por plan (E16-09). Email y push no tienen tope. */
export function evaluarTope(plan: Plan, usadosEnElMes: number, nuevos: number): EstadoTope {
  const tope = DATOS.mensajeria.whatsappIncluidoPorMes[plan];
  const restantes = Math.max(0, tope - usadosEnElMes);
  return { tope, usados: usadosEnElMes, restantes, excedente: Math.max(0, nuevos - restantes) };
}

// ───────────── Automatizaciones ─────────────

export const AUTOMATIZACIONES = {
  RECORDATORIO_PARTIDO: {
    nombre: 'Recordatorio 24 h antes del partido',
    detalle: 'A los capitanes de los dos equipos',
  },
  COBRO_ESCALONADO: {
    nombre: 'Cobro escalonado',
    detalle: '3 días antes del vencimiento, el día y 2 días después',
  },
  AVISO_SUSPENSION: { nombre: 'Aviso de suspensión', detalle: 'Al cerrar el acta, al capitán del jugador' },
} as const;
export type ClaveAutomatizacion = keyof typeof AUTOMATIZACIONES;

const MS_DIA = 86_400_000;

/** Días entre dos fechas AAAA-MM-DD (positivo si `hasta` es posterior). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / MS_DIA);
}

export type EtapaCobro = 'T-3' | 'T0' | 'T+2';

/** Qué recordatorio de cobro corresponde hoy según el vencimiento (3 días antes, el día y 2 días después). */
export function etapaDeCobro(hoy: string, vence: string): EtapaCobro | null {
  const d = diasEntre(hoy, vence);
  if (d === 3) return 'T-3';
  if (d === 0) return 'T0';
  if (d === -2) return 'T+2';
  return null;
}

/** ¿Falta 24 horas o menos (y todavía no empezó) para el partido? Sirve para el recordatorio automático. */
export function esRecordatorio24h(inicio: Date, ahora: Date): boolean {
  const falta = inicio.getTime() - ahora.getTime();
  return falta > 0 && falta <= MS_DIA;
}
