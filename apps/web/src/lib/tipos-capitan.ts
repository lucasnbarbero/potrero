// Tipos de las respuestas de usuarios e invitaciones (E04-09) y del panel del capitán (E19).
import type { RespuestaConvocatoria } from '@potrero/shared';

type Decision = { ok: true } | { ok: false; motivo: string };

export interface UsuariosOrganizacion {
  miembros: {
    id: string;
    usuarioId: string;
    nombre: string;
    email: string;
    rol: string;
    rolNombre: string;
    equipo: string | null;
    desde: string;
    esUnoMismo: boolean;
    quitar: Decision;
  }[];
  invitaciones: {
    id: string;
    email: string;
    nombre: string | null;
    rol: string;
    rolNombre: string;
    equipo: string | null;
    estado: 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA' | 'ANULADA' | 'VENCIDA';
    venceEn: string;
    creadoEn: string;
    gestionable: boolean;
  }[];
  rolesInvitables: { rol: string; nombre: string }[];
  equipos: { id: string; nombre: string }[];
}

export interface InvitacionPublica {
  organizacion: string;
  email: string;
  nombre: string | null;
  rol: string;
  rolNombre: string;
  equipo: string | null;
  estado: UsuariosOrganizacion['invitaciones'][number]['estado'];
  venceEn: string;
  tieneCuenta: boolean;
  /** Solo para JUGADOR (E20-01): términos que acepta al crear su cuenta. */
  terminos: { version: number; titulo: string; texto: string } | null;
}

export interface PanelCapitan {
  capitan: string;
  equipo: { id: string; nombre: string; color: string | null };
  torneo: { id: string; nombre: string; estado: string } | null;
  torneos: { id: string; nombre: string; estado: string }[];
  posicion: { posicion: number; pts: number; grupo: string | null } | null;
  tabla: { posicion: number; equipo: string; propio: boolean; pj: number; dg: number; pts: number }[];
  proximo: {
    id: string;
    fecha: number;
    inicio: string | null;
    cancha: string | null;
    local: boolean;
    rival: string;
  } | null;
  ultimos: { id: string; fecha: number; rival: string; gf: number; gc: number; resultado: 'G' | 'E' | 'P' }[];
  convocatoria: {
    va: number;
    noVa: number;
    pendientes: number;
    suspendidos: number;
    convocables: number;
  } | null;
  plantel: {
    jugadorId: string;
    nombre: string;
    numero: number | null;
    goles: number;
    habilitado: boolean;
    motivos: string[];
    suspendidoPor: number;
    convocatoria: RespuestaConvocatoria | 'SUSPENDIDO' | null;
    baja: Decision;
    /** Cuenta del jugador en la app (E20-01). */
    cuenta: 'ACTIVA' | 'INVITADO' | null;
  }[];
  documentacion: {
    requeridos: string[];
    habilitados: number;
    total: number;
    faltantes: {
      tipo: string;
      nombre: string;
      total: number;
      completos: number;
      faltan: { nombre: string; estado: string }[];
    }[];
    textoWhatsapp: string;
  };
  sanciones: {
    id: string;
    jugador: string;
    causa: string;
    partidos: number;
    restantes: number;
    activa: boolean;
  }[];
  expedientes: {
    id: string;
    tipo: string;
    tipoNombre: string;
    motivo: string;
    jugador: string | null;
    informeArbitro: string | null;
    descargo: string | null;
    descargoEn: string | null;
    estado: 'ABIERTO' | 'RESUELTO';
    sugeridos: number;
    partidosResueltos: number | null;
    multa: number;
    veredicto: string | null;
    resolucion: string | null;
    creadoEn: string;
  }[];
  deudas: {
    total: number;
    cargos: {
      id: string;
      concepto: string;
      torneo: string;
      monto: number;
      saldo: number;
      vence: string | null;
      categoria: string;
    }[];
  };
}
