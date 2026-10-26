import { DATOS } from '@potrero/shared';
import { Icono } from '@potrero/ui';
import Link from 'next/link';
import { Encabezado } from '@/componentes/ui';
import { fechaCorta, iniciales, pesos } from '@/lib/formato';
import { apiGregal, ESTADO_SALUD, type LigaResumen } from '@/lib/gregal';

export const metadata = { title: 'Organizaciones' };

export default async function Organizaciones({ searchParams }: PageProps<'/gregal/organizaciones'>) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q : '';
  const ligas = await apiGregal<LigaResumen[]>(`/organizaciones${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  return (
    <div className="space-y-4">
      <Encabezado
        eyebrow={`${ligas.length} ${ligas.length === 1 ? 'organización' : 'organizaciones'}`}
        titulo="Organizaciones"
      >
        <form className="flex w-full gap-2 sm:w-auto" role="search">
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por nombre o localidad"
            className="input !rounded-full !py-2.5 sm:w-72"
            aria-label="Buscar organización"
          />
          <button className="btn">
            <Icono nombre="search" />
            Buscar
          </button>
        </form>
      </Encabezado>

      <section className="tile rise !p-0 overflow-x-auto" data-testid="lista-organizaciones">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-black/5">
              <th className="th">Organización</th>
              <th className="th">Plan</th>
              <th className="th">Estado</th>
              <th className="th text-right">Torneos</th>
              <th className="th text-right">Equipos</th>
              <th className="th text-right">Cobrado</th>
              <th className="th">Último uso</th>
              <th className="th">Salud</th>
            </tr>
          </thead>
          <tbody>
            {ligas.map((l) => {
              const [texto, clase] = ESTADO_SALUD[l.salud];
              return (
                <tr key={l.id} className="border-t border-black/5 transition hover:bg-white/60">
                  <td className="td">
                    <Link
                      href={`/gregal/organizaciones/${l.id}`}
                      className="flex items-center gap-3 font-semibold hover:underline"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink text-xs font-extrabold text-white">
                        {iniciales(l.nombre)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate">{l.nombre}</span>
                        <span className="block text-xs font-normal text-mute">
                          {l.localidad ?? `/${l.slug}`} · alta {fechaCorta(l.creadaEn)}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="td whitespace-nowrap">
                    <span className={l.fundadora ? 'pill-gregal' : 'pill'}>
                      {DATOS.planes[l.plan].nombre}
                      {l.fundadora ? ' · Fundadora' : ''}
                    </span>
                  </td>
                  <td className="td whitespace-nowrap">
                    <span className={l.activa ? 'pill-ink' : 'pill'}>
                      {l.activa ? 'Activa' : 'Sin actividad'}
                    </span>
                  </td>
                  <td className="td num whitespace-nowrap text-right">
                    {l.torneos}
                    {l.torneosEnCurso > 0 && (
                      <span className="text-mute"> ({l.torneosEnCurso} en curso)</span>
                    )}
                  </td>
                  <td className="td num text-right">{l.equipos}</td>
                  <td className="td num text-right font-semibold">{pesos(l.cobrado)}</td>
                  <td className="td whitespace-nowrap text-mute">
                    {l.ultimoUso ? fechaCorta(l.ultimoUso) : 'Nunca'}
                  </td>
                  <td className="td whitespace-nowrap">
                    <span className={clase} title={l.alertas.map((a) => a.titulo).join(' · ') || undefined}>
                      {texto}
                      {l.alertas.length > 0 && ` · ${l.alertas.length}`}
                    </span>
                  </td>
                </tr>
              );
            })}
            {ligas.length === 0 && (
              <tr>
                <td colSpan={8} className="td py-10 text-center text-mute">
                  No hay organizaciones que coincidan con “{q}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
