// Tipos de las respuestas de /sponsors (E23). Viven acá para no tocar lib/tipos.ts mientras se trabaja en paralelo.
import type { CategoriaSponsor, EspacioSponsor, EstadoPlacement } from '@potrero/shared';

export interface PlacementPanel {
  id: string;
  torneoId: string;
  torneo: string;
  espacio: EspacioSponsor;
  desde: string;
  hasta: string;
  monto: number;
  activo: boolean;
  motivoBloqueo: string | null;
  estado: EstadoPlacement;
  diasRestantes: number;
  impresiones: number;
  clics: number;
}

export interface SponsorPanel {
  id: string;
  nombre: string;
  iniciales: string;
  categoria: CategoriaSponsor;
  categoriaNombre: string;
  descripcion: string | null;
  link: string | null;
  logoUrl: string | null;
  placements: PlacementPanel[];
  activo: boolean;
  acordadoVigente: number;
  cobrado: number;
  impresiones: number;
  clics: number;
}

export interface PanelSponsors {
  hoy: string;
  sponsors: SponsorPanel[];
  torneos: { id: string; nombre: string; slug: string; estado: string; conMenores: boolean }[];
  categoriasRechazadas: CategoriaSponsor[];
  resumen: {
    acordadoVigente: number;
    sponsorsActivos: number;
    cobradoEnCaja: number;
    cobradoSinAsignar: number;
    impresiones: number;
    clics: number;
    ctr: number;
    mejorEspacio: { espacio: EspacioSponsor; nombre: string; ctr: number } | null;
  };
}

export interface ReporteSponsor {
  organizacion: string;
  sponsor: {
    id: string;
    nombre: string;
    iniciales: string;
    categoria: string;
    descripcion: string | null;
    link: string | null;
    logoUrl: string | null;
  };
  desde: string;
  hasta: string;
  impresiones: number;
  clics: number;
  ctr: number;
  serie: { dia: string; impresiones: number; clics: number }[];
  espacios: {
    id: string;
    espacio: string;
    torneo: string;
    desde: string;
    hasta: string;
    monto: number;
    impresiones: number;
    clics: number;
    ctr: number;
  }[];
  cobros: {
    id: string;
    fecha: string;
    descripcion: string;
    comprobante: string | null;
    monto: number;
    anulado: boolean;
  }[];
  cobrado: number;
}

/** "26 oct" a partir de un día AAAA-MM-DD (al mediodía de Argentina, para no correrse de día). */
export const dia = (d: string) =>
  new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${d}T12:00:00-03:00`));

/** 48.213 → "48,2 mil". */
export function compacto(n: number): string {
  const corto = (x: number) => x.toLocaleString('es-AR', { maximumFractionDigits: 1 });
  if (n >= 1_000_000) return `${corto(n / 1_000_000)} M`;
  if (n >= 1_000) return `${corto(n / 1_000)} mil`;
  return n.toLocaleString('es-AR');
}

export const porcentaje = (n: number) => `${String(n).replace('.', ',')}%`;
