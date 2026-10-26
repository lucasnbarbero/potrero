// Backoffice de Gregal (E36): métricas de la plataforma (E36-12, E24-05) y salud de cada liga (E36-05).
// Funciones puras: la API junta los datos de todas las organizaciones y llama a estas funciones.
import { DATOS } from '../datos.js';
import type { MetodoPago } from './tipos.js';

/** Roles del equipo interno de Gregal (E36-02). No se mezclan con los roles de una organización. */
export const ROLES_STAFF = ['SUPERADMIN', 'SOPORTE', 'FINANZAS', 'DIRECCION'] as const;
export type RolStaff = (typeof ROLES_STAFF)[number];
export const NOMBRE_ROL_STAFF: Record<RolStaff, string> = {
  SUPERADMIN: 'Superadmin',
  SOPORTE: 'Soporte',
  FINANZAS: 'Finanzas',
  DIRECCION: 'Dirección',
};

const DIA_MS = 86_400_000;
/** Argentina no tiene horario de verano: la hora local es UTC−3 todo el año. */
const DESFASE_AR_MS = -3 * 60 * 60 * 1000;
const local = (iso: string | Date) => new Date(new Date(iso).getTime() + DESFASE_AR_MS);

/** Lunes (fecha local de Argentina, AAAA-MM-DD) de la semana de un instante. */
export function lunesDe(iso: string | Date): string {
  const d = local(iso);
  const dia = (d.getUTCDay() + 6) % 7; // 0 = lunes
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dia))
    .toISOString()
    .slice(0, 10);
}

/** Mes local de Argentina (AAAA-MM) de un instante. */
export function mesDe(iso: string | Date): string {
  return local(iso).toISOString().slice(0, 7);
}

/** Las últimas `n` semanas (lunes, de la más vieja a la actual). */
export function ultimasSemanas(ahora: Date, n: number): string[] {
  const actual = new Date(`${lunesDe(ahora)}T12:00:00Z`).getTime();
  return Array.from({ length: n }, (_, i) =>
    new Date(actual - (n - 1 - i) * 7 * DIA_MS).toISOString().slice(0, 10),
  );
}

/** Los últimos `n` meses (AAAA-MM, del más viejo al actual). */
export function ultimosMeses(ahora: Date, n: number): string[] {
  const d = local(ahora);
  return Array.from({ length: n }, (_, i) =>
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (n - 1 - i), 1)).toISOString().slice(0, 7),
  );
}

/** Cuenta fechas por semana: siempre devuelve las `n` semanas, con cero las vacías. */
export function porSemana(fechas: string[], ahora: Date, n = 8) {
  const semanas = ultimasSemanas(ahora, n);
  const cuenta = new Map(semanas.map((s) => [s, 0]));
  for (const f of fechas) {
    const s = lunesDe(f);
    if (cuenta.has(s)) cuenta.set(s, cuenta.get(s)! + 1);
  }
  return semanas.map((semana) => ({ semana, cantidad: cuenta.get(semana)! }));
}

/** Cuenta fechas por mes: siempre devuelve los `n` meses, con cero los vacíos. */
export function porMes(fechas: string[], ahora: Date, n = 6) {
  const meses = ultimosMeses(ahora, n);
  const cuenta = new Map(meses.map((m) => [m, 0]));
  for (const f of fechas) {
    const m = mesDe(f);
    if (cuenta.has(m)) cuenta.set(m, cuenta.get(m)! + 1);
  }
  return meses.map((mes) => ({ mes, cantidad: cuenta.get(mes)! }));
}

// ── Dinero (E36-06) ──

export interface PagoDePlataforma {
  metodo: MetodoPago;
  monto: number;
  comision: number;
  /** Acreditación (o registro). ISO. Solo se pasan los pagos aprobados. */
  fecha: string;
}

export interface CobrosPorMedio {
  efectivo: number;
  transferencia: number;
  online: number;
  total: number;
  comision: number;
  pagos: number;
}

const CAMPO_MEDIO: Record<MetodoPago, 'efectivo' | 'transferencia' | 'online'> = {
  EFECTIVO: 'efectivo',
  TRANSFERENCIA: 'transferencia',
  MERCADO_PAGO: 'online',
};

const vacio = (): CobrosPorMedio => ({
  efectivo: 0,
  transferencia: 0,
  online: 0,
  total: 0,
  comision: 0,
  pagos: 0,
});

/** Suma lo cobrado (GMV) por medio y la comisión de Gregal. */
export function sumarCobros(pagos: PagoDePlataforma[]): CobrosPorMedio {
  const r = vacio();
  for (const p of pagos) {
    r[CAMPO_MEDIO[p.metodo]] += p.monto;
    r.total += p.monto;
    r.comision += p.comision;
    r.pagos++;
  }
  return r;
}

/** Take rate: comisión sobre lo cobrado online (lo único que paga comisión) y sobre el total. */
export function tasaDeComision(c: CobrosPorMedio) {
  return {
    sobreOnline: c.online ? c.comision / c.online : 0,
    sobreTotal: c.total ? c.comision / c.total : 0,
  };
}

