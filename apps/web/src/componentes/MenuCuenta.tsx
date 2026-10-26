'use client';
// Menú del usuario en la barra superior (E04-10, E04-14): cambiar de organización, "Mi cuenta" y salir.
import { Icono } from '@potrero/ui';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/cliente';
import { cambiarOrganizacion } from '@/lib/cuenta';
import { iniciales } from '@/lib/formato';
import { limpiarSinConexion } from '@/lib/sin-conexion';
import { NOMBRE_ROL, type MiCuenta } from '@/lib/tipos-panel';

export function MenuCuenta({ usuario }: { usuario: { nombre: string } }) {
  const [abierto, setAbierto] = useState(false);
  const [orgs, setOrgs] = useState<MiCuenta['organizaciones'] | null>(null);
  const [cambiando, setCambiando] = useState<string | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    if (!orgs)
      api<MiCuenta>('GET', '/cuenta')
        .then((c) => setOrgs(c.organizaciones))
        .catch(() => setOrgs([]));
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', escape);
    };
  }, [abierto, orgs]);

  return (
    <div className="relative" ref={caja}>
      <button
        className="flex items-center gap-2 rounded-full bg-white/80 py-1 pl-1 pr-3.5 text-sm font-semibold hover:bg-white"
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
        data-testid="menu-cuenta"
      >
        <span className="grid size-8 place-items-center rounded-full bg-ink text-xs font-bold text-volt">
          {iniciales(usuario.nombre)}
        </span>
        <span className="hidden max-w-32 truncate sm:inline">{usuario.nombre.split(/\s+/)[0]}</span>
        <Icono nombre="chev" className="text-mute" />
      </button>
      {abierto && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-50 w-72 rounded-3xl bg-white p-2 text-sm shadow-2xl ring-1 ring-black/5"
        >
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[.14em] text-mute">
            Organizaciones
          </p>
          {!orgs && <p className="px-3 py-2 text-mute">Cargando…</p>}
          {orgs?.map((o) => (
            <button
              key={o.id}
              role="menuitemradio"
              aria-checked={o.activa}
              disabled={o.activa || !!cambiando}
              onClick={async () => {
                setCambiando(o.id);
                try {
                  await cambiarOrganizacion(o.id);
                } catch {
                  setCambiando(null);
                }
              }}
              className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left ${o.activa ? 'bg-black/5' : 'hover:bg-black/5'}`}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-ink text-[11px] font-extrabold text-volt">
                {iniciales(o.nombre)}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block truncate">{o.nombre}</b>
                <span className="text-xs text-mute">{NOMBRE_ROL[o.rol] ?? o.rol}</span>
              </span>
              {o.activa ? (
                <Icono nombre="check" className="text-ink" />
              ) : cambiando === o.id ? (
                <span className="text-xs text-mute">Cambiando…</span>
              ) : null}
            </button>
          ))}
          <div className="my-2 border-t border-black/5" />
          <Link
            href="/panel/cuenta"
            role="menuitem"
            onClick={() => setAbierto(false)}
            className="flex items-center gap-3 rounded-2xl px-3 py-2 hover:bg-black/5"
          >
            <Icono nombre="users" />
            Mi cuenta
          </Link>
          <button
            role="menuitem"
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left hover:bg-black/5"
            onClick={async () => {
              await api('POST', '/auth/salir');
              await limpiarSinConexion();
              window.location.href = '/ingresar';
            }}
          >
            <Icono nombre="back" />
            Salir
          </button>
        </div>
      )}
    </div>
  );
}
