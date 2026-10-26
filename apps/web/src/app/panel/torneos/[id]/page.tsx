import { Icono } from '@potrero/ui';
import Link from 'next/link';
import { Encabezado, Escudo, Estado, Vacio } from '@/componentes/ui';
import { apiServidor } from '@/lib/api';
import { pesos } from '@/lib/formato';
import { Llave } from '@/componentes/Llave';
import type {
  DetalleTorneo,
  Equipo,
  Estadisticas,
  Inscripcion,
  Llave as LlaveDatos,
  Partido,
  ProgramacionTorneo,
  Sede,
} from '@/lib/tipos';
import type { ConteosTorneo, InscripcionConPagos } from '@/lib/tipos';
import { AccionesTorneo } from './AccionesTorneo';
import { CobroEquipo } from './CobroEquipo';
import { GenerarFixture, GenerarLlaves, InscribirEquipo, VencimientoInscripcion } from './acciones';
import { CobrosPorFecha } from './CobrosPorFecha';
import { GrillaFixture } from './GrillaFixture';

const pestanasDe = (formato: string) =>
  [
    ['inscripciones', 'Inscripciones y pagos'],
    ...(formato === 'COPA'
      ? []
      : [['fixture', formato === 'GRUPOS_PLAYOFFS' ? 'Fase de grupos' : 'Fixture']]),
    ...(formato === 'LIGA' ? [] : [['llaves', 'Llaves']]),
    ...(formato === 'COPA' ? [] : [['tabla', 'Tabla']]),
    ['sanciones', 'Sanciones'],
  ] as [string, string][];

export default async function DetalleTorneoPagina({
  params,
  searchParams,
}: PageProps<'/panel/torneos/[id]'>) {
  const { id } = await params;
  const t = await apiServidor<DetalleTorneo & ConteosTorneo>(`/torneos/${id}`);
  const sp = await searchParams;
  const tab =
    (typeof sp.tab === 'string' ? sp.tab : null) ??
    (t.estado === 'INSCRIPCION' ? 'inscripciones' : t.formato === 'COPA' ? 'llaves' : 'fixture');
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
        <AccionesTorneo torneo={t} />
      </Encabezado>

      <nav className="tabs rise w-fit max-w-full">
        {pestanasDe(t.formato).map(([clave, texto]) => (
          <Link key={clave} href={`?tab=${clave}`} className={tab === clave ? 'on' : ''}>
            {texto}
          </Link>
        ))}
      </nav>

      {tab === 'inscripciones' && <PestanaInscripciones torneo={t} />}
      {tab === 'fixture' && <PestanaFixture torneo={t} />}
      {tab === 'llaves' && <PestanaLlaves torneo={t} />}
      {tab === 'tabla' && <PestanaTabla id={id} />}
      {tab === 'sanciones' && <PestanaSanciones id={id} />}
    </div>
  );
}

async function PestanaInscripciones({ torneo }: { torneo: DetalleTorneo }) {
  const [inscripciones, equipos] = [
    await apiServidor<InscripcionConPagos[]>(`/torneos/${torneo.id}/inscripciones`),
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
                      {i.deudaPorFecha.monto > 0 && (
                        <span
                          className={`${i.deudaPorFecha.vencido > 0 ? 'pill-red' : 'pill-amber'} ml-1`}
                          title={i.deudaPorFecha.cargos.map((c) => c.concepto).join(' · ')}
                        >
                          {i.deudaPorFecha.vencido > 0 ? 'Cuotas vencidas' : 'Cuota de hoy'}{' '}
                          {pesos(i.deudaPorFecha.monto)}
                        </span>
                      )}
                    </td>
                    <td className="td">
                      <CobroEquipo inscripcion={i} />
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
          <VencimientoInscripcion torneoId={torneo.id} inicial={torneo.venceInscripcion} />
        </div>
      )}
      {torneo.estado !== 'FINALIZADO' && <CobrosPorFecha torneoId={torneo.id} />}
      {torneo.estado === 'INSCRIPCION' && (
        <div className="tile">
          <InscribirEquipo torneoId={torneo.id} equipos={equipos.filter((e) => !inscriptos.has(e.id))} />
        </div>
      )}
    </div>
  );
}

