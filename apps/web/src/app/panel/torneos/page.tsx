import { Icono } from '@potrero/ui';
import Link from 'next/link';
import { Encabezado, Estado, Vacio } from '@/componentes/ui';
import { apiServidor } from '@/lib/api';
import { pesos } from '@/lib/formato';
import type { Torneo } from '@/lib/tipos';

export const metadata = { title: 'Torneos' };

const FORMATOS: Record<string, string> = {
  LIGA: 'Liga',
  COPA: 'Copa',
  GRUPOS_PLAYOFFS: 'Grupos + playoffs',
  LIGA_PLAYOFFS: 'Liga + playoffs',
  FLEXIBLE: 'Por fases',
};

export default async function Torneos() {
  const torneos = await apiServidor<Torneo[]>('/torneos');
  return (
    <div className="space-y-6">
      <Encabezado eyebrow="Operación" titulo="Torneos">
        <Link href="/panel/torneos/formato" className="btn-glass">
          <Icono nombre="spark" />
          Armá el formato
        </Link>
        <Link href="/panel/torneos/nuevo" className="btn-volt">
          <Icono nombre="plus" />
          Nuevo torneo
        </Link>
      </Encabezado>
      {torneos.length === 0 ? (
        <Vacio titulo="Sin torneos" texto="Creá el primero en menos de 2 minutos." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {torneos.map((t, i) => (
            <Link
              key={t.id}
              href={`/panel/torneos/${t.id}`}
              className="tile rise block"
              style={{ '--d': i } as React.CSSProperties}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="pill-ink">{t.modalidad.replace('F', 'Fútbol ')}</span>
                <Estado estado={t.estado} />
              </div>
              <b className="mt-4 block text-2xl tracking-tight">{t.nombre}</b>
              <p className="text-sm text-mute">
                {FORMATOS[t.formato]}
                {t.idaYVuelta ? ' · ida y vuelta' : ''}
              </p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <span className="eyebrow">Equipos</span>
                  <b className="block">
                    {t._count?.inscripciones ?? 0}/{t.cupo}
                  </b>
                </div>
                <div>
                  <span className="eyebrow">Partidos</span>
                  <b className="block">{t._count?.partidos ?? 0}</b>
                </div>
                <div>
                  <span className="eyebrow">Inscripción</span>
                  <b className="block">{pesos(t.inscripcion)}</b>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
