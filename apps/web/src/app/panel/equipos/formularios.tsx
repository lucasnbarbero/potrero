'use client';
import { Icono } from '@potrero/ui';
import { useRouter } from 'next/navigation';
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
    <FormularioRapido ruta="/equipos" boton="Crear equipo">
      <Campo etiqueta="Nombre del equipo" name="nombre" required />
      <Campo etiqueta="Capitán" name="capitanNombre" />
      <Campo etiqueta="Teléfono del capitán" name="capitanTelefono" />
    </FormularioRapido>
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
    <FormularioRapido ruta="/canchas" boton="Agregar cancha">
      <Campo etiqueta="Sede o complejo" name="sede" required placeholder="Complejo El Potrero" />
      <Campo etiqueta="Cancha" name="nombre" required placeholder="Cancha 1" />
      <Campo etiqueta="Dirección" name="direccion" />
    </FormularioRapido>
  );
}
