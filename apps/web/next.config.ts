import type { NextConfig } from 'next';

const API = process.env.API_URL ?? 'http://localhost:4000';

const config: NextConfig = {
  transpilePackages: ['@potrero/ui'],
  // La web y la API comparten origen: /api/* se reenvía a la API, así las cookies de sesión son del mismo sitio.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API}/api/:path*` }];
  },
};

export default config;
