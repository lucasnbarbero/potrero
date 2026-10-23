'use client';
import { Icono } from '@potrero/ui';
import { useParams } from 'next/navigation';
import { Campo, MensajeError, useEnvio } from '@/componentes/formulario';
import { MarcoPublico } from '@/componentes/MarcoPublico';
import { api } from '@/lib/cliente';

/** Inscripción desde el link público: el capitán anota su equipo y paga con Mercado Pago. */
export default function Inscripcion() {
  const { org, torneo } = useParams<{ org: string; torneo: string }>();
  const { enviando, error, campos, enviar } = useEnvio();
  return (
    <MarcoPublico liga={{ nombre: 'Inscripción', slug: org }}>
      <form
        className="tile mx-auto max-w-lg space-y-4 !p-7"
        onSubmit={(e) => {
          e.preventDefault();
          const d = Object.fromEntries(new FormData(e.currentTarget));
          enviar(async () => {
            const r = await api<{ urlPago: string | null }>(
              'POST',
              `/publico/${org}/${torneo}/inscripcion`,
              d,
            );
            window.location.href = r.urlPago ?? `/t/${org}/${torneo}`;
          });
        }}
      >
        <h1 className="text-3xl font-bold tracking-tighter">Inscribí tu equipo</h1>
        <p className="text-sm text-mute">
          Completá los datos y pagá la inscripción online. El lugar queda confirmado cuando se acredita el
          pago.
        </p>
        <Campo etiqueta="Nombre del equipo" name="equipo" required error={campos.equipo} />
        <Campo
          etiqueta="Nombre del capitán"
          name="capitanNombre"
          required
          autoComplete="name"
          error={campos.capitanNombre}
        />
        <Campo
          etiqueta="Email"
          name="capitanEmail"
          type="email"
          required
          autoComplete="email"
          error={campos.capitanEmail}
        />
        <Campo
          etiqueta="WhatsApp"
          name="capitanTelefono"
          type="tel"
          required
          autoComplete="tel"
          error={campos.capitanTelefono}
        />
        <MensajeError error={error} />
        <button className="btn-volt btn-lg w-full" disabled={enviando}>
          <Icono nombre="wallet" />
          {enviando ? 'Generando el pago…' : 'Continuar al pago'}
        </button>
        <p className="text-center text-xs text-mute">
          Tus datos de contacto solo los ve el organizador. Nunca se publican.
        </p>
      </form>
    </MarcoPublico>
  );
}
