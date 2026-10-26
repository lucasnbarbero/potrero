'use client';
// Elegir una contraseña nueva con el link de recuperación (E04-02). Al guardarla se cierran las demás sesiones.
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Campo, MensajeError, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';

export default function Restablecer() {
  const { token } = useParams<{ token: string }>();
  const { enviando, error, campos, enviar } = useEnvio();
  const [invalido, setInvalido] = useState<string | null>(null);
  const [distintas, setDistintas] = useState(false);

  useEffect(() => {
    api<{ estado: string; mensaje: string | null }>('POST', '/auth/recuperar/estado', { token })
      .then((r) => setInvalido(r.mensaje))
      .catch((e: Error) => setInvalido(e.message));
  }, [token]);

  if (invalido)
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tighter">El link no sirve</h1>
        <p className="text-sm text-mute">{invalido}</p>
        <Link href="/recuperar" className="btn-volt btn-lg w-full">
          Pedir un link nuevo
        </Link>
      </div>
    );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (f.get('password') !== f.get('repetir')) return setDistintas(true);
        setDistintas(false);
        enviar(async () => {
          await api('POST', '/auth/restablecer', { token, password: f.get('password') });
          window.location.href = '/panel';
        });
      }}
    >
      <h1 className="text-3xl font-bold tracking-tighter">Elegí tu contraseña nueva</h1>
      <p className="text-sm text-mute">Al guardarla cerramos la sesión en los demás dispositivos.</p>
      <Campo
        etiqueta="Contraseña nueva"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={10}
        required
        ayuda="Al menos 10 caracteres."
        error={campos.password}
      />
      <Campo
        etiqueta="Repetila"
        name="repetir"
        type="password"
        autoComplete="new-password"
        required
        error={distintas ? 'Las contraseñas no coinciden.' : undefined}
      />
      <MensajeError error={error} />
      <button className="btn-volt btn-lg w-full" disabled={enviando}>
        {enviando ? 'Guardando…' : 'Guardar e ingresar'}
      </button>
    </form>
  );
}
