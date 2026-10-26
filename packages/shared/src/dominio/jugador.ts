// Cuenta y panel del jugador (E20-01, E20-05, E19-02 del lado del jugador). Reglas puras: términos que acepta al reclamar
// su perfil, cuándo puede confirmar asistencia, qué documentación ve (y cuál puede subir él mismo) y sus avisos
// personales, que se derivan de los datos (no hay canal real todavía).
import type { Decision } from './usuarios.js';
import { requeridosPara, NOMBRE_DOCUMENTO, TIPOS_DOCUMENTO, type TipoDocumento } from './documentacion.js';

/** Términos que acepta el jugador al crear su cuenta. Cambiar el texto obliga a subir la versión. */
export const TERMINOS_JUGADOR = {
  version: 1,
  titulo: 'Términos de uso para jugadores',
  texto:
    'Acepto los términos de uso y la política de privacidad. La liga ve mis datos para organizar el torneo; en el ' +
    'sitio público solo aparece mi nombre como yo lo elija (iniciales, apodo o completo), nunca mi DNI, fecha de ' +
    'nacimiento, teléfono, email ni domicilio.',
} as const;

/** Tipo de consentimiento con el que se guarda la aceptación de los términos (tabla de consentimientos, versionado). */
export const CONSENTIMIENTO_TERMINOS_JUGADOR = 'TERMINOS_JUGADOR';

/** Si el jugador puede responder "Voy" / "No voy" al próximo partido. Un suspendido solo puede decir que no va. */
export function puedeConfirmarAsistencia(e: {
  estadoPartido: string;
  suspendido: boolean;
  respuesta: 'VA' | 'NO_VA';
}): Decision {
  if (e.estadoPartido !== 'PROGRAMADO')
    return { ok: false, motivo: 'La convocatoria se cierra cuando empieza el partido.' };
  if (e.suspendido && e.respuesta === 'VA')
    return { ok: false, motivo: 'Estás suspendido para este partido: no podés confirmar que vas.' };
  return { ok: true };
}

export type EstadoDocumentoJugador =
  'VIGENTE' | 'POR_VENCER' | 'PENDIENTE' | 'VENCIDO' | 'RECHAZADO' | 'FALTA';

/**
 * Documentos que el jugador sube él mismo (una foto o un PDF). La autorización del menor no: la firma el tutor por su
 * link (E15-08), así que para el jugador es solo lectura.
 */
export const DOCUMENTOS_QUE_SUBE_EL_JUGADOR: readonly TipoDocumento[] = ['DNI', 'APTO_FISICO'];

/** Documentación del jugador: qué le exigen sus torneos, en qué estado está cada cosa y si la puede subir. */
export function documentacionDelJugador(e: {
  requeridosTorneos: readonly TipoDocumento[];
  menor: boolean;
  estados: Record<TipoDocumento, EstadoDocumentoJugador>;
}) {
  const requeridos = new Set(requeridosPara(e.requeridosTorneos, e.menor));
  const items = TIPOS_DOCUMENTO.filter((t) => requeridos.has(t) || e.estados[t] !== 'FALTA').map((t) => {
    const estado = e.estados[t];
    const ok = estado === 'VIGENTE' || estado === 'POR_VENCER';
    return {
      tipo: t,
      nombre: NOMBRE_DOCUMENTO[t],
      estado,
      requerido: requeridos.has(t),
      ok,
      // Se puede subir si falta, se rechazó o venció (o está por vencer); lo pendiente espera la revisión de la liga.
      puedeSubir:
        DOCUMENTOS_QUE_SUBE_EL_JUGADOR.includes(t) &&
        (estado === 'FALTA' || estado === 'RECHAZADO' || estado === 'VENCIDO' || estado === 'POR_VENCER'),
    };
  });
  return { items, faltan: items.filter((i) => i.requerido && !i.ok).length };
}

export type TipoAviso = 'PARTIDO' | 'CONVOCATORIA' | 'SANCION' | 'DOCUMENTACION' | 'DEUDA';
export interface AvisoJugador {
  tipo: TipoAviso;
  titulo: string;
  detalle: string;
  /** ALTA: hay que hacer algo ya (confirmar, no podés jugar). */
  urgencia: 'ALTA' | 'NORMAL';
  fecha: string | null;
}

export interface EntradaAvisos {
  hoy: Date;
  partidos: {
    equipo: string;
    rival: string;
    inicio: Date | string | null;
    cancha: string | null;
    respuesta: 'VA' | 'NO_VA' | null;
    suspendido: boolean;
  }[];
  sanciones: { equipo: string; causa: string; restantes: number }[];
  documentosFaltantes: string[];
  deudaEquipos: { equipo: string; saldo: number }[];
}

const HORAS_URGENTE = 72;
const fechaIso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);

/**
 * Avisos personales del jugador (E20-05), derivados de sus datos: el próximo partido de cada equipo, la convocatoria
 * sin responder, la suspensión, la documentación que falta y la deuda del equipo. Primero los urgentes.
 */
export function avisosDelJugador(e: EntradaAvisos): AvisoJugador[] {
  const avisos: AvisoJugador[] = [];
  for (const s of e.sanciones.filter((x) => x.restantes > 0))
    avisos.push({
      tipo: 'SANCION',
      titulo: `Estás suspendido en ${s.equipo}`,
      detalle: `${s.causa}: te ${s.restantes === 1 ? 'falta 1 fecha' : `faltan ${s.restantes} fechas`} para volver a jugar.`,
      urgencia: 'ALTA',
      fecha: null,
    });
  for (const p of e.partidos) {
    const horas = p.inicio ? (new Date(p.inicio).getTime() - e.hoy.getTime()) / 3_600_000 : null;
    const pronto = horas != null && horas >= 0 && horas <= HORAS_URGENTE;
    if (!p.suspendido && p.respuesta == null)
      avisos.push({
        tipo: 'CONVOCATORIA',
        titulo: `¿Vas contra ${p.rival}?`,
        detalle: `${p.equipo} necesita saber si contás para el partido. Confirmá "Voy" o "No voy".`,
        urgencia: 'ALTA',
        fecha: fechaIso(p.inicio),
      });
    avisos.push({
      tipo: 'PARTIDO',
      titulo: `${p.equipo} vs ${p.rival}`,
      detalle: p.suspendido
        ? 'No podés jugarlo: estás suspendido.'
        : `${pronto ? 'Se juega pronto' : 'Próximo partido'}${p.cancha ? ` en ${p.cancha}` : ''}.${p.respuesta === 'VA' ? ' Confirmaste que vas.' : p.respuesta === 'NO_VA' ? ' Avisaste que no vas.' : ''}`,
      urgencia: pronto && !p.suspendido ? 'ALTA' : 'NORMAL',
      fecha: fechaIso(p.inicio),
    });
  }
  if (e.documentosFaltantes.length)
    avisos.push({
      tipo: 'DOCUMENTACION',
      titulo: 'Te falta documentación',
      detalle: `Sin ${e.documentosFaltantes.join(' y ')} no te habilitan para jugar.`,
      urgencia: 'ALTA',
      fecha: null,
    });
  for (const d of e.deudaEquipos.filter((x) => x.saldo > 0))
    avisos.push({
      tipo: 'DEUDA',
      titulo: `${d.equipo} tiene pagos pendientes`,
      detalle: 'Hablalo con tu capitán: la deuda es del equipo.',
      urgencia: 'NORMAL',
      fecha: null,
    });
  return avisos.sort((a, b) => Number(b.urgencia === 'ALTA') - Number(a.urgencia === 'ALTA'));
}
