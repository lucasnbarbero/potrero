// Documentación, identidad y consentimientos (E15). Funciones puras: la API carga los datos y las llama.
import { DATOS } from '../datos.js';

export const TIPOS_DOCUMENTO = ['DNI', 'APTO_FISICO', 'AUTORIZACION_MENOR'] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const NOMBRE_DOCUMENTO: Record<TipoDocumento, string> = {
  DNI: 'DNI',
  APTO_FISICO: 'Apto físico',
  AUTORIZACION_MENOR: 'Autorización del tutor',
};

export type EstadoRevision = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';

/** Estado del requisito de un jugador, mirando todos sus documentos de ese tipo. */
export type EstadoVigencia = 'FALTA' | 'PENDIENTE' | 'RECHAZADO' | 'VIGENTE' | 'POR_VENCER' | 'VENCIDO';

export interface DocumentoBasico {
  tipo: TipoDocumento;
  estado: EstadoRevision;
  vencimiento: Date | string | null;
}

const DIA_MS = 86_400_000;
const aFecha = (f: Date | string) => (f instanceof Date ? f : new Date(f));

/** Edad cumplida a la fecha `hoy`. */
export function edadEn(nacimiento: Date | string, hoy: Date): number {
  const n = aFecha(nacimiento);
  let edad = hoy.getUTCFullYear() - n.getUTCFullYear();
  const antes =
    hoy.getUTCMonth() < n.getUTCMonth() ||
    (hoy.getUTCMonth() === n.getUTCMonth() && hoy.getUTCDate() < n.getUTCDate());
  if (antes) edad--;
  return edad;
}

/** Sin fecha de nacimiento no se puede afirmar que sea menor: el sistema lo marca como dato faltante aparte. */
export function esMenor(nacimiento: Date | string | null | undefined, hoy: Date): boolean {
  return nacimiento != null && edadEn(nacimiento, hoy) < DATOS.documentacion.mayoriaEdad;
}

const PRIORIDAD: EstadoVigencia[] = ['VIGENTE', 'POR_VENCER', 'PENDIENTE', 'VENCIDO', 'RECHAZADO', 'FALTA'];

/** Estado de un tipo de documento: gana el mejor (un apto vigente pesa más que uno viejo rechazado). */
export function estadoDeDocumento(
  docs: readonly DocumentoBasico[],
  tipo: TipoDocumento,
  hoy: Date,
): EstadoVigencia {
  const estados = docs
    .filter((d) => d.tipo === tipo)
    .map((d): EstadoVigencia => {
      if (d.estado === 'PENDIENTE') return 'PENDIENTE';
      if (d.estado === 'RECHAZADO') return 'RECHAZADO';
      if (!d.vencimiento) return 'VIGENTE';
      const dias = (aFecha(d.vencimiento).getTime() - hoy.getTime()) / DIA_MS;
      if (dias < 0) return 'VENCIDO';
      return dias <= DATOS.documentacion.avisoVencimientoDias ? 'POR_VENCER' : 'VIGENTE';
    });
  return PRIORIDAD.find((p) => estados.includes(p)) ?? 'FALTA';
}

/**
 * Documentos que exige el torneo a un jugador. `AUTORIZACION_MENOR` en la lista del torneo
 * significa "exigir la autorización a los menores": a un mayor no se le pide.
 */
export function requeridosPara(torneo: readonly TipoDocumento[], menor: boolean): TipoDocumento[] {
  return torneo.filter((t) => t !== 'AUTORIZACION_MENOR' || menor);
}

export interface EntradaHabilitacion {
  /** Lo que exige el torneo (vacío = no exige documentación). */
  requeridos: readonly TipoDocumento[];
  documentos: readonly DocumentoBasico[];
  nacimiento: Date | string | null;
  /** El tutor firmó la autorización en línea (reemplaza al documento de autorización). */
  tutorAutorizo: boolean;
  sancionActiva: boolean;
  duplicadoAbierto: boolean;
  hoy: Date;
}

export interface Habilitacion {
  habilitado: boolean;
  motivos: string[];
  estados: Partial<Record<TipoDocumento, EstadoVigencia>>;
}

const MOTIVO_ESTADO: Record<Exclude<EstadoVigencia, 'VIGENTE' | 'POR_VENCER'>, (n: string) => string> = {
  FALTA: (n) => `Falta ${n}`,
  PENDIENTE: (n) => `${n} pendiente de revisión`,
  RECHAZADO: (n) => `${n} rechazado`,
  VENCIDO: (n) => `${n} vencido`,
};

/**
 * Habilitación del jugador: documentación vigente + sin sanción activa + sin duplicado abierto.
 * Un documento pendiente de revisión todavía no habilita.
 */
