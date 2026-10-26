// Sponsors del torneo (E23): los vende el organizador (documento 2, sección 6). Reglas puras: qué categorías se aceptan,
// cuándo se muestra un espacio y cómo se mide el alcance, siempre en forma agregada y sin datos personales.
import { DATOS } from '../datos.js';
import { sumarDias } from './fixture.js';
import { diasEntre } from './mensajeria.js';

/** Rubros de los auspiciantes. Los tres últimos antes de OTROS no se aceptan en torneos con menores. */
export const CATEGORIAS_SPONSOR = [
  'BEBIDAS',
  'ALIMENTOS',
  'INDUMENTARIA',
  'BANCOS',
  'SEGUROS',
  'DELIVERY',
  'FITNESS',
  'COMERCIO',
  'APUESTAS',
  'ALCOHOL',
  'TABACO',
  'OTROS',
] as const;
export type CategoriaSponsor = (typeof CATEGORIAS_SPONSOR)[number];

export const NOMBRE_CATEGORIA_SPONSOR: Record<CategoriaSponsor, string> = {
  BEBIDAS: 'Bebidas e hidratación',
  ALIMENTOS: 'Alimentos y gastronomía',
  INDUMENTARIA: 'Indumentaria y calzado',
  BANCOS: 'Billeteras y bancos',
  SEGUROS: 'Seguros',
  DELIVERY: 'Apps de delivery',
  FITNESS: 'Fitness y salud',
  COMERCIO: 'Comercio del barrio',
  APUESTAS: 'Apuestas',
  ALCOHOL: 'Bebidas alcohólicas',
  TABACO: 'Tabaco',
  OTROS: 'Otros',
};

/** Documento 2, sección 6: en torneos con menores no se aceptan apuestas, alcohol ni tabaco. */
export const CATEGORIAS_PROHIBIDAS_CON_MENORES: readonly CategoriaSponsor[] = [
  'APUESTAS',
  'ALCOHOL',
  'TABACO',
];

/** Dónde puede aparecer un sponsor en el sitio público del torneo. */
export const ESPACIOS_SPONSOR = ['CABECERA', 'ENTRE_SECCIONES', 'GOLEADORES', 'TARJETA_RESULTADO'] as const;
export type EspacioSponsor = (typeof ESPACIOS_SPONSOR)[number];

export const ESPACIO_SPONSOR: Record<EspacioSponsor, { nombre: string; descripcion: string }> = {
  CABECERA: { nombre: 'Banner del sitio', descripcion: 'Cabecera del sitio del torneo' },
  ENTRE_SECCIONES: { nombre: 'Entre secciones', descripcion: 'Entre la tabla y los resultados' },
  GOLEADORES: { nombre: 'Pelota oficial', descripcion: 'Sección de goleadores' },
  TARJETA_RESULTADO: { nombre: 'Tarjeta de resultado', descripcion: 'Junto a los últimos resultados' },
};

/** Desde cuántos días antes del final un espacio se marca "por vencer". */
export const DIAS_AVISO_VENCIMIENTO_SPONSOR: number = DATOS.sponsors.avisoVencimientoDias;

/**
 * Por qué no se puede vender este rubro en este torneo, o null si se puede.
 * El organizador puede rechazar rubros enteros (por ejemplo, apuestas aunque el torneo sea de mayores).
 */
export function motivoDeRechazoSponsor(e: {
  categoria: CategoriaSponsor;
  torneoConMenores: boolean;
  categoriasRechazadas: readonly string[];
}): string | null {
  const nombre = NOMBRE_CATEGORIA_SPONSOR[e.categoria];
  if (e.torneoConMenores && CATEGORIAS_PROHIBIDAS_CON_MENORES.includes(e.categoria))
    return `El torneo tiene jugadores menores de edad: no se aceptan sponsors de ${nombre.toLowerCase()}.`;
  if (e.categoriasRechazadas.includes(e.categoria))
    return `Tu organización no acepta sponsors de ${nombre.toLowerCase()}. Lo podés cambiar en las preferencias.`;
  return null;
}

/** Un espacio está vigente del primer al último día del período, ambos inclusive (días AAAA-MM-DD de Argentina). */
export function placementVigente(p: { desde: string; hasta: string }, hoy: string): boolean {
  return p.desde <= hoy && hoy <= p.hasta;
}

