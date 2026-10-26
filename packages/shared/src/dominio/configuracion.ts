// Asistente de configuración inicial (E25-01): cinco pasos para dejar una liga nueva andando.
// Un paso está completo si el organizador lo confirmó o si la liga ya tiene lo que el paso pide
// (por ejemplo, equipos cargados o la cuenta de Mercado Pago conectada).

export const PASOS_CONFIGURACION = [
  'organizacion',
  'mercadoPago',
  'marca',
  'reglamento',
  'importacion',
] as const;
export type PasoConfiguracion = (typeof PASOS_CONFIGURACION)[number];

export const TITULO_PASO: Record<PasoConfiguracion, string> = {
  organizacion: 'Tu organización',
  mercadoPago: 'Cobros con Mercado Pago',
  marca: 'Personalizá tu marca',
  reglamento: 'Reglamento base',
  importacion: 'Importá tu Excel',
};

/** Lo que se guarda en la organización: cuándo confirmó cada paso. */
export type PasosConfirmados = Partial<Record<PasoConfiguracion, string>>;

export interface EstadoLiga {
  confirmados: PasosConfirmados;
  mpConectado: boolean;
  tieneMarca: boolean;
  equipos: number;
  torneos: number;
}

export interface ProgresoConfiguracion {
  completos: Record<PasoConfiguracion, boolean>;
  cantidad: number;
  total: number;
  porcentaje: number;
  /** El primer paso sin completar; null si terminó. */
  siguiente: PasoConfiguracion | null;
}

export function progresoConfiguracion(e: EstadoLiga): ProgresoConfiguracion {
  const completos: Record<PasoConfiguracion, boolean> = {
    organizacion: !!e.confirmados.organizacion,
    mercadoPago: !!e.confirmados.mercadoPago || e.mpConectado,
    marca: !!e.confirmados.marca || e.tieneMarca,
    reglamento: !!e.confirmados.reglamento || e.torneos > 0,
    importacion: !!e.confirmados.importacion || e.equipos > 0,
  };
  const cantidad = PASOS_CONFIGURACION.filter((p) => completos[p]).length;
  const total = PASOS_CONFIGURACION.length;
  return {
    completos,
    cantidad,
    total,
    porcentaje: Math.round((cantidad / total) * 100),
    siguiente: PASOS_CONFIGURACION.find((p) => !completos[p]) ?? null,
  };
}

/** Dirección del sitio público: minúsculas, números y guiones, sin guiones en los bordes. */
export const slugValido = (s: string) =>
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length >= 3 && s.length <= 40;

/** Colores de marca que ofrece el asistente (los del mock). Se acepta cualquier #RRGGBB. */
export const COLORES_MARCA = ['#d6ff3d', '#38bdf8', '#f43f5e', '#8b5cf6', '#f97316'] as const;
