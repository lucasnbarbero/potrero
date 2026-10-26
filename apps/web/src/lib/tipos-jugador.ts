// Tipos de la respuesta del panel del jugador (E20-01, E20-05).
import type { AvisoJugador, EstadoDocumentoJugador, TipoDocumento } from '@potrero/shared';
import type { PanelCapitan } from './tipos-capitan';
import type { JugadorPerfil } from './tipos-publico';

export interface PanelJugador {
  usuario: string;
  organizacion: { slug: string; nombre: string };
  jugador: { id: string; nombre: string; apellido: string; menor: boolean; perfilPublico: boolean };
  equipos: {
    equipo: PanelCapitan['equipo'];
    torneo: PanelCapitan['torneo'];
    posicion: PanelCapitan['posicion'];
    numero: number | null;
    habilitado: boolean;
    motivos: string[];
    proximo:
      | (NonNullable<PanelCapitan['proximo']> & {
          respuesta: 'VA' | 'NO_VA' | null;
          suspendido: boolean;
          confirmados: number;
          convocables: number;
        })
      | null;
    ultimos: PanelCapitan['ultimos'];
    sanciones: { id: string; causa: string; partidos: number; restantes: number; activa: boolean }[];
    deuda: PanelCapitan['deudas'];
  }[];
  estadisticas: Pick<JugadorPerfil, 'totales' | 'trayectoria' | 'logros' | 'ultimos'> | null;
  documentacion: {
    items: {
      tipo: TipoDocumento;
      nombre: string;
      estado: EstadoDocumentoJugador;
      requerido: boolean;
      ok: boolean;
      puedeSubir: boolean;
    }[];
    faltan: number;
  };
  privacidad: {
    apodo: string | null;
    nombrePublico: 'INICIALES' | 'APODO' | 'COMPLETO';
    comoAparece: string;
    opciones: { INICIALES: string; APODO: string | null; COMPLETO: string };
  };
  terminos: { version: number; aceptadosEn: string } | null;
  avisos: AvisoJugador[];
}
