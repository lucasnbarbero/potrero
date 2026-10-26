'use client';
import { DATOS, type FormatoFlexible, type Modalidad } from '@potrero/shared';
import { Icono } from '@potrero/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Campo, MensajeError, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';

const MODALIDADES: [Modalidad, string][] = [
  ['F5', 'Fútbol 5'],
  ['F7', 'Fútbol 7'],
  ['F8', 'Fútbol 8'],
  ['F11', 'Fútbol 11'],
];

/**
 * "Crear torneo con este formato" (E10-07): con el formato del simulador, un formulario corto crea el torneo por fases.
 * El servidor vuelve a validar el formato; si tiene errores no se crea.
 */
export function CrearConFormato({
  formato,
  equipos,
  inscripcion,
  cuotaPorFecha,
  conErrores,
}: {
  formato: FormatoFlexible;
  equipos: number;
  inscripcion: number;
  cuotaPorFecha: number;
  conErrores: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [modalidad, setModalidad] = useState<Modalidad>('F5');
  const { enviando, error, campos, enviar } = useEnvio();

  if (!abierto)
    return (
      <div className="tile-volt rise flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <b className="text-lg">¿Te cierra?</b>
          <p className="text-sm text-ink/70">
            Creá el torneo con este formato: inscribís los equipos y después generás cada fase cuando se
            define.
          </p>
        </div>
        <button
          type="button"
          className="btn bg-ink text-white hover:bg-ink/85 disabled:opacity-40"
          disabled={conErrores || equipos < 2}
          title={conErrores ? 'Corregí los errores del formato primero.' : undefined}
          onClick={() => setAbierto(true)}
        >
          <Icono nombre="plus" />
          Crear torneo con este formato
        </button>
      </div>
    );

  return (
    <form
      aria-label="Crear torneo con este formato"
      className="tile rise space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void enviar(async () => {
          const t = await api<{ id: string }>('POST', '/torneos/flexible', {
            nombre: f.get('nombre'),
            modalidad,
            cupo: Number(f.get('cupo')),
            inscripcion: Number(f.get('inscripcion')),
            cobrosPorFecha: { cuotaPorFecha: Number(f.get('cuotaPorFecha')) },
            formato,
          });
          router.push(`/panel/torneos/${t.id}`);
        });
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="text-lg">Crear torneo con este formato</b>
        <span className="pill-ink">{formato.fases.length} fases</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Campo etiqueta="Nombre" name="nombre" required placeholder="Apertura 2027" error={campos.nombre} />
        </div>
        <div className="sm:col-span-2">
          <span className="field-label">Modalidad</span>
          <div className="seg flex-wrap">
            {MODALIDADES.map(([m, t]) => (
              <button
                type="button"
                key={m}
                className={modalidad === m ? 'on' : ''}
                onClick={() => setModalidad(m)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <Campo
          etiqueta="Cupo de equipos"
          name="cupo"
          type="number"
          min={2}
          max={128}
          defaultValue={equipos}
          required
          ayuda="Con los equipos de la simulación."
        />
        <Campo
          etiqueta="Inscripción por equipo ($)"
          name="inscripcion"
          type="number"
          min={0}
          step={1000}
          defaultValue={inscripcion}
          required
        />
        <Campo
          etiqueta="Cuota por fecha ($)"
          name="cuotaPorFecha"
          type="number"
          min={0}
          step={500}
          defaultValue={cuotaPorFecha || DATOS.cobrosPorFechaPorDefecto.cuotaPorFecha}
          ayuda="Lo que paga cada equipo por partido jugado. 0 = no se cobra."
        />
      </div>
      <MensajeError error={error} />
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn-glass" onClick={() => setAbierto(false)}>
          Cancelar
        </button>
        <button type="submit" className="btn-volt" disabled={enviando}>
          {enviando ? 'Creando…' : 'Crear torneo'}
        </button>
      </div>
    </form>
  );
}
