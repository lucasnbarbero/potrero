import { Icono } from '@potrero/ui';
import Link from 'next/link';
import { Encabezado, Escudo, Estado, Vacio } from '@/componentes/ui';
import { apiServidor } from '@/lib/api';
import { fechaCorta, hora, pesos } from '@/lib/formato';
import type { DetalleTorneo, Equipo, Estadisticas, Inscripcion, Partido, Sede } from '@/lib/tipos';
import { AccionesCobro, GenerarFixture, InscribirEquipo } from './acciones';

const PESTANAS = [
  ['inscripciones', 'Inscripciones y pagos'],
  ['fixture', 'Fixture'],
  ['tabla', 'Tabla'],
  ['sanciones', 'Sanciones'],
] as const;

export default async function DetalleTorneoPagina({
  params,
  searchParams,
}: PageProps<'/panel/torneos/[id]'>) {
  const { id } = await params;
  const t = await apiServidor<DetalleTorneo>(`/torneos/${id}`);
  const sp = await searchParams;
  const tab =
    (typeof sp.tab === 'string' ? sp.tab : null) ??
    (t.estado === 'INSCRIPCION' ? 'inscripciones' : 'fixture');
  const urlPublica = `/t/${t.organizacionSlug}/${t.slug}`;

  return (
    <div className="space-y-6">
      <Encabezado
        eyebrow={`${t.modalidad.replace('F', 'Fútbol ')} · ${t.formato.replace('_', ' + ').toLowerCase()}`}
        titulo={t.nombre}
      >
        <Estado estado={t.estado} />
        <Link href={urlPublica} className="btn-glass btn-sm" target="_blank">
          <Icono nombre="globe" />
          Ver sitio público
        </Link>
        {t.estado === 'INSCRIPCION' && (
          <Link href={`${urlPublica}/inscripcion`} className="btn-volt btn-sm" target="_blank">
            <Icono nombre="share" />
            Link de inscripción
          </Link>
        )}
      </Encabezado>

      <nav className="tabs rise w-fit max-w-full">
        {PESTANAS.map(([clave, texto]) => (
          <Link key={clave} href={`?tab=${clave}`} className={tab === clave ? 'on' : ''}>
            {texto}
          </Link>
        ))}
      </nav>

      {tab === 'inscripciones' && <PestanaInscripciones torneo={t} />}
      {tab === 'fixture' && <PestanaFixture torneo={t} />}
      {tab === 'tabla' && <PestanaTabla id={id} />}
      {tab === 'sanciones' && <PestanaSanciones id={id} />}
    </div>
  );
}

