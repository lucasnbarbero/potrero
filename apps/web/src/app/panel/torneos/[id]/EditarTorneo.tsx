'use client';
// Formulario para editar un torneo: nombre, cupo, inscripción (monto y vencimiento) y reglamento básico.
import { pesos } from '@/lib/formato';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Campo, MensajeError, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';
import type { ConteosTorneo, DetalleTorneo } from '@/lib/tipos';

export function EditarTorneo({
  torneo: t,
  listo,
}: {
  torneo: DetalleTorneo & ConteosTorneo;
  listo: () => void;
}) {
  const router = useRouter();
  const { enviando, error, campos, enviar } = useEnvio();
  const [resultado, setResultado] = useState<string | null>(null);
  const finalizado = t.estado === 'FINALIZADO';
  const [monto, setMonto] = useState(String(t.inscripcion));
  const cambiaMonto = Number(monto) !== t.inscripcion;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const num = (k: string) => Number(f.get(k));
        enviar(async () => {
          const r = await api<{ cargos: { actualizados: number; anulados: number; conservan: number } }>(
            'PATCH',
            `/torneos/${t.id}`,
            finalizado
              ? { nombre: f.get('nombre') }
              : {
                  nombre: f.get('nombre'),
                  cupo: num('cupo'),
                  inscripcion: num('inscripcion'),
                  venceInscripcion: (f.get('vence') as string) || null,
                  puntosVictoria: num('puntosVictoria'),
                  puntosEmpate: num('puntosEmpate'),
                  umbralAmarillas: num('umbralAmarillas'),
                },
          );
          router.refresh();
          const { actualizados, anulados, conservan } = r.cargos;
          if (actualizados || anulados || conservan)
            setResultado(
              [
                actualizados && `${actualizados} cargo(s) actualizados al monto nuevo`,
                anulados && `${anulados} cargo(s) anulados`,
                conservan && `${conservan} con pagos conservan el monto anterior`,
              ]
                .filter(Boolean)
                .join(' · ') + '.',
            );
          else listo();
        });
      }}
    >
      <Campo
        etiqueta="Nombre"
        name="nombre"
        defaultValue={t.nombre}
        required
        maxLength={120}
        error={campos.nombre}
      />
      {finalizado ? (
        <p className="text-sm text-mute">El torneo está finalizado: solo se puede cambiar el nombre.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo
              etiqueta="Cupo de equipos"
              name="cupo"
              type="number"
              min={Math.max(2, t.inscriptos)}
              max={64}
              defaultValue={t.cupo}
              required
              error={campos.cupo}
              ayuda={`Hay ${t.inscriptos} inscriptos: no puede ser menos.`}
            />
            <Campo
              etiqueta="Inscripción por equipo ($)"
              name="inscripcion"
              type="number"
              min={0}
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              required
              error={campos.inscripcion}
            />
          </div>
          <p
            className={`rounded-2xl px-4 py-3 text-xs ${cambiaMonto ? 'bg-amber-100' : 'bg-black/5 text-mute'}`}
          >
            {cambiaMonto
              ? `El monto nuevo (${pesos(Number(monto) || 0)}) se aplica a los inscriptos que todavía no pagaron nada y a los que se inscriban. Los que ya pagaron, aunque sea una parte, conservan el monto con el que se inscribieron.`
              : 'Si cambiás el monto, solo afecta a los equipos que todavía no pagaron nada y a los que se inscriban.'}
            {cambiaMonto &&
              Number(monto) === 0 &&
              ' Con $ 0, sus cargos de inscripción se anulan y quedan confirmados.'}
          </p>
          <Campo
            etiqueta="Vence el pago de la inscripción"
            name="vence"
            type="date"
            defaultValue={t.venceInscripcion?.slice(0, 10) ?? ''}
          />
          <fieldset className="grid gap-3 sm:grid-cols-3">
            <legend className="field-label">Reglamento</legend>
            <Campo
              etiqueta="Puntos por ganar"
              name="puntosVictoria"
              type="number"
              min={0}
              max={10}
              defaultValue={t.reglamento.puntosVictoria}
            />
            <Campo
              etiqueta="Puntos por empatar"
              name="puntosEmpate"
              type="number"
              min={0}
              max={10}
              defaultValue={t.reglamento.puntosEmpate}
            />
            <Campo
              etiqueta="Amarillas para suspensión"
              name="umbralAmarillas"
              type="number"
              min={1}
              max={20}
              defaultValue={t.reglamento.umbralAmarillas}
            />
          </fieldset>
          {t.partidos.total > t.partidos.sinJugar && (
            <p className="text-xs text-mute">
              Ya hay partidos jugados: si cambiás los puntos, la tabla se recalcula con los nuevos.
            </p>
          )}
        </>
      )}
      <MensajeError error={error} />
      {resultado && !error && (
        <p className="rounded-2xl bg-volt/40 px-4 py-3 text-sm font-semibold">Guardado. {resultado}</p>
      )}
      {resultado ? (
        <button type="button" className="btn w-full" onClick={listo}>
          Listo
        </button>
      ) : (
        <button className="btn-volt w-full" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      )}
    </form>
  );
}
