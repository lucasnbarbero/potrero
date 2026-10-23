import { apiServidor } from '@/lib/api';
import type { Acta } from '@/lib/tipos';
import { ActaDigital } from './ActaDigital';

export const metadata = { title: 'Acta digital' };

export default async function PaginaActa({ params }: PageProps<'/panel/partidos/[id]'>) {
  const { id } = await params;
  return <ActaDigital inicial={await apiServidor<Acta>(`/partidos/${id}`)} />;
}