export function habilitacionDelJugador(e: EntradaHabilitacion): Habilitacion {
  const menor = esMenor(e.nacimiento, e.hoy);
  const motivos: string[] = [];
  const estados: Habilitacion['estados'] = {};
  for (const tipo of requeridosPara(e.requeridos, menor)) {
    let estado = estadoDeDocumento(e.documentos, tipo, e.hoy);
    if (tipo === 'AUTORIZACION_MENOR' && e.tutorAutorizo) estado = 'VIGENTE';
    estados[tipo] = estado;
    if (estado === 'VIGENTE' || estado === 'POR_VENCER') continue;
    motivos.push(
      tipo === 'AUTORIZACION_MENOR' && estado === 'FALTA'
        ? 'Menor sin autorización del tutor'
        : MOTIVO_ESTADO[estado](NOMBRE_DOCUMENTO[tipo]),
    );
  }
  if (e.sancionActiva) motivos.push('Suspendido por sanción');
  if (e.duplicadoAbierto) motivos.push('Posible duplicado sin resolver');
  return { habilitado: motivos.length === 0, motivos, estados };
}

// ───────────── Identidad ─────────────

/** Solo los dígitos: 30.123.456 y 30123456 son el mismo DNI. */
export const normalizarDni = (dni: string) => dni.replace(/\D/g, '');
export const dniValido = (dni: string) => /^\d{7,8}$/.test(normalizarDni(dni));
/** Para mostrar: **.***.456. El número completo solo se descifra donde hace falta. */
export function enmascararDni(dni: string): string {
  const d = normalizarDni(dni);
  return `${'•'.repeat(Math.max(d.length - 3, 0))}${d.slice(-3)}`;
}

// ───────────── Consentimientos versionados ─────────────

export const TIPOS_CONSENTIMIENTO = ['TUTOR_PARTICIPACION', 'IMAGEN', 'DATOS_PERSONALES'] as const;
export type TipoConsentimiento = (typeof TIPOS_CONSENTIMIENTO)[number];

/** Textos vigentes. Al cambiar uno se sube la versión: los consentimientos viejos dejan de valer. */
export const CONSENTIMIENTOS: Record<TipoConsentimiento, { version: number; titulo: string; texto: string }> =
  {
    TUTOR_PARTICIPACION: {
      version: 1,
      titulo: 'Autorización para participar',
      texto:
        'Soy el padre, madre o tutor del jugador y autorizo su participación en los torneos de la liga, ' +
        'declaro que está en condiciones de salud para jugar y acepto el reglamento.',
    },
    IMAGEN: {
      version: 1,
      titulo: 'Uso de imagen',
      texto:
        'Autorizo que la liga publique fotos y videos de los partidos en los que aparezca el jugador, ' +
        'en su sitio y redes. Puedo retirar esta autorización cuando quiera.',
    },
    DATOS_PERSONALES: {
      version: 1,
      titulo: 'Tratamiento de datos personales',
      texto:
        'Acepto que se guarden el DNI y los datos de salud del jugador solo para verificar su identidad y su aptitud, ' +
        'con acceso restringido, y que se borren según los plazos de retención.',
    },
  };

export interface ConsentimientoBasico {
  tipo: TipoConsentimiento;
  version: number;
  revocadoEn: Date | string | null;
}

/** Hay un consentimiento vigente si existe uno de la versión actual y no fue revocado. */
export function consentimientoVigente(registros: readonly ConsentimientoBasico[], tipo: TipoConsentimiento) {
  return registros.some(
    (r) => r.tipo === tipo && r.version === CONSENTIMIENTOS[tipo].version && r.revocadoEn == null,
  );
}

/** Un menor solo se publica con consentimiento del tutor; un mayor, con el suyo. Sin consentimiento, no se publica. */
export function puedePublicarImagen(menor: boolean, registros: readonly ConsentimientoBasico[]) {
  return (
    consentimientoVigente(registros, 'IMAGEN') &&
    (!menor || consentimientoVigente(registros, 'TUTOR_PARTICIPACION'))
  );
}

// ───────────── Retención ─────────────

export type DatoRetenible = 'RECHAZADO' | 'VENCIDO' | 'ACCESO';

/** Cuándo se borra un dato: `desde` es cuando se rechazó, cuando venció o cuando se registró el acceso. */
export function fechaDeBorrado(tipo: DatoRetenible, desde: Date | string): Date {
  return new Date(aFecha(desde).getTime() + DATOS.documentacion.retencionDias[tipo] * DIA_MS);
}

export const debeBorrarse = (tipo: DatoRetenible, desde: Date | string, hoy: Date) =>
  fechaDeBorrado(tipo, desde).getTime() <= hoy.getTime();
