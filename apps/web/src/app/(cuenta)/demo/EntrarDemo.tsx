'use client';
import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { MensajeError, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';

type Turnstile = {
  render: (el: HTMLElement, o: { sitekey: string; callback: (t: string) => void }) => void;
};

/** Crea la sandbox del visitante y lo lleva a su panel. Con captcha (Cloudflare Turnstile) si hay clave configurada. */
export function EntrarDemo({ claveCaptcha }: { claveCaptcha?: string }) {
  const { enviando, error, enviar } = useEnvio();
  const [captcha, setCaptcha] = useState<string>();
  const [scriptListo, setScriptListo] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!claveCaptcha || !scriptListo || !contenedor.current) return;
    (window as unknown as { turnstile: Turnstile }).turnstile.render(contenedor.current, {
      sitekey: claveCaptcha,
      callback: setCaptcha,
    });
  }, [claveCaptcha, scriptListo]);

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tighter">Probá Potrero</h1>
      <p className="text-mute">
        Te armamos una liga de ejemplo con equipos, fixture, partidos jugados y cobros. Tocá, cargá un acta,
        mirá la tabla. Es tuya por 24 horas y después se borra sola.
      </p>
      {claveCaptcha && (
        <>
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
            onLoad={() => setScriptListo(true)}
          />
          <div ref={contenedor} />
        </>
      )}
      <MensajeError error={error} />
      <button
        className="btn-volt btn-lg w-full"
        disabled={enviando || (!!claveCaptcha && !captcha)}
        onClick={() =>
          enviar(async () => {
            await api('POST', '/demo/sandbox', { captcha });
            window.location.href = '/panel';
          })
        }
      >
        {enviando ? 'Armando tu demo…' : 'Entrar a la demo'}
      </button>
      <p className="text-center text-xs text-mute">Sin registro. Los pagos son de prueba.</p>
    </div>
  );
}
