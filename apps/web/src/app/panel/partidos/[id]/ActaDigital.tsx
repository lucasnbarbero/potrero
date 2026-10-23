'use client';
// Acta digital: botones grandes para usar en la cancha. Cada evento lleva un clientUuid generado en el
// dispositivo, así un reintento no duplica nada (base del modo sin conexión, backlog E11-06).
import { Icono } from '@potrero/ui';
import Link from 'next/link';
import { useState } from 'react';
import { MensajeError, useEnvio } from '@/componentes/formulario';
import { Escudo, Estado } from '@/componentes/ui';
import { api } from '@/lib/cliente';
import { fechaCorta, hora } from '@/lib/formato';
import type { Acta, JugadorActa } from '@/lib/tipos';

type TipoEvento = 'GOL' | 'GOL_EN_CONTRA' | 'AMARILLA' | 'ROJA';
const TIPOS: [TipoEvento, string, string][] = [
  ['GOL', 'Gol', 'bg-volt text-ink'],
  ['AMARILLA', 'Amarilla', 'bg-amber-300 text-ink'],
  ['ROJA', 'Roja', 'bg-red-500 text-white'],
  ['GOL_EN_CONTRA', 'En contra', 'bg-black/10 text-ink'],
];
const ETIQUETA: Record<string, string> = {
  GOL: '⚽ Gol',
  GOL_EN_CONTRA: '⚽ Gol en contra',
  AMARILLA: '🟨 Amarilla',
  ROJA: '🟥 Roja',
  CAMBIO: '🔁 Cambio',
};

