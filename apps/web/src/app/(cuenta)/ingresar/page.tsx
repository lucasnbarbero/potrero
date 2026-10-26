'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Campo, MensajeError, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';

function Formulario() {
  const volver = useSearchParams().get('volver') ?? '/panel';
  const { enviando, error, campos, enviar } = useEnvio();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        enviar(async () => {
          await api('POST', '/auth/ingresar', { email: f.get('email'), password: f.get('password') });
          window.location.href = volver.startsWith('/') ? volver : '/panel';
        });
      }}
    >
      <h1 className="text-3xl font-bold tracking-tighter">Ingresá a tu liga</h1>
      <Campo etiqueta="Email" name="email" type="email" autoComplete="email" required error={campos.email} />
      <Campo
        etiqueta="Contraseña"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={campos.password}
      />
      <p className="-mt-2 text-right text-sm">
        <Link href="/recuperar" className="font-semibold text-mute underline hover:text-ink">
          ¿Te olvidaste la contraseña?
        </Link>
      </p>
      <MensajeError error={error} />
      <button className="btn-volt btn-lg w-full" disabled={enviando}>
        {enviando ? 'Ingresando…' : 'Ingresar'}
      </button>
      <p className="text-center text-sm text-mute">
        ¿Todavía no tenés cuenta?{' '}
        <Link href="/registro" className="font-semibold text-ink underline">
          Creá tu liga
        </Link>
      </p>
      {/* Credenciales de la demo local: nunca en producción. */}
      {process.env.NODE_ENV !== 'production' && (
        <p className="rounded-2xl bg-black/5 px-4 py-3 text-xs text-mute">
          Demo: <b className="text-ink">demo@potrero.app</b> · contraseña{' '}
          <b className="text-ink">potrero-demo-2026</b>
        </p>
      )}
    </form>
  );
}

export default function Ingresar() {
  return (
    <Suspense>
      <Formulario />
    </Suspense>
  );
}
