import Link from 'next/link';
import { Encabezado, Vacio } from '@/componentes/ui';
import { apiServidor } from '@/lib/api';
import { pesos } from '@/lib/formato';
import type { Equipo, Torneo, ExpedienteVista, FilaDisciplina, ResumenTribunal } from '@/lib/tipos';
import { AbrirExpediente, AccionesExpediente } from './Acciones';

export const metadata = { title: 'Sanciones' };

const TABS = [
  ['abiertos', 'Abiertos'],
  ['resueltos', 'Resueltos'],
  ['automaticas', 'Automáticas'],
  ['historial', 'Historial'],
] as const;

const CAUSA: Record<string, string> = {
  ROJA_DIRECTA: 'Roja directa',
  DOBLE_AMARILLA: 'Doble amarilla',
  ACUMULACION: 'Amarillas acumuladas',
  TRIBUNAL: 'Tribunal',
};

const VEREDICTO: Record<string, string> = {
  APLICADA: 'Aplicada como sugería el reglamento',
  AMPLIADA: 'Ampliada por el tribunal',
  REDUCIDA: 'Reducida por el tribunal',
  ANULADA: 'Anulada',
};

const fechas = (n: number) => `${n} fecha${n === 1 ? '' : 's'}`;

function Expediente({ e }: { e: ExpedienteVista }) {
  return (
    <li className="list-row block" data-testid="expediente">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <b className="block">
            {e.jugador ? `${e.jugador} · ` : ''}
            {e.equipo}
          </b>
          <span className="text-sm text-mute">
            {e.tipoNombre} · {e.motivo}
            {e.fecha ? ` · Fecha ${e.fecha}` : ''}
            {e.partido ? ` · ${e.partido}` : ''}
          </span>
        </div>
        {e.estado === 'ABIERTO' ? (
          <span className="flex flex-wrap gap-1.5">
            {e.descargo && <span className="pill-amber">Descargo recibido</span>}
            <span className="pill-red">Abierto</span>
          </span>
        ) : (
          <span className="pill-ink">Resuelto</span>
        )}
      </div>
      {e.informeArbitro && (
        <p className="mt-2 rounded-2xl bg-black/5 px-4 py-3 text-sm">
          <b>Informe del árbitro:</b> “{e.informeArbitro}”
        </p>
      )}
      {e.descargo && (
        <p className="mt-2 rounded-2xl bg-black/5 px-4 py-3 text-sm">
          <b>Descargo del capitán:</b> “{e.descargo}”
        </p>
      )}
      {e.estado === 'ABIERTO' ? (
        <>
          <p className="mt-2 text-sm text-mute">
            Sugerido por reglamento: <b className="text-ink">{fechas(e.sugeridos)}</b>
          </p>
          <AccionesExpediente e={e} />
        </>
      ) : (
        <p className="mt-2 text-sm">
          <b>{VEREDICTO[e.veredicto ?? ''] ?? 'Resuelto'}:</b> {fechas(e.partidosResueltos ?? 0)}
          {e.multa > 0 && <> · Multa {pesos(e.multa)}</>}
          {e.resolucion && <span className="text-mute"> · {e.resolucion}</span>}
        </p>
      )}
    </li>
  );
}

