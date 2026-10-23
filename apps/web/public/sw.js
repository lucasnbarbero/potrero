// Service worker de Potrero (E11-06, E11-12): deja disponible el acta sin conexión.
// Cachea lo mínimo: la pantalla del acta y los archivos de la app. Nunca guarda datos de la API: las escrituras viajan
// por la cola del dispositivo y la última foto del acta la guarda la propia app (IndexedDB). Si el worker devolviera una
// lectura vieja de la API, la pantalla creería que hay conexión. Estrategia: red primero, y si no hay red, lo guardado.
const CACHE = 'potrero-acta-v2';

const esActa = (url) => /^\/panel\/partidos\/[^/]+\/?$/.test(url.pathname);
const esArchivoDeLaApp = (url) => url.pathname.startsWith('/_next/static/') || url.pathname === '/icono.svg';
const seGuarda = (url) => url.origin === self.location.origin && (esActa(url) || esArchivoDeLaApp(url));

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      for (const clave of await caches.keys()) if (clave !== CACHE) await caches.delete(clave);
      await self.clients.claim();
    })(),
  );
});

// La pantalla le pide al worker que guarde los archivos que ya cargó, así alcanza con abrir el acta una vez con señal.
self.addEventListener('message', (evento) => {
  const { tipo, urls } = evento.data ?? {};
  if (tipo === 'guardar') evento.waitUntil(guardar(urls ?? []));
  if (tipo === 'limpiar') evento.waitUntil(caches.delete(CACHE));
});

async function guardar(urls) {
  const cache = await caches.open(CACHE);
  await Promise.all(
    urls.map(async (u) => {
      try {
        const url = new URL(u, self.location.href);
        if (!seGuarda(url)) return;
        const respuesta = await fetch(url, { credentials: 'same-origin' });
        if (respuesta.ok) await cache.put(url.pathname + url.search, respuesta);
      } catch {
        // Sin red: se guardará la próxima vez.
      }
    }),
  );
}

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;
  const url = new URL(pedido.url);
  if (!seGuarda(url)) return;
  evento.respondWith(redPrimero(pedido, url));
});

async function redPrimero(pedido, url) {
  const cache = await caches.open(CACHE);
  const clave = url.pathname + url.search;
  try {
    const respuesta = await fetch(pedido);
    if (respuesta.ok && respuesta.type === 'basic') await cache.put(clave, respuesta.clone());
    return respuesta;
  } catch (error) {
    const guardada = await cache.match(clave);
    if (guardada) return guardada;
    // Una navegación del acta sin la versión exacta guardada: sirve la última guardada de cualquier acta.
    if (pedido.mode === 'navigate' && esActa(url)) {
      for (const llave of await cache.keys()) {
        if (esActa(new URL(llave.url))) return cache.match(llave);
      }
    }
    throw error;
  }
}
