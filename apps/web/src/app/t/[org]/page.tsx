import Link from 'next/link';
import { MarcoPublico } from '@/componentes/MarcoPublico';
import { Estado } from '@/componentes/ui';
import { apiPublica } from '@/lib/api';

interface SitioLiga {
  organizacion: { nombre: string; slug: string };
  torneos: { nombre: string; slug: string; modalidad: string; estado: string }[];
}

export default async function SitioDeLaLiga({ params }: PageProps<'/t/[org]'>) {
  const { org } = await params;
  const s = await apiPublica<SitioLiga>(`/publico/${org}`);
  return (
    <MarcoPublico liga={s.organizacion}>
      <h1 className="rise text-5xl font-bold tracking-tighter sm:text-6xl">{s.organizacion.nombre}</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {s.torneos.map((t) => (
          <Link key={t.slug} href={`/t/${org}/${t.slug}`} className="tile block">
            <div className="flex items-center justify-between">
              <span className="pill-ink">{t.modalidad.replace('F', 'Fútbol ')}</span>
              <Estado estado={t.estado} />
            </div>
            <b className="mt-4 block text-2xl tracking-tight">{t.nombre}</b>
          </Link>
        ))}
      </div>
    </MarcoPublico>
  );
}
