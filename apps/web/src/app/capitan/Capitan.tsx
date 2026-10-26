'use client';
import { Icono } from '@potrero/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Campo, MensajeError, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';
import { iniciales } from '@/lib/formato';
import { limpiarSinConexion } from '@/lib/sin-conexion';
import type { PanelCapitan } from '@/lib/tipos-capitan';

type Jugador = PanelCapitan['plantel'][number];

export function Salir({ nombre }: { nombre: string }) {
  return (
    <button
      className="flex items-center gap-2 rounded-full bg-white/80 py-1 pl-1 pr-3.5 text-sm font-semibold hover:bg-white"
      title="Cerrar sesión"
      onClick={async () => {
        await api('POST', '/auth/salir');
        await limpiarSinConexion();
        window.location.href = '/ingresar';
      }}
    >
      <span className="grid size-8 place-items-center rounded-full bg-ink text-xs font-bold text-volt">
        {iniciales(nombre)}
      </span>
      <span className="hidden sm:inline">Salir</span>
    </button>
  );
}

const PILL: Record<string, [string, string]> = {
  VA: ['pill-volt', 'Va'],
  NO_VA: ['pill', 'No va'],
  PENDIENTE: ['pill-amber', 'Pendiente'],
  SUSPENDIDO: ['pill-red', 'Suspendido'],
};