/** Cobros y comisiones mes a mes (los últimos `n` meses, con cero los vacíos). */
export function cobrosPorMes(pagos: PagoDePlataforma[], ahora: Date, n = 6) {
  const meses = ultimosMeses(ahora, n);
  const grupos = new Map<string, PagoDePlataforma[]>(meses.map((m) => [m, []]));
  for (const p of pagos) grupos.get(mesDe(p.fecha))?.push(p);
  return meses.map((mes) => ({ mes, ...sumarCobros(grupos.get(mes)!) }));
}

// ── Salud de cada liga (E36-05) ──

export interface LigaParaSalud {
  /** Alta de la organización. ISO. */
  creadaEn: string;
  equipos: number;
  /** Torneos en inscripción o en curso. */
  torneosActivos: number;
  /** Partidos cuyo horario ya pasó (sin suspendidos): deberían tener el acta cargada. */
  partidosVencidos: number;
  /** De esos, los que se cerraron en la plataforma (finalizados o con equipo ausente). */
  actasCargadas: number;
  pagosOnline: number;
  pagosManuales: number;
  /** Último uso del panel por alguien de la organización. ISO o null si nunca. */
  ultimoUso: string | null;
}

export type ClaveAlerta = 'SIN_EQUIPOS' | 'ACTAS_BAJAS' | 'SOLO_MANUALES' | 'PANEL_SIN_USO';

export interface AlertaDeSalud {
  clave: ClaveAlerta;
  titulo: string;
  detalle: string;
}

export type EstadoDeSalud = 'SANA' | 'ATENCION' | 'RIESGO';

export const UMBRALES_SALUD = DATOS.saludDeLiga;

/** Alertas de riesgo de abandono del documento 5: el gestor llama o escribe en 24 horas. */
export function alertasDeSalud(l: LigaParaSalud, ahora: Date, u = UMBRALES_SALUD): AlertaDeSalud[] {
  const alertas: AlertaDeSalud[] = [];
  const dias = (iso: string) => Math.floor((ahora.getTime() - new Date(iso).getTime()) / DIA_MS);
  const antiguedad = dias(l.creadaEn);
  if (l.equipos === 0 && antiguedad >= u.diasSinEquipos)
    alertas.push({
      clave: 'SIN_EQUIPOS',
      titulo: 'Sin equipos cargados',
      detalle: `Se dio de alta hace ${antiguedad} días y todavía no cargó ningún equipo.`,
    });
  if (
    l.partidosVencidos >= u.partidosMinimosParaActas &&
    l.actasCargadas / l.partidosVencidos < u.actasMinimas
  )
    alertas.push({
      clave: 'ACTAS_BAJAS',
      titulo: 'Pocas actas cargadas',
      detalle: `Cargó ${l.actasCargadas} de ${l.partidosVencidos} actas (${Math.round((l.actasCargadas / l.partidosVencidos) * 100)} %).`,
    });
  if (l.pagosManuales >= u.pagosManualesSostenidos && l.pagosOnline === 0)
    alertas.push({
      clave: 'SOLO_MANUALES',
      titulo: 'Solo pagos manuales',
      detalle: `${l.pagosManuales} pagos en efectivo o transferencia y ninguno online.`,
    });
  const sinUso = l.ultimoUso ? dias(l.ultimoUso) : antiguedad;
  if (l.torneosActivos > 0 && sinUso >= u.diasSinUsoDelPanel)
    alertas.push({
      clave: 'PANEL_SIN_USO',
      titulo: 'No usa el panel',
      detalle: l.ultimoUso
        ? `No abre el panel hace ${sinUso} días con un torneo activo.`
        : 'Nunca abrió el panel y tiene un torneo activo.',
    });
  return alertas;
}

export function estadoDeSalud(alertas: AlertaDeSalud[]): EstadoDeSalud {
  return alertas.length === 0 ? 'SANA' : alertas.length === 1 ? 'ATENCION' : 'RIESGO';
}

/**
 * Liga activa (norte del producto): tiene un torneo en inscripción o en curso, o cerró un partido en los últimos
 * `diasLigaActiva` días.
 */
export function esLigaActiva(
  l: { torneosActivos: number; ultimoPartidoCerrado: string | null },
  ahora: Date,
  u = UMBRALES_SALUD,
): boolean {
  if (l.torneosActivos > 0) return true;
  return (
    !!l.ultimoPartidoCerrado &&
    ahora.getTime() - new Date(l.ultimoPartidoCerrado).getTime() <= u.diasLigaActiva * DIA_MS
  );
}

// ── Permisos del staff (E36-02) ──

export const SECCIONES_STAFF = ['inicio', 'organizaciones', 'dinero', 'auditoria'] as const;
export type SeccionStaff = (typeof SECCIONES_STAFF)[number];

/** Qué sección ve cada rol interno. Soporte no ve plata; la auditoría la ven dirección y superadmin. */
const SECCIONES_POR_ROL: Record<RolStaff, readonly SeccionStaff[]> = {
  SUPERADMIN: SECCIONES_STAFF,
  DIRECCION: SECCIONES_STAFF,
  FINANZAS: ['inicio', 'organizaciones', 'dinero'],
  SOPORTE: ['inicio', 'organizaciones'],
};

export function staffPuedeVer(rol: string, seccion: SeccionStaff): boolean {
  return (SECCIONES_POR_ROL[rol as RolStaff] ?? []).includes(seccion);
}
