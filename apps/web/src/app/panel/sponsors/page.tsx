import { ESPACIO_SPONSOR, ESPACIOS_SPONSOR, type EstadoPlacement } from '@potrero/shared';
import { Icono } from '@potrero/ui';
import Link from 'next/link';
import { LogoSponsor } from '@/componentes/LogoSponsor';
import { Encabezado, Vacio } from '@/componentes/ui';
import { apiServidor } from '@/lib/api';
import { pesos } from '@/lib/formato';
import {
  ElegirReporte,
  NuevoSponsor,
  PausarEspacio,
  RegistrarCobro,
  RubrosRechazados,
  VenderEspacio,
} from './Acciones';
import { compacto, dia, type PanelSponsors, type PlacementPanel, porcentaje } from './tipos';

export const metadata = { title: 'Sponsors' };

function EstadoEspacio({ p }: { p: Pick<PlacementPanel, 'estado' | 'diasRestantes' | 'desde'> }) {
  const textos: Record<EstadoPlacement, [string, string]> = {
    ACTIVO: ['pill-volt', 'Activo'],
    POR_VENCER: [
      'pill-amber',
      p.diasRestantes === 0
        ? 'Vence hoy'
        : `Vence en ${p.diasRestantes} ${p.diasRestantes === 1 ? 'día' : 'días'}`,
    ],
    PROGRAMADO: ['pill', `Desde el ${dia(p.desde)}`],
    VENCIDO: ['pill', 'Vencido'],
    PAUSADO: ['pill', 'Pausado'],
    BLOQUEADO: ['pill-red', 'No se muestra'],
  };
  const [clase, texto] = textos[p.estado];
  return <span className={`${clase} shrink-0`}>{texto}</span>;
}

/** El estado más relevante de un sponsor para la fila principal: el de su espacio más urgente. */
const ORDEN: EstadoPlacement[] = ['BLOQUEADO', 'POR_VENCER', 'ACTIVO', 'PROGRAMADO', 'PAUSADO', 'VENCIDO'];

