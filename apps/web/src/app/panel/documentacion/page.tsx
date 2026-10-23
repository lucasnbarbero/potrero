import { Icono } from '@potrero/ui';
import { Encabezado } from '@/componentes/ui';
import { apiServidor } from '@/lib/api';
import type { DuplicadoJugador, PanelDocumentacion } from '@/lib/tipos';
import { Duplicados } from './Duplicados';
import { Requisitos } from './Requisitos';
import { TablaDocumentacion } from './TablaDocumentacion';

export const metadata = { title: 'Documentación' };

export default async function Documentacion({ searchParams }: PageProps<'/panel/documentacion'>) {
  const sp = await searchParams;
  const torneoId = typeof sp.torneo === 'string' ? sp.torneo : undefined;
  const p = await apiServidor<PanelDocumentacion>(`/documentacion${torneoId ? `?torneoId=${torneoId}` : ''}`);
  const duplicados = await apiServidor<DuplicadoJugador[]>('/documentacion/duplicados');

  if (!p.torneo || !p.resumen || !p.alertas)
    return (
      <div className="space-y-6">
        <Encabezado eyebrow="Identidad y habilitación" titulo="Documentación" />
        <p className="tile text-mute">
          Cuando haya un torneo publicado, acá vas a ver la documentación de sus jugadores.
        </p>
      </div>
    );

  const { resumen, alertas } = p;
  const pct = resumen.total ? Math.round((resumen.habilitados / resumen.total) * 100) : 0;
  const filasAlerta: [string, number][] = [
    ['Posible duplicado', alertas.duplicados],
    ['Apto vencido', alertas.aptoVencido],
    ['Apto por vencer', alertas.aptoPorVencer],
    ['Menor sin autorización', alertas.menoresSinAutorizacion],
    ['Documentos por revisar', alertas.pendientesDeRevision],
  ];

  return (
    <div className="space-y-6">
      <Encabezado eyebrow="Identidad y habilitación" titulo="Documentación">
        <form method="get" className="flex items-center gap-2">
          <select name="torneo" defaultValue={p.torneo.id} className="input !w-auto" aria-label="Torneo">
            {p.torneos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
          <button className="btn-glass btn-sm">Ver</button>
        </form>
      </Encabezado>
      <p className="-mt-3 max-w-xl text-mute">
        Cada jugador queda verificado antes de pisar la cancha. Se acabaron los «jugó con el DNI del hermano».
      </p>

      <div className="grid gap-4 md:grid-cols-6 xl:grid-cols-12">
        <section
          className="tile-ink rise relative md:col-span-6 xl:col-span-5"
          style={{ '--d': 1 } as React.CSSProperties}
        >
          <div className="field-pattern pointer-events-none absolute inset-0 opacity-70" />
          <div className="relative">
            <span className="eyebrow !text-white/50">Habilitados en {p.torneo.nombre}</span>
            <div className="mt-3 flex items-end gap-2" data-testid="habilitados">
              <span className="num text-7xl font-bold tracking-tighter">{resumen.habilitados}</span>
              <span className="pb-3 text-2xl text-white/40">/ {resumen.total}</span>
            </div>
            <div className="bar mt-3 !bg-white/15">
              <i style={{ width: `${pct}%`, background: '#d6ff3d' }} />
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs text-white/60">
              <div className="rounded-2xl bg-white/10 py-3">
                <b className="block text-xl text-white">{resumen.conDni}</b>DNI
              </div>
              <div className="rounded-2xl bg-white/10 py-3">
                <b className="block text-xl text-white">{resumen.conApto}</b>Apto físico
              </div>
              <div className="rounded-2xl bg-white/10 py-3">
                <b className="block text-xl text-white">{resumen.menores}</b>Menores
              </div>
            </div>
          </div>
        </section>

        <section
          className="tile rise md:col-span-3 xl:col-span-3"
          style={{ '--d': 2 } as React.CSSProperties}
        >
          <span className="pill-red">
            <Icono nombre="shield" />
            Alertas
          </span>
          <ul className="mt-3 space-y-3 text-sm" data-testid="alertas-documentacion">
            {filasAlerta.map(([texto, n]) => (
              <li key={texto} className="flex justify-between">
                <span>{texto}</span>
                <b className={n > 0 ? 'text-red-600' : 'text-mute'}>{n}</b>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="tile-volt rise md:col-span-3 xl:col-span-4"
          style={{ '--d': 3 } as React.CSSProperties}
        >
          <Icono nombre="spark" className="size-7" />
          <h3 className="mt-3 text-2xl font-bold leading-tight tracking-tight">Verificación con selfie</h3>
          <p className="mt-1 text-sm text-ink/70">
            Antes del partido, cada jugador se valida con una foto comparada contra su DNI.
          </p>
          <p className="mt-3 rounded-2xl bg-ink/10 px-3 py-2 text-xs font-semibold" data-testid="selfie">
            {p.selfie.habilitada ? 'Activada' : 'No disponible todavía'} · {p.selfie.detalle}
          </p>
        </section>
      </div>

      <Requisitos torneoId={p.torneo.id} inicial={p.torneo.requeridos} />
      {duplicados.length > 0 && <Duplicados lista={duplicados} />}
      <TablaDocumentacion filas={p.filas} torneoId={p.torneo.id} />
    </div>
  );
}