async function PestanaFixture({ torneo }: { torneo: DetalleTorneo }) {
  const partidos = (await apiServidor<Partido[]>(`/torneos/${torneo.id}/partidos`)).filter(
    (p) => p.fase !== 'LLAVE',
  );
  if (partidos.length === 0) {
    const [sedes, inscripciones] = [
      await apiServidor<Sede[]>('/canchas'),
      await apiServidor<Inscripcion[]>(`/torneos/${torneo.id}/inscripciones`),
    ];
    return (
      <div className="tile space-y-4">
        <div>
          <b className="text-lg">
            {torneo.formato === 'GRUPOS_PLAYOFFS'
              ? 'Armar los grupos y su fixture'
              : 'Generar el fixture automático'}
          </b>
          <p className="text-sm text-mute">
            {torneo.formato === 'GRUPOS_PLAYOFFS'
              ? 'Reparte los equipos confirmados en grupos y arma todos contra todos dentro de cada uno, sin choques de cancha ni de horario.'
              : 'Todos contra todos con los equipos confirmados, sin choques de cancha ni de horario.'}{' '}
            Al generarlo, el torneo pasa a &quot;En curso&quot;.
          </p>
        </div>
        <GenerarFixture
          torneoId={torneo.id}
          sedes={sedes}
          confirmados={inscripciones.filter((i) => i.estado === 'CONFIRMADA').length}
          conGrupos={torneo.formato === 'GRUPOS_PLAYOFFS'}
        />
      </div>
    );
  }
  // Grilla por cancha y horario, con el armado a mano (E09-07).
  const programacion = await apiServidor<ProgramacionTorneo>(`/torneos/${torneo.id}/programacion`);
  return (
    <GrillaFixture
      datos={{ ...programacion, partidos: programacion.partidos.filter((p) => p.fase !== 'LLAVE') }}
    />
  );
}

async function PestanaTabla({ id }: { id: string }) {
  const e = await apiServidor<Estadisticas>(`/torneos/${id}/estadisticas`);
  if (e.tabla.length === 0)
    return (
      <Vacio titulo="Sin posiciones todavía" texto="La tabla se arma sola cuando se cierran las actas." />
    );
  const tablas = e.grupos.length ? e.grupos : [{ grupo: '', tabla: e.tabla }];
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
      <div className="space-y-4">
        {tablas.map((g) => (
          <div key={g.grupo} className="tile !p-0">
            {g.grupo && <p className="eyebrow px-5 pt-4">Grupo {g.grupo}</p>}
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
                  {g.tabla.map((f) => (
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
        ))}
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
    TRIBUNAL: 'Resolución del tribunal',
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
                {s.equipo} · {causa[s.causa] ?? 'Sanción'} · {s.partidos} partido(s)
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
        Las tarjetas se convierten en sanciones al cerrar cada acta. Los expedientes y descargos están en{' '}
        <Link href={`/panel/sanciones?torneoId=${id}`} className="font-semibold text-ink underline">
          Sanciones
        </Link>
        .
      </p>
    </div>
  );
}

async function PestanaLlaves({ torneo }: { torneo: DetalleTorneo }) {
  const llave = await apiServidor<LlaveDatos | null>(`/torneos/${torneo.id}/llave`);
  if (llave) {
    return (
      <div className="space-y-4">
        <Llave llave={llave} enlazarActa />
        <p className="text-xs text-mute">
          La llave se completa sola: al cerrar el acta de un cruce, el ganador avanza y se programa el
          siguiente. Si hay empate, el acta pide los penales.
        </p>
      </div>
    );
  }
  const [sedes, inscripciones] = [
    await apiServidor<Sede[]>('/canchas'),
    await apiServidor<Inscripcion[]>(`/torneos/${torneo.id}/inscripciones`),
  ];
  const confirmados = inscripciones.filter((i) => i.estado === 'CONFIRMADA').map((i) => i.equipo);
  const texto: Record<string, string> = {
    COPA: 'Sorteo de los equipos confirmados con cabezas de serie. Si la cantidad no es potencia de dos, las mejores cabezas pasan la primera ronda libres.',
    LIGA_PLAYOFFS:
      'Cuando termina la fase regular, clasifican los primeros de la tabla: 1º contra último, 2º contra anteúltimo…',
    GRUPOS_PLAYOFFS:
      'Cuando terminan los grupos, avanzan los mejores de cada uno y se cruzan 1º de un grupo con 2º del vecino.',
  };
  return (
    <div className="tile space-y-4">
      <div>
        <b className="text-lg">Armar la llave</b>
        <p className="text-sm text-mute">{texto[torneo.formato]}</p>
      </div>
      <GenerarLlaves
        torneoId={torneo.id}
        formato={torneo.formato}
        sedes={sedes}
        equipos={confirmados.map((e) => ({ id: e.id, nombre: e.nombre }))}
      />
    </div>
  );
}
