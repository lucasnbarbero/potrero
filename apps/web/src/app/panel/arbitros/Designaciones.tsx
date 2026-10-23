'use client';
import { Icono } from '@potrero/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MensajeError, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';
import { pesos } from '@/lib/formato';
import type { Designaciones } from '@/lib/tipos';

type Partido = Designaciones['partidos'][number];

/** Reparte los árbitros entre los partidos sin árbitro del día: uno por franja, parejo y según su disponibilidad. */
export function DesignarAutomatico({ dia, pendientes }: { dia: string; pendientes: number }) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const [resultado, setResultado] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-2">
      <button
        className="btn-volt btn-sm"
        disabled={enviando || pendientes === 0}
        onClick={() =>
          enviar(async () => {
            const r = await api<{
              designados: number;
              sinAsignar: number;
              detalleSinAsignar: { motivo: string }[];
            }>('POST', '/designaciones/automatico', { dia });
            setResultado(
              r.sinAsignar === 0
                ? `Designamos ${r.designados} ${r.designados === 1 ? 'partido' : 'partidos'}.`
                : `Designamos ${r.designados}. ${r.sinAsignar} quedó sin árbitro: ${r.detalleSinAsignar[0]!.motivo}`,
            );
            router.refresh();
          })
        }
      >
        <Icono nombre="bolt" />
        {enviando ? 'Designando…' : 'Designar automático'}
      </button>
      {resultado && (
        <p
          role="status"
          className="max-w-xs text-right text-xs font-semibold"
          data-testid="resultado-designacion"
        >
          {resultado}
        </p>
      )}
      <MensajeError error={error} />
    </div>
  );
}

/** Elige o cambia el árbitro de un partido y lo marca como confirmado cuando el árbitro avisa. */
export function SelectorArbitro({ partido }: { partido: Partido }) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const [aviso, setAviso] = useState<string | null>(null);
  const designar = (arbitroId: string | null) =>
    enviar(async () => {
      const r = await api<{ advertencia: string | null }>('POST', `/partidos/${partido.id}/arbitro`, {
        arbitroId,
      });
      setAviso(r.advertencia);
      router.refresh();
    });
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {partido.arbitroEstado === 'CONFIRMADO' ? (
          <span className="pill-volt">Confirmado</span>
        ) : partido.arbitroEstado === 'PENDIENTE' ? (
          <button
            className="pill-amber"
            title="Marcar como confirmado por el árbitro"
            disabled={enviando}
            onClick={() =>
              enviar(async () => {
                await api('POST', `/partidos/${partido.id}/arbitro/confirmar`);
                router.refresh();
              })
            }
          >
            Pendiente · confirmar
          </button>
        ) : (
          <span className="pill">Sin asignar · {partido.disponibles.length} disponibles</span>
        )}
        <select
          aria-label={`Árbitro de ${partido.local} y ${partido.visitante}`}
          className="input !w-44 !py-1.5 text-sm"
          value={partido.arbitroId ?? ''}
          disabled={enviando}
          onChange={(e) => designar(e.target.value || null)}
        >
          <option value="">Sin árbitro</option>
          {partido.arbitroId && <option value={partido.arbitroId}>{partido.arbitro}</option>}
          {partido.disponibles.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre} · {pesos(a.tarifa)}
            </option>
          ))}
        </select>
      </div>
      {aviso && <p className="max-w-xs text-right text-xs font-medium text-amber-800">{aviso}</p>}
      {error && <p className="max-w-xs text-right text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
