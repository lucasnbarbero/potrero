'use client';
// Torneos por fases (ADR-026): genera una fase cuando sus equipos están definidos, con las canchas y franjas elegidas.
import { Icono } from '@potrero/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Campo, MensajeError, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';
import type { Sede } from '@/lib/tipos';
import type { FaseVista } from '@/lib/tipos-fases';

export function GenerarFase({
  torneoId,
  fase,
  sedes,
  primerDiaSugerido,
}: {
  torneoId: string;
  fase: FaseVista;
  sedes: Sede[];
  primerDiaSugerido: string;
}) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const canchas = sedes.flatMap((s) => s.canchas.map((c) => ({ ...c, sede: s.nombre })));
  const [elegidas, setElegidas] = useState(canchas.map((c) => c.id));
  const eliminacion = fase.tipo === 'ELIMINACION';
  if (canchas.length === 0)
    return (
      <p className="text-sm text-mute">
        Primero cargá al menos una cancha en{' '}
        <a href="/panel/canchas" className="font-semibold text-ink underline">
          Canchas
        </a>
        .
      </p>
    );
  return (
    <form
      aria-label={`Generar ${fase.nombre}`}
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void enviar(async () => {
          await api('POST', `/torneos/${torneoId}/fases/${fase.id}/generar`, {
            primerDia: f.get('primerDia'),
            diasEntreFechas: Number(f.get('diasEntreFechas')),
            horarios: String(f.get('horarios'))
              .split(',')
              .map((h) => h.trim())
              .filter(Boolean),
            canchaIds: elegidas,
          });
          router.refresh();
        });
      }}
    >
      <Campo
        etiqueta="Primer día de juego"
        name="primerDia"
        type="date"
        defaultValue={primerDiaSugerido}
        required
      />
      <Campo
        etiqueta={eliminacion ? 'Días entre partidos' : 'Días entre fechas'}
        name="diasEntreFechas"
        type="number"
        defaultValue={7}
        min={1}
        ayuda={eliminacion ? 'Entre la ida y la vuelta, y entre rondas.' : undefined}
      />
      <Campo
        etiqueta="Horarios"
        name="horarios"
        defaultValue="19:00, 20:00, 21:00"
        ayuda="Separados por coma (HH:MM)."
      />
      <div>
        <span className="field-label">Canchas</span>
        <div className="flex flex-wrap gap-2">
          {canchas.map((c) => {
            const on = elegidas.includes(c.id);
            return (
              <button
                type="button"
                key={c.id}
                onClick={() => setElegidas(on ? elegidas.filter((x) => x !== c.id) : [...elegidas, c.id])}
                className={on ? 'pill-ink' : 'pill'}
              >
                {c.sede} · {c.nombre}
              </button>
            );
          })}
        </div>
      </div>
      <div className="sm:col-span-2">
        <MensajeError error={error} />
      </div>
      <button className="btn-volt sm:col-span-2" disabled={enviando}>
        <Icono nombre="bolt" />
        {enviando ? 'Armando…' : `Generar ${fase.nombre} con ${fase.equipos} equipos`}
      </button>
    </form>
  );
}
