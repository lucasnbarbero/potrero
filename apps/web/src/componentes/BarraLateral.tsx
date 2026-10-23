'use client';
import { DATOS, type Plan } from '@potrero/shared';
import { Icono, Logo, type NombreIcono, ProductoDeGregal } from '@potrero/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/cliente';
import { limpiarSinConexion } from '@/lib/sin-conexion';
import { iniciales } from '@/lib/formato';

type Item = [href: string, icono: NombreIcono, texto: string];
const MENU: Item[] = [
  ['/panel', 'home', 'Panel'],
  ['/panel/torneos', 'trophy', 'Torneos'],
  ['/panel/equipos', 'users', 'Equipos'],
  ['/panel/canchas', 'pin', 'Canchas'],
  ['/panel/arbitros', 'whistle', 'Árbitros'],
  ['/panel/caja', 'wallet', 'Caja'],
  ['/panel/sanciones', 'card', 'Sanciones'],
  ['/panel/documentacion', 'id', 'Documentación'],
  ['/panel/reprogramaciones', 'cloud', 'Reprogramar'],
  ['/panel/comunicacion', 'whatsapp', 'Comunicación'],
];
/** Módulos del producto completo que todavía no están en la demo (ver docs/backlog.md). */
const PROXIMAMENTE: [NombreIcono, string][] = [
  ['star', 'Sponsors'],
  ['trend', 'Métricas'],
];

export function BarraLateral({
  organizacion,
  usuario,
}: {
  organizacion: { nombre: string; slug: string; plan: Plan };
  usuario: { nombre: string };
}) {
  const ruta = usePathname();
  const [abierta, setAbierta] = useState(false);
  const plan = DATOS.planes[organizacion.plan];
  const activo = (href: string) => (href === '/panel' ? ruta === href : ruta.startsWith(href));
  return (
    <>
      <header className="glass sticky top-3 z-40 mx-4 mt-3 flex items-center gap-3 rounded-full py-2 pl-2 pr-2 sm:mx-6 lg:ml-[18.5rem]">
        <button
          onClick={() => setAbierta(true)}
          className="grid size-10 place-items-center rounded-full bg-ink text-white lg:hidden"
          aria-label="Abrir menú"
        >
          <Icono nombre="menu" />
        </button>
        <span className="truncate px-2 text-sm font-semibold">{organizacion.nombre}</span>
        <div className="ml-auto flex items-center gap-2">
          <Link href={`/t/${organizacion.slug}`} className="btn-glass btn-sm hidden sm:inline-flex">
            <Icono nombre="globe" />
            Sitio público
          </Link>
          <button
            className="flex items-center gap-2 rounded-full bg-white/80 py-1 pl-1 pr-3.5 text-sm font-semibold hover:bg-white"
            title="Cerrar sesión"
            onClick={async () => {
              await api('POST', '/auth/salir');
              await limpiarSinConexion();
              window.location.href = '/ingresar';
            }}
          >
            <span className="grid size-8 place-items-center rounded-full bg-ink text-xs font-bold text-volt">
              {iniciales(usuario.nombre)}
            </span>
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </header>

      {abierta && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setAbierta(false)}
        />
      )}
      <aside
        className={`fixed inset-y-3 left-3 z-50 flex w-64 flex-col gap-1 overflow-hidden rounded-4xl bg-ink p-4 text-white shadow-2xl transition-transform duration-300 lg:translate-x-0 ${abierta ? '' : '-translate-x-[110%]'}`}
      >
        <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-volt/20 blur-3xl" />
        <div className="relative flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-1 [scrollbar-width:none]">
          <Link href="/panel" className="px-1.5 pb-4 pt-1" onClick={() => setAbierta(false)}>
            <Logo className="text-xl" />
          </Link>
          <div className="mb-2 flex items-center gap-3 rounded-2xl bg-white/10 p-3">
            <span className="grid size-10 place-items-center rounded-xl bg-volt text-sm font-extrabold text-ink">
              {iniciales(organizacion.nombre)}
            </span>
            <div className="min-w-0 leading-tight">
              <b className="block truncate text-sm">{organizacion.nombre}</b>
              <span className="text-xs text-white/50">Plan {plan.nombre}</span>
            </div>
          </div>
          <div className="px-3.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[.14em] text-white/35">
            Operación
          </div>
          {MENU.map(([href, icono, texto]) => (
            <Link
              key={href}
              href={href}
              onClick={() => setAbierta(false)}
              className={`flex items-center gap-3 rounded-xl px-3.5 py-2 text-[13.5px] font-medium transition ${activo(href) ? 'bg-volt font-semibold text-ink' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}
            >
              <Icono nombre={icono} className="text-[1.05rem]" />
              {texto}
            </Link>
          ))}
          <div className="px-3.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[.14em] text-white/35">
            Próximamente
          </div>
          {PROXIMAMENTE.map(([icono, texto]) => (
            <span
              key={texto}
              className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3.5 py-2 text-[13.5px] font-medium text-white/30"
              title="Está en el backlog del lanzamiento"
            >
              <Icono nombre={icono} className="text-[1.05rem]" />
              {texto}
            </span>
          ))}
        </div>
        <div className="relative mt-2 rounded-2xl bg-white/10 p-3.5 text-xs text-white/60">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-volt">
            <Icono nombre="spark" />
            Comisión {String(plan.comisionPct).replace('.', ',')}%
          </div>
          Mercado Pago conectado (modo demo). Cobrás directo en tu cuenta.
        </div>
        <ProductoDeGregal oscuro className="relative mt-3 px-1.5" />
      </aside>
    </>
  );
}
