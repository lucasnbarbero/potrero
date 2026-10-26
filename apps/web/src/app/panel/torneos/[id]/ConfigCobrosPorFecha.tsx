'use client';
// Configuración de la cuota por fecha y del seguro por jugador del torneo (E06-20, E06-21).
import type { ConfigCobrosPorFecha as Config } from '@potrero/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Campo, MensajeError, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';

const OPCIONES: [keyof Config, string, string][] = [
  ['cobrarWO', 'Cobrar el W.O.', 'El partido perdido por W.O. se cobra igual.'],
  ['cobrarFechaLibre', 'Cobrar la fecha libre', 'El equipo que descansa paga la cuota de esa fecha.'],
  ['cobrarPartidoSuspendido', 'Cobrar el partido suspendido', 'Si no, la cuota pendiente se anula sola.'],
  [
    'deudaBloqueaJugar',
    'La deuda vencida no deja jugar',
    'El acta avisa que el equipo con cuotas vencidas no está habilitado.',
  ],
];

export function ConfigCobrosPorFecha({ torneoId, inicial }: { torneoId: string; inicial: Config }) {
  const router = useRouter();
  const { enviando, error, campos, enviar } = useEnvio();
  const [config, setConfig] = useState(inicial);
  const [resultado, setResultado] = useState<string | null>(null);
  const cambiar = (k: keyof Config, v: number | boolean) => setConfig((c) => ({ ...c, [k]: v }));
  return (
    <form
      className="space-y-4"
      data-testid="config-cobros-por-fecha"
      onSubmit={(e) => {
        e.preventDefault();
        setResultado(null);
        enviar(async () => {
          const r = await api<{ creados: number; actualizados: number; anulados: number }>(
            'PATCH',
            `/torneos/${torneoId}/cobros-por-fecha`,
            config,
          );
          const partes = [
            r.creados && `${r.creados} cargo${r.creados > 1 ? 's' : ''} nuevo${r.creados > 1 ? 's' : ''}`,
            r.actualizados && `${r.actualizados} actualizado${r.actualizados > 1 ? 's' : ''}`,
            r.anulados && `${r.anulados} anulado${r.anulados > 1 ? 's' : ''}`,
          ].filter(Boolean);
          setResultado(`Guardado.${partes.length ? ` ${partes.join(', ')}.` : ''}`);
          router.refresh();
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          etiqueta="Cuota por fecha, por equipo ($)"
          name="cuotaPorFecha"
          type="number"
          min={0}
          step={500}
          value={config.cuotaPorFecha}
          onChange={(e) => cambiar('cuotaPorFecha', Number(e.target.value))}
          error={campos.cuotaPorFecha}
          ayuda="0 = no se cobra."
        />
        <Campo
          etiqueta="Seguro por jugador, por fecha ($)"
          name="seguroPorJugadorPorFecha"
          type="number"
          min={0}
          step={100}
          value={config.seguroPorJugadorPorFecha}
          onChange={(e) => cambiar('seguroPorJugadorPorFecha', Number(e.target.value))}
          error={campos.seguroPorJugadorPorFecha}
          ayuda="Por cada jugador del plantel, juegue o no. Va al rubro Seguros de la caja."
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {OPCIONES.map(([k, titulo, detalle]) => (
          <label key={k} className="flex items-start gap-3 rounded-2xl bg-black/5 p-3 text-sm">
            <input
              type="checkbox"
              name={k}
              checked={config[k] as boolean}
              onChange={(e) => cambiar(k, e.target.checked)}
              className="mt-0.5 size-5 shrink-0 accent-black"
            />
            <span>
              <b className="block">{titulo}</b>
              <span className="text-xs text-mute">{detalle}</span>
            </span>
          </label>
        ))}
      </div>
      {(inicial.cuotaDesdeFecha ?? 1) > 1 || (inicial.seguroDesdeFecha ?? 1) > 1 ? (
        <p className="text-xs text-mute" data-testid="cobros-desde-fecha">
          Se activó con el torneo empezado: las fechas ya jugadas no se cobran.
          {inicial.cuotaPorFecha > 0 && ` Cuota desde la fecha ${inicial.cuotaDesdeFecha ?? 1}.`}
          {inicial.seguroPorJugadorPorFecha > 0 && ` Seguro desde la fecha ${inicial.seguroDesdeFecha ?? 1}.`}
        </p>
      ) : (
        <p className="text-xs text-mute">
          Si lo activás con el torneo empezado, se cobra desde la próxima fecha.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar cobros por fecha'}
        </button>
        {resultado && !error && <p className="text-xs font-semibold">{resultado}</p>}
      </div>
      <MensajeError error={error} />
    </form>
  );
}
