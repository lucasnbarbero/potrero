// Links de un solo uso de la cuenta (E04-02) y límite de intentos de ingreso (E04-05).
// Tablas globales (como usuario): se usan con `db.app`, sin RLS.
import { createHash, randomBytes } from 'node:crypto';
import { HttpStatus, Logger } from '@nestjs/common';
import {
  type EstadoLink,
  estadoDeLink,
  evaluarIntentos,
  LIMITE_INGRESO,
  mensajeDeBloqueo,
  type TipoLinkCuenta,
  vencimientoDeLink,
} from '@potrero/shared';
import { config } from '../config.js';
import { ErrorNegocio } from '../comun/http.js';
import type { DbService } from '../db/db.service.js';

const log = new Logger('Cuenta');
const hash = (t: string) => createHash('sha256').update(t).digest('hex');

const RUTA: Record<TipoLinkCuenta, string> = { RECUPERAR: '/restablecer', VERIFICAR_EMAIL: '/verificar' };
const ASUNTO: Record<TipoLinkCuenta, string> = {
  RECUPERAR: 'Recuperá tu contraseña',
  VERIFICAR_EMAIL: 'Verificá tu email',
};

/**
 * El link se muestra en la respuesta solo en desarrollo: no hay proveedor de email todavía (el envío se simula y queda en
 * el log). Nunca en producción ni en la demo pública, donde mostrarlo dejaría entrar a la cuenta de otro.
 */
export const MOSTRAR_LINK = config.NODE_ENV !== 'production' && !config.DEMO_MODE;

/** Crea un link de un solo uso, invalida los anteriores del mismo tipo y "manda" el email (simulado). */
export async function crearLink(db: DbService, usuarioId: string, tipo: TipoLinkCuenta, email: string) {
  const token = randomBytes(32).toString('base64url');
  const ahora = new Date();
  await db.app.linkCuenta.updateMany({
    where: { usuarioId, tipo, usadoEn: null },
    data: { usadoEn: ahora },
  });
  await db.app.linkCuenta.create({
    data: { usuarioId, tipo, email, tokenHash: hash(token), venceEn: vencimientoDeLink(tipo, ahora) },
  });
  const url = `${config.WEB_URL}${RUTA[tipo]}/${token}`;
  // Envío simulado: sin proveedor de email, el link queda en el log del servidor.
  log.log(`[email simulado] Para: ${email} · ${ASUNTO[tipo]} · ${MOSTRAR_LINK ? url : '(link oculto)'}`);
  return MOSTRAR_LINK ? url : undefined;
}

/** Busca un link por su token y dice si se puede usar. */
export async function buscarLink(db: DbService, token: string, tipo: TipoLinkCuenta) {
  const link = await db.app.linkCuenta.findUnique({ where: { tokenHash: hash(token) } });
  const valido = link && link.tipo === tipo ? link : null;
  return { link: valido, estado: estadoDeLink(valido, new Date()) as EstadoLink };
}

/** Marca el link como usado. Devuelve false si otro pedido lo usó antes (doble clic, reintento). */
export async function usarLink(db: DbService, id: string) {
  const r = await db.app.linkCuenta.updateMany({
    where: { id, usadoEn: null },
    data: { usadoEn: new Date() },
  });
  return r.count === 1;
}

/** Rechaza el ingreso si la cuenta o la IP superaron los intentos fallidos de la ventana. */
export async function controlarIntentos(db: DbService, email: string, ip: string) {
  const ahora = new Date();
  const desde = new Date(ahora.getTime() - LIMITE_INGRESO.ventanaMin * 60_000);
  // Un ingreso correcto (o una contraseña restablecida) pone en cero el contador de la cuenta.
  const ultimoOk = await db.app.intentoIngreso.findFirst({
    where: { email, exitoso: true, creadoEn: { gte: desde } },
    orderBy: { creadoEn: 'desc' },
  });
  const [cuenta, porIp] = [
    await db.app.intentoIngreso.findMany({
      where: { email, exitoso: false, creadoEn: { gt: ultimoOk?.creadoEn ?? desde } },
      select: { creadoEn: true },
    }),
    await db.app.intentoIngreso.findMany({
      where: { ip, exitoso: false, creadoEn: { gt: desde } },
      select: { creadoEn: true },
    }),
  ];
  const b = evaluarIntentos(
    { cuenta: cuenta.map((x) => x.creadoEn), ip: porIp.map((x) => x.creadoEn) },
    ahora,
  );
  if (b.bloqueado) throw new ErrorNegocio(mensajeDeBloqueo(b), HttpStatus.TOO_MANY_REQUESTS);
}

export async function registrarIntento(db: DbService, email: string, ip: string, exitoso: boolean) {
  await db.app.intentoIngreso.create({ data: { email, ip, exitoso } });
}
