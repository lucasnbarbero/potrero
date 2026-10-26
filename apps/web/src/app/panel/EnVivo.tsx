'use client';
// Partido en vivo del panel (E18-01): marcador y goleadores que se refrescan solos cada pocos segundos.
import { Icono } from '@potrero/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Escudo } from '@/componentes/ui';
import { api } from '@/lib/cliente';
import { fechaCorta, hora } from '@/lib/formato';
import type { PartidoEnVivo, Tablero } from '@/lib/tipos-panel';

const CADA_MS = 15_000;

const goles = (p: PartidoEnVivo) =>
  p.goles.map(
    (g) => `${g.minuto != null ? `${g.minuto}' ` : ''}${g.jugador}${g.enContra ? ' (en contra)' : ''}`,
  );

export function EnVivo({
  inicial,
  proximo,
}: {
  inicial: PartidoEnVivo[];
  proximo: Tablero['proximos'][number] | null;
}) {
  const [vivos, setVivos] = useState(inicial);
  useEffect(() => {
    let activo = true;
    const id = setInterval(async () => {
      if (document.hidden) return;
      try {
        const r = await api<PartidoEnVivo[]>('GET', '/panel/vivo');
        if (activo) setVivos(r);
      } catch {
        // Sin conexión: queda el último marcador conocido y se reintenta en el próximo ciclo.
      }
    }, CADA_MS);
    return () => {
      activo = false;
      clearInterval(id);
    };
  }, []);

  const p = vivos[0];
  if (!p) return <SinVivo proximo={proximo} />;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="pill-live" data-testid="en-vivo">
          En vivo{p.minuto != null ? ` · ${p.minuto}'` : ''}
        </span>
        <span className="text-xs text-white/50">
          {p.torneo} · Fecha {p.fecha}
          {p.cancha ? ` · ${p.cancha}` : ''}
        </span>
      </div>
      <div className="my-7 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-center sm:gap-6">
        <div className="flex min-w-0 flex-col items-center gap-2">
          <Escudo nombre={p.local.nombre} className="!size-16 !text-base sm:!size-20 sm:!text-lg" />
          <b className="max-w-full truncate text-sm sm:text-lg">{p.local.nombre}</b>
        </div>
        <div className="num text-6xl font-bold tracking-tighter sm:text-8xl" aria-label="Marcador">
          {p.marcador.local}
          <span className="mx-2 text-white/25">:</span>
          {p.marcador.visitante}
        </div>
        <div className="flex min-w-0 flex-col items-center gap-2">
          <Escudo nombre={p.visitante.nombre} className="!size-16 !text-base sm:!size-20 sm:!text-lg" />
          <b className="max-w-full truncate text-sm sm:text-lg">{p.visitante.nombre}</b>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
        <div className="flex min-w-0 items-center gap-2 text-sm text-white/60">
          <Icono nombre="ball" className="shrink-0 text-volt" />
          <span className="truncate">{p.goles.length ? goles(p).join(' · ') : 'Todavía sin goles'}</span>
        </div>
        <Link href={`/panel/partidos/${p.id}`} className="btn-volt btn-sm">
          Abrir acta
          <Icono nombre="arrow" />
        </Link>
      </div>
      {vivos.length > 1 && (
        <ul className="mt-4 space-y-2 border-t border-white/10 pt-4 text-sm">
          {vivos.slice(1).map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-white/70">
                {o.minuto != null && <b className="mr-2 text-volt">{o.minuto}&apos;</b>}
                {o.local.nombre} <b className="num text-white">{o.marcador.local}</b> –{' '}
                <b className="num text-white">{o.marcador.visitante}</b> {o.visitante.nombre}
              </span>
              <Link
                href={`/panel/partidos/${o.id}`}
                className="shrink-0 text-xs font-semibold text-volt hover:underline"
              >
                Acta →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Sin partidos en juego: el lugar lo ocupa el próximo partido. */
function SinVivo({ proximo }: { proximo: Tablero['proximos'][number] | null }) {
  if (!proximo)
    return (
      <div className="grid min-h-48 place-items-center text-center">
        <div>
          <span className="pill border-transparent bg-white/15 text-white">Sin partidos en juego</span>
          <p className="mt-4 text-white/60">Cuando arranque un partido, el marcador se ve acá en vivo.</p>
        </div>
      </div>
    );
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="pill border-transparent bg-white/15 text-white">
          Próximo partido · {fechaCorta(proximo.inicio)} {hora(proximo.inicio)}
        </span>
        {proximo.cancha && <span className="text-xs text-white/50">{proximo.cancha}</span>}
      </div>
      <div className="my-7 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-center sm:gap-6">
        <div className="flex min-w-0 flex-col items-center gap-2">
          <Escudo nombre={proximo.local} className="!size-16 !text-base sm:!size-20 sm:!text-lg" />
          <b className="max-w-full truncate text-sm sm:text-lg">{proximo.local}</b>
        </div>
        <div className="text-4xl font-bold tracking-tighter text-white/40 sm:text-6xl">vs</div>
        <div className="flex min-w-0 flex-col items-center gap-2">
          <Escudo nombre={proximo.visitante} className="!size-16 !text-base sm:!size-20 sm:!text-lg" />
          <b className="max-w-full truncate text-sm sm:text-lg">{proximo.visitante}</b>
        </div>
      </div>
      <div className="flex justify-end border-t border-white/10 pt-4">
        <Link href={`/panel/partidos/${proximo.id}`} className="btn-volt btn-sm">
          Abrir acta
          <Icono nombre="arrow" />
        </Link>
      </div>
    </>
  );
}
