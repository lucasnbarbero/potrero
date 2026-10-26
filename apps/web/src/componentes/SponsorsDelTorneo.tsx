// Sponsors en el sitio público del torneo (E23). Componente propio para enchufar en cualquier página pública:
// <SponsorsDelTorneo org="..." torneo="..." espacio="CABECERA" />. Si la API falla, no muestra nada: nunca rompe la página.
import type { EspacioSponsor } from '@potrero/shared';
import { LogoSponsor } from './LogoSponsor';
import { MedirSponsors } from './MedirSponsors';

const API = process.env.API_URL ?? 'http://localhost:4000';

interface SponsorPublico {
  id: string;
  espacio: EspacioSponsor;
  sponsor: {
    nombre: string;
    iniciales: string;
    descripcion: string | null;
    logoUrl: string | null;
    conLink: boolean;
  };
}

/** Misma URL y opciones en todas las instancias: Next deduplica el pedido dentro de un mismo render. */
async function sponsorsVisibles(org: string, torneo: string): Promise<SponsorPublico[]> {
  try {
    const r = await fetch(
      `${API}/api/sponsors-publico/${encodeURIComponent(org)}/${encodeURIComponent(torneo)}`,
      {
        next: { revalidate: 10 },
      },
    );
    return r.ok ? ((await r.json()) as SponsorPublico[]) : [];
  } catch {
    return [];
  }
}

function Logo({ s, oscuro }: { s: SponsorPublico['sponsor']; oscuro?: boolean }) {
  return (
    <LogoSponsor
      nombre={s.nombre}
      iniciales={s.iniciales}
      logoUrl={s.logoUrl}
      className={`size-11 text-base ${oscuro && !s.logoUrl ? '!bg-volt !text-ink' : ''}`}
    />
  );
}

/** Siempre visible y antes que el contenido: la publicidad se señaliza como tal (documento 2, sección 6). */
function Etiqueta({ oscuro }: { oscuro?: boolean }) {
  return (
    <span
      className={`text-[10px] font-semibold uppercase tracking-[.14em] ${oscuro ? 'text-white/45' : 'text-mute'}`}
    >
      Publicidad
    </span>
  );
}

export async function SponsorsDelTorneo({
  org,
  torneo,
  espacio,
  oscuro = false,
  className = '',
}: {
  org: string;
  torneo: string;
  espacio: EspacioSponsor;
  /** Para ponerlo sobre una tarjeta oscura (tile-ink). */
  oscuro?: boolean;
  className?: string;
}) {
  const lista = (await sponsorsVisibles(org, torneo)).filter((p) => p.espacio === espacio);
  if (lista.length === 0) return null;
  return (
    <aside
      aria-label="Publicidad"
      data-testid={`sponsors-${espacio}`}
      className={`flex flex-col gap-2 ${className}`}
    >
      <MedirSponsors org={org} ids={lista.map((p) => p.id)} />
      {lista.map((p) => {
        const contenido = (
          <>
            <Logo s={p.sponsor} oscuro={oscuro} />
            <span className="min-w-0 flex-1">
              <Etiqueta oscuro={oscuro} />
              <b className="block truncate leading-tight">{p.sponsor.nombre}</b>
              {p.sponsor.descripcion && (
                <span className={`block truncate text-xs ${oscuro ? 'text-white/60' : 'text-mute'}`}>
                  {p.sponsor.descripcion}
                </span>
              )}
            </span>
          </>
        );
        const clase = `flex items-center gap-3 rounded-3xl p-3 pr-4 text-sm ${oscuro ? 'bg-white/10' : 'glass bg-white/70'}`;
        return p.sponsor.conLink ? (
          <a
            key={p.id}
            href={`/api/sponsors-publico/${encodeURIComponent(org)}/clic/${p.id}`}
            target="_blank"
            rel="sponsored noopener"
            className={`${clase} transition hover:-translate-y-0.5`}
          >
            {contenido}
            <span className={`text-xs font-semibold ${oscuro ? 'text-volt' : ''}`}>Visitar</span>
          </a>
        ) : (
          <div key={p.id} className={clase}>
            {contenido}
          </div>
        );
      })}
    </aside>
  );
}