/** Convocatoria del próximo partido (E19-02): el capitán anota quién va y quién no. */
export function Convocatoria({ partidoId, plantel }: { partidoId: string; plantel: Jugador[] }) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const [filtro, setFiltro] = useState<'todos' | 'pendientes'>('todos');
  const lista = filtro === 'todos' ? plantel : plantel.filter((j) => j.convocatoria === 'PENDIENTE');
  const responder = (jugadorId: string, respuesta: 'VA' | 'NO_VA' | 'PENDIENTE') =>
    enviar(async () => {
      await api('POST', `/capitan/partidos/${partidoId}/convocatoria`, { jugadorId, respuesta });
      router.refresh();
    });
  return (
    <div data-testid="convocatoria">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Convocatoria</h2>
        <div className="seg">
          <button className={filtro === 'todos' ? 'on' : ''} onClick={() => setFiltro('todos')}>
            Todos
          </button>
          <button className={filtro === 'pendientes' ? 'on' : ''} onClick={() => setFiltro('pendientes')}>
            Pendientes
          </button>
        </div>
      </div>
      <MensajeError error={error} />
      {lista.length === 0 && <p className="py-4 text-sm text-mute">Ya respondieron todos.</p>}
      {lista.map((j) => {
        const estado = j.convocatoria ?? 'PENDIENTE';
        const [clase, texto] = PILL[estado]!;
        const suspendido = estado === 'SUSPENDIDO';
        return (
          <div key={j.jugadorId} className="list-row flex-wrap" data-testid="convocado">
            <span
              className={`grid size-11 shrink-0 place-items-center rounded-full font-bold ${suspendido ? 'bg-red-100 text-red-600' : estado === 'VA' ? 'bg-ink text-volt' : 'bg-black/10'}`}
            >
              {iniciales(j.nombre)}
            </span>
            <div className="min-w-0 flex-1">
              <b className="block truncate">{j.nombre}</b>
              <div className={`text-xs ${suspendido ? 'font-medium text-red-600' : 'text-mute'}`}>
                {suspendido
                  ? `Suspendido · ${j.suspendidoPor} fecha${j.suspendidoPor === 1 ? '' : 's'}`
                  : `${j.numero != null ? `#${j.numero}` : 'Sin número'}${j.goles ? ` · ${j.goles} gol${j.goles === 1 ? '' : 'es'}` : ''}`}
              </div>
            </div>
            <span className={clase}>{texto}</span>
            {!suspendido && (
              <span className="flex gap-1.5">
                <button
                  className={`btn-sm ${estado === 'VA' ? 'btn' : 'btn-glass'}`}
                  disabled={enviando}
                  aria-label={`${j.nombre} va`}
                  onClick={() => responder(j.jugadorId, estado === 'VA' ? 'PENDIENTE' : 'VA')}
                >
                  <Icono nombre="check" />
                </button>
                <button
                  className={`btn-sm ${estado === 'NO_VA' ? 'btn' : 'btn-glass'}`}
                  disabled={enviando}
                  aria-label={`${j.nombre} no va`}
                  onClick={() => responder(j.jugadorId, estado === 'NO_VA' ? 'PENDIENTE' : 'NO_VA')}
                >
                  <Icono nombre="x" />
                </button>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Alta de un jugador al plantel (E19-01). Con DNI se cifra y se buscan duplicados, como cuando lo carga la liga. */
export function AltaJugador() {
  const router = useRouter();
  const { enviando, error, campos, enviar } = useEnvio();
  const [abierto, setAbierto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  if (!abierto)
    return (
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className="btn-volt" onClick={() => setAbierto(true)}>
          <Icono nombre="plus" />
          Sumar jugador
        </button>
        {aviso && <span className="text-sm text-mute">{aviso}</span>}
      </div>
    );
  return (
    <form
      className="mt-4 grid gap-3 rounded-3xl bg-black/5 p-4 sm:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] sm:items-end"
      onSubmit={(ev) => {
        ev.preventDefault();
        const f = new FormData(ev.currentTarget);
        const texto = (k: string) => ((f.get(k) as string) || '').trim() || undefined;
        void enviar(async () => {
          const r = await api<{ duplicados: number }>('POST', '/capitan/plantel', {
            nombre: texto('nombre'),
            apellido: texto('apellido'),
            numero: texto('numero') ? Number(texto('numero')) : undefined,
            dni: texto('dni'),
            fechaNacimiento: texto('fechaNacimiento'),
          });
          setAviso(
            r.duplicados
              ? 'Lo sumamos, pero ese DNI ya figura en otro jugador: la liga lo va a revisar antes de habilitarlo.'
              : 'Jugador sumado. Para jugar le falta la documentación que pide el torneo.',
          );
          setAbierto(false);
          router.refresh();
        });
      }}
    >
      <Campo etiqueta="Nombre" name="nombre" required error={campos.nombre} />
      <Campo etiqueta="Apellido" name="apellido" required error={campos.apellido} />
      <Campo etiqueta="Número" name="numero" type="number" min={0} max={99} error={campos.numero} />
      <Campo etiqueta="DNI (opcional)" name="dni" inputMode="numeric" error={campos.dni} />
      <Campo
        etiqueta="Nacimiento (opcional)"
        name="fechaNacimiento"
        type="date"
        error={campos.fechaNacimiento}
      />
      <div className="flex gap-2">
        <button className="btn" disabled={enviando}>
          Sumar
        </button>
        <button type="button" className="btn-glass" onClick={() => setAbierto(false)}>
          Cancelar
        </button>
      </div>
      <div className="sm:col-span-full">
        <MensajeError error={error} />
      </div>
    </form>
  );
}

export function BajaJugador({
  jugadorId,
  nombre,
  baja,
}: {
  jugadorId: string;
  nombre: string;
  baja: Jugador['baja'];
}) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  if (!baja.ok)
    return (
      <span className="hidden text-xs text-mute lg:inline" title={baja.motivo}>
        <Icono nombre="lock" />
      </span>
    );
  return (
    <>
      <button
        className="btn-glass btn-sm"
        aria-label={`Dar de baja a ${nombre}`}
        title="Dar de baja"
        disabled={enviando}
        onClick={() => {
          if (!confirm(`¿Dar de baja a ${nombre} del plantel?`)) return;
          void enviar(async () => {
            await api('POST', `/capitan/plantel/${jugadorId}/baja`);
            router.refresh();
          });
        }}
      >
        <Icono nombre="x" />
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </>
  );
}

/** Descargo del capitán (E19-05): queda en el expediente que resuelve el tribunal. */
export function Descargo({ id, actual }: { id: string; actual: string | null }) {
  const router = useRouter();
  const { enviando, error, campos, enviar } = useEnvio();
  const [editando, setEditando] = useState(!actual);
  if (!editando)
    return (
      <div className="mt-2">
        <p className="rounded-2xl bg-black/5 px-4 py-3 text-sm">
          <b>Tu descargo:</b> “{actual}”
        </p>
        <button className="btn-glass btn-sm mt-2" onClick={() => setEditando(true)}>
          Editar descargo
        </button>
      </div>
    );
  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={(ev) => {
        ev.preventDefault();
        const f = new FormData(ev.currentTarget);
        void enviar(async () => {
          await api('POST', `/capitan/expedientes/${id}/descargo`, { descargo: f.get('descargo') });
          setEditando(false);
          router.refresh();
        });
      }}
    >
      <label className="block">
        <span className="field-label">Tu descargo para el tribunal</span>
        <textarea
          name="descargo"
          className="input min-h-24"
          required
          minLength={3}
          maxLength={1000}
          defaultValue={actual ?? ''}
          placeholder="Contá qué pasó desde el lado del equipo."
        />
        {campos.descargo && <span className="mt-1 block text-xs text-red-600">{campos.descargo}</span>}
      </label>
      <MensajeError error={error} />
      <button className="btn btn-sm" disabled={enviando}>
        <Icono nombre="send" />
        Enviar descargo
      </button>
    </form>
  );
}

/** Invitar a un jugador del plantel a tener cuenta (E20-01): el link se manda por WhatsApp o se copia. */
export function InvitarJugador({
  jugadorId,
  nombre,
  cuenta,
}: {
  jugadorId: string;
  nombre: string;
  cuenta: Jugador['cuenta'];
}) {
  const router = useRouter();
  const { enviando, error, campos, enviar } = useEnvio();
  const [abierto, setAbierto] = useState(false);
  const [listo, setListo] = useState<{ link: string; texto: string } | null>(null);
  if (cuenta === 'ACTIVA') return <span className="pill-ink hidden sm:inline-flex">En la app</span>;
  return (
    <>
      <button
        className="btn-glass btn-sm"
        aria-label={`Invitar a ${nombre} a la app`}
        onClick={() => setAbierto((x) => !x)}
      >
        <Icono nombre="send" />
        <span className="hidden sm:inline">{cuenta === 'INVITADO' ? 'Reinvitar' : 'Invitar a la app'}</span>
      </button>
      {abierto && (
        <div className="basis-full rounded-3xl bg-black/5 p-4" data-testid="invitar-jugador">
          {listo ? (
            <div className="space-y-3" role="status">
              <p className="text-sm">
                Listo. Mandale este link a {nombre}: crea su cuenta y confirma si va a los partidos.
              </p>
              <input
                className="input w-full text-xs"
                readOnly
                value={listo.link}
                aria-label="Link de invitación"
              />
              <div className="flex flex-wrap gap-2">
                <a
                  className="btn-volt btn-sm"
                  href={`https://wa.me/?text=${encodeURIComponent(listo.texto)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Icono nombre="whatsapp" />
                  Mandar por WhatsApp
                </a>
                <button
                  className="btn-glass btn-sm"
                  onClick={() => void navigator.clipboard?.writeText(listo.link)}
                >
                  <Icono nombre="link" />
                  Copiar link
                </button>
              </div>
            </div>
          ) : (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(ev) => {
                ev.preventDefault();
                const email = String(new FormData(ev.currentTarget).get('email') ?? '').trim();
                void enviar(async () => {
                  setListo(
                    await api<{ link: string; texto: string }>(
                      'POST',
                      `/capitan/plantel/${jugadorId}/invitar`,
                      {
                        email,
                      },
                    ),
                  );
                  router.refresh();
                });
              }}
            >
              <div className="min-w-[12rem] flex-1">
                <Campo
                  etiqueta={`Email de ${nombre}`}
                  name="email"
                  type="email"
                  required
                  error={campos.email}
                />
              </div>
              <button className="btn btn-sm" disabled={enviando}>
                Generar invitación
              </button>
              <MensajeError error={error} />
            </form>
          )}
        </div>
      )}
    </>
  );
}
