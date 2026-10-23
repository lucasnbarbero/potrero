'use client';
import { useEffect, useState } from 'react';
import { MensajeError, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';

interface Datos {
  liga: string;
  destinatario: string;
  mensaje: string;
  respuesta: 'CONFIRMO' | 'NO_PUEDO' | null;
}

/** El capitán responde "Confirmo" o "No puedo". Puede cambiar de opinión: queda la última respuesta. */
export function Confirmar({ token }: { token: string }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [noExiste, setNoExiste] = useState(false);
  const { enviando, error, enviar } = useEnvio();

  useEffect(() => {
    api<Datos>('GET', `/confirmaciones/${token}`)
      .then(setDatos)
      .catch(() => setNoExiste(true));
  }, [token]);

  if (noExiste)
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tighter">Este link no es válido</h1>
        <p className="text-mute">
          Puede que esté mal copiado. Pedile a tu organizador que te lo mande de nuevo.
        </p>
      </div>
    );
  if (!datos) return <p className="text-mute">Cargando…</p>;

  const responder = (respuesta: 'CONFIRMO' | 'NO_PUEDO') =>
    enviar(async () => {
      await api('POST', `/confirmaciones/${token}`, { respuesta });
      setDatos({ ...datos, respuesta });
    });

  return (
    <div className="space-y-4">
      <p className="eyebrow">{datos.liga}</p>
      <h1 className="text-3xl font-bold tracking-tighter">Hola {datos.destinatario}!</h1>
      <p className="rounded-3xl bg-[#e7f7d9] p-4 text-sm leading-relaxed" data-testid="mensaje-confirmacion">
        {/* El link es esta misma página: no hace falta mostrarlo. */}
        {datos.mensaje.replace(/\s*https?:\/\/\S+/g, '').trim()}
      </p>
      {datos.respuesta && (
        <p
          role="status"
          className="rounded-2xl bg-volt/40 px-4 py-3 text-sm font-semibold"
          data-testid="respuesta-registrada"
        >
          {datos.respuesta === 'CONFIRMO'
            ? '¡Gracias! Quedó confirmado que podés jugar.'
            : 'Gracias por avisar. Tu organizador ya sabe que no podés y se va a comunicar.'}{' '}
          Si cambia algo, podés responder de nuevo.
        </p>
      )}
      <MensajeError error={error} />
      <div className="grid grid-cols-2 gap-3">
        <button
          className={`btn-lg ${datos.respuesta === 'CONFIRMO' ? 'btn-volt' : 'btn'}`}
          disabled={enviando}
          onClick={() => responder('CONFIRMO')}
        >
          Confirmo
        </button>
        <button
          className={`btn-lg ${datos.respuesta === 'NO_PUEDO' ? 'btn-volt' : 'btn-glass'}`}
          disabled={enviando}
          onClick={() => responder('NO_PUEDO')}
        >
          No puedo
        </button>
      </div>
    </div>
  );
}
