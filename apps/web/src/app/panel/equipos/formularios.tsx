'use client';
import { Icono } from '@potrero/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Campo, MensajeError, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';

/** Formulario genérico en línea: envía los campos a la ruta y refresca la página. */
function FormularioRapido({
  ruta,
  boton,
  children,
  transformar,
}: {
  ruta: string;
  boton: string;
  children: React.ReactNode;
  transformar?: (d: Record<string, FormDataEntryValue>) => unknown;
}) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  return (
    <form
      className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const d = Object.fromEntries(new FormData(form));
        enviar(async () => {
          await api('POST', ruta, transformar ? transformar(d) : d);
          form.reset();
          router.refresh();
        });
      }}
    >
      {children}
      <button className="btn" disabled={enviando}>
        <Icono nombre="plus" />
        {boton}
      </button>
      <div className="sm:col-span-full">
        <MensajeError error={error} />
      </div>
    </form>
  );
}

export function NuevoEquipo() {
  return (
    <FormularioRapido
      ruta="/equipos"
      boton="Crear equipo"
      transformar={(d) => ({
        nombre: d.nombre,
        capitanNombre: d.capitanNombre || undefined,
        capitanTelefono: d.capitanTelefono || undefined,
        capitanEmail: d.capitanEmail || undefined,
        capitanOptInWhatsapp: d.capitanOptInWhatsapp === 'on',
      })}
    >
      <Campo etiqueta="Nombre del equipo" name="nombre" required />
      <Campo etiqueta="Capitán" name="capitanNombre" />
      <Campo etiqueta="Teléfono del capitán" name="capitanTelefono" />
      <Campo etiqueta="Email del capitán" name="capitanEmail" type="email" />
      <label className="flex items-center gap-2 pb-3 text-sm font-semibold">
        <input type="checkbox" name="capitanOptInWhatsapp" className="size-4" />
        Acepta recibir WhatsApp
      </label>
    </FormularioRapido>
  );
}

/** Datos de contacto del capitán y sus consentimientos: de acá sale por qué canal le llegan los avisos. */
export function ContactoCapitan({
  equipoId,
  inicial,
}: {
  equipoId: string;
  inicial: {
    capitanNombre: string | null;
    capitanEmail: string | null;
    capitanTelefono: string | null;
    capitanOptInWhatsapp: boolean;
    capitanBajaMarketing: boolean;
  };
}) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const [guardado, setGuardado] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        enviar(async () => {
          await api('PATCH', `/equipos/${equipoId}/contacto`, {
            capitanNombre: (f.get('capitanNombre') as string) || undefined,
            capitanEmail: (f.get('capitanEmail') as string) || '',
            capitanTelefono: (f.get('capitanTelefono') as string) || undefined,
            capitanOptInWhatsapp: f.get('capitanOptInWhatsapp') === 'on',
            capitanBajaMarketing: f.get('capitanBajaMarketing') === 'on',
          });
          setGuardado(true);
          router.refresh();
        });
      }}
    >
      <span className="eyebrow">Contacto del capitán</span>
      <Campo etiqueta="Nombre" name="capitanNombre" defaultValue={inicial.capitanNombre ?? ''} />
      <Campo etiqueta="Email" name="capitanEmail" type="email" defaultValue={inicial.capitanEmail ?? ''} />
      <Campo
        etiqueta="Teléfono (WhatsApp)"
        name="capitanTelefono"
        defaultValue={inicial.capitanTelefono ?? ''}
      />
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          name="capitanOptInWhatsapp"
          defaultChecked={inicial.capitanOptInWhatsapp}
          className="size-4"
        />
        Acepta recibir WhatsApp
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          name="capitanBajaMarketing"
          defaultChecked={inicial.capitanBajaMarketing}
          className="size-4"
        />
        No quiere recibir novedades
      </label>
      <p className="text-xs text-mute">
        Sin consentimiento de WhatsApp, los avisos le llegan por email. Los avisos de cobro y de partidos
        siempre le llegan, aunque no quiera novedades.
      </p>
      <MensajeError error={error} />
      {guardado && !error && <p className="text-xs font-semibold text-ink">Guardado.</p>}
      <button className="btn btn-sm" disabled={enviando}>
        Guardar contacto
      </button>
    </form>
  );
}

export function NuevoJugador({ equipoId }: { equipoId: string }) {
  return (
    <FormularioRapido
      ruta={`/equipos/${equipoId}/jugadores`}
      boton="Agregar jugador"
      transformar={(d) => ({
        nombre: d.nombre,
        apellido: d.apellido,
        numero: d.numero ? Number(d.numero) : undefined,
      })}
    >
      <Campo etiqueta="Nombre" name="nombre" required />
      <Campo etiqueta="Apellido" name="apellido" required />
      <Campo etiqueta="Número" name="numero" type="number" min={0} max={99} />
    </FormularioRapido>
  );
}

export function NuevaCancha() {
  return (
    <FormularioRapido
      ruta="/canchas"
      boton="Agregar cancha"
      transformar={(d) => ({
        sede: d.sede,
        nombre: d.nombre,
        direccion: d.direccion || undefined,
        superficie: d.superficie || undefined,
        costoPorPartido: d.costoPorPartido ? Number(d.costoPorPartido) : undefined,
      })}
    >
      <Campo etiqueta="Sede o complejo" name="sede" required placeholder="Complejo El Potrero" />
      <Campo etiqueta="Cancha" name="nombre" required placeholder="Cancha 1" />
      <Campo etiqueta="Dirección" name="direccion" />
      <Campo etiqueta="Superficie" name="superficie" placeholder="césped, sintético…" />
      <Campo etiqueta="Costo por partido ($)" name="costoPorPartido" type="number" min={0} />
    </FormularioRapido>
  );
}
