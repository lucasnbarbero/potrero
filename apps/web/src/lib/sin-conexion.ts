// Registro del service worker y preparación para trabajar sin conexión (E11-06).

/** Registra el service worker y le pide que guarde lo que esta pantalla ya cargó. Seguro de llamar varias veces. */
export async function prepararSinConexion() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
    const registro = await navigator.serviceWorker.ready;
    const urls = [
      location.pathname + location.search,
      ...performance.getEntriesByType('resource').map((r) => r.name),
    ].filter((u) => {
      try {
        return new URL(u, location.href).origin === location.origin;
      } catch {
        return false;
      }
    });
    registro.active?.postMessage({ tipo: 'guardar', urls });
  } catch {
    // Sin service worker el acta igual funciona con la cola local; solo no se puede reabrir sin señal.
  }
}

/** Al cerrar sesión se borra lo guardado: en un celular compartido no tiene que quedar el acta de otro usuario. */
export async function limpiarSinConexion() {
  try {
    const registro = await navigator.serviceWorker?.getRegistration();
    registro?.active?.postMessage({ tipo: 'limpiar' });
  } catch {
    // Nada que limpiar.
  }
}
