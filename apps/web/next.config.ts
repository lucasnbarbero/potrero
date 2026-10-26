import type { NextConfig } from 'next';

const API = process.env.API_URL ?? 'http://localhost:4000';

const config: NextConfig = {
  transpilePackages: ['@potrero/ui'],
  // Habilita forbidden() para mostrar un aviso cuando el rol no tiene acceso a una sección.
  experimental: { authInterrupts: true },
  // La web y la API comparten origen: /api/* se reenvía a la API, así las cookies de sesión son del mismo sitio.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API}/api/:path*` }];
  },
};

export default config;