function Historial({ titulo, filas }: { titulo: string; filas: FilaDisciplina[] }) {
  return (
    <section className="tile overflow-x-auto">
      <span className="eyebrow">{titulo}</span>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="text-left">
            <th className="th">Nombre</th>
            <th className="th text-right">Amarillas</th>
            <th className="th text-right">Rojas</th>
            <th className="th text-right">Fechas</th>
            <th className="th text-right">Multas</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.clave}>
              <td className="td font-semibold">{f.nombre}</td>
              <td className="td text-right">{f.amarillas}</td>
              <td className="td text-right">{f.rojas}</td>
              <td className="td text-right">{f.partidosSancionados}</td>
              <td className="td text-right">{f.multas ? pesos(f.multas) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default async function Sanciones({ searchParams }: PageProps<'/panel/sanciones'>) {
  const sp = await searchParams;
  const tab = TABS.find(([k]) => k === sp.tab)?.[0] ?? 'abiertos';
  const torneoId = typeof sp.torneoId === 'string' ? sp.torneoId : '';
  const t = await apiServidor<ResumenTribunal | null>(`/tribunal${torneoId ? `?torneoId=${torneoId}` : ''}`);
  if (!t)
    return (
      <div className="space-y-6">
        <Encabezado eyebrow="Tribunal de disciplina" titulo="Sanciones" />
        <Vacio
          titulo="Todavía no hay torneos"
          texto="Cuando juegues partidos, las tarjetas se convierten en suspensiones."
        />
      </div>
    );
  const [equipos, torneos, historial] = await Promise.all([
    apiServidor<Equipo[]>('/equipos'),
    apiServidor<Torneo[]>('/torneos'),
    tab === 'historial'
      ? apiServidor<{ jugadores: FilaDisciplina[]; equipos: FilaDisciplina[] }>(
          `/tribunal/historial?torneoId=${t.torneo.id}`,
        )
      : null,
  ]);
  const { contadores: c, reglamento: r } = t;
  const abiertos = t.expedientes.filter((e) => e.estado === 'ABIERTO');
  const resueltos = t.expedientes.filter((e) => e.estado === 'RESUELTO');

  return (
    <div className="space-y-6">
      <Encabezado eyebrow={`Tribunal de disciplina · ${t.torneo.nombre}`} titulo="Sanciones">
        <AbrirExpediente torneoId={t.torneo.id} equipos={equipos} />
      </Encabezado>
      <p className="max-w-2xl text-mute">
        Las tarjetas del acta se convierten en suspensiones automáticas. Vos solo resolvés los casos graves.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="contadores">
        {[
          ['Suspendidos hoy', c.suspendidos, 'no pueden jugar la próxima fecha'],
          ['Automáticas', c.automaticas, 'por acumulación de amarillas'],
          ['Para resolver', c.abiertos, 'expedientes abiertos'],
          ['Descargos', c.descargos, 'pendientes de revisar'],
        ].map(([titulo, n, detalle]) => (
          <div key={titulo} className="tile">
            <span className="eyebrow">{titulo}</span>
            <p className="mt-1 text-4xl font-bold tracking-tighter">{n}</p>
            <p className="text-sm text-mute">{detalle}</p>
          </div>
        ))}
      </div>

      {torneos.length > 1 && (
        <nav className="flex flex-wrap gap-2" aria-label="Torneo">
          {torneos.map((x) => (
            <Link
              key={x.id}
              href={`?torneoId=${x.id}`}
              className={x.id === t.torneo.id ? 'pill-ink' : 'pill'}
              aria-current={x.id === t.torneo.id ? 'page' : undefined}
            >
              {x.nombre}
            </Link>
          ))}
        </nav>
      )}

      <nav className="flex flex-wrap gap-2" aria-label="Secciones">
        {TABS.map(([k, nombre]) => (
          <Link
            key={k}
            href={`?tab=${k}${torneoId ? `&torneoId=${torneoId}` : ''}`}
            className={k === tab ? 'btn btn-sm' : 'btn-glass btn-sm'}
            aria-current={k === tab ? 'page' : undefined}
          >
            {nombre}
            {k === 'abiertos' && ` ${abiertos.length}`}
          </Link>
        ))}
      </nav>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section className="tile" data-testid="lista-expedientes">
          {tab === 'abiertos' &&
            (abiertos.length ? (
              <ul>
                {abiertos.map((e) => (
                  <Expediente key={e.id} e={e} />
                ))}
              </ul>
            ) : (
              <p className="text-mute">No hay expedientes abiertos.</p>
            ))}
          {tab === 'resueltos' &&
            (resueltos.length ? (
              <ul>
                {resueltos.map((e) => (
                  <Expediente key={e.id} e={e} />
                ))}
              </ul>
            ) : (
              <p className="text-mute">Todavía no se resolvió ningún expediente.</p>
            ))}
          {tab === 'automaticas' &&
            (t.automaticas.length ? (
              <ul>
                {t.automaticas.map((s) => (
                  <li key={s.id} className="list-row items-center text-sm">
                    <span className="min-w-0 flex-1">
                      <b className="block">{s.jugador}</b>
                      <span className="text-mute">
                        {s.equipo} · {CAUSA[s.causa] ?? s.causa}
                      </span>
                    </span>
                    <span className={s.activa ? 'pill-red' : 'pill'}>
                      {s.activa
                        ? `Le ${s.restantes === 1 ? 'falta' : 'faltan'} ${fechas(s.restantes)}`
                        : 'Cumplida'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-mute">Todavía no hay sanciones automáticas.</p>
            ))}
          {tab === 'historial' && historial && (
            <div className="space-y-4">
              <Historial titulo="Por jugador" filas={historial.jugadores} />
              <Historial titulo="Por equipo" filas={historial.equipos} />
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <section className="tile" data-testid="suspendidos">
            <span className="eyebrow">Suspendidos esta fecha</span>
            {t.suspendidos.length ? (
              <ul className="mt-2">
                {t.suspendidos.map((s) => (
                  <li key={s.sancionId} className="list-row items-center text-sm">
                    <span className="min-w-0 flex-1">
                      <b className="block">{s.jugador}</b>
                      <span className="text-mute">
                        {s.equipo} · {CAUSA[s.causa] ?? s.causa}
                      </span>
                    </span>
                    <span className="pill-red">{fechas(s.restantes)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-mute">Nadie está suspendido.</p>
            )}
          </section>
          <section className="tile">
            <span className="eyebrow">Reglamento aplicado</span>
            <ul className="mt-2 space-y-1 text-sm">
              <li>
                {r.umbralAmarillas} amarillas <b>{fechas(r.suspensionAcumulacion)}</b>
              </li>
              <li>
                Doble amarilla <b>{fechas(r.suspensionDobleAmarilla)}</b>
              </li>
              <li>
                Roja directa <b>{fechas(r.suspensionRojaDirecta)}+</b>
              </li>
              <li>
                Agresión e incidentes <b>Tribunal</b>
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
