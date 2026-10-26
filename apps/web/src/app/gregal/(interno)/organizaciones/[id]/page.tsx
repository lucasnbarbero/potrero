import { DATOS } from '@potrero/shared';
import { Icono } from '@potrero/ui';
import Link from 'next/link';
import { Encabezado } from '@/componentes/ui';
import { fechaCorta, pesos } from '@/lib/formato';
import { apiGregal, ESTADO_SALUD, nombreMes, type OrganizacionGregal, porcentaje } from '@/lib/gregal';
import { Columnas, MezclaDeMedios } from '../../graficos';

export const metadata = { title: 'Organización' };

const ESTADO_TORNEO: Record<string, string> = {
  BORRADOR: 'Borrador',
  INSCRIPCION: 'Inscripción',
  EN_CURSO: 'En curso',
  FINALIZADO: 'Finalizado',
};
const ROL: Record<string, string> = {
  DUENO: 'Dueño',
  ADMINISTRADOR: 'Administrador',
  TESORERO: 'Tesorero',
  ARBITRO: 'Árbitro',
  TRIBUNAL: 'Tribunal',
  CAPITAN: 'Capitán',
};

const d = (n: number) => ({ '--d': n }) as React.CSSProperties;

export default async function Organizacion({ params }: PageProps<'/gregal/organizaciones/[id]'>) {
  const { id } = await params;
  const o = await apiGregal<OrganizacionGregal>(`/organizaciones/${id}`);
  const [salud, claseSalud] = ESTADO_SALUD[o.salud];
  const actas = o.actas.vencidos ? o.actas.cargadas / o.actas.vencidos : null;
  return (
    <div className="space-y-4">
      <Link
        href="/gregal/organizaciones"
        className="inline-flex items-center gap-1 text-sm font-semibold text-mute hover:text-ink"
      >
        <Icono nombre="back" />
        Organizaciones
      </Link>
      <Encabezado
        eyebrow={`${o.localidad ?? `/${o.slug}`} · alta ${fechaCorta(o.creadaEn)}`}
        titulo={o.nombre}
      >
        <div className="flex flex-wrap gap-2">
          <span className={o.fundadora ? 'pill-gregal' : 'pill'}>
            Plan {DATOS.planes[o.plan].nombre}
            {o.fundadora ? ' · Fundadora' : ''} · {pesos(o.cuotaMensual)}/mes
          </span>
          <span className={o.activa ? 'pill-ink' : 'pill'}>{o.activa ? 'Activa' : 'Sin actividad'}</span>
          <span className={o.mpConectado ? 'pill-gregal' : 'pill-amber'}>
            {o.mpConectado ? 'Mercado Pago conectado' : 'Mercado Pago sin conectar'}
          </span>
          <Link href={`/t/${o.slug}`} className="btn-glass btn-sm">
            <Icono nombre="globe" />
            Sitio público
          </Link>
        </div>
      </Encabezado>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <section className="tile rise" style={d(1)}>
          <span className="eyebrow">Torneos</span>
          <div className="num mt-2 text-4xl font-bold tracking-tighter">{o.torneos.length}</div>
          <p className="text-sm text-mute">{o.torneosEnCurso} en curso</p>
        </section>
        <section className="tile rise" style={d(2)}>
          <span className="eyebrow">Equipos y jugadores</span>
          <div className="num mt-2 text-4xl font-bold tracking-tighter">{o.equipos}</div>
          <p className="text-sm text-mute">{o.jugadores} jugadores</p>
        </section>
        <section className="tile rise" style={d(3)}>
          <span className="eyebrow">Actas cargadas</span>
          <div className="num mt-2 text-4xl font-bold tracking-tighter">
            {actas === null ? '—' : porcentaje(actas)}
          </div>
          <p className="text-sm text-mute">
            {o.actas.cargadas} de {o.actas.vencidos} partidos jugados
          </p>
        </section>
        <section className="tile-ink rise" style={d(4)}>
          <span className="eyebrow !text-white/50">Cargos por servicio</span>
          <div className="num text-gregal mt-2 text-4xl font-bold tracking-tighter">
            {pesos(o.cobros.cargoServicio)}
          </div>
          <p className="text-sm text-white/50">
            sobre {pesos(o.cobros.online)} online · suscripción {pesos(o.cuotaMensual)}/mes
          </p>
        </section>
      </div>

      <section className="tile rise" style={d(5)} data-testid="salud">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-bold">Salud de la liga</h2>
          <span className={claseSalud}>{salud}</span>
          <span className="ml-auto text-sm text-mute">
            Último uso del panel: {o.ultimoUso ? fechaCorta(o.ultimoUso) : 'nunca'}
          </span>
        </div>
        {o.alertas.length === 0 ? (
          <p className="text-sm text-mute">Sin alertas de abandono: carga equipos, actas y cobra online.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {o.alertas.map((a) => (
              <li key={a.clave} className="flex gap-3 rounded-2xl bg-amber-50 p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800">
                  <Icono nombre="bell" />
                </span>
                <div>
                  <b className="block">{a.titulo}</b>
                  <span className="text-sm text-mute">{a.detalle}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-[1.4fr_1fr]">
        <section className="tile rise !p-0 overflow-x-auto" style={d(6)}>
          <h2 className="px-6 pt-6 text-xl font-bold">Torneos</h2>
          <table className="mt-2 w-full min-w-[520px] text-sm">
            <thead>
              <tr>
                <th className="th">Torneo</th>
                <th className="th">Estado</th>
                <th className="th text-right">Equipos</th>
                <th className="th text-right">Partidos</th>
              </tr>
            </thead>
            <tbody>
              {o.torneos.map((t) => (
                <tr key={t.id} className="border-t border-black/5">
                  <td className="td">
                    <b>{t.nombre}</b>
                    <span className="block text-xs text-mute">
                      {t.modalidad} · {t.formato.replaceAll('_', ' ').toLowerCase()}
                    </span>
                  </td>
                  <td className="td">
                    <span className={t.estado === 'EN_CURSO' ? 'pill-ink' : 'pill'}>
                      {ESTADO_TORNEO[t.estado] ?? t.estado}
                    </span>
                  </td>
                  <td className="td num text-right">{t.equipos}</td>
                  <td className="td num text-right">
                    {t.jugados}/{t.partidos}
                  </td>
                </tr>
              ))}
              {o.torneos.length === 0 && (
                <tr>
                  <td colSpan={4} className="td py-8 text-center text-mute">
                    Todavía no creó torneos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="tile rise" style={d(7)}>
          <h2 className="mb-2 text-xl font-bold">Usuarios</h2>
          {o.usuarios.map((u) => (
            <div key={u.email} className="list-row">
              <div className="min-w-0 flex-1">
                <b className="block truncate">{u.nombre}</b>
                <span className="block truncate text-xs text-mute">{u.email}</span>
              </div>
              <span className={u.rol === 'DUENO' ? 'pill-ink' : 'pill'}>{ROL[u.rol] ?? u.rol}</span>
            </div>
          ))}
        </section>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[1fr_1fr]">
        <section className="tile rise" style={d(8)}>
          <h2 className="mb-4 text-xl font-bold">Cobros y cargos por servicio</h2>
          <MezclaDeMedios cobros={o.cobros} />
          <h3 className="mb-3 mt-6 font-semibold">Cobrado por mes</h3>
          <Columnas
            etiqueta="Cobrado por mes, últimos 6 meses"
            datos={o.cobrosPorMes.map((m) => ({
              clave: m.mes,
              valor: Math.round(m.total / 1000),
              texto: nombreMes(m.mes),
              titulo: `${nombreMes(m.mes)}: ${pesos(m.total)} (cargos por servicio ${pesos(m.cargoServicio)})`,
            }))}
          />
          <p className="mt-2 text-xs text-mute">En miles de pesos.</p>
        </section>

        <section className="tile rise" style={d(9)}>
          <h2 className="mb-2 text-xl font-bold">Últimos pagos</h2>
          {o.ultimosPagos.length === 0 && (
            <p className="py-6 text-center text-sm text-mute">Todavía no cobró nada.</p>
          )}
          {o.ultimosPagos.map((p) => (
            <div key={p.id} className="list-row text-sm">
              <div className="min-w-0 flex-1">
                <b className="block truncate">{p.equipo}</b>
                <span className="block truncate text-xs text-mute">
                  {p.concepto} · {fechaCorta(p.fecha)}
                </span>
              </div>
              <span className={p.medio === 'Online' ? 'pill-gregal' : 'pill'}>{p.medio}</span>
              <div className="w-28 text-right">
                <b className="num block">{pesos(p.monto)}</b>
                {p.cargoServicio > 0 && (
                  <span className="num text-xs text-mute">cargo {pesos(p.cargoServicio)}</span>
                )}
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
