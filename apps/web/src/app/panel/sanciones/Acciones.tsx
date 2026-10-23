'use client';
import { Icono } from '@potrero/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Campo, MensajeError, Selector, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';
import type { ExpedienteVista } from '@/lib/tipos';

/** Informe del árbitro, descargo del capitán y resolución del tribunal, todo en la tarjeta del expediente. */
export function AccionesExpediente({ e }: { e: ExpedienteVista }) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const [panel, setPanel] = useState<'' | 'descargo' | 'informe' | 'resolver'>('');
  const texto = (campo: string) => (f: FormData) => (f.get(campo) as string) ?? '';
  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-2">
        <button className="btn-glass btn-sm" onClick={() => setPanel(panel === 'resolver' ? '' : 'resolver')}>
          <Icono nombre="check" />
          Resolver
        </button>
        <button className="btn-glass btn-sm" onClick={() => setPanel(panel === 'descargo' ? '' : 'descargo')}>
          {e.descargo ? 'Editar descargo' : 'Cargar descargo'}
        </button>
        <button className="btn-glass btn-sm" onClick={() => setPanel(panel === 'informe' ? '' : 'informe')}>
          {e.informeArbitro ? 'Editar informe' : 'Cargar informe'}
        </button>
      </div>
      {panel === 'resolver' && (
        <form
          className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] sm:items-end"
          onSubmit={(ev) => {
            ev.preventDefault();
            const f = new FormData(ev.currentTarget);
            enviar(async () => {
              await api('POST', `/expedientes/${e.id}/resolver`, {
                partidos: Number(f.get('partidos')),
                multa: f.get('multa') ? Number(f.get('multa')) : 0,
                resolucion: texto('resolucion')(f),
              });
              setPanel('');
              router.refresh();
            });
          }}
        >
          <Campo
            etiqueta="Partidos de suspensión"
            name="partidos"
            type="number"
            min={0}
            max={20}
            required
            defaultValue={e.sugeridos}
            ayuda={`El reglamento sugiere ${e.sugeridos}. Podés ampliar o reducir.`}
          />
          <Campo etiqueta="Multa al equipo ($)" name="multa" type="number" min={0} placeholder="0" />
          <Campo etiqueta="Fundamento" name="resolucion" required minLength={3} />
          <button className="btn" disabled={enviando}>
            Confirmar resolución
          </button>
        </form>
      )}
      {(panel === 'descargo' || panel === 'informe') && (
        <form
          className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
          onSubmit={(ev) => {
            ev.preventDefault();
            const f = new FormData(ev.currentTarget);
            enviar(async () => {
              if (panel === 'descargo')
                await api('POST', `/expedientes/${e.id}/descargo`, { descargo: texto('texto')(f) });
              else await api('POST', `/expedientes/${e.id}/informe`, { informeArbitro: texto('texto')(f) });
              setPanel('');
              router.refresh();
            });
          }}
        >
          <Campo
            etiqueta={panel === 'descargo' ? 'Descargo del capitán' : 'Informe del árbitro'}
            name="texto"
            required
            minLength={3}
            defaultValue={(panel === 'descargo' ? e.descargo : e.informeArbitro) ?? ''}
          />
          <button className="btn" disabled={enviando}>
            Guardar
          </button>
        </form>
      )}
      <MensajeError error={error} />
    </div>
  );
}

const TIPOS = [
  ['AGRESION', 'Agresión'],
  ['INCIDENTE_HINCHADA', 'Incidente de la hinchada'],
  ['ROJA_DIRECTA', 'Roja directa'],
  ['OTRO', 'Otro'],
] as const;

/** Abrir un expediente a mano: un caso que no salió del acta (agresión, hinchada). */
export function AbrirExpediente({
  torneoId,
  equipos,
}: {
  torneoId: string;
  equipos: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const [abierto, setAbierto] = useState(false);
  if (!abierto)
    return (
      <button className="btn-volt" onClick={() => setAbierto(true)}>
        <Icono nombre="plus" />
        Abrir expediente
      </button>
    );
  return (
    <form
      data-testid="form-expediente"
      className="tile grid w-full gap-3 sm:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] sm:items-end"
      onSubmit={(ev) => {
        ev.preventDefault();
        const f = new FormData(ev.currentTarget);
        enviar(async () => {
          await api('POST', '/expedientes', {
            tipo: f.get('tipo'),
            torneoId,
            equipoId: f.get('equipoId'),
            motivo: f.get('motivo'),
            informeArbitro: (f.get('informeArbitro') as string) || undefined,
          });
          setAbierto(false);
          router.refresh();
        });
      }}
    >
      <Selector etiqueta="Tipo" name="tipo">
        {TIPOS.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </Selector>
      <Selector etiqueta="Equipo" name="equipoId">
        {equipos.map((q) => (
          <option key={q.id} value={q.id}>
            {q.nombre}
          </option>
        ))}
      </Selector>
      <Campo etiqueta="Motivo" name="motivo" required minLength={3} />
      <Campo etiqueta="Informe del árbitro" name="informeArbitro" />
      <button className="btn" disabled={enviando}>
        Abrir
      </button>
      <div className="sm:col-span-full">
        <MensajeError error={error} />
      </div>
    </form>
  );
}
