import { DATOS } from './datos.js';
import type { Reglamento } from './dominio/tipos.js';

/** Reglamento por defecto (docs/datos.json). Cada torneo guarda su propia versión. */
export const REGLAMENTO_POR_DEFECTO: Reglamento = {
  puntosVictoria: DATOS.reglamentoPorDefecto.puntosVictoria,
  puntosEmpate: DATOS.reglamentoPorDefecto.puntosEmpate,
  puntosDerrota: DATOS.reglamentoPorDefecto.puntosDerrota,
  desempates: DATOS.reglamentoPorDefecto.desempates,
  suspensionRojaDirecta: DATOS.reglamentoPorDefecto.suspensionRojaDirecta,
  suspensionDobleAmarilla: DATOS.reglamentoPorDefecto.suspensionDobleAmarilla,
  umbralAmarillas: DATOS.reglamentoPorDefecto.umbralAmarillas,
  suspensionAcumulacion: DATOS.reglamentoPorDefecto.suspensionAcumulacion,
  golesWO: DATOS.reglamentoPorDefecto.golesWO,
  levantarSancionPagando: DATOS.reglamentoPorDefecto.levantarSancionPagando,
  levantarSancionTipos: [...DATOS.reglamentoPorDefecto.levantarSancionTipos],
  // Sin monto no hay nada que cobrar: el organizador lo fija al encender la opción en el torneo.
  levantarSancionMonto: DATOS.reglamentoPorDefecto.levantarSancionMonto,
  toleranciaWOMinutos: DATOS.reglamentoPorDefecto.toleranciaWOMinutos,
};
