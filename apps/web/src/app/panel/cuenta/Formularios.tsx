'use client';
// Formularios de "Mi cuenta" (E04-02, E04-10, E04-14).
import { Icono } from '@potrero/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Campo, MensajeError, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';
import { cambiarOrganizacion } from '@/lib/cuenta';
import { limpiarSinConexion } from '@/lib/sin-conexion';
import { NOMBRE_ROL, type MiCuenta } from '@/lib/tipos-panel';

function LinkSimulado({ href }: { href: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-black/20 bg-black/5 px-4 py-3 text-xs text-mute">
      <b className="block text-ink">Email simulado (modo desarrollo)</b>
      No hay proveedor de email todavía.{' '}
      <a
        href={href.replace(/^https?:\/\/[^/]+/, '')}
        className="font-semibold text-ink underline"
        data-testid="link-dev"
      >
        Abrir el link de verificación
      </a>
    </p>
  );
}

export function VerificarEmail({ verificado, email }: { verificado: boolean; email: string }) {
  const { enviando, error, enviar } = useEnvio();
  const [link, setLink] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  if (verificado)
    return (
      <p className="flex items-center gap-2 text-sm">
        <span className="pill-volt">
          <Icono nombre="check" />
          Email verificado
        </span>
        <span className="truncate text-mute">{email}</span>
      </p>
    );
  return (
    <div className="space-y-2 rounded-2xl bg-amber-50 p-4 text-sm" data-testid="email-sin-verificar">
      <p>
        <b>Tu email todavía no está verificado.</b> Lo usamos para recuperar la contraseña y para avisos
        importantes.
      </p>
      <button
        className="btn-glass btn-sm"
        disabled={enviando || enviado}
        onClick={() =>
          enviar(async () => {
            const r = await api<{ linkDev?: string }>('POST', '/cuenta/verificacion');
            setEnviado(true);
            setLink(r.linkDev ?? null);
          })
        }
      >
        {enviado ? 'Te mandamos el link' : enviando ? 'Enviando…' : 'Mandarme el link de verificación'}
      </button>
      {link && <LinkSimulado href={link} />}
      <MensajeError error={error} />
    </div>
  );
}

export function Perfil({ nombre, email }: { nombre: string; email: string }) {
  const router = useRouter();
  const { enviando, error, campos, enviar } = useEnvio();
  const [nuevoEmail, setNuevoEmail] = useState(email);
  const [ok, setOk] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const cambiaEmail = nuevoEmail.trim().toLowerCase() !== email;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setOk(null);
        enviar(async () => {
          const r = await api<{ verificacionEnviada: boolean; linkDev?: string }>('PATCH', '/cuenta', {
            nombre: f.get('nombre'),
            email: f.get('email'),
            ...(cambiaEmail ? { password: f.get('password') } : {}),
          });
          setOk(
            r.verificacionEnviada
              ? 'Guardado. Te mandamos un link para verificar el email nuevo.'
              : 'Guardado.',
          );
          setLink(r.linkDev ?? null);
          router.refresh();
        });
      }}
    >
      <Campo etiqueta="Nombre" name="nombre" defaultValue={nombre} required error={campos.nombre} />
      <Campo
        etiqueta="Email"
        name="email"
        type="email"
        value={nuevoEmail}
        onChange={(e) => setNuevoEmail(e.target.value)}
        required
        error={campos.email}
      />
      {cambiaEmail && (
        <Campo
          etiqueta="Tu contraseña actual"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          ayuda="Para cambiar el email te la pedimos por seguridad."
        />
      )}
      <MensajeError error={error} />
      {ok && <p className="text-sm font-medium text-green-700">{ok}</p>}
      {link && <LinkSimulado href={link} />}
      <button className="btn-volt" disabled={enviando}>
        {enviando ? 'Guardando…' : 'Guardar cambios'}
      </button>
    </form>
  );
}

export function CambiarPassword() {
  const { enviando, error, campos, enviar } = useEnvio();
  const [ok, setOk] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        setOk(false);
        enviar(async () => {
          await api('POST', '/cuenta/password', { actual: f.get('actual'), nueva: f.get('nueva') });
          form.reset();
          setOk(true);
        });
      }}
    >
      <Campo
        etiqueta="Contraseña actual"
        name="actual"
        type="password"
        autoComplete="current-password"
        required
        error={campos.actual}
      />
      <Campo
        etiqueta="Contraseña nueva"
        name="nueva"
        type="password"
        autoComplete="new-password"
        minLength={10}
        required
        ayuda="Al menos 10 caracteres."
        error={campos.nueva}
      />
      <MensajeError error={error} />
      {ok && (
        <p className="text-sm font-medium text-green-700">
          Listo. Cambiamos tu contraseña y cerramos la sesión en los otros dispositivos.
        </p>
      )}
      <button className="btn-volt" disabled={enviando}>
        {enviando ? 'Cambiando…' : 'Cambiar contraseña'}
      </button>
    </form>
  );
}

/** Lista de organizaciones del usuario con la activa marcada; cambiar recarga el panel con la otra. */
export function Organizaciones({ organizaciones }: { organizaciones: MiCuenta['organizaciones'] }) {
  const { enviando, error, enviar } = useEnvio();
  return (
    <div>
      <ul>
        {organizaciones.map((o) => (
          <li key={o.id} className="list-row">
            <div className="min-w-0 flex-1">
              <b className="block truncate text-sm">{o.nombre}</b>
              <span className="text-xs text-mute">{NOMBRE_ROL[o.rol] ?? o.rol}</span>
            </div>
            {o.activa ? (
              <span className="pill-volt">Activa</span>
            ) : (
              <button
                className="btn-glass btn-sm"
                disabled={enviando}
                onClick={() => enviar(() => cambiarOrganizacion(o.id))}
              >
                Cambiar a esta
              </button>
            )}
          </li>
        ))}
      </ul>
      <MensajeError error={error} />
    </div>
  );
}

export function CerrarSesiones() {
  const { enviando, error, enviar } = useEnvio();
  const [confirmar, setConfirmar] = useState(false);
  return (
    <div className="space-y-2">
      {confirmar ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">¿Seguro? Vas a tener que volver a ingresar.</span>
          <button
            className="btn btn-sm"
            disabled={enviando}
            onClick={() =>
              enviar(async () => {
                await api('POST', '/cuenta/cerrar-sesiones');
                await limpiarSinConexion();
                window.location.href = '/ingresar';
              })
            }
          >
            Sí, cerrar todas
          </button>
          <button className="btn-glass btn-sm" onClick={() => setConfirmar(false)}>
            Cancelar
          </button>
        </div>
      ) : (
        <button className="btn-glass" onClick={() => setConfirmar(true)}>
          <Icono nombre="lock" />
          Cerrar sesión en todos los dispositivos
        </button>
      )}
      <p className="text-xs text-mute">
        En los otros dispositivos la sesión termina en 15 minutos como máximo.
      </p>
      <MensajeError error={error} />
    </div>
  );
}
