'use client';
// Recuperar la contraseña (E04-02): pide el email y manda un link de un solo uso que vence en una hora.
import { VIGENCIA_LINK_MIN } from '@potrero/shared';
import Link from 'next/link';
import { useState } from 'react';
import { Campo, MensajeError, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';
import { LinkDeDesarrollo } from '../LinkDeDesarrollo';

export default function Recuperar() {
  const { enviando, error, campos, enviar } = useEnvio();
  const [enviado, setEnviado] = useState<{ email: string; linkDev?: string } | null>(null);

  if (enviado)
    return (
      <div className="space-y-4" data-testid="recuperar-enviado">
        <h1 className="text-3xl font-bold tracking-tighter">Revisá tu email</h1>
        <p className="text-sm text-mute">
          Si <b className="text-ink">{enviado.email}</b> tiene una cuenta en Potrero, te mandamos un link para
          elegir una contraseña nueva. Vale una sola vez y vence en {VIGENCIA_LINK_MIN.RECUPERAR} minutos.
        </p>
        {enviado.linkDev && <LinkDeDesarrollo href={enviado.linkDev} texto="Elegir contraseña nueva" />}
        <p className="text-center text-sm text-mute">
          <Link href="/ingresar" className="font-semibold text-ink underline">
            Volver a ingresar
          </Link>
        </p>
      </div>
    );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const email = String(new FormData(e.currentTarget).get('email') ?? '');
        enviar(async () => {
          const r = await api<{ linkDev?: string }>('POST', '/auth/recuperar', { email });
          setEnviado({ email, linkDev: r.linkDev });
        });
      }}
    >
      <h1 className="text-3xl font-bold tracking-tighter">Recuperá tu contraseña</h1>
      <p className="text-sm text-mute">Te mandamos un link a tu email para que elijas una nueva.</p>
      <Campo etiqueta="Email" name="email" type="email" autoComplete="email" required error={campos.email} />
      <MensajeError error={error} />
      <button className="btn-volt btn-lg w-full" disabled={enviando}>
        {enviando ? 'Enviando…' : 'Mandarme el link'}
      </button>
      <p className="text-center text-sm text-mute">
        ¿Te acordaste?{' '}
        <Link href="/ingresar" className="font-semibold text-ink underline">
          Ingresá
        </Link>
      </p>
    </form>
  );
}
