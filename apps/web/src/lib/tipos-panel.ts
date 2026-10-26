// Tipos del panel del organizador (E18) y de la cuenta (E04-14), tal como los devuelve la API.
import type { AlertaPanel, Sugerencia } from '@potrero/shared';

export interface PartidoEnVivo {
  id: string;
  torneo: string;
  fecha: number;
  fase: string;
  cancha: string | null;
  minuto: number | null;
  local: { id: string; nombre: string };
  visitante: { id: string; nombre: string };
  marcador: { local: number; visitante: number };
  goles: { minuto: number | null; jugador: string; enContra: boolean; lado: 'LOCAL' | 'VISITANTE' }[];
}

export interface Tablero {
  hoy: string;
  vivo: PartidoEnVivo[];
  dinero: {
    cobrado: number;
    comisiones: number;
    neto: number;
    pendiente: number;
    online: number;
    porcentajeCobrado: number;
    proximoVence: string | null;
    serie: { dia: string; cobrado: number }[];
  };
  deudores: { equipo: string; torneoId: string; debe: number; vencido: boolean }[];
  equipos: { total: number; nuevos: number; torneos: number; muestra: string[] };
  hoyPartidos: {
    total: number;
    enJuego: number;
    sinArbitro: number;
    lista: { id: string; inicio: string; local: string; visitante: string }[];
  };
  proximos: {
    id: string;
    torneoId: string;
    inicio: string;
    local: string;
    visitante: string;
    cancha: string | null;
    sinArbitro: boolean;
  }[];
  torneos: {
    id: string;
    nombre: string;
    modalidad: string;
    formato: string;
    estado: string;
    inscriptos: number;
    cupo: number;
    fechaActual: number;
    fechas: number;
  }[];
  alertas: AlertaPanel[];
  sugerencias: Sugerencia[];
}

export interface MiCuenta {
  usuario: { id: string; nombre: string; email: string; emailVerificado: boolean };
  organizaciones: { id: string; nombre: string; slug: string; rol: string; activa: boolean }[];
  sesionesActivas: number;
}

export const NOMBRE_ROL: Record<string, string> = {
  DUENO: 'Dueño',
  ADMINISTRADOR: 'Administrador',
  TESORERO: 'Tesorero',
  ARBITRO: 'Árbitro',
  TRIBUNAL: 'Tribunal',
  CAPITAN: 'Capitán',
};
