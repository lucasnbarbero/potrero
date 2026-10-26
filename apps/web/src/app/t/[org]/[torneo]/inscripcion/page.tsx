'use client';
import { Icono } from '@potrero/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Campo, MensajeError, useEnvio } from '@/componentes/formulario';
import { MarcoPublico } from '@/componentes/MarcoPublico';
import { api } from '@/lib/cliente';

/** Inscripción desde el link público: el capitán anota su equipo y paga con Mercado Pago. */
export default function Inscripcion() {
  const { org, torneo } = useParams<{ org: string; torneo: string }>();
  const { enviando, error, campos, enviar } = useEnvio();
  // Con la inscripción cerrada o el cupo lleno no se muestra el formulario (F6): el aviso aparece antes de cargar nada.
  const [estado, setEstado] = useState<{ nombre: string; cerrada: boolean; completo: boolean } | null>(null);
  useEffect(() => {
    api<{ torneo: { nombre: string; estado: string; cupo: number; inscriptos: number } }>(
      'GET',
      `/publico/${org}/${torneo}`,
    ).then(
      ({ torneo: t }) =>
        setEstado({
          nombre: t.nombre,
          cerrada: t.estado !== 'INSCRIPCION',
          completo: t.inscriptos >= t.cupo,
        }),
      () => setEstado({ nombre: '', cerrada: false, completo: false }),
    );
  }, [org, torneo]);
  if (!estado)
    return (
      <MarcoPublico liga={{ nombre: 'Inscripción', slug: org }}>
        <p className="tile mx-auto max-w-lg !p-7 text-sm text-mute">Cargando…</p>
      </MarcoPublico>
    );
  if (estado.cerrada || estado.completo)
    return (
      <MarcoPublico liga={{ nombre: 'Inscripción', slug: org }}>
        <div className="tile mx-auto max-w-lg space-y-4 !p-7 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-volt text-xl">
            <Icono nombre="trophy" />
          </span>
          <h1 className="text-3xl font-bold tracking-tighter">
            {estado.cerrada ? 'La inscripción está cerrada' : 'El torneo completó su cupo'}
          </h1>
          <p className="text-sm text-mute">
            {estado.nombre} ya no recibe equipos. Si querés jugar, escribile al organizador de la liga.
          </p>
          <Link href={`/t/${org}/${torneo}`} className="btn-glass w-full">
            Ver el torneo
          </Link>
        </div>
      </MarcoPublico>
    );
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
