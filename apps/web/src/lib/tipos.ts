// Formas de las respuestas de la API que usa la web.
// Pendiente (backlog E02-06): reemplazarlas por el cliente tipado generado desde OpenAPI.
import type { FilaTabla, Formato, Modalidad } from '@potrero/shared';

export interface Torneo {
  id: string;
  nombre: string;
  slug: string;
  modalidad: Modalidad;
  formato: Formato;
  idaYVuelta: boolean;
  estado: string;
  cupo: number;
  inscripcion: number;
  _count?: { inscripciones: number; partidos: number };
}

export interface DetalleTorneo extends Torneo {
  organizacionSlug: string;
  partidosEstimados: number;
  reglamento: { puntosVictoria: number; puntosEmpate: number; umbralAmarillas: number; desempates: string[] };
}

export interface Partido {
  id: string;
  fecha: number;
  inicio: string | null;
  estado: string;
  localId?: string;
  visitanteId?: string;
  local: string;
  visitante: string;
  golesLocal: number | null;
  golesVisitante: number | null;
  ganadorWOId: string | null;
  cancha: string | null;
}

export interface Estadisticas {
  tabla: (FilaTabla & { equipo: string })[];
  goleadores: { jugadorId: string; jugador: string; equipo: string; goles: number }[];
  sanciones: {
    id: string;
    jugador: string;
    equipo: string;
    causa: string;
    partidos: number;
    cumplidos: number;
    restantes: number;
    activa: boolean;
  }[];
}

export interface Inscripcion {
  id: string;
  estado: string;
  equipo: { id: string; nombre: string; capitan: string | null; jugadores: number };
  total: number;
  pagado: number;
  debe: number;
  cargos: { id: string; concepto: string; monto: number; estado: string }[];
  pagos: { id: string; metodo: string; monto: number; estado: string; comision: number; fecha: string }[];
}

export interface Equipo {
  id: string;
  nombre: string;
  capitanNombre: string | null;
  capitanTelefono: string | null;
  _count?: { plantel: number };
}

export interface Sede {
  id: string;
  nombre: string;
  direccion: string | null;
  canchas: { id: string; nombre: string }[];
}

export interface JugadorActa {
  id: string;
  nombre: string;
  numero: number | null;
  habilitado: boolean;
  motivo: string | null;
}

export interface Acta {
  id: string;
  torneo: { id: string; nombre: string };
  fecha: number;
  inicio: string | null;
  estado: string;
  cancha: string | null;
  local: { id: string; nombre: string; jugadores: JugadorActa[] };
  visitante: { id: string; nombre: string; jugadores: JugadorActa[] };
  marcador: { local: number; visitante: number };
  eventos: { id: string; tipo: string; equipoId: string; jugadorId: string | null; minuto: number | null }[];
}
