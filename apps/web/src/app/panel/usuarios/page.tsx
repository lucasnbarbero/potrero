import { DESCRIPCION_ROL, type RolOrganizacion } from '@potrero/shared';
import { Encabezado, Vacio } from '@/componentes/ui';
import { apiServidor, ErrorApi } from '@/lib/api';
import { fechaCorta, iniciales } from '@/lib/formato';
import type { UsuariosOrganizacion } from '@/lib/tipos-capitan';
import { AccionesInvitacion, Invitar, QuitarAcceso } from './Usuarios';

export const metadata = { title: 'Usuarios' };

const ESTADO: Record<string, [string, string]> = {
  PENDIENTE: ['pill-amber', 'Pendiente'],
  ACEPTADA: ['pill-volt', 'Aceptada'],
  RECHAZADA: ['pill', 'Rechazada'],
  ANULADA: ['pill', 'Anulada'],
  VENCIDA: ['pill-red', 'Vencida'],
};

/** Usuarios de la organización (E04-09): miembros con su rol, invitaciones y accesos. */
export default async function Usuarios() {
  let datos: UsuariosOrganizacion;
  try {
    datos = await apiServidor<UsuariosOrganizacion>('/usuarios');
  } catch (e) {
    if (e instanceof ErrorApi && e.status === 403)
      return (
        <div className="space-y-6">
          <Encabezado eyebrow="Organización" titulo="Usuarios" />
          <Vacio
            titulo="Solo el dueño o un administrador"
            texto="Las invitaciones y los accesos los maneja el dueño de la organización o un administrador de torneo."
          />
        </div>
      );
    throw e;
  }
  const pendientes = datos.invitaciones.filter((i) => i.estado === 'PENDIENTE' || i.estado === 'VENCIDA');
  const historial = datos.invitaciones.filter((i) => i.estado !== 'PENDIENTE' && i.estado !== 'VENCIDA');
  return (
    <div className="space-y-6">
      <Encabezado eyebrow="Organización" titulo="Usuarios" />

      <div className="grid gap-4 lg:grid-cols-12">
        <section className="tile rise lg:col-span-5" style={{ '--d': 1 } as React.CSSProperties}>
          <h2 className="text-xl font-bold">Invitar a alguien</h2>
          <p className="mt-1 text-sm text-mute">
            Le llega un link para crear su cuenta (o entrar con la que ya tiene) y queda con el rol que
            elijas.
          </p>
          <Invitar roles={datos.rolesInvitables} equipos={datos.equipos} />
          <ul className="mt-5 space-y-2 border-t border-black/10 pt-4 text-xs text-mute">
            {datos.rolesInvitables.map((r) => (
              <li key={r.rol}>
                <b className="text-ink">{r.nombre}:</b> {DESCRIPCION_ROL[r.rol as RolOrganizacion]}
              </li>
            ))}
          </ul>
        </section>

        <section className="tile rise lg:col-span-7" style={{ '--d': 2 } as React.CSSProperties}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xl font-bold">Miembros</h2>
            <span className="pill">{datos.miembros.length}</span>
          </div>
          <ul data-testid="miembros">
            {datos.miembros.map((m) => (
              <li key={m.id} className="list-row" data-testid="miembro">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-sm font-bold text-volt">
                  {iniciales(m.nombre)}
                </span>
                <div className="min-w-0 flex-1">
                  <b className="block truncate">
                    {m.nombre}
                    {m.esUnoMismo && <span className="font-normal text-mute"> (vos)</span>}
                  </b>
                  <span className="block truncate text-xs text-mute">
                    {m.email} · desde {fechaCorta(m.desde)}
                  </span>
                </div>
                <span className={m.rol === 'DUENO' ? 'pill-ink' : m.rol === 'CAPITAN' ? 'pill-volt' : 'pill'}>
                  {m.rolNombre}
                  {m.equipo ? ` · ${m.equipo}` : ''}
                </span>
                {m.quitar.ok && <QuitarAcceso id={m.id} nombre={m.nombre} />}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="tile rise" style={{ '--d': 3 } as React.CSSProperties}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xl font-bold">Invitaciones pendientes</h2>
          <span className="pill-amber">{pendientes.length}</span>
        </div>
        {pendientes.length === 0 ? (
          <p className="py-4 text-sm text-mute">No hay invitaciones esperando respuesta.</p>
        ) : (
          <ul>
            {pendientes.map((i) => (
              <li key={i.id} className="list-row flex-wrap" data-testid="invitacion">
                <div className="min-w-0 flex-1">
                  <b className="block truncate">{i.nombre ?? i.email}</b>
                  <span className="block truncate text-xs text-mute">
                    {i.email} · {i.rolNombre}
                    {i.equipo ? ` de ${i.equipo}` : ''} · vence {fechaCorta(i.venceEn)}
                  </span>
                </div>
                <span className={ESTADO[i.estado]![0]}>{ESTADO[i.estado]![1]}</span>
                {i.gestionable && <AccionesInvitacion id={i.id} email={i.email} rol={i.rolNombre} />}
              </li>
            ))}
          </ul>
        )}
        {historial.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold text-mute">
              Historial ({historial.length})
            </summary>
            <ul className="mt-2">
              {historial.map((i) => (
                <li key={i.id} className="list-row">
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-sm">{i.nombre ?? i.email}</b>
                    <span className="text-xs text-mute">
                      {i.rolNombre}
                      {i.equipo ? ` de ${i.equipo}` : ''} · {fechaCorta(i.creadoEn)}
                    </span>
                  </div>
                  <span className={ESTADO[i.estado]![0]}>{ESTADO[i.estado]![1]}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}
