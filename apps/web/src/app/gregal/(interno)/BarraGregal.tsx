'use client';
import { NOMBRE_ROL_STAFF, type RolStaff, type SeccionStaff, staffPuedeVer } from '@potrero/shared';
import { Icono, type NombreIcono } from '@potrero/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { iniciales } from '@/lib/formato';
import type { StaffYo } from '@/lib/gregal';

const MENU: [href: string, icono: NombreIcono, texto: string, seccion: SeccionStaff][] = [
  ['/gregal', 'home', 'Inicio', 'inicio'],
  ['/gregal/organizaciones', 'trophy', 'Organizaciones', 'organizaciones'],
  ['/gregal/dinero', 'wallet', 'Dinero', 'dinero'],
  ['/gregal/auditoria', 'shield', 'Auditoría', 'auditoria'],
];

async function salir() {
  await fetch('/api/gregal/sesion/salir', { method: 'POST' }).catch(() => null);
  window.location.href = '/gregal/ingresar';
}

/** Barra del backoffice: la del panel, con el acento verde de Gregal para que nunca se confunda con una liga. */
export function BarraGregal({ staff }: { staff: StaffYo }) {
  const ruta = usePathname();
  const [abierta, setAbierta] = useState(false);
  const activo = (href: string) => (href === '/gregal' ? ruta === href : ruta.startsWith(href));
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
        <span className="pill-gregal">
          <Icono nombre="lock" />
          Uso interno · todo queda auditado
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-right text-xs leading-tight sm:block">
            <b className="block text-sm">{staff.nombre}</b>
            <span className="text-mute">{NOMBRE_ROL_STAFF[staff.rol as RolStaff] ?? staff.rol}</span>
          </span>
          <button onClick={salir} className="btn-glass btn-sm" data-testid="gregal-salir">
            Salir
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
        <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-[#12c28a]/25 blur-3xl" />
        <div className="relative flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-1 [scrollbar-width:none]">
          <Link href="/gregal" className="px-1.5 pb-4 pt-1" onClick={() => setAbierta(false)}>
            <img src="/gregal-oscuro.svg" alt="Gregal Tech" className="h-7 w-auto" />
          </Link>
          <div className="mb-2 flex items-center gap-3 rounded-2xl bg-white/10 p-3">
            <span className="bg-gregal grid size-10 place-items-center rounded-xl text-sm font-extrabold">
              {iniciales(staff.nombre)}
            </span>
            <div className="min-w-0 leading-tight">
              <b className="block truncate text-sm">Backoffice</b>
              <span className="text-xs text-white/50">Potrero · equipo Gregal</span>
            </div>
          </div>
          <div className="px-3.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[.14em] text-white/35">
            Plataforma
          </div>
          {MENU.filter(([, , , s]) => staffPuedeVer(staff.rol, s)).map(([href, icono, texto]) => (
            <Link
              key={href}
              href={href}
              onClick={() => setAbierta(false)}
              className={`flex items-center gap-3 rounded-xl px-3.5 py-2 text-[13.5px] font-medium transition ${activo(href) ? 'bg-gregal font-semibold' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}
            >
              <Icono nombre={icono} className="text-[1.05rem]" />
              {texto}
            </Link>
          ))}
        </div>
        <div className="relative mt-2 rounded-2xl bg-white/10 p-3.5 text-xs text-white/60">
          <div className="text-gregal mb-1 flex items-center gap-1.5 font-semibold">
            <Icono nombre="shield" />
            Acceso de staff
          </div>
          Ves todas las ligas en modo lectura. Cada consulta queda registrada en la auditoría.
        </div>
      </aside>
    </>
  );
}
