'use client';
import { DATOS } from '@potrero/shared';
import { useEffect, useState } from 'react';
import { Campo, MensajeError, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';
import type { InvitacionPublica } from '@/lib/tipos-capitan';

const NO_VALE: Record<string, string> = {
  ACEPTADA: 'Esta invitación ya se usó. Si sos vos, iniciá sesión con tu cuenta.',
  RECHAZADA: 'Esta invitación fue rechazada.',
  ANULADA: 'Esta invitación fue anulada. Pedile una nueva a quien te invitó.',
  VENCIDA: 'Esta invitación venció. Pedile a quien te invitó que la reenvíe.',
};

/** El invitado ve a qué organización y con qué rol lo suman, y acepta creando su cuenta o con la que ya tiene. */
export function Aceptar({ token }: { token: string }) {
  const [datos, setDatos] = useState<InvitacionPublica | null>(null);
  const [invalido, setInvalido] = useState<string | null>(null);
  const [rechazada, setRechazada] = useState(false);
  const { enviando, error, campos, enviar } = useEnvio();

  useEffect(() => {
    api<InvitacionPublica>('GET', `/invitaciones/${token}`)
      .then((d) => (d.estado === 'PENDIENTE' ? setDatos(d) : setInvalido(NO_VALE[d.estado] ?? 'No vale.')))
      .catch((e: Error) => setInvalido(e.message));
  }, [token]);

  if (invalido)
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold tracking-tighter">Este link no sirve</h1>
        <p className="text-mute">{invalido}</p>
        <a href="/ingresar" className="btn-glass btn-sm">
          Ir a iniciar sesión
        </a>
      </div>
    );
  if (!datos) return <p className="text-mute">Cargando…</p>;
  if (rechazada)
    return (
      <div className="space-y-2" role="status">
        <h1 className="text-2xl font-bold tracking-tighter">Listo</h1>
        <p className="text-mute">Rechazaste la invitación de {datos.organizacion}.</p>
      </div>
    );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void enviar(async () => {
          await api('POST', `/invitaciones/${token}/aceptar`, {
            nombre: datos.tieneCuenta ? undefined : f.get('nombre'),
            password: f.get('password'),
            terminosVersion: datos.terminos && f.get('terminos') ? datos.terminos.version : undefined,
          });
          window.location.href =
            datos.rol === 'CAPITAN' ? '/capitan' : datos.rol === 'JUGADOR' ? '/jugador' : '/panel';
        });
      }}
    >
      <p className="eyebrow">{datos.organizacion}</p>
      <h1 className="text-3xl font-bold tracking-tighter">
        Te invitaron como {datos.rolNombre.toLowerCase()}
        {datos.equipo ? ` de ${datos.equipo}` : ''}
      </h1>
      <p className="text-sm text-mute">
        {datos.tieneCuenta
          ? `Ya tenés una cuenta con ${datos.email}: ingresá tu contraseña para sumarte.`
          : `Creá tu cuenta con ${datos.email} para sumarte.`}
      </p>
      {!datos.tieneCuenta && (
        <Campo
          etiqueta="Tu nombre y apellido"
          name="nombre"
          required
          defaultValue={datos.nombre ?? ''}
          error={campos.nombre}
        />
      )}
      <Campo
        etiqueta={datos.tieneCuenta ? 'Tu contraseña' : 'Elegí una contraseña'}
        name="password"
        type="password"
        required
        minLength={datos.tieneCuenta ? 1 : 10}
        autoComplete={datos.tieneCuenta ? 'current-password' : 'new-password'}
        ayuda={
          datos.tieneCuenta ? undefined : `Al menos ${DATOS.cuentas.contrasenaMinimaCaracteres} caracteres.`
        }
        error={campos.password}
      />
      {datos.terminos && (
        <label className="flex items-start gap-3 rounded-2xl bg-black/5 p-4 text-sm">
          <input type="checkbox" name="terminos" required className="mt-1 size-4 accent-ink" />
          <span>
            <b className="block">{datos.terminos.titulo}</b>
            <span className="text-mute">{datos.terminos.texto}</span>
          </span>
        </label>
      )}
      <MensajeError error={error} />
      <button className="btn btn-lg w-full" disabled={enviando}>
        {datos.tieneCuenta ? 'Entrar y aceptar' : 'Crear cuenta y aceptar'}
      </button>
      <button
        type="button"
        className="w-full text-sm font-semibold text-mute hover:text-ink"
        disabled={enviando}
        onClick={() =>
          enviar(async () => {
            await api('POST', `/invitaciones/${token}/rechazar`);
            setRechazada(true);
          })
        }
      >
        No, gracias
      </button>
    </form>
  );
}
