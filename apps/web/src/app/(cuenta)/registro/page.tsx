'use client';
import Link from 'next/link';
import { Campo, MensajeError, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';

export default function Registro() {
  const { enviando, error, campos, enviar } = useEnvio();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.currentTarget));
        enviar(async () => {
          await api('POST', '/auth/registro', f);
          window.location.href = '/panel';
        });
      }}
    >
      <h1 className="text-3xl font-bold tracking-tighter">Creá tu liga</h1>
      <p className="text-sm text-mute">
        Sin costo fijo: pagás un porcentaje solo de lo que cobrás por la plataforma.
      </p>
      <Campo
        etiqueta="Nombre de la liga"
        name="organizacion"
        required
        placeholder="Liga Barrial Sur"
        error={campos.organizacion}
      />
      <Campo etiqueta="Tu nombre" name="nombre" required autoComplete="name" error={campos.nombre} />
      <Campo etiqueta="Email" name="email" type="email" required autoComplete="email" error={campos.email} />
      <Campo
        etiqueta="Contraseña"
        name="password"
        type="password"
        required
        minLength={10}
        autoComplete="new-password"
        ayuda="Al menos 10 caracteres."
        error={campos.password}
      />
      <MensajeError error={error} />
      <button className="btn-volt btn-lg w-full" disabled={enviando}>
        {enviando ? 'Creando…' : 'Crear mi liga'}
      </button>
      <p className="text-center text-sm text-mute">
        ¿Ya tenés cuenta?{' '}
        <Link href="/ingresar" className="font-semibold text-ink underline">
          Ingresá
        </Link>
      </p>
    </form>
  );
}
