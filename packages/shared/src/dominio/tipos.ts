// Tipos del dominio de Potrero, compartidos entre la API y la web.

export const MODALIDADES = ['F5', 'F7', 'F8', 'F11'] as const;
export type Modalidad = (typeof MODALIDADES)[number];

export const FORMATOS = ['LIGA', 'COPA', 'GRUPOS_PLAYOFFS', 'LIGA_PLAYOFFS'] as const;
export type Formato = (typeof FORMATOS)[number];

export const DESEMPATES = ['DIFERENCIA_GOL', 'GOLES_FAVOR', 'ENTRE_SI', 'JUEGO_LIMPIO', 'SORTEO'] as const;
export type Desempate = (typeof DESEMPATES)[number];

export const PLANES = ['LIGA', 'FUNDADORA', 'PRO'] as const;
export type Plan = (typeof PLANES)[number];

export const METODOS_PAGO = ['MERCADO_PAGO', 'EFECTIVO', 'TRANSFERENCIA'] as const;
export type MetodoPago = (typeof METODOS_PAGO)[number];

export const TIPOS_EVENTO = ['GOL', 'GOL_EN_CONTRA', 'AMARILLA', 'ROJA', 'CAMBIO', 'ANULACION'] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export const CAUSAS_SANCION = ['ROJA_DIRECTA', 'DOBLE_AMARILLA', 'ACUMULACION'] as const;
export type CausaSancion = (typeof CAUSAS_SANCION)[number];

export interface Reglamento {
  puntosVictoria: number;
  puntosEmpate: number;
  puntosDerrota: number;
  desempates: readonly Desempate[];
  suspensionRojaDirecta: number;
  suspensionDobleAmarilla: number;
  umbralAmarillas: number;
  suspensionAcumulacion: number;
  golesWO: number;
  /** Levantar una suspensión pagando una multa (E14-08). Opcional por torneo, apagado por defecto. */
  levantarSancionPagando: boolean;
  /** Tipos de sanción que se pueden levantar. Nunca la roja directa ni lo que resolvió el tribunal. */
  levantarSancionTipos: CausaSancion[];
  /** Monto por cada partido levantado, en pesos enteros. Con 0 la opción no está disponible aunque esté encendida. */
  levantarSancionMonto: number;
}

/** Evento del acta. Los eventos no se editan: una corrección es un evento ANULACION que apunta a otro. */
export interface EventoPartido {
  id: string;
  tipo: TipoEvento;
  /** Equipo del jugador que protagoniza el evento. En un gol en contra, es el equipo que lo convierte en su arco. */
  equipoId: string;
  jugadorId?: string | null;
  minuto?: number | null;
  /** Solo en ANULACION: id del evento anulado. */
  anulaA?: string | null;
}

/** Partido con resultado, listo para la tabla. */
export interface ResultadoPartido {
  id: string;
  localId: string;
  visitanteId: string;
  golesLocal: number;
  golesVisitante: number;
  /** Si fue W.O., el equipo que gana. */
  ganadorWO?: string | null;
  /** Tarjetas por equipo en el partido, para el desempate por juego limpio. */
  tarjetas?: { equipoId: string; amarillas: number; rojas: number }[];
}
