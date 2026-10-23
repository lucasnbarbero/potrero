import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });

export const metadata: Metadata = {
  title: { default: 'Potrero · Tu torneo, sin planillas ni grupos de WhatsApp', template: '%s · Potrero' },
  description: 'Cobros, fixture, actas, sanciones y avisos en un solo lugar. Un producto de Gregal Tech.',
  applicationName: 'Potrero',
};

export const viewport: Viewport = { themeColor: '#0a0a0a' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={geist.variable}>
      <body>{children}</body>
    </html>
  );
}