export function ActaDigital({ inicial }: { inicial: Acta }) {
  const [acta, setActa] = useState(inicial);
  const [lado, setLado] = useState<'local' | 'visitante'>('local');
  const [minuto, setMinuto] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [cerrando, setCerrando] = useState(false);
  const { enviando, error, enviar } = useEnvio();
  const recargar = async () => setActa(await api<Acta>('GET', `/partidos/${acta.id}`));
  const equipo = acta[lado];
  const nombreJugador = new Map(
    [...acta.local.jugadores, ...acta.visitante.jugadores].map((j) => [j.id, j.nombre]),
  );
  const abierto = acta.estado === 'EN_JUEGO';

  const cargar = (tipo: TipoEvento, jugador: JugadorActa) =>
    enviar(async () => {
      const r = await api<{ advertencia: string | null }>('POST', `/partidos/${acta.id}/eventos`, {
        tipo,
        equipoId: equipo.id,
        jugadorId: jugador.id,
        minuto: minuto ? Number(minuto) : undefined,
        clientUuid: crypto.randomUUID(),
      });
      setAviso(r.advertencia);
      await recargar();
    });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href={`/panel/torneos/${acta.torneo.id}?tab=fixture`}
        className="inline-flex items-center gap-1 text-sm font-semibold text-mute hover:text-ink"
      >
        <Icono nombre="back" />
        {acta.torneo.nombre} · Fecha {acta.fecha}
      </Link>

      <section className="tile-ink rise">
        <div className="field-pattern pointer-events-none absolute inset-0 opacity-70" />
        <div className="relative">
          <div className="flex items-center justify-between text-xs text-white/60">
            <span>
              {fechaCorta(acta.inicio)} · {hora(acta.inicio)} · {acta.cancha}
            </span>
            <Estado estado={acta.estado} />
          </div>
          <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
            <div className="grid justify-items-center gap-2">
              <Escudo nombre={acta.local.nombre} className="!size-14 !text-sm" />
              <b className="text-sm sm:text-base">{acta.local.nombre}</b>
            </div>
            <div className="num text-6xl font-bold tracking-tighter text-volt sm:text-7xl">
              {acta.marcador.local}
              <span className="text-white/30">-</span>
              {acta.marcador.visitante}
            </div>
            <div className="grid justify-items-center gap-2">
              <Escudo nombre={acta.visitante.nombre} className="!size-14 !text-sm" />
              <b className="text-sm sm:text-base">{acta.visitante.nombre}</b>
            </div>
          </div>
        </div>
      </section>

      <MensajeError error={error} />
      {aviso && (
        <p className="rounded-2xl bg-amber-100 px-4 py-3 text-sm font-medium text-amber-900">{aviso}</p>
      )}

      {acta.estado === 'PROGRAMADO' && (
        <div className="tile space-y-3 text-center">
          <button
            className="btn-volt btn-lg w-full"
            disabled={enviando}
            onClick={() =>
              enviar(async () => {
                await api('POST', `/partidos/${acta.id}/iniciar`);
                await recargar();
              })
            }
          >
            <Icono nombre="whistle" />
            Iniciar partido
          </button>
          <div className="flex flex-wrap justify-center gap-2 text-sm">
            <span className="text-mute">¿No se presentó un equipo?</span>
            {[acta.local, acta.visitante].map((e, i) => {
              const ganador = i === 0 ? acta.visitante : acta.local;
              return (
                <button
                  key={e.id}
                  className="btn-glass btn-sm"
                  disabled={enviando}
                  onClick={() =>
                    enviar(async () => {
                      await api('POST', `/partidos/${acta.id}/wo`, { ganadorId: ganador.id });
                      await recargar();
                    })
                  }
                >
                  W.O. de {e.nombre}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {acta.estado === 'PROGRAMADO' && (
        <section className="grid gap-4 sm:grid-cols-2">
          {[acta.local, acta.visitante].map((e) => (
            <div key={e.id} className="tile">
              <span className="eyebrow">Planilla · {e.nombre}</span>
              <ul className="mt-2">
                {e.jugadores.map((j) => (
                  <li key={j.id} className="list-row text-sm">
                    <span
                      className={`grid size-8 place-items-center rounded-full text-xs font-bold ${j.habilitado ? 'bg-ink text-volt' : 'bg-red-500 text-white'}`}
                    >
                      {j.numero ?? '–'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate">{j.nombre}</b>
                      {!j.habilitado && (
                        <span className="text-xs font-semibold text-red-600">{j.motivo}</span>
                      )}
                    </span>
                    {j.habilitado ? (
                      <span className="pill">Habilitado</span>
                    ) : (
                      <span className="pill-red">No habilitado</span>
                    )}
                  </li>
                ))}
                {e.jugadores.length === 0 && (
                  <li className="py-3 text-sm text-mute">Sin jugadores cargados.</li>
                )}
              </ul>
            </div>
          ))}
        </section>
      )}

      {abierto && (
        <section className="tile space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="seg">
              {(['local', 'visitante'] as const).map((l) => (
                <button key={l} className={lado === l ? 'on' : ''} onClick={() => setLado(l)}>
                  {acta[l].nombre}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold">
              Minuto
              <input
                className="input !w-20 !py-2"
                inputMode="numeric"
                value={minuto}
                onChange={(e) => setMinuto(e.target.value.replace(/\D/g, ''))}
                placeholder="—"
              />
            </label>
          </div>
          <ul className="divide-y divide-black/5">
            {equipo.jugadores.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center gap-2 py-2.5">
                <span
                  className={`grid size-9 place-items-center rounded-full text-xs font-bold ${j.habilitado ? 'bg-ink text-volt' : 'bg-red-500 text-white'}`}
                >
                  {j.numero ?? '–'}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm">{j.nombre}</b>
                  {!j.habilitado && <span className="text-xs font-semibold text-red-600">{j.motivo}</span>}
                </span>
                <div className="flex gap-1.5">
                  {TIPOS.map(([tipo, texto, clase]) => (
                    <button
                      key={tipo}
                      disabled={enviando}
                      onClick={() => cargar(tipo, j)}
                      className={`min-h-11 rounded-2xl px-3 text-xs font-bold transition active:scale-95 ${clase}`}
                    >
                      {texto}
                    </button>
                  ))}
                </div>
              </li>
            ))}
            {equipo.jugadores.length === 0 && (
              <li className="py-4 text-sm text-mute">Este equipo no tiene jugadores cargados.</li>
            )}
          </ul>
        </section>
      )}

      <section className="tile">
        <span className="eyebrow">Eventos</span>
        <ol className="timeline mt-3">
          {acta.eventos.map((e) => (
            <li
              key={e.id}
              className={`ev ${e.tipo === 'AMARILLA' ? 'y' : e.tipo === 'ROJA' ? 'rd' : ''} flex items-center gap-2 text-sm`}
            >
              <span className="w-10 shrink-0 font-semibold text-mute">
                {e.minuto != null ? `${e.minuto}'` : ''}
              </span>
              <span className="flex-1">
                <b>{ETIQUETA[e.tipo]}</b> · {e.jugadorId ? nombreJugador.get(e.jugadorId) : ''}{' '}
                <span className="text-mute">
                  ({e.equipoId === acta.local.id ? acta.local.nombre : acta.visitante.nombre})
                </span>
              </span>
              {abierto && (
                <button
                  className="text-xs font-semibold text-mute underline hover:text-red-600"
                  disabled={enviando}
                  onClick={() =>
                    enviar(async () => {
                      await api('POST', `/partidos/${acta.id}/eventos/${e.id}/anular`, {
                        clientUuid: crypto.randomUUID(),
                      });
                      await recargar();
                    })
                  }
                >
                  Anular
                </button>
              )}
            </li>
          ))}
          {acta.eventos.length === 0 && <li className="text-sm text-mute">Sin eventos.</li>}
        </ol>
      </section>

      {abierto && !cerrando && (
        <button className="btn btn-lg w-full" onClick={() => setCerrando(true)}>
          <Icono nombre="lock" />
          Cerrar acta
        </button>
      )}
      {abierto && cerrando && (
        <form
          className="tile-volt space-y-3"
          onSubmit={(ev) => {
            ev.preventDefault();
            const f = new FormData(ev.currentTarget);
            enviar(async () => {
              const r = await api<{ sanciones: number }>('POST', `/partidos/${acta.id}/cerrar`, {
                firmaLocal: f.get('firmaLocal') === 'on',
                firmaVisitante: f.get('firmaVisitante') === 'on',
                justificacion: (f.get('justificacion') as string) || undefined,
              });
              setAviso(
                r.sanciones
                  ? `Acta cerrada. Se generaron ${r.sanciones} sanción(es) automáticamente.`
                  : 'Acta cerrada. La tabla y los goleadores ya están actualizados.',
              );
              setCerrando(false);
              await recargar();
            });
          }}
        >
          <b className="text-lg">Cierre del acta</b>
          {[
            ['firmaLocal', acta.local.nombre],
            ['firmaVisitante', acta.visitante.nombre],
          ].map(([n, e]) => (
            <label key={n} className="flex items-center gap-3 text-sm font-semibold">
              <input type="checkbox" name={n} className="size-5 accent-black" />
              Firma del capitán de {e}
            </label>
          ))}
          <label className="block">
            <span className="field-label">Si falta una firma, justificación del árbitro</span>
            <input name="justificacion" className="input" />
          </label>
          <button className="btn btn-lg w-full" disabled={enviando}>
            Confirmar cierre
          </button>
        </form>
      )}
      {acta.estado === 'FINALIZADO' && (
        <p className="text-center text-sm text-mute">
          Acta cerrada. Las correcciones las hace el administrador y quedan auditadas.
        </p>
      )}
    </div>
  );
}
