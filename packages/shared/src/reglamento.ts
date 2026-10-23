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
};
