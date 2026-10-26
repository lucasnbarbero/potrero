import { NOMBRE_ROL_STAFF, type RolStaff } from '@potrero/shared';
import Link from 'next/link';
import { Encabezado } from '@/componentes/ui';
import { fechaCorta, hora } from '@/lib/formato';
import { apiGregal, type FilaAuditoria } from '@/lib/gregal';

export const metadata = { title: 'Auditoría' };

/** Nombre legible de cada acción del staff (las que terminan en _DENEGADO son intentos sin permiso). */
const ACCION: Record<string, string> = {
  INGRESO: 'Ingresó al backoffice',
  SALIDA: 'Cerró sesión',
  VER_METRICAS: 'Vio las métricas de la plataforma',
  LISTAR_ORGANIZACIONES: 'Listó organizaciones',
  VER_ORGANIZACION: 'Vio el detalle de una organización',
  VER_DINERO: 'Vio cobros e ingresos',
  VER_AUDITORIA: 'Vio la auditoría',
};
const texto = (accion: string) => {
  const denegado = accion.endsWith('_DENEGADO');
  const base = ACCION[accion.replace(/_DENEGADO$/, '')] ?? accion;
  return denegado ? `Intentó: ${base.toLowerCase()} (sin permiso)` : base;
};

export default async function Auditoria() {
  const filas = await apiGregal<FilaAuditoria[]>('/auditoria');
  return (
    <div className="space-y-4">
      <Encabezado eyebrow="Registro inmutable de cada acción del staff" titulo="Auditoría" />
      <section className="tile rise !p-0 overflow-x-auto" data-testid="auditoria">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr>
              <th className="th">Cuándo</th>
              <th className="th">Quién</th>
              <th className="th">Acción</th>
              <th className="th">Organización</th>
              <th className="th">IP</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className="border-t border-black/5">
                <td className="td num whitespace-nowrap text-mute">
                  {fechaCorta(f.creadoEn)} · {hora(f.creadoEn)}
                </td>
                <td className="td">
                  <b className="block">{f.staff?.nombre ?? '—'}</b>
                  <span className="text-xs text-mute">
                    {f.staff ? (NOMBRE_ROL_STAFF[f.staff.rol as RolStaff] ?? f.staff.rol) : ''}
                  </span>
                </td>
                <td className="td">
                  <span className={f.accion.endsWith('_DENEGADO') ? 'pill-red' : ''}>{texto(f.accion)}</span>
                  {f.detalle?.consulta?.q && <span className="text-mute"> · “{f.detalle.consulta.q}”</span>}
                </td>
                <td className="td">
                  {f.organizacion ? (
                    <Link
                      href={`/gregal/organizaciones/${f.organizacion.id}`}
                      className="font-semibold hover:underline"
                    >
                      {f.organizacion.nombre ?? f.organizacion.id}
                    </Link>
                  ) : (
                    <span className="text-mute">—</span>
                  )}
                </td>
                <td className="td num text-xs text-mute">{f.ip ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
