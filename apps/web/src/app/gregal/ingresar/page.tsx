'use client';
import { Icono } from '@potrero/ui';
import Link from 'next/link';
import { useState } from 'react';
import { Campo, MensajeError } from '@/componentes/formulario';
import '../gregal.css';

/** Ingreso del equipo de Gregal (E36-01): login propio, separado del de las ligas. */
export default function IngresarGregal() {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="gregal mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <img src="/gregal-claro.svg" alt="Gregal Tech" className="mx-auto h-9 w-auto" />
      <form
        className="tile rise mt-8 space-y-4 !p-7"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setEnviando(true);
          setError(null);
          // Fetch directo: el cliente de la API del panel renueva la sesión de organizador y manda a /ingresar.
          const r = await fetch('/api/gregal/sesion/ingresar', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: f.get('email'), password: f.get('password') }),
          }).catch(() => null);
          if (r?.ok) {
            window.location.href = '/gregal';
            return;
          }
          const datos = await r?.json().catch(() => null);
          setError(datos?.mensaje ?? 'No pudimos conectar. Probá de nuevo.');
          setEnviando(false);
        }}
      >
        <span className="pill-gregal">
          <Icono nombre="lock" />
          Uso interno
        </span>
        <h1 className="text-3xl font-bold tracking-tighter">Backoffice de Potrero</h1>
        <p className="-mt-2 text-sm text-mute">
          Solo para el equipo de Gregal Tech. Cada acceso queda auditado.
        </p>
        <Campo etiqueta="Email" name="email" type="email" autoComplete="email" required />
        <Campo
          etiqueta="Contraseña"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <MensajeError error={error} />
        <button className="bg-gregal btn btn-lg w-full !text-[#0a0f0d]" disabled={enviando}>
          {enviando ? 'Ingresando…' : 'Ingresar'}
        </button>
        {process.env.NODE_ENV !== 'production' && (
          <p className="rounded-2xl bg-black/5 px-4 py-3 text-xs text-mute">
            Demo: <b className="text-ink">staff@gregal.tech</b> · contraseña{' '}
            <b className="text-ink">potrero-demo-2026</b>
          </p>
        )}
      </form>
      <Link
        href="/ingresar"
        className="mx-auto mt-6 text-sm font-semibold text-mute underline hover:text-ink"
      >
        ¿Organizás una liga? Ingresá acá
      </Link>
    </main>
  );
}
