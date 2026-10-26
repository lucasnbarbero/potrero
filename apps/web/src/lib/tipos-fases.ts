// Torneos por fases (ADR-026): lo que devuelve GET /torneos/:id/fases y el sitio público de un torneo FLEXIBLE.
import type { CruceLlave, Estadisticas } from './tipos';

export interface PiernaSerie {
  id: string;
  pierna: number;
  local: string;
  visitante: string;
  golesLocal: number | null;
  golesVisitante: number | null;
  penalesLocal: number | null;
  penalesVisitante: number | null;
  estado: string;
  inicio: string | null;
}

export interface SerieDeFase extends CruceLlave {
  piernas: PiernaSerie[];
}

export interface PartidoDeFase {
  id: string;
  fecha: number;
  grupo: string | null;
  ronda: number | null;
  pierna: number | null;
  inicio: string | null;
  estado: string;
  local: string;
  visitante: string;
  golesLocal: number | null;
  golesVisitante: number | null;
  penalesLocal: number | null;
  penalesVisitante: number | null;
  cancha: string | null;
}

export interface FaseVista {
  id: string;
  clave: string;
  orden: number;
  nombre: string;
  tipo: 'TODOS_CONTRA_TODOS' | 'GRUPOS' | 'ELIMINACION';
  estado: 'PENDIENTE' | 'EN_CURSO' | 'FINALIZADA';
  inicio: 'DESPUES' | 'EN_PARALELO';
  entradas: string[];
  idaYVuelta: boolean[] | null;
  equipos: number;
  /** Equipos que se esperan según el formato y el cupo. */
  previstos: number;
  rondasPrevistas: { nombre: string; idaYVuelta: boolean; partidos: number }[];
  puedeGenerar: boolean;
  motivo: string | null;
  jugados: number;
  grupos: { grupo: string | null; tabla: Estadisticas['tabla'] }[];
  llave: {
    rondas: { numero: number; nombre: string; idaYVuelta: boolean; partidos: SerieDeFase[] }[];
    campeon: { id: string; nombre: string } | null;
  } | null;
  partidos: PartidoDeFase[];
}

export interface VistaFases {
  torneoId: string;
  fases: FaseVista[];
}
