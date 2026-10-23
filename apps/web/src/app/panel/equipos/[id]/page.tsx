import Link from 'next/link';
import { Encabezado, Escudo, Estado } from '@/componentes/ui';
import { apiServidor } from '@/lib/api';
import { NuevoJugador } from '../formularios';

interface DetalleEquipo {
  id: string;
  nombre: string;
  capitanNombre: string | null;
  capitanTelefono: string | null;
  plantel: { id: string; numero: number | null; jugador: { id: string; nombre: string; apellido: string } }[];
  inscripciones: { id: string; estado: string; torneo: { id: string; nombre: string } }[];
}

export default async function Equipo({ params }: PageProps<'/panel/equipos/[id]'>) {
  const { id } = await params;
  const e = await apiServidor<DetalleEquipo>(`/equipos/${id}`);
  return (
    <div className="space-y-6">
      <Encabezado eyebrow="Equipo" titulo={e.nombre} />
      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <section className="tile">
          <span className="eyebrow">Plantel</span>
          <ul className="mt-2">
            {e.plantel.map((p) => (
              <li key={p.id} className="list-row text-sm">
                <span className="grid size-8 place-items-center rounded-full bg-ink text-xs font-bold text-volt">
                  {p.numero ?? '–'}
                </span>
                <b>
                  {p.jugador.nombre} {p.jugador.apellido}
                </b>
              </li>
            ))}
            {e.plantel.length === 0 && <li className="py-3 text-sm text-mute">Sin jugadores todavía.</li>}
          </ul>
          <div className="mt-4 border-t border-black/5 pt-4">
            <NuevoJugador equipoId={e.id} />
          </div>
        </section>
        <aside className="space-y-4">
          <div className="tile flex items-center gap-3">
            <Escudo nombre={e.nombre} />
            <div className="text-sm">
              <b className="block">{e.capitanNombre ?? 'Sin capitán'}</b>
              <span className="text-mute">{e.capitanTelefono ?? ''}</span>
            </div>
          </div>
          <div className="tile">
            <span className="eyebrow">Torneos</span>
            <ul className="mt-2">
              {e.inscripciones.map((i) => (
                <li key={i.id} className="list-row text-sm">
                  <Link
                    href={`/panel/torneos/${i.torneo.id}`}
                    className="flex-1 font-semibold hover:underline"
                  >
                    {i.torneo.nombre}
                  </Link>
                  <Estado estado={i.estado} />
                </li>
              ))}
              {e.inscripciones.length === 0 && (
                <li className="py-2 text-sm text-mute">No está inscripto en ningún torneo.</li>
              )}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
