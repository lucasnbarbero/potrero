'use client';
import { DIAS_VENCIMIENTO_INVITACION } from '@potrero/shared';
import { Icono } from '@potrero/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Campo, MensajeError, Selector, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';

type LinkGenerado = { link: string; venceEn: string };

/** El email todavía no sale por un proveedor: se muestra el link para copiarlo o mandarlo por WhatsApp. */
function LinkParaCompartir({ link, texto }: { link: string; texto: string }) {
  const [copiado, setCopiado] = useState(false);
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${texto} ${link}`)}`;
  return (
    <div className="mt-3 rounded-3xl bg-[#e7f7d9] p-4" data-testid="link-invitacion">
      <p className="text-sm font-semibold">
        Listo. Compartile este link (vale {DIAS_VENCIMIENTO_INVITACION} días y se usa una sola vez):
      </p>
      <input
        readOnly
        value={link}
        className="input mt-2 !bg-white font-mono text-xs"
        onFocus={(e) => e.currentTarget.select()}
        aria-label="Link de la invitación"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-sm"
          onClick={async () => {
            await navigator.clipboard?.writeText(link).catch(() => undefined);
            setCopiado(true);
          }}
        >
          <Icono nombre={copiado ? 'check' : 'link'} />
          {copiado ? 'Copiado' : 'Copiar link'}
        </button>
        <a href={whatsapp} target="_blank" rel="noreferrer" className="btn-volt btn-sm">
          <Icono nombre="whatsapp" />
          Mandar por WhatsApp
        </a>
      </div>
    </div>
  );
}

export function Invitar({
  roles,
  equipos,
}: {
  roles: { rol: string; nombre: string }[];
  equipos: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const { enviando, error, campos, enviar } = useEnvio();
  const [rol, setRol] = useState(roles[0]?.rol ?? '');
  const [generado, setGenerado] = useState<(LinkGenerado & { rol: string }) | null>(null);
  if (!roles.length)
    return <p className="mt-3 text-sm text-mute">Tu rol no puede invitar a otras personas.</p>;
  return (
    <>
      <form
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          const f = new FormData(ev.currentTarget);
          const form = ev.currentTarget;
          void enviar(async () => {
            const r = await api<LinkGenerado>('POST', '/usuarios/invitaciones', {
              email: f.get('email'),
              nombre: (f.get('nombre') as string) || undefined,
              rol,
              equipoId: rol === 'CAPITAN' ? f.get('equipoId') : undefined,
            });
            setGenerado({ ...r, rol: roles.find((x) => x.rol === rol)?.nombre ?? rol });
            form.reset();
            router.refresh();
          });
        }}
      >
        <Campo etiqueta="Email" name="email" type="email" required error={campos.email} />
        <Campo etiqueta="Nombre (opcional)" name="nombre" error={campos.nombre} />
        <Selector etiqueta="Rol" name="rol" value={rol} onChange={(e) => setRol(e.target.value)}>
          {roles.map((r) => (
            <option key={r.rol} value={r.rol}>
              {r.nombre}
            </option>
          ))}
        </Selector>
        {rol === 'CAPITAN' ? (
          <Selector etiqueta="Equipo" name="equipoId" required>
            {equipos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </Selector>
        ) : (
          <span className="hidden sm:block" />
        )}
        <div className="sm:col-span-2">
          <MensajeError error={error} />
        </div>
        <button className="btn sm:col-span-2" disabled={enviando}>
          <Icono nombre="send" />
          Crear invitación
        </button>
      </form>
      {generado && (
        <LinkParaCompartir link={generado.link} texto={`Te invito a sumarte como ${generado.rol}:`} />
      )}
    </>
  );
}

export function AccionesInvitacion({ id, email, rol }: { id: string; email: string; rol: string }) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const [link, setLink] = useState<string | null>(null);
  return (
    <div className="w-full sm:w-auto">
      <div className="flex flex-wrap gap-2">
        <button
          className="btn-glass btn-sm"
          disabled={enviando}
          onClick={() =>
            enviar(async () => {
              const r = await api<LinkGenerado>('POST', `/usuarios/invitaciones/${id}/reenviar`);
              setLink(r.link);
              router.refresh();
            })
          }
        >
          <Icono nombre="send" />
          Reenviar
        </button>
        <button
          className="btn-glass btn-sm"
          disabled={enviando}
          onClick={() => {
            if (!confirm(`¿Anular la invitación de ${email}? El link deja de funcionar.`)) return;
            void enviar(async () => {
              await api('POST', `/usuarios/invitaciones/${id}/anular`);
              router.refresh();
            });
          }}
        >
          <Icono nombre="x" />
          Anular
        </button>
      </div>
      {link && <LinkParaCompartir link={link} texto={`Te invito a sumarte como ${rol}:`} />}
      <MensajeError error={error} />
    </div>
  );
}

export function QuitarAcceso({ id, nombre }: { id: string; nombre: string }) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  return (
    <>
      <button
        className="btn-glass btn-sm"
        title="Quitar acceso"
        aria-label={`Quitar acceso a ${nombre}`}
        disabled={enviando}
        onClick={() => {
          if (!confirm(`¿Quitarle el acceso a ${nombre}? Deja de ver la organización al instante.`)) return;
          void enviar(async () => {
            await api('POST', `/usuarios/miembros/${id}/quitar`);
            router.refresh();
          });
        }}
      >
        <Icono nombre="x" />
        <span className="hidden sm:inline">Quitar</span>
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </>
  );
}
