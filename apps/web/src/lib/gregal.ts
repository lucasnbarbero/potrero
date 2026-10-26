// Backoffice de Gregal (E36): acceso a la API interna desde el servidor y tipos de sus respuestas.
// La sesión del staff es otra cookie (potrero_staff): sin ella se vuelve a /gregal/ingresar, nunca a /ingresar.
import type { AlertaDeSalud, CobrosPorMedio, EstadoDeSalud, Plan } from '@potrero/shared';
import { cookies } from 'next/headers';
import { forbidden, notFound, redirect } from 'next/navigation';

const API = process.env.API_URL ?? 'http://localhost:4000';

export async function apiGregal<T>(ruta: string): Promise<T> {
  const c = await cookies();
  const r = await fetch(`${API}/api/gregal${ruta}`, { headers: { cookie: c.toString() }, cache: 'no-store' });
  if (r.status === 401) redirect('/gregal/ingresar');
  if (r.status === 403) forbidden();
  if (r.status === 404) notFound();
  if (!r.ok) throw new Error('Error de la API interna');
  return (await r.json()) as T;
}

export interface StaffYo {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  ultimoIngresoEn: string | null;
}

export interface LigaResumen {
  id: string;
  nombre: string;
  slug: string;
  plan: Plan;
  localidad: string | null;
  mpConectado: boolean;
  creadaEn: string;
  activa: boolean;
  torneos: number;
  torneosEnCurso: number;
  equipos: number;
  jugadores: number;
  partidosCerrados: number;
  actas: { cargadas: number; vencidos: number };
  cobrado: number;
  comision: number;
  ultimoUso: string | null;
  salud: EstadoDeSalud;
  alertas: AlertaDeSalud[];
}

export interface InicioGregal {
  ligas: { total: number; activas: number };
  torneosEnCurso: number;
  equipos: number;
  jugadores: number;
  cobros: CobrosPorMedio;
  tasa: { sobreOnline: number; sobreTotal: number };
  partidosPorSemana: { semana: string; cantidad: number }[];
  ligasPorMes: { mes: string; cantidad: number }[];
  enRiesgo: { id: string; nombre: string; salud: EstadoDeSalud; alertas: AlertaDeSalud[] }[];
}

export type CobrosDelMes = CobrosPorMedio & { mes: string };

export type OrganizacionGregal = Omit<LigaResumen, 'torneos'> & {
  torneos: {
    id: string;
    nombre: string;
    slug: string;
    estado: string;
    modalidad: string;
    formato: string;
    equipos: number;
    partidos: number;
    jugados: number;
  }[];
  usuarios: { nombre: string; email: string; rol: string; desde: string }[];
  cobros: CobrosPorMedio;
  cobrosPorMes: CobrosDelMes[];
  ultimosPagos: {
    id: string;
    medio: string;
    monto: number;
    comision: number;
    fecha: string;
    concepto: string;
    equipo: string;
  }[];
};

export interface DineroGregal {
  total: CobrosPorMedio;
  tasa: { sobreOnline: number; sobreTotal: number };
  porMes: CobrosDelMes[];
  porLiga: (CobrosPorMedio & { id: string; nombre: string; plan: Plan })[];
}

export interface FilaAuditoria {
  id: string;
  creadoEn: string;
  accion: string;
  staff: { nombre: string; email: string; rol: string } | null;
  organizacion: { id: string; nombre: string | null } | null;
  detalle: { ruta?: string; consulta?: Record<string, string> } | null;
  ip: string | null;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** "2026-10" → "oct 26". */
export const nombreMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(2, 4)}`;
/** "2026-10-19" → "19/10". */
export const diaMes = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
export const porcentaje = (x: number, decimales = 0) => `${(x * 100).toFixed(decimales).replace('.', ',')} %`;

export const ESTADO_SALUD: Record<EstadoDeSalud, [texto: string, clase: string]> = {
  SANA: ['Sana', 'pill-gregal'],
  ATENCION: ['Atención', 'pill-amber'],
  RIESGO: ['En riesgo', 'pill-red'],
};
