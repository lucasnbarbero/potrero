import type { Plan } from '@potrero/shared';
import { BarraLateral } from '@/componentes/BarraLateral';
import { ProveedorDePermisos } from '@/componentes/Permisos';
import { apiServidor } from '@/lib/api';

export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  const yo = await apiServidor<{
    usuario: { nombre: string };
    organizacion: { nombre: string; slug: string; plan: Plan; mpConectado: boolean };
    permisos: string[];
  }>('/auth/yo');
  return (
    <>
      <BarraLateral organizacion={yo.organizacion} usuario={yo.usuario} permisos={yo.permisos} />
      <main className="px-4 pb-16 pt-6 sm:px-6 lg:ml-[18.5rem]">
        <ProveedorDePermisos permisos={yo.permisos}>{children}</ProveedorDePermisos>
      </main>
    </>
  );
}
