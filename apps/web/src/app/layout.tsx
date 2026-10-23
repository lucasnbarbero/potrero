import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import { BannerDemo, MODO_DEMO } from '@/componentes/BannerDemo';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });

export const metadata: Metadata = {
  title: { default: 'Potrero · Tu torneo, sin planillas ni grupos de WhatsApp', template: '%s · Potrero' },
  description: 'Cobros, fixture, actas, sanciones y avisos en un solo lugar. Un producto de Gregal Tech.',
  applicationName: 'Potrero',
  // La demo pública no tiene que aparecer en buscadores como si fuera una liga real.
  ...(MODO_DEMO && { robots: { index: false, follow: false } }),
};

export const viewport: Viewport = { themeColor: '#0a0a0a' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={geist.variable}>
      <body>
        <BannerDemo />
        {children}
      </body>
    </html>
  );
}
