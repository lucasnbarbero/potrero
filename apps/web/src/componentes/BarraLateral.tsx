'use client';
import { DATOS, type Plan } from '@potrero/shared';
import { Icono, Logo, type NombreIcono, ProductoDeGregal } from '@potrero/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { iniciales } from '@/lib/formato';
import { MenuCuenta } from './MenuCuenta';

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
  ['/panel/metricas', 'trend', 'Métricas'],
  ['/panel/configuracion', 'gear', 'Configuración'],
  ['/panel/sponsors', 'star', 'Sponsors'],
  // Usuarios e invitaciones (E04-09).
  ['/panel/usuarios', 'shield', 'Usuarios'],
];

// Permiso que pide cada sección (ver apps/api/src/comun/permisos.ts): el menú oculta lo que el rol no puede usar.
const PERMISO_DEL_MENU: Record<string, string> = {
  '/panel/torneos': 'torneo.leer',
  '/panel/equipos': 'torneo.leer',
  '/panel/canchas': 'cancha.escribir',
  '/panel/arbitros': 'arbitro.escribir',
  '/panel/caja': 'caja.leer',
  '/panel/sanciones': 'sancion.resolver',
  '/panel/documentacion': 'documentacion.leer',
  '/panel/reprogramaciones': 'fixture.escribir',
  '/panel/comunicacion': 'comunicacion.leer',
  '/panel/metricas': 'cobro.leer',
  '/panel/configuracion': 'torneo.escribir',
  '/panel/sponsors': 'torneo.escribir',
  '/panel/usuarios': 'usuario.gestionar',
};
const puede = (permisos: readonly string[] | undefined, href: string) => {
  const p = PERMISO_DEL_MENU[href];
  return !p || !permisos || permisos.includes('*') || permisos.includes(p);
};

export function BarraLateral({
  organizacion,
  usuario,
  permisos,
}: {
  organizacion: { nombre: string; slug: string; plan: Plan; mpConectado?: boolean };
  usuario: { nombre: string };
  permisos?: readonly string[];
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
          <MenuCuenta usuario={usuario} />
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
          {MENU.filter(([href]) => puede(permisos, href)).map(([href, icono, texto]) => (
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
        </div>
        <div className="relative mt-2 rounded-2xl bg-white/10 p-3.5 text-xs text-white/60">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-volt">
            <Icono nombre="spark" />
            Comisión {String(plan.comisionPct).replace('.', ',')}%
          </div>
          {organizacion.mpConectado ? (
            'Mercado Pago conectado. Cobrás directo en tu cuenta.'
          ) : (
            <>
              Mercado Pago sin conectar.{' '}
              {puede(permisos, '/panel/configuracion') && (
                <Link href="/panel/configuracion" className="font-semibold text-white underline">
                  Conectalo en Configuración
                </Link>
              )}
            </>
          )}
        </div>
        <ProductoDeGregal oscuro className="relative mt-3 px-1.5" />
      </aside>
    </>
  );
}
