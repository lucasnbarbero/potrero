import type { MetadataRoute } from 'next';

// App instalable (PWA): el delegado la agrega a la pantalla de inicio y abre el acta como una app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Potrero',
    short_name: 'Potrero',
    description: 'Fixture, actas, cobros y tabla de tu torneo.',
    start_url: '/panel',
    scope: '/',
    display: 'standalone',
    lang: 'es-AR',
    background_color: '#f5f5f0',
    theme_color: '#0a0a0a',
    icons: [
      { src: '/icono-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icono-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icono.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}
