import { Icono } from '@potrero/ui';
import { Encabezado, Vacio } from '@/componentes/ui';
import { apiServidor } from '@/lib/api';
import type { Sede } from '@/lib/tipos';
import { NuevaCancha } from '../equipos/formularios';

export const metadata = { title: 'Canchas' };

export default async function Canchas() {
  const sedes = await apiServidor<Sede[]>('/canchas');
  return (
    <div className="space-y-6">
      <Encabezado eyebrow="Operación" titulo="Canchas" />
      <div className="tile">
        <NuevaCancha />
      </div>
      {sedes.length === 0 ? (
        <Vacio
          titulo="Sin canchas"
          texto="El fixture automático reparte los partidos entre las canchas que cargues acá."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {sedes.map((s) => (
            <section key={s.id} className="tile">
              <b className="flex items-center gap-2 text-lg">
                <Icono nombre="pin" />
                {s.nombre}
              </b>
              {s.direccion && <p className="text-sm text-mute">{s.direccion}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {s.canchas.map((c) => (
                  <span key={c.id} className="pill-ink">
                    {c.nombre}
                  </span>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <p className="text-xs text-mute">
        Disponibilidad por franja, árbitros y ocupación: próximamente (backlog E08).
      </p>
    </div>
  );
}
