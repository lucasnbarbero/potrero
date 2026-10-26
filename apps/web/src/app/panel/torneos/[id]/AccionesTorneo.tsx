'use client';
// Acciones del encabezado del torneo: editar y cambiar el estado (cerrar o reabrir la inscripción, finalizar).
import { Icono, type NombreIcono } from '@potrero/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MensajeError, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';
import type { ConteosTorneo, DetalleTorneo } from '@/lib/tipos';
import { Dialogo } from './Dialogo';
import { EditarTorneo } from './EditarTorneo';

type Destino = 'INSCRIPCION' | 'EN_CURSO' | 'FINALIZADO';

const CONFIRMACION: Record<Destino, { titulo: string; texto: string; boton: string }> = {
  EN_CURSO: {
    titulo: 'Cerrar inscripción',
    texto:
      'Nadie más se va a poder inscribir desde el sitio ni desde el panel. Los equipos que deben siguen pudiendo pagar.',
    boton: 'Cerrar inscripción',
  },
  INSCRIPCION: {
    titulo: 'Reabrir inscripción',
    texto: 'El link de inscripción vuelve a funcionar hasta completar el cupo.',
    boton: 'Reabrir inscripción',
  },
  FINALIZADO: {
    titulo: 'Finalizar torneo',
    texto:
      'El torneo pasa a la historia: la tabla y las estadísticas quedan como están y ya no se cobran cuotas por fecha.',
    boton: 'Finalizar torneo',
  },
};

export function AccionesTorneo({ torneo: t }: { torneo: DetalleTorneo & ConteosTorneo }) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const [editar, setEditar] = useState(false);
  const [destino, setDestino] = useState<Destino | null>(null);
  const { sinJugar, total } = t.partidos;
  const acciones: { destino: Destino; texto: string; icono: NombreIcono }[] = [];
  if (t.estado === 'INSCRIPCION')
    acciones.push({ destino: 'EN_CURSO', texto: 'Cerrar inscripción', icono: 'lock' });
  if (t.estado === 'EN_CURSO' && total === 0)
    acciones.push({ destino: 'INSCRIPCION', texto: 'Reabrir inscripción', icono: 'users' });
  if (t.estado === 'INSCRIPCION' || t.estado === 'EN_CURSO')
    acciones.push({ destino: 'FINALIZADO', texto: 'Finalizar torneo', icono: 'flag' });
  if (t.estado === 'FINALIZADO')
    acciones.push({ destino: 'EN_CURSO', texto: 'Reabrir torneo', icono: 'swap' });
  const c = destino
    ? t.estado === 'FINALIZADO'
      ? {
          titulo: 'Reabrir torneo',
          texto: 'El torneo vuelve a estar en curso.',
          boton: 'Reabrir torneo',
        }
      : CONFIRMACION[destino]
    : null;
  return (
    <>
      <button className="btn-glass btn-sm" onClick={() => setEditar(true)}>
        <Icono nombre="gear" />
        Editar
      </button>
      {acciones.map((a) => (
        <button key={a.texto} className="btn-glass btn-sm" onClick={() => setDestino(a.destino)}>
          <Icono nombre={a.icono} />
          {a.texto}
        </button>
      ))}
      {editar && (
        <Dialogo titulo="Editar torneo" cerrar={() => setEditar(false)}>
          <EditarTorneo torneo={t} listo={() => setEditar(false)} />
        </Dialogo>
      )}
      {destino && c && (
        <Dialogo titulo={c.titulo} cerrar={() => setDestino(null)}>
          <div className="space-y-3">
            <p className="text-sm">{c.texto}</p>
            {destino === 'FINALIZADO' && sinJugar > 0 && (
              <p role="alert" className="rounded-2xl bg-amber-100 px-4 py-3 text-sm font-semibold">
                {sinJugar > 1 ? `Quedan ${sinJugar} partidos sin jugar` : 'Queda 1 partido sin jugar'}. Si
                finalizás, no se juegan y la tabla queda como está.
              </p>
            )}
            <MensajeError error={error} />
            <div className="flex gap-2">
              <button
                className={destino === 'FINALIZADO' ? 'btn flex-1' : 'btn-volt flex-1'}
                disabled={enviando}
                onClick={() =>
                  enviar(async () => {
                    await api('PATCH', `/torneos/${t.id}/estado`, { estado: destino, confirmar: true });
                    setDestino(null);
                    router.refresh();
                  })
                }
              >
                {enviando ? 'Guardando…' : c.boton}
              </button>
              <button className="btn-glass" onClick={() => setDestino(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </Dialogo>
      )}
    </>
  );
}
