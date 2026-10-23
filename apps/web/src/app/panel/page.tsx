import { Icono } from '@potrero/ui';
import Link from 'next/link';
import { Encabezado, Escudo, Estado, Vacio } from '@/componentes/ui';
import { apiServidor } from '@/lib/api';
import { fechaCorta, hora, pesos } from '@/lib/formato';

interface Resumen {
  torneos: { id: string; nombre: string; estado: string }[];
  dinero: { cobrado: number; comisiones: number; neto: number; pendiente: number; online: number };
  deudores: { equipo: string; torneoId: string; debe: number }[];
  proximos: {
    id: string;
    torneoId: string;
    inicio: string;
    local: string;
    visitante: string;
    cancha: string | null;
  }[];
  alertas: { tipo: string; mensaje: string; href?: string }[];
  sanciones: number;
}

export const metadata = { title: 'Panel' };

export default async function Panel() {
  const r = await apiServidor<Resumen>('/panel/resumen');
  return (
    <div className="space-y-6">
      <Encabezado eyebrow="Panel del organizador" titulo="Hoy en tu liga">
        <Link href="/panel/torneos/nuevo" className="btn-volt">
          <Icono nombre="plus" />
          Nuevo torneo
        </Link>
      </Encabezado>

      {r.torneos.length === 0 ? (
        <Vacio
          titulo="Todavía no hay torneos"
          texto="Creá tu primer torneo: elegís modalidad y formato y abrís la inscripción con un link."
        >
          <Link href="/panel/torneos/nuevo" className="btn-volt mt-3">
            Crear torneo
          </Link>
        </Vacio>
      ) : (
        <div className="grid gap-4 md:grid-cols-6 xl:grid-cols-12">
          <section
            className="tile-volt rise md:col-span-3 xl:col-span-4"
            style={{ '--d': 1 } as React.CSSProperties}
          >
            <span className="eyebrow !text-ink/60">Cobrado</span>
            <div className="num mt-4 text-5xl font-bold tracking-tighter">{pesos(r.dinero.cobrado)}</div>
            <p className="mt-1 text-sm text-ink/70">
              Neto después de la comisión de Potrero: <b>{pesos(r.dinero.neto)}</b>
            </p>
            <p className="mt-1 text-xs text-ink/60">
              Online: {pesos(r.dinero.online)} · Comisión: {pesos(r.dinero.comisiones)}
            </p>
          </section>

          <section
            className="tile rise md:col-span-3 xl:col-span-4"
            style={{ '--d': 2 } as React.CSSProperties}
          >
            <span className="eyebrow">Pendiente de cobro</span>
            <div className="num mt-4 text-5xl font-bold tracking-tighter">{pesos(r.dinero.pendiente)}</div>
            <ul className="mt-3 space-y-1 text-sm">
              {r.deudores.slice(0, 4).map((d) => (
                <li key={d.equipo} className="flex justify-between">
                  <Link href={`/panel/torneos/${d.torneoId}?tab=inscripciones`} className="hover:underline">
                    {d.equipo}
                  </Link>
                  <b className="num">{pesos(d.debe)}</b>
                </li>
              ))}
              {r.deudores.length === 0 && <li className="text-mute">Nadie debe nada. 🎉</li>}
            </ul>
          </section>

          <section
            className="tile-ink rise md:col-span-6 xl:col-span-4"
            style={{ '--d': 3 } as React.CSSProperties}
          >
            <div className="field-pattern pointer-events-none absolute inset-0 opacity-60" />
            <div className="relative">
              <span className="eyebrow !text-white/50">Requiere atención</span>
              <ul className="mt-4 space-y-2 text-sm">
                {r.alertas.map((a) => (
                  <li key={a.tipo} className="flex gap-2">
                    <Icono nombre="bell" className="mt-0.5 text-volt" />
                    {a.href ? (
                      <Link
                        href={a.href}
                        className="underline decoration-white/30 underline-offset-2 hover:decoration-volt"
                      >
                        {a.mensaje}
                      </Link>
                    ) : (
                      a.mensaje
                    )}
                  </li>
                ))}
                {r.sanciones > 0 && (
                  <li className="flex gap-2">
                    <Icono nombre="card" className="mt-0.5 text-volt" />
                    {r.sanciones} sanción(es) aplicadas automáticamente desde las actas.
                  </li>
                )}
                {r.alertas.length === 0 && r.sanciones === 0 && (
                  <li className="text-white/60">Todo en orden.</li>
                )}
              </ul>
            </div>
          </section>

          <section
            className="tile rise md:col-span-6 xl:col-span-8"
            style={{ '--d': 4 } as React.CSSProperties}
          >
            <div className="flex items-center justify-between">
              <span className="eyebrow">Próximos partidos</span>
            </div>
            <ul className="mt-2">
              {r.proximos.map((p) => (
                <li key={p.id} className="list-row">
                  <span className="w-24 shrink-0 text-xs text-mute">
                    {fechaCorta(p.inicio)}
                    <br />
                    <b className="text-sm text-ink">{hora(p.inicio)}</b>
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <Escudo nombre={p.local ?? ''} className="!size-8" />
                    <b className="truncate text-sm">{p.local}</b>
                    <span className="text-mute">vs</span>
                    <b className="truncate text-sm">{p.visitante}</b>
                  </span>
                  <span className="hidden text-xs text-mute sm:block">{p.cancha}</span>
                  <Link href={`/panel/partidos/${p.id}`} className="btn-glass btn-sm">
                    Acta
                  </Link>
                </li>
              ))}
              {r.proximos.length === 0 && (
                <li className="py-4 text-sm text-mute">No hay partidos programados.</li>
              )}
            </ul>
          </section>

          <section
            className="tile rise md:col-span-6 xl:col-span-4"
            style={{ '--d': 5 } as React.CSSProperties}
          >
            <span className="eyebrow">Torneos activos</span>
            <ul className="mt-2">
              {r.torneos.map((t) => (
                <li key={t.id} className="list-row">
                  <Link href={`/panel/torneos/${t.id}`} className="flex-1 font-semibold hover:underline">
                    {t.nombre}
                  </Link>
                  <Estado estado={t.estado} />
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
