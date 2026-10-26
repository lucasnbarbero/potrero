'use client';
import { Icono } from '@potrero/ui';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { MensajeError, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';
import type { PanelJugador } from '@/lib/tipos-jugador';

/** "Voy" / "No voy" al próximo partido (E19-02): es la misma convocatoria que ve el capitán. */
export function Asistencia({
  partidoId,
  respuesta,
  suspendido,
}: {
  partidoId: string;
  respuesta: 'VA' | 'NO_VA' | null;
  suspendido: boolean;
}) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const responder = (r: 'VA' | 'NO_VA') =>
    enviar(async () => {
      await api('POST', `/jugador/partidos/${partidoId}/asistencia`, { respuesta: r });
      router.refresh();
    });
  if (suspendido)
    return (
      <p className="mt-5 text-sm font-medium text-red-300">Estás suspendido: no podés jugar este partido.</p>
    );
  return (
    <div className="mt-5" data-testid="asistencia">
      <p className="mb-2 text-sm text-white/60">
        {respuesta === 'VA'
          ? 'Confirmaste que vas. Si cambia algo, avisá.'
          : respuesta === 'NO_VA'
            ? 'Avisaste que no vas.'
            : 'Tu capitán espera tu respuesta.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          className={respuesta === 'VA' ? 'btn-volt' : 'btn-glass'}
          disabled={enviando}
          aria-pressed={respuesta === 'VA'}
          onClick={() => responder('VA')}
        >
          <Icono nombre="check" />
          Voy
        </button>
        <button
          className={respuesta === 'NO_VA' ? 'btn bg-white text-ink' : 'btn-glass'}
          disabled={enviando}
          aria-pressed={respuesta === 'NO_VA'}
          onClick={() => responder('NO_VA')}
        >
          <Icono nombre="x" />
          No voy
        </button>
      </div>
      <MensajeError error={error} />
    </div>
  );
}

const MIME = ['image/jpeg', 'image/png', 'application/pdf'];

/** Subir el DNI o el apto físico (foto o PDF). Queda pendiente hasta que la liga lo revise. */
export function SubirDocumento({ tipo, nombre }: { tipo: string; nombre: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const { enviando, error, enviar } = useEnvio();
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={MIME.join(',')}
        className="hidden"
        data-testid={`subir-${tipo}`}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          void enviar(async () => {
            if (!MIME.includes(f.type)) throw new Error('Subí una foto (JPG o PNG) o un PDF.');
            const contenido = await new Promise<string>((ok, mal) => {
              const r = new FileReader();
              r.onload = () => ok(String(r.result).split(',')[1] ?? '');
              r.onerror = () => mal(new Error('No pudimos leer el archivo.'));
              r.readAsDataURL(f);
            });
            await api('POST', '/jugador/documentos', {
              tipo,
              nombreArchivo: f.name,
              mime: f.type,
              contenido,
            });
            router.refresh();
          });
        }}
      />
      <button
        className="btn-glass btn-sm"
        disabled={enviando}
        onClick={() => input.current?.click()}
        aria-label={`Subir ${nombre}`}
      >
        <Icono nombre="up" />
        {enviando ? 'Subiendo…' : 'Subir'}
      </button>
      <MensajeError error={error} />
    </>
  );
}

const OPCIONES = [
  ['INICIALES', 'Nombre e inicial'],
  ['APODO', 'Apodo'],
  ['COMPLETO', 'Completo'],
] as const;

/** Cómo aparece su nombre en el sitio público de la liga (E20-04), elegido por el propio jugador. */
export function Privacidad({ p, menor }: { p: PanelJugador['privacidad']; menor: boolean }) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const [modo, setModo] = useState(p.nombrePublico);
  const [apodo, setApodo] = useState(p.apodo ?? '');
  const guardar = (nombrePublico: typeof modo) =>
    enviar(async () => {
      await api('PATCH', '/jugador/privacidad', { nombrePublico, apodo: apodo.trim() || null });
      router.refresh();
    });
  return (
    <div data-testid="privacidad">
      <p className="text-sm text-mute">
        En el sitio público aparecés como <b className="text-ink">{p.comoAparece}</b>. Nunca se publican tu
        DNI, tu fecha de nacimiento, tu teléfono ni tu email.
      </p>
      <div className="seg mt-3" role="radiogroup" aria-label="Cómo aparece tu nombre">
        {OPCIONES.map(([v, texto]) => (
          <button
            key={v}
            role="radio"
            aria-checked={modo === v}
            className={modo === v ? 'on' : ''}
            disabled={enviando || (v === 'COMPLETO' && menor)}
            onClick={() => {
              setModo(v);
              if (v !== 'APODO') void guardar(v);
            }}
          >
            {texto}
          </button>
        ))}
      </div>
      {modo === 'APODO' && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void guardar('APODO');
          }}
        >
          <input
            className="input flex-1"
            placeholder="Tu apodo"
            maxLength={30}
            value={apodo}
            onChange={(e) => setApodo(e.target.value)}
            aria-label="Tu apodo"
          />
          <button className="btn btn-sm" disabled={enviando}>
            Guardar
          </button>
        </form>
      )}
      {menor && <p className="mt-2 text-xs text-mute">Por ser menor, tu nombre completo no se publica.</p>}
      <MensajeError error={error} />
    </div>
  );
}
