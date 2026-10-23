'use client';
import { formatearDisponibilidad, parsearDisponibilidad } from '@potrero/shared';
import { Icono } from '@potrero/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Campo, MensajeError, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';
import { pesos } from '@/lib/formato';
import type { Arbitro } from '@/lib/tipos';

const iniciales = (a: Arbitro) => `${a.nombre[0] ?? ''}${a.apellido[0] ?? ''}`.toUpperCase();

/** Un árbitro con su carga, su tarifa y lo que cobró; se puede editar la tarifa y la disponibilidad o darlo de baja. */
export function FilaArbitro({ a, partidosDelDia }: { a: Arbitro; partidosDelDia: number }) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const [editando, setEditando] = useState(false);
  return (
    <li
      className={`list-row flex-wrap text-sm ${a.activo ? '' : 'opacity-50'}`}
      data-testid={`arbitro-${a.apellido}`}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-volt">
        {iniciales(a)}
      </span>
      <span className="min-w-0 flex-1">
        <b className="block truncate">
          {a.nombre} {a.apellido}
          {!a.activo && <span className="ml-2 text-xs font-normal text-mute">(inactivo)</span>}
        </b>
        <span className="text-xs text-mute">
          {partidosDelDia} {partidosDelDia === 1 ? 'partido' : 'partidos'} hoy · {pesos(a.tarifa)} c/u
          {a.disponibilidad.length > 0
            ? ` · ${formatearDisponibilidad(a.disponibilidad)}`
            : ' · disponible siempre'}
        </span>
        <span className="block text-xs text-mute">
          Dirigió {a.dirigidos} · cobró {pesos(a.pagado)}
        </span>
      </span>
      {a.valoracion !== null && (
        <span className="pill" title="Valoración">
          <Icono nombre="star" /> {a.valoracion.toFixed(1).replace('.', ',')}
        </span>
      )}
      <button
        className="text-xs font-semibold text-mute underline hover:text-ink"
        onClick={() => setEditando((v) => !v)}
      >
        {editando ? 'Cerrar' : 'Editar'}
      </button>
      {editando && (
        <form
          className="mt-2 grid w-full gap-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            // Si el texto de disponibilidad no se entiende, el error dice cuál franja y `useEnvio` lo muestra.
            enviar(async () => {
              await api('PATCH', `/arbitros/${a.id}`, {
                tarifa: Number(f.get('tarifa')),
                disponibilidad: parsearDisponibilidad((f.get('disponibilidad') as string) ?? ''),
                activo: f.get('activo') === 'on',
              });
              setEditando(false);
              router.refresh();
            });
          }}
        >
          <Campo
            etiqueta="Tarifa por partido ($)"
            name="tarifa"
            type="number"
            min={0}
            defaultValue={a.tarifa}
          />
          <Campo
            etiqueta="Disponibilidad"
            name="disponibilidad"
            defaultValue={formatearDisponibilidad(a.disponibilidad)}
            placeholder="sáb 14:00-22:00, dom 10:00-14:00"
            ayuda="Vacío = siempre. Día, hora de inicio y de fin."
          />
          <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
            <input type="checkbox" name="activo" defaultChecked={a.activo} className="size-4" />
            Activo (si no, no se lo designa)
          </label>
          <div className="sm:col-span-2">
            <MensajeError error={error} />
          </div>
          <button className="btn btn-sm sm:col-span-2" disabled={enviando}>
            Guardar
          </button>
        </form>
      )}
    </li>
  );
}

export function FormularioArbitro() {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        enviar(async () => {
          await api('POST', '/arbitros', {
            nombre: f.get('nombre'),
            apellido: f.get('apellido'),
            tarifa: Number(f.get('tarifa') || 0),
            ...(f.get('telefono') ? { telefono: f.get('telefono') } : {}),
            disponibilidad: parsearDisponibilidad((f.get('disponibilidad') as string) ?? ''),
          });
          form.reset();
          router.refresh();
        });
      }}
    >
      <span className="eyebrow sm:col-span-2">Nuevo árbitro</span>
      <Campo etiqueta="Nombre" name="nombre" required />
      <Campo etiqueta="Apellido" name="apellido" required />
      <Campo etiqueta="Tarifa por partido ($)" name="tarifa" type="number" min={0} />
      <Campo etiqueta="Teléfono" name="telefono" />
      <div className="sm:col-span-2">
        <Campo
          etiqueta="Disponibilidad (opcional)"
          name="disponibilidad"
          placeholder="sáb 14:00-22:00, dom 10:00-14:00"
          ayuda="Vacío = disponible siempre."
        />
      </div>
      <div className="sm:col-span-2">
        <MensajeError error={error} />
      </div>
      <button className="btn sm:col-span-2" disabled={enviando}>
        <Icono nombre="plus" />
        Agregar árbitro
      </button>
    </form>
  );
}