export default async function Sponsors({ searchParams }: PageProps<'/panel/sponsors'>) {
  const sp = await searchParams;
  const torneoId = typeof sp.torneo === 'string' ? sp.torneo : '';
  const p = await apiServidor<PanelSponsors>(`/sponsors${torneoId ? `?torneoId=${torneoId}` : ''}`);
  const { resumen: r } = p;
  const torneosVisibles = p.torneos.filter((t) => t.estado !== 'BORRADOR');
  // Para "Espacios disponibles": el torneo elegido, o el que más espacios vendidos tiene, o el primero en curso.
  const vendidosPorTorneo = (id: string) =>
    p.sponsors.flatMap((s) => s.placements).filter((x) => x.torneoId === id && x.estado !== 'VENCIDO').length;
  const torneoEspacios =
    p.torneos.find((t) => t.id === torneoId) ??
    [...torneosVisibles]
      .sort((a, b) => vendidosPorTorneo(b.id) - vendidosPorTorneo(a.id))
      .find((t) => vendidosPorTorneo(t.id) > 0) ??
    torneosVisibles.find((t) => t.estado === 'EN_CURSO') ??
    torneosVisibles[0];
  const opcionesSponsor = p.sponsors.map((s) => ({ id: s.id, nombre: s.nombre, categoria: s.categoria }));
  const opcionesTorneo = torneosVisibles.map((t) => ({
    id: t.id,
    nombre: t.nombre,
    conMenores: t.conMenores,
  }));
  const vendidos = new Map(
    p.sponsors.flatMap((s) =>
      s.placements
        .filter(
          (x) =>
            x.torneoId === torneoEspacios?.id && ['ACTIVO', 'POR_VENCER', 'PROGRAMADO'].includes(x.estado),
        )
        .map((x) => [x.espacio, { sponsor: s.nombre, hasta: x.hasta }] as const),
    ),
  );
  const conMenores = p.torneos.filter((t) => t.conMenores && t.estado !== 'BORRADOR');

  return (
    <div className="space-y-6">
      <Encabezado eyebrow="Ingresos extra" titulo="Sponsors">
        <NuevoSponsor />
      </Encabezado>
      <p className="-mt-3 max-w-xl text-mute">
        Vendé espacios en tu torneo y mostrale al sponsor cuánto alcance tuvo, con números reales.
      </p>

      <nav className="flex flex-wrap gap-2" aria-label="Torneo">
        <Link href="?" className={!torneoId ? 'pill-ink' : 'pill'}>
          Todos los torneos
        </Link>
        {torneosVisibles.map((t) => (
          <Link key={t.id} href={`?torneo=${t.id}`} className={torneoId === t.id ? 'pill-ink' : 'pill'}>
            {t.nombre}
          </Link>
        ))}
      </nav>

      <div className="grid gap-4 md:grid-cols-6 xl:grid-cols-12">
        <section className="tile-volt rise md:col-span-3 xl:col-span-4" data-testid="ingresos-sponsors">
          <span className="eyebrow !text-ink/60">Ingresos por sponsors</span>
          <div className="num mt-3 text-5xl font-bold tracking-tighter">{pesos(r.acordadoVigente)}</div>
          <p className="mt-1 text-sm text-ink/70">
            {r.sponsorsActivos} {r.sponsorsActivos === 1 ? 'sponsor activo' : 'sponsors activos'}
            {torneoId ? ' en este torneo' : ''} · {pesos(r.cobradoEnCaja)} cobrados en la caja
          </p>
        </section>
        <section
          className="tile rise md:col-span-3 xl:col-span-4"
          style={{ '--d': 1 } as React.CSSProperties}
          data-testid="impresiones"
        >
          <span className="eyebrow">Impresiones · últimos 30 días</span>
          <div className="num mt-3 text-5xl font-bold tracking-tighter">{compacto(r.impresiones)}</div>
          <p className="mt-1 text-sm text-mute">
            {r.clics.toLocaleString('es-AR')} clics · CTR {porcentaje(r.ctr)} · en el sitio del torneo
          </p>
        </section>
        <section
          className="tile-ink rise md:col-span-6 xl:col-span-4"
          style={{ '--d': 2 } as React.CSSProperties}
        >
          <div className="field-pattern pointer-events-none absolute inset-0 opacity-60" />
          <div className="relative">
            <span className="pill-volt">
              <Icono nombre="spark" />
              Sugerencia
            </span>
            <p className="mt-3 text-lg font-semibold leading-snug">
              {r.mejorEspacio
                ? `Ofrecé "${r.mejorEspacio.nombre}" como espacio premium: es el que más clics genera (CTR ${porcentaje(r.mejorEspacio.ctr)}).`
                : 'Cuando tus espacios sumen visitas, te decimos cuál conviene vender más caro.'}
            </p>
          </div>
        </section>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[1.3fr_1fr]">
        <section className="tile rise" style={{ '--d': 3 } as React.CSSProperties}>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-bold">Auspiciantes</h2>
            <VenderEspacio
              sponsors={opcionesSponsor}
              torneos={opcionesTorneo}
              torneoId={torneoEspacios?.id}
              hoy={p.hoy}
              className="btn-glass btn-sm"
            >
              <Icono nombre="plus" />
              Vender espacio
            </VenderEspacio>
          </div>
          {p.sponsors.length === 0 ? (
            <div className="py-6">
              <Vacio
                titulo="Todavía no tenés sponsors"
                texto="Cargá al kiosco, al gimnasio o a la pizzería del barrio y vendeles un espacio en el sitio del torneo."
              />
            </div>
          ) : (
            <ul data-testid="auspiciantes">
              {p.sponsors.map((s) => {
                const principal = [...s.placements].sort(
                  (a, b) => ORDEN.indexOf(a.estado) - ORDEN.indexOf(b.estado),
                )[0];
                return (
                  <li key={s.id} className="border-t border-black/5 py-3 first:border-0">
                    <div className="flex items-center gap-3">
                      <LogoSponsor nombre={s.nombre} iniciales={s.iniciales} logoUrl={s.logoUrl} />
                      <div className="min-w-0 flex-1">
                        <b className="block truncate">{s.nombre}</b>
                        <span className="block truncate text-xs text-mute">
                          {s.descripcion ?? s.categoriaNombre}
                        </span>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 text-right sm:flex-row sm:items-center sm:gap-3">
                        <div>
                          <b className="num block">{pesos(s.acordadoVigente)}</b>
                          <span className="text-xs text-mute">
                            {s.cobrado > 0 ? `${pesos(s.cobrado)} cobrado` : 'acordado'}
                          </span>
                        </div>
                        {principal ? (
                          <EstadoEspacio p={principal} />
                        ) : (
                          <span className="pill shrink-0">Sin espacio</span>
                        )}
                      </div>
                    </div>
                    {s.placements.length > 0 && (
                      <ul className="mt-2 space-y-1.5 sm:pl-[3.75rem]">
                        {s.placements.map((x) => (
                          <li
                            key={x.id}
                            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-white/60 px-3 py-2 text-xs"
                          >
                            <b className="text-[13px]">{ESPACIO_SPONSOR[x.espacio].nombre}</b>
                            <span className="text-mute">
                              {x.torneo} · {dia(x.desde)} al {dia(x.hasta)} · {pesos(x.monto)}
                            </span>
                            <span className="num ml-auto text-mute">
                              {compacto(x.impresiones)} imp. · {x.clics} clics
                            </span>
                            {x.estado !== 'VENCIDO' && x.estado !== 'BLOQUEADO' && (
                              <PausarEspacio id={x.id} activo={x.activo} />
                            )}
                            {x.motivoBloqueo && (
                              <span className="w-full text-red-700">{x.motivoBloqueo}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2 sm:pl-[3.75rem]">
                      <VenderEspacio
                        sponsors={opcionesSponsor}
                        torneos={opcionesTorneo}
                        sponsorId={s.id}
                        torneoId={torneoEspacios?.id}
                        hoy={p.hoy}
                        className="btn-glass btn-sm"
                      >
                        <Icono nombre="plus" />
                        Espacio
                      </VenderEspacio>
                      <RegistrarCobro
                        sponsor={{ id: s.id, nombre: s.nombre }}
                        torneos={opcionesTorneo}
                        torneoId={s.placements[0]?.torneoId}
                      />
                      <Link href={`/panel/sponsors/${s.id}`} className="btn-glass btn-sm">
                        <Icono nombre="file" />
                        Reporte
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {r.cobradoSinAsignar > 0 && (
            <p className="mt-3 rounded-2xl bg-white/60 px-4 py-3 text-xs text-mute">
              Hay {pesos(r.cobradoSinAsignar)} de ingresos de sponsors cargados en la caja sin asociar a un
              sponsor. Los próximos cobros registralos desde acá para que cuenten en su reporte.
            </p>
          )}
        </section>

        <div className="space-y-4">
          <section className="tile rise" style={{ '--d': 4 } as React.CSSProperties} data-testid="espacios">
            <h2 className="text-xl font-bold">Espacios disponibles</h2>
            {torneoEspacios ? (
              <>
                <p className="mb-3 text-sm text-mute">En el sitio de {torneoEspacios.nombre}</p>
                <div className="space-y-2">
                  {ESPACIOS_SPONSOR.map((e) => {
                    const v = vendidos.get(e);
                    return v ? (
                      <div
                        key={e}
                        className="flex items-center justify-between gap-3 rounded-2xl bg-white/70 p-3 text-sm"
                      >
                        <div className="min-w-0">
                          <b>{ESPACIO_SPONSOR[e].nombre}</b>
                          <div className="truncate text-xs text-mute">
                            {ESPACIO_SPONSOR[e].descripcion} · {v.sponsor} hasta el {dia(v.hasta)}
                          </div>
                        </div>
                        <span className="pill-ink shrink-0">Vendido</span>
                      </div>
                    ) : (
                      <div
                        key={e}
                        className="flex items-center justify-between gap-3 rounded-2xl border-2 border-dashed border-volt-deep/60 bg-volt/20 p-3 text-sm"
                      >
                        <div className="min-w-0">
                          <b>{ESPACIO_SPONSOR[e].nombre}</b>
                          <div className="text-xs text-mute">{ESPACIO_SPONSOR[e].descripcion}</div>
                        </div>
                        <VenderEspacio
                          sponsors={opcionesSponsor}
                          torneos={opcionesTorneo}
                          espacio={e}
                          torneoId={torneoEspacios.id}
                          hoy={p.hoy}
                        >
                          Ofrecer
                        </VenderEspacio>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-mute">Publicá un torneo para vender espacios en su sitio.</p>
            )}
          </section>

          <section className="tile rise" style={{ '--d': 5 } as React.CSSProperties}>
            <h2 className="mb-1 text-xl font-bold">Reporte para sponsors</h2>
            <p className="text-sm text-mute">
              Impresiones, clics y CTR del período, para imprimir o descargar en Excel.
            </p>
            <ElegirReporte sponsors={p.sponsors.map((s) => ({ id: s.id, nombre: s.nombre }))} />
          </section>

          <section className="tile rise" style={{ '--d': 6 } as React.CSSProperties}>
            <h2 className="mb-1 text-xl font-bold">Rubros que no aceptás</h2>
            <p className="mb-3 text-sm text-mute">
              Tocá un rubro para rechazarlo en todos tus torneos.
              {conMenores.length > 0 &&
                ` En ${conMenores.map((t) => t.nombre).join(', ')} hay menores: ahí nunca se aceptan apuestas, alcohol ni tabaco.`}
            </p>
            <RubrosRechazados rechazadas={p.categoriasRechazadas} />
          </section>
        </div>
      </div>
    </div>
  );
}
