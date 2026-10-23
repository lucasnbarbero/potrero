// Direcciones de los dos entornos (ADR-019). La landing vive en producción y manda a la demo por acá.
// Vacías = mismo origen, que es lo que pasa en desarrollo local.
export const URL_DEMO = process.env.NEXT_PUBLIC_DEMO_URL ?? '';
export const URL_APP = process.env.NEXT_PUBLIC_APP_URL ?? '';

export const enlaceDemo = `${URL_DEMO}/demo`;
export const enlaceCrearLiga = `${URL_APP}/registro`;
