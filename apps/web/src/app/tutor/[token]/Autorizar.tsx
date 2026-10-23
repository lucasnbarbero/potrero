'use client';
import { useEffect, useState } from 'react';
import { Campo, MensajeError, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';

interface Datos {
  liga: string;
  jugador: string;
  textos: { tipo: 'TUTOR_PARTICIPACION' | 'IMAGEN'; version: number; titulo: string; texto: string }[];
}

/** El tutor lee el texto vigente, se identifica y autoriza. El uso de imagen es aparte y opcional. */
export function Autorizar({ token }: { token: string }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [invalido, setInvalido] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const { enviando, error, campos, enviar } = useEnvio();

  useEffect(() => {
    api<Datos>('GET', `/consentimientos-tutor/${token}`)
      .then(setDatos)
      .catch((e: Error) => setInvalido(e.message));
  }, [token]);

  if (invalido)
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tighter">Este link no sirve</h1>
        <p className="text-mute">{invalido}</p>
      </div>
    );
  if (!datos) return <p className="text-mute">Cargando…</p>;
  if (listo)
    return (
      <div className="space-y-2" role="status" data-testid="autorizacion-lista">
        <h1 className="text-2xl font-bold tracking-tighter">¡Gracias!</h1>
        <p className="text-mute">
          Registramos tu autorización para que {datos.jugador} juegue en {datos.liga}. Podés pedirle a la liga
          que la revoque cuando quieras.
        </p>
      </div>
    );

  const [participacion, imagen] = datos.textos;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        void enviar(async () => {
          await api('POST', `/consentimientos-tutor/${token}`, {
            tutorNombre: d.get('nombre'),
            tutorDni: d.get('dni'),
            vinculo: d.get('vinculo'),
            imagen: d.get('imagen') === 'on',
          });
          setListo(true);
        });
      }}
    >
      <p className="eyebrow">{datos.liga}</p>
      <h1 className="text-3xl font-bold tracking-tighter">Autorización para {datos.jugador}</h1>
      <p className="rounded-3xl bg-[#e7f7d9] p-4 text-sm leading-relaxed">{participacion?.texto}</p>
      <Campo etiqueta="Tu nombre y apellido" name="nombre" required error={campos.tutorNombre} />
      <Campo etiqueta="Tu DNI" name="dni" required error={campos.tutorDni} />
      <label className="block">
        <span className="field-label">Vínculo</span>
        <select name="vinculo" className="input" defaultValue="MADRE">
          <option value="MADRE">Madre</option>
          <option value="PADRE">Padre</option>
          <option value="TUTOR">Tutor</option>
        </select>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="imagen" className="mt-1 size-4" />
        <span>
          <b>Uso de imagen (opcional).</b> {imagen?.texto}
        </span>
      </label>
      <MensajeError error={error} />
      <button className="btn-lg btn w-full" disabled={enviando}>
        Autorizo
      </button>
    </form>
  );
}
