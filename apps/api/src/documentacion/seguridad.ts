// Cifrado de campos sensibles, hash de búsqueda y firmas de links (E15, ADR-025).
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { normalizarDni } from '@potrero/shared';
import { config } from '../config.js';

/** Una clave por uso, derivadas de la maestra: así una filtración de un hash no sirve para descifrar. */
const maestra = Buffer.from(config.CLAVE_CIFRADO ?? config.JWT_SECRET, 'utf8');
const derivar = (uso: string) => Buffer.from(hkdfSync('sha256', maestra, 'potrero', uso, 32));
const CLAVE_CAMPOS = derivar('campos');
const CLAVE_HASH = derivar('hash-dni');
const CLAVE_FIRMA = derivar('firma-links');

/** AES-256-GCM. Formato: v1.iv.etiqueta.cifrado (base64url). */
export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', CLAVE_CAMPOS, iv);
  const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return ['v1', iv, c.getAuthTag(), datos]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.');
}

export function descifrar(valor: string): string {
  const [version, iv, tag, datos] = valor.split('.');
  if (version !== 'v1' || !iv || !tag || !datos) throw new Error('Campo cifrado con un formato desconocido');
  const d = createDecipheriv('aes-256-gcm', CLAVE_CAMPOS, Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(datos, 'base64url')), d.final()]).toString('utf8');
}

/** Huella del DNI para detectar repetidos sin descifrar: mismo DNI, mismo hash. */
export const hashDeDni = (dni: string) =>
  createHmac('sha256', CLAVE_HASH).update(normalizarDni(dni)).digest('base64url');

// ───────────── Links firmados ─────────────

const firmar = (cuerpo: string) => createHmac('sha256', CLAVE_FIRMA).update(cuerpo).digest('base64url');

/** Token `cuerpo.firma` con vencimiento. El cuerpo es JSON en base64url. */
export function firmarToken(datos: Record<string, string | number>, venceEnMs: number): string {
  const cuerpo = Buffer.from(JSON.stringify({ ...datos, exp: Date.now() + venceEnMs })).toString('base64url');
  return `${cuerpo}.${firmar(cuerpo)}`;
}

/** Devuelve los datos si la firma es válida y no venció; si no, null. */
export function verificarToken(token: string): Record<string, string | number> | null {
  const [cuerpo, firma] = token.split('.');
  if (!cuerpo || !firma) return null;
  const esperada = Buffer.from(firmar(cuerpo));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  try {
    const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as Record<
      string,
      string | number
    >;
    return typeof datos.exp === 'number' && datos.exp > Date.now() ? datos : null;
  } catch {
    return null;
  }
}
