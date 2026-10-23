import { redirect } from 'next/navigation';
import { MODO_DEMO } from '@/componentes/BannerDemo';
import { URL_DEMO } from '@/lib/entornos';
import { EntrarDemo } from './EntrarDemo';

export const metadata = { title: 'Probá la demo', robots: { index: false } };

export default function Demo() {
  // En producción no hay demo propia: se manda al entorno de demo.
  if (!MODO_DEMO && URL_DEMO) redirect(`${URL_DEMO}/demo`);
  if (!MODO_DEMO)
    return (
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tighter">La demo no está activa acá</h1>
        <p className="text-mute">
          Este entorno no tiene demo pública. En desarrollo se levanta con <b>pnpm demo --publica</b>.
        </p>
      </div>
    );
  return <EntrarDemo claveCaptcha={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || undefined} />;
}