/** Si el espacio se muestra hoy en el sitio público: vigente, activo y con un rubro que sigue siendo aceptable. */
export function placementVisible(e: {
  desde: string;
  hasta: string;
  activo: boolean;
  categoria: CategoriaSponsor;
  torneoConMenores: boolean;
  categoriasRechazadas: readonly string[];
  hoy: string;
}): boolean {
  return e.activo && placementVigente(e, e.hoy) && motivoDeRechazoSponsor(e) === null;
}

export type EstadoPlacement = 'PROGRAMADO' | 'ACTIVO' | 'POR_VENCER' | 'VENCIDO' | 'PAUSADO' | 'BLOQUEADO';

/** Estado para el panel. BLOQUEADO: el rubro dejó de ser aceptable (por ejemplo, se sumó un menor al torneo). */
export function estadoDelPlacement(e: {
  desde: string;
  hasta: string;
  activo: boolean;
  bloqueado: boolean;
  hoy: string;
}): { estado: EstadoPlacement; diasRestantes: number } {
  const diasRestantes = diasEntre(e.hoy, e.hasta);
  if (e.bloqueado) return { estado: 'BLOQUEADO', diasRestantes };
  if (!e.activo) return { estado: 'PAUSADO', diasRestantes };
  if (e.hoy < e.desde) return { estado: 'PROGRAMADO', diasRestantes };
  if (e.hoy > e.hasta) return { estado: 'VENCIDO', diasRestantes };
  if (diasRestantes <= DIAS_AVISO_VENCIMIENTO_SPONSOR) return { estado: 'POR_VENCER', diasRestantes };
  return { estado: 'ACTIVO', diasRestantes };
}

/** Clics cada 100 impresiones, con un decimal. Sin impresiones, 0. */
export function ctr(impresiones: number, clics: number): number {
  return impresiones > 0 ? Math.round((clics / impresiones) * 1000) / 10 : 0;
}

export interface MetricaDia {
  dia: string;
  impresiones: number;
  clics: number;
}

/** Totales y serie diaria completa (días sin datos en cero) entre `desde` y `hasta`, ambos inclusive. */
export function resumenDeMetricas(filas: readonly MetricaDia[], desde: string, hasta: string) {
  const porDia = new Map<string, { impresiones: number; clics: number }>();
  for (const f of filas) {
    if (f.dia < desde || f.dia > hasta) continue;
    const d = porDia.get(f.dia) ?? { impresiones: 0, clics: 0 };
    d.impresiones += f.impresiones;
    d.clics += f.clics;
    porDia.set(f.dia, d);
  }
  const serie: MetricaDia[] = [];
  for (let d = desde; d <= hasta && serie.length < 1000; d = sumarDias(d, 1))
    serie.push({ dia: d, ...(porDia.get(d) ?? { impresiones: 0, clics: 0 }) });
  const impresiones = serie.reduce((s, x) => s + x.impresiones, 0);
  const clics = serie.reduce((s, x) => s + x.clics, 0);
  return { impresiones, clics, ctr: ctr(impresiones, clics), serie };
}

/** El link del sponsor solo puede ser http(s): el redirect que cuenta clics no lleva a ningún otro lado. */
export function linkSeguro(link: string | null | undefined): string | null {
  const l = link?.trim();
  return l && /^https?:\/\/[^\s/?#]+\.[^\s]+$/i.test(l) ? l : null;
}

/** Iniciales para el logo cuando no hay uno: las dos primeras palabras, o las dos últimas si son más ("Kiosco Don Pepe" → "DP"). */
export function inicialesSponsor(nombre: string): string {
  const p = nombre.trim().split(/\s+/).filter(Boolean);
  return (p.length > 2 ? p.slice(-2) : p.slice(0, 2)).map((x) => x[0]!.toUpperCase()).join('');
}

/** Dos períodos (AAAA-MM-DD, inclusive) se pisan si comparten al menos un día. Un espacio se vende a uno por vez. */
export function periodosSeSuperponen(
  a: { desde: string; hasta: string },
  b: { desde: string; hasta: string },
): boolean {
  return a.desde <= b.hasta && b.desde <= a.hasta;
}
