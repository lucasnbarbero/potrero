import { apiGregal, type StaffYo } from '@/lib/gregal';
import { BarraGregal } from './BarraGregal';
import '../gregal.css';

export const metadata = {
  title: { default: 'Gregal interno', template: '%s · Gregal interno' },
  robots: 'noindex',
};

export default async function LayoutGregal({ children }: { children: React.ReactNode }) {
  const yo = await apiGregal<StaffYo>('/yo');
  return (
    <div className="gregal">
      <BarraGregal staff={yo} />
      <main className="px-4 pb-16 pt-6 sm:px-6 lg:ml-[18.5rem]">{children}</main>
    </div>
  );
}
