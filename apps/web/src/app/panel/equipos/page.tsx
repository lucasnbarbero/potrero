import Link from 'next/link';
import { Encabezado, Escudo, Vacio } from '@/componentes/ui';
import { apiServidor } from '@/lib/api';
import type { Equipo } from '@/lib/tipos';
import { NuevoEquipo } from './formularios';

export const metadata = { title: 'Equipos' };

export default async function Equipos() {
  const equipos = await apiServidor<Equipo[]>('/equipos');
  return (
    <div className="space-y-6">
      <Encabezado eyebrow="Operación" titulo="Equipos" />
      <div className="tile">
        <NuevoEquipo />
      </div>
      {equipos.length === 0 ? (
        <Vacio titulo="Sin equipos" texto="Los equipos se reutilizan entre torneos: cargalos una vez." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {equipos.map((e) => (
            <Link key={e.id} href={`/panel/equipos/${e.id}`} className="tile flex items-center gap-3">
              <Escudo nombre={e.nombre} />
              <span className="min-w-0">
                <b className="block truncate">{e.nombre}</b>
                <span className="text-xs text-mute">
                  {e._count?.plantel ?? 0} jugadores · {e.capitanNombre ?? 'sin capitán'}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