async function PestanaInscripciones({ torneo }: { torneo: DetalleTorneo }) {
  const [inscripciones, equipos] = [
    await apiServidor<Inscripcion[]>(`/torneos/${torneo.id}/inscripciones`),
    await apiServidor<Equipo[]>('/equipos'),
  ];
  const inscriptos = new Set(inscripciones.map((i) => i.equipo.id));
  const total = inscripciones.reduce((s, i) => s + i.total, 0);
  const cobrado = inscripciones.reduce((s, i) => s + i.pagado, 0);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="tile">
          <span className="eyebrow">Equipos</span>
          <b className="num mt-2 block text-4xl tracking-tighter">
            {inscripciones.length}/{torneo.cupo}
          </b>
        </div>
        <div className="tile-volt">
          <span className="eyebrow !text-ink/60">Cobrado</span>
          <b className="num mt-2 block text-4xl tracking-tighter">{pesos(cobrado)}</b>
          <div className="bar mt-3 !bg-ink/10">
            <i style={{ width: `${total ? (cobrado / total) * 100 : 0}%` }} />
          </div>
        </div>
        <div className="tile">
          <span className="eyebrow">Pendiente</span>
          <b className="num mt-2 block text-4xl tracking-tighter">{pesos(total - cobrado)}</b>
        </div>
      </div>
      <div className="tile !p-0">
        <div className="scrollx">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr>
                <th className="th">Equipo</th>
                <th className="th">Capitán</th>
                <th className="th">Pagado</th>
                <th className="th">Estado</th>
                <th className="th text-right">Cobro</th>
              </tr>
            </thead>
            <tbody className="[&>tr]:border-t [&>tr]:border-black/5">
              {inscripciones.map((i) => {
                const cargo = i.cargos.find((c) => c.estado === 'PENDIENTE');
                return (
                  <tr key={i.id}>
                    <td className="td">
                      <Link
                        href={`/panel/equipos/${i.equipo.id}`}
                        className="flex items-center gap-3 font-semibold hover:underline"
                      >
                        <Escudo nombre={i.equipo.nombre} className="!size-8" />
                        {i.equipo.nombre}
                      </Link>
                    </td>
                    <td className="td text-mute">{i.equipo.capitan ?? '—'}</td>
                    <td className="td">
                      <b className="num">{pesos(i.pagado)}</b>
                      <span className="text-mute"> / {pesos(i.total)}</span>
                      <div className="text-xs text-mute">
                        {i.pagos
                          .filter((p) => p.estado === 'APROBADO')
                          .map(
                            (p) =>
                              `${p.metodo === 'MERCADO_PAGO' ? 'Mercado Pago' : p.metodo === 'EFECTIVO' ? 'Efectivo' : 'Transferencia'}${p.comision ? ` (comisión ${pesos(p.comision)})` : ''}`,
                          )
                          .join(' · ')}
                      </div>
                    </td>
                    <td className="td">
                      <Estado estado={i.estado} />
                    </td>
                    <td className="td">
                      {cargo ? (
                        <AccionesCobro cargoId={cargo.id} debe={i.debe} />
                      ) : (
                        <span className="block text-right text-mute">Al día</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {inscripciones.length === 0 && (
          <p className="p-6 text-sm text-mute">
            Todavía no hay equipos. Compartí el link de inscripción o inscribilos desde acá.
          </p>
        )}
      </div>
      {torneo.estado === 'INSCRIPCION' && (
        <div className="tile">
          <InscribirEquipo torneoId={torneo.id} equipos={equipos.filter((e) => !inscriptos.has(e.id))} />
        </div>
      )}
    </div>
  );
}

async function PestanaFixture({ torneo }: { torneo: DetalleTorneo }) {
  const partidos = await apiServidor<Partido[]>(`/torneos/${torneo.id}/partidos`);
  if (partidos.length === 0) {
    const [sedes, inscripciones] = [
      await apiServidor<Sede[]>('/canchas'),
      await apiServidor<Inscripcion[]>(`/torneos/${torneo.id}/inscripciones`),
    ];
    return (
      <div className="tile space-y-4">
        <div>
          <b className="text-lg">Generar el fixture automático</b>
          <p className="text-sm text-mute">
            Todos contra todos con los equipos confirmados, sin choques de cancha ni de horario. Al generarlo,
            el torneo pasa a &quot;En curso&quot;.
          </p>
        </div>
        <GenerarFixture
          torneoId={torneo.id}
          sedes={sedes}
          confirmados={inscripciones.filter((i) => i.estado === 'CONFIRMADA').length}
        />
      </div>
    );
  }
  const fechas = Map.groupBy(partidos, (p) => p.fecha);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {[...fechas].map(([fecha, ps]) => (
        <section key={fecha} className="tile">
          <div className="flex items-center justify-between">
            <b className="text-lg">Fecha {fecha}</b>
            <span className="text-sm text-mute">{fechaCorta(ps[0]!.inicio)}</span>
          </div>
          <ul className="mt-2">
            {ps.map((p) => (
              <li key={p.id} className="list-row text-sm">
                <span className="w-12 shrink-0 font-semibold">{hora(p.inicio)}</span>
                <span className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right">
                  <span className="truncate">{p.local}</span>
                </span>
                <span className="num w-14 shrink-0 rounded-full bg-black/5 py-1 text-center font-bold">
                  {p.estado === 'FINALIZADO'
                    ? `${p.golesLocal}-${p.golesVisitante}`
                    : p.estado === 'WO'
                      ? 'W.O.'
                      : 'vs'}
                </span>
                <span className="min-w-0 flex-1 truncate">{p.visitante}</span>
                <Link
                  href={`/panel/partidos/${p.id}`}
                  className={p.estado === 'FINALIZADO' ? 'btn-glass btn-sm' : 'btn btn-sm'}
                >
                  Acta
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

async function PestanaTabla({ id }: { id: string }) {
  const e = await apiServidor<Estadisticas>(`/torneos/${id}/estadisticas`);
  if (e.tabla.length === 0)
    return (
      <Vacio titulo="Sin posiciones todavía" texto="La tabla se arma sola cuando se cierran las actas." />
    );
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
      <div className="tile !p-0">
        <div className="scrollx">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr>
                {['#', 'Equipo', 'PJ', 'PG', 'PE', 'PP', 'GF', 'GC', 'DG', 'Pts'].map((h) => (
                  <th key={h} className="th">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="[&>tr]:border-t [&>tr]:border-black/5">
              {e.tabla.map((f) => (
                <tr key={f.equipoId}>
                  <td className="td font-bold">{f.posicion}</td>
                  <td className="td">
                    <span className="flex items-center gap-2 font-semibold">
                      <Escudo nombre={f.equipo} className="!size-7 !text-[9px]" />
                      {f.equipo}
                    </span>
                  </td>
                  {[f.pj, f.pg, f.pe, f.pp, f.gf, f.gc, f.dg].map((v, i) => (
                    <td key={i} className="td num">
                      {v}
                    </td>
                  ))}
                  <td className="td num font-bold">{f.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 pb-4 text-xs text-mute">
          Calculada automáticamente desde las actas cerradas. No se edita a mano.
        </p>
      </div>
      <div className="tile">
        <span className="eyebrow">Goleadores</span>
        <ol className="mt-2">
          {e.goleadores.slice(0, 10).map((g, i) => (
            <li key={g.jugadorId} className="list-row text-sm">
              <span className="w-5 font-bold">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <b className="block truncate">{g.jugador}</b>
                <span className="text-xs text-mute">{g.equipo}</span>
              </span>
              <b className="num text-lg">{g.goles}</b>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

async function PestanaSanciones({ id }: { id: string }) {
  const e = await apiServidor<Estadisticas>(`/torneos/${id}/estadisticas`);
  if (e.sanciones.length === 0)
    return (
      <Vacio
        titulo="Sin sanciones"
        texto="Las tarjetas del acta se convierten en suspensiones según el reglamento del torneo."
      />
    );
  const causa: Record<string, string> = {
    ROJA_DIRECTA: 'Roja directa',
    DOBLE_AMARILLA: 'Doble amarilla',
    ACUMULACION: 'Acumulación de amarillas',
  };
  return (
    <div className="tile !p-0">
      <ul className="px-5">
        {e.sanciones.map((s) => (
          <li key={s.id} className="list-row text-sm">
            <span
              className={`grid size-9 place-items-center rounded-xl ${s.causa === 'ACUMULACION' ? 'bg-amber-300' : 'bg-red-500 text-white'}`}
            >
              <Icono nombre="card" />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block">{s.jugador}</b>
              <span className="text-xs text-mute">
                {s.equipo} · {causa[s.causa]} · {s.partidos} partido(s)
              </span>
            </span>
            {s.activa ? (
              <span className="pill-red">Le falta(n) {s.restantes}</span>
            ) : (
              <span className="pill">Cumplida</span>
            )}
          </li>
        ))}
      </ul>
      <p className="px-5 pb-4 text-xs text-mute">
        Generadas automáticamente al cerrar cada acta. Expedientes y descargos: próximamente (E14).
      </p>
    </div>
  );
}
