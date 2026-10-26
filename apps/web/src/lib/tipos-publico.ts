// Respuestas de la API para la página pública del partido (E21) y el perfil del jugador (E20).
import type { EstadisticasJugador, Logro } from '@potrero/shared';

/** Un jugador tal como se publica: `id` solo si tiene perfil público (si no, no se enlaza). */
export interface JugadorRef {
  id: string | null;
  nombre: string;
  iniciales: string;
}

export interface PartidoPublico {
  organizacion: { nombre: string; slug: string };
  torneo: { nombre: string; slug: string; modalidad: string };
  partido: {
    id: string;
    fecha: number;
    fase: string;
    grupo: string | null;
    ronda: string | null;
    estado: 'PROGRAMADO' | 'EN_JUEGO' | 'FINALIZADO' | 'WO' | 'SUSPENDIDO' | string;
    inicio: string | null;
    cancha: string | null;
    local: string;
    visitante: string;
    golesLocal: number | null;
    golesVisitante: number | null;
    penalesLocal: number | null;
    penalesVisitante: number | null;
    ganadorWO: 'LOCAL' | 'VISITANTE' | null;
  };
  lineaDeTiempo: {
    id: string;
    minuto: number | null;
    tipo: 'GOL' | 'GOL_EN_CONTRA' | 'AMARILLA' | 'ROJA' | 'CAMBIO';
    lado: 'LOCAL' | 'VISITANTE';
    segundaAmarilla: boolean;
    marcador: { local: number; visitante: number };
    jugador: JugadorRef | null;
  }[];
  cronica: string[];
  figura: { jugador: JugadorRef | null; lado: 'LOCAL' | 'VISITANTE'; goles: number } | null;
  planteles: {
    local: (JugadorRef & { numero: number | null })[];
    visitante: (JugadorRef & { numero: number | null })[];
  };
}

export interface JugadorPerfil {
  organizacion: { nombre: string; slug: string };
  jugador: { nombre: string; iniciales: string };
  equipoActual: {
    nombre: string;
    torneo: string | null;
    torneoSlug: string | null;
    modalidad: string | null;
    numero: number | null;
  } | null;
  totales: EstadisticasJugador;
  trayectoria: {
    torneo: { nombre: string; slug: string; modalidad: string; estado: string };
    equipo: string;
    estadisticas: EstadisticasJugador;
    goleador: boolean;
  }[];
  logros: Logro[];
  ultimos: {
    id: string;
    torneoSlug: string;
    inicio: string | null;
    rival: string;
    resultado: 'G' | 'E' | 'P';
    marcador: string;
    goles: number;
    amarillas: number;
    rojas: number;
  }[];
}
