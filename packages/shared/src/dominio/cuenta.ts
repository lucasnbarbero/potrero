// Cuenta del usuario (E04-02, E04-05): límite de intentos de ingreso y vigencia de los links de un solo uso.

/**
 * Límites contra la fuerza bruta: intentos fallidos por cuenta y por IP dentro de la ventana.
 * TODO datos.json: llevar estas cifras a docs/datos.json cuando se aprueben.
 */
export const LIMITE_INGRESO = { porCuenta: 5, porIp: 20, ventanaMin: 15 } as const;

/** Vigencia de los links que se mandan por email, en minutos. TODO datos.json. */
export const VIGENCIA_LINK_MIN = { RECUPERAR: 60, VERIFICAR_EMAIL: 48 * 60 } as const;
export type TipoLinkCuenta = keyof typeof VIGENCIA_LINK_MIN;

export interface Bloqueo {
  bloqueado: boolean;
  motivo: 'CUENTA' | 'IP' | null;
  /** Minutos que faltan para poder intentar de nuevo (redondeado hacia arriba). */
  esperaMin: number;
}

function liberacion(fallidos: readonly Date[], limite: number, desde: number): number | null {
  const recientes = fallidos
    .map((f) => f.getTime())
    .filter((t) => t > desde)
    .sort((a, b) => b - a);
  if (recientes.length < limite) return null;
  // Se libera cuando el intento número `limite` (contando desde el más nuevo) sale de la ventana.
  return recientes[limite - 1]! + LIMITE_INGRESO.ventanaMin * 60_000;
}

/**
 * ¿Se puede intentar ingresar? Cuenta solo los intentos fallidos de la ventana. Bloquea por cuenta (alguien prueba
 * contraseñas de un email) o por IP (alguien prueba muchos emails desde el mismo lugar).
 */
export function evaluarIntentos(
  fallidos: { cuenta: readonly Date[]; ip: readonly Date[] },
  ahora: Date,
): Bloqueo {
  const desde = ahora.getTime() - LIMITE_INGRESO.ventanaMin * 60_000;
  const porCuenta = liberacion(fallidos.cuenta, LIMITE_INGRESO.porCuenta, desde);
  const porIp = liberacion(fallidos.ip, LIMITE_INGRESO.porIp, desde);
  const libera = Math.max(porCuenta ?? 0, porIp ?? 0);
  if (!libera) return { bloqueado: false, motivo: null, esperaMin: 0 };
  return {
    bloqueado: true,
    motivo: porCuenta != null && porCuenta >= (porIp ?? 0) ? 'CUENTA' : 'IP',
    esperaMin: Math.max(1, Math.ceil((libera - ahora.getTime()) / 60_000)),
  };
}

export function mensajeDeBloqueo(b: Bloqueo): string {
  const espera = `${b.esperaMin} ${b.esperaMin === 1 ? 'minuto' : 'minutos'}`;
  return b.motivo === 'IP'
    ? `Hubo demasiados intentos de ingreso desde esta conexión. Esperá ${espera} y probá de nuevo.`
    : `Por seguridad bloqueamos el ingreso a esta cuenta por ${espera} después de varios intentos fallidos. Si no te acordás la contraseña, recuperala con "¿Te olvidaste la contraseña?".`;
}

export type EstadoLink = 'VALIDO' | 'USADO' | 'VENCIDO' | 'INEXISTENTE';

/** Un link de un solo uso vale si existe, no se usó y no venció. */
export function estadoDeLink(
  link: { venceEn: Date; usadoEn: Date | null } | null | undefined,
  ahora: Date,
): EstadoLink {
  if (!link) return 'INEXISTENTE';
  if (link.usadoEn) return 'USADO';
  if (link.venceEn.getTime() <= ahora.getTime()) return 'VENCIDO';
  return 'VALIDO';
}

export const MENSAJE_LINK: Record<Exclude<EstadoLink, 'VALIDO'>, string> = {
  INEXISTENTE: 'El link no es válido. Pedí uno nuevo.',
  USADO: 'Este link ya se usó. Si lo necesitás, pedí uno nuevo.',
  VENCIDO: 'El link venció. Pedí uno nuevo.',
};

export const vencimientoDeLink = (tipo: TipoLinkCuenta, ahora: Date) =>
  new Date(ahora.getTime() + VIGENCIA_LINK_MIN[tipo] * 60_000);
