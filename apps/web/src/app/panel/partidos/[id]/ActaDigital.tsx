'use client';
// Acta digital: botones grandes para usar en la cancha, pensada para funcionar sin señal (E11-06).
// Cada toque se guarda primero en el dispositivo (cola en IndexedDB) y se ve al instante; la cola viaja al servidor en
// orden apenas hay conexión. Cada evento lleva un clientUuid, así un reenvío nunca duplica nada (ADR-004).
import { Icono } from '@potrero/ui';
import { DATOS, type OperacionActa, procesarCola, vistaLocal } from '@potrero/shared';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MensajeError, useEnvio } from '@/componentes/formulario';
import { Escudo, Estado } from '@/componentes/ui';
import { ahora, almacenDelActa, dispositivoId, type Rechazada } from '@/lib/acta-offline';
import { enviarOperacion, esErrorDeRed } from '@/lib/acta-sync';
import { api } from '@/lib/cliente';
import { fechaCorta, hora } from '@/lib/formato';
import { prepararSinConexion } from '@/lib/sin-conexion';
import type { Acta, JugadorActa } from '@/lib/tipos';

type TipoCargable = 'GOL' | 'GOL_EN_CONTRA' | 'AMARILLA' | 'ROJA';
const TIPOS: [TipoCargable, string, string][] = [
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
  const id = inicial.id;
  const [base, setBase] = useState(inicial);
  const [cola, setCola] = useState<OperacionActa[]>([]);
  const [rechazadas, setRechazadas] = useState<Rechazada[]>([]);
  const [enLinea, setEnLinea] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [lado, setLado] = useState<'local' | 'visitante'>('local');
  const [minuto, setMinuto] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [cerrando, setCerrando] = useState(false);
  const [dispositivo, setDispositivo] = useState('');
  const { enviando, error, enviar } = useEnvio();
  const sincronizandoRef = useRef(false);
  // Reloj para la cuenta regresiva del W.O. Arranca vacío para no desfasar el HTML del servidor con el del navegador.
  const [reloj, setReloj] = useState<number | null>(null);
  useEffect(() => {
    setReloj(Date.now());
    const t = setInterval(() => setReloj(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const dispositivoRef = useRef('');

  // Lo que ve el delegado: lo último que confirmó el servidor más lo que cargó y todavía no se envió.
  const acta = useMemo(() => vistaLocal(base, cola), [base, cola]);
  const equipo = acta[lado];
  const nombreJugador = new Map(
    [...acta.local.jugadores, ...acta.visitante.jugadores].map((j) => [j.id, j.nombre]),
  );
  const abierto = acta.estado === 'EN_JUEGO';
  // W.O.: pasada la hora del partido corre la tolerancia del reglamento; al vencer, se puede declarar.
  const toleranciaMs = DATOS.reglamentoPorDefecto.toleranciaWOMinutos * 60_000;
  const pasadoMs = reloj !== null && acta.inicio ? reloj - Date.parse(acta.inicio) : -1;
  const faltaWoMs = toleranciaMs - pasadoMs;
  const woVencido = acta.estado === 'PROGRAMADO' && pasadoMs >= 0 && faltaWoMs <= 0;
  const cuentaWo = (ms: number) =>
    `${String(Math.floor(ms / 60_000)).padStart(2, '0')}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0')}`;
  // En una llave no hay empate: si termina igualado, se definen penales antes de cerrar.
  const empateEnLlave = acta.fase === 'LLAVE' && acta.marcador.local === acta.marcador.visitante;
  // Un solo dueño por partido: otro dispositivo con el acta bloquea la carga desde este.
  const soyDueno = !dispositivo || !base.dueno || base.dueno.dispositivoId === dispositivo;

  /** Trae la última versión del servidor y la guarda en el dispositivo. Sin conexión, conserva lo que hay. */
  const refrescar = useCallback(async () => {
    try {
      const fresca = await api<Acta>('GET', `/partidos/${id}`);
      setBase(fresca);
      setEnLinea(true);
      await (await almacenDelActa()).guardarSnapshot(id, fresca);
    } catch (e) {
      if (esErrorDeRed(e)) setEnLinea(false);
    }
  }, [id]);

  /** Envía la cola en orden. Se llama al volver la señal, cada pocos segundos y después de cada toque. */
  const sincronizar = useCallback(async () => {
    if (sincronizandoRef.current) return;
    sincronizandoRef.current = true;
    setSincronizando(true);
    try {
      const almacen = await almacenDelActa();
      for (let pasada = 0; pasada < 5; pasada++) {
        const pendientes = await almacen.cola(id);
        if (pendientes.length === 0) break;
        const resumen = await procesarCola(pendientes, (op) =>
          enviarOperacion(id, op, dispositivoRef.current),
        );
        await almacen.quitar(
          [...resumen.enviadas, ...resumen.rechazadas.map((r) => r.operacion)].map((o) => o.id),
        );
        for (const r of resumen.rechazadas) await almacen.rechazar(id, r);
        setCola(await almacen.cola(id));
        setRechazadas(await almacen.rechazadas(id));
        if (resumen.pendientes.length > 0) {
          setEnLinea(false); // se cortó el envío: no hay conexión
          return;
        }
        setEnLinea(true);
      }
      await refrescar();
    } finally {
      sincronizandoRef.current = false;
      setSincronizando(false);
    }
  }, [id, refrescar]);

  /** Guarda la operación en el dispositivo (se ve al instante) y la manda si hay conexión. */
  const encolar = useCallback(
    async (op: OperacionActa) => {
      await (await almacenDelActa()).encolar(id, op);
      setCola((c) => [...c, op]);
      if (navigator.onLine) void sincronizar();
    },
    [id, sincronizar],
  );

  // Al abrir: recupera lo guardado en el dispositivo, toma el acta si nadie la tiene y manda lo pendiente.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const miId = dispositivoId();
      dispositivoRef.current = miId;
      setDispositivo(miId);
      const almacen = await almacenDelActa();
      const [guardadaCola, guardadasRechazadas, snapshot] = await Promise.all([
        almacen.cola(id),
        almacen.rechazadas(id),
        almacen.leerSnapshot(id),
      ]);
      if (!vivo) return;
      setCola(guardadaCola);
      setRechazadas(guardadasRechazadas);
      if (navigator.onLine) {
        await almacen.guardarSnapshot(id, inicial);
      } else {
        // Sin señal, la pantalla pudo venir de la copia del navegador: manda lo último que el servidor confirmó.
        setEnLinea(false);
        if (snapshot) setBase(snapshot);
      }
      void prepararSinConexion();
      if (navigator.onLine && (inicial.estado === 'PROGRAMADO' || inicial.estado === 'EN_JUEGO')) {
        await api('POST', `/partidos/${id}/tomar`, { dispositivoId: miId }).catch(() => undefined);
      }
      if (navigator.onLine) await sincronizar();
    })();
    return () => {
      vivo = false;
    };
  }, [id, inicial, sincronizar]);

  // Conexión: al volver la señal se envía todo; mientras haya pendientes se reintenta cada pocos segundos.
  useEffect(() => {
    const alVolver = () => {
      setEnLinea(true);
      void sincronizar();
    };
    const alIrse = () => setEnLinea(false);
    window.addEventListener('online', alVolver);
    window.addEventListener('offline', alIrse);
    const intervalo = setInterval(() => {
      if (navigator.onLine && !sincronizandoRef.current) void sincronizar();
    }, 8000);
    return () => {
      window.removeEventListener('online', alVolver);
      window.removeEventListener('offline', alIrse);
      clearInterval(intervalo);
    };
  }, [sincronizar]);

  const cargar = (tipo: TipoCargable, jugador: JugadorActa) => {
    setAviso(
      jugador.habilitado
        ? null
        : 'Este jugador está suspendido. Quedó registrado y el tribunal lo va a revisar.',
    );
    void encolar({
      tipo: 'evento',
      id: crypto.randomUUID(),
      creadoEn: ahora(),
      evento: {
        tipo,
        equipoId: equipo.id,
        jugadorId: jugador.id,
        ...(minuto ? { minuto: Number(minuto) } : {}),
      },
    });
  };

  const descripcion = (op: OperacionActa) => {
    if (op.tipo === 'iniciar') return 'Inicio del partido';
    if (op.tipo === 'cerrar') return 'Cierre del acta';
    if (op.tipo === 'anular') return 'Anulación de un evento';
    const quien = op.evento.jugadorId ? nombreJugador.get(op.evento.jugadorId) : '';
    return `${ETIQUETA[op.evento.tipo]} · ${quien}`;
  };

  const pendientes = acta.pendientes;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href={`/panel/torneos/${acta.torneo.id}?tab=${acta.fase === 'LLAVE' ? 'llaves' : 'fixture'}`}
        className="inline-flex items-center gap-1 text-sm font-semibold text-mute hover:text-ink"
      >
        <Icono nombre="back" />
        {acta.torneo.nombre} · {acta.fase === 'LLAVE' ? 'Llave' : `Fecha ${acta.fecha}`}
        {acta.grupo ? ` · Grupo ${acta.grupo}` : ''}
      </Link>

      <div
        role="status"
        data-testid="estado-sync"
        className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-2 text-sm font-semibold ${enLinea ? 'bg-volt/40' : 'bg-amber-200 text-amber-900'}`}
      >
        <span>
          {!enLinea
            ? pendientes > 0
              ? `Sin conexión · ${pendientes} ${pendientes === 1 ? 'cambio' : 'cambios'} sin enviar. El acta sigue funcionando.`
              : 'Sin conexión. Podés seguir cargando el acta.'
            : sincronizando
              ? 'Sincronizando…'
              : pendientes > 0
                ? `${pendientes} ${pendientes === 1 ? 'cambio' : 'cambios'} sin enviar`
                : 'En línea · todo sincronizado'}
        </span>
        {pendientes > 0 && (
          <button
            className="rounded-full bg-ink px-3 py-1 text-xs text-volt disabled:opacity-50"
            disabled={sincronizando || !enLinea}
            onClick={() => void sincronizar()}
          >
            Sincronizar ahora
          </button>
        )}
      </div>

      {!soyDueno && base.dueno && (
        <div
          className="space-y-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-900"
          data-testid="otro-dueno"
        >
          <b>Otro dispositivo tiene esta acta.</b> La está cargando {base.dueno.usuario}
          {base.dueno.desde ? ` desde las ${hora(base.dueno.desde)}` : ''}. Para evitar que se pisen los
          datos, desde acá solo podés mirarla.
          <div>
            <button
              className="btn-glass btn-sm"
              disabled={enviando || !enLinea}
              onClick={() =>
                enviar(async () => {
                  await api('POST', `/partidos/${id}/tomar`, { dispositivoId: dispositivo, forzar: true });
                  await refrescar();
                })
              }
            >
              Tomar el acta en este dispositivo
            </button>
          </div>
        </div>
      )}

      {rechazadas.length > 0 && (
        <section
          className="space-y-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-900"
          data-testid="rechazadas"
        >
          <b>El servidor no aceptó {rechazadas.length === 1 ? 'este cambio' : 'estos cambios'}:</b>
          <ul className="space-y-1">
            {rechazadas.map((r) => (
              <li key={r.operacion.id} className="flex flex-wrap items-center gap-2">
                <span className="flex-1">
                  {descripcion(r.operacion)} — {r.motivo}
                </span>
                <button
                  className="text-xs font-semibold underline"
                  onClick={async () => {
                    await (await almacenDelActa()).descartar(r.operacion.id);
                    setRechazadas((x) => x.filter((y) => y.operacion.id !== r.operacion.id));
                  }}
                >
                  Descartar
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

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
            <div
              className="num text-6xl font-bold tracking-tighter text-volt sm:text-7xl"
              data-testid="marcador"
            >
              {acta.marcador.local}
              <span className="text-white/30">-</span>
              {acta.marcador.visitante}
            </div>
            <div className="grid justify-items-center gap-2">
              <Escudo nombre={acta.visitante.nombre} className="!size-14 !text-sm" />
              <b className="text-sm sm:text-base">{acta.visitante.nombre}</b>
            </div>
          </div>
          {acta.penalesLocal !== null && acta.penalesVisitante !== null && (
            <p className="mt-3 text-center text-sm font-semibold text-white/70">
              Definido por penales: {acta.penalesLocal}-{acta.penalesVisitante}
            </p>
          )}
        </div>
      </section>

      <MensajeError error={error} />
      {aviso && (
        <p className="rounded-2xl bg-amber-100 px-4 py-3 text-sm font-medium text-amber-900">{aviso}</p>
      )}

      {acta.estado === 'PROGRAMADO' && pasadoMs >= 0 && (
        <div
          role="status"
          data-testid="cuenta-wo"
          className={`rounded-2xl px-4 py-3 text-sm font-semibold ${woVencido ? 'bg-red-50 text-red-800' : 'bg-amber-100 text-amber-900'}`}
        >
          {woVencido
            ? `Pasó la tolerancia de ${DATOS.reglamentoPorDefecto.toleranciaWOMinutos} minutos. Si un equipo no se presentó, declará el W.O.`
            : `El partido ya tendría que haber empezado. W.O. posible en ${cuentaWo(faltaWoMs)} (tolerancia de ${DATOS.reglamentoPorDefecto.toleranciaWOMinutos} min).`}
        </div>
      )}

      {acta.estado === 'PROGRAMADO' && (
        <div className="tile space-y-3 text-center">
          <button
            className="btn-volt btn-lg w-full"
            disabled={!soyDueno}
            onClick={() => void encolar({ tipo: 'iniciar', id: crypto.randomUUID(), creadoEn: ahora() })}
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
                  className={`${woVencido ? 'btn-volt' : 'btn-glass'} btn-sm`}
                  disabled={enviando || !enLinea || !soyDueno}
                  title={enLinea ? undefined : 'El W.O. necesita conexión'}
                  onClick={() =>
                    enviar(async () => {
                      await api('POST', `/partidos/${id}/wo`, { ganadorId: ganador.id });
                      await refrescar();
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
                      disabled={!soyDueno}
                      onClick={() => cargar(tipo, j)}
                      className={`min-h-11 rounded-2xl px-3 text-xs font-bold transition active:scale-95 disabled:opacity-40 ${clase}`}
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
                {e.pendiente && (
                  <span className="ml-2 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                    sin enviar
                  </span>
                )}
              </span>
              {abierto && (
                <button
                  className="text-xs font-semibold text-mute underline hover:text-red-600 disabled:opacity-40"
                  disabled={!soyDueno}
                  onClick={() =>
                    void encolar({
                      tipo: 'anular',
                      id: crypto.randomUUID(),
                      creadoEn: ahora(),
                      objetivoId: e.id,
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
        <button className="btn btn-lg w-full" disabled={!soyDueno} onClick={() => setCerrando(true)}>
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
            void encolar({
              tipo: 'cerrar',
              id: crypto.randomUUID(),
              creadoEn: ahora(),
              cierre: {
                firmaLocal: f.get('firmaLocal') === 'on',
                firmaVisitante: f.get('firmaVisitante') === 'on',
                ...((f.get('justificacion') as string)
                  ? { justificacion: f.get('justificacion') as string }
                  : {}),
                ...(empateEnLlave
                  ? {
                      penalesLocal: Number(f.get('penalesLocal')),
                      penalesVisitante: Number(f.get('penalesVisitante')),
                    }
                  : {}),
              },
            });
            setAviso(
              'Acta cerrada. La tabla y los goleadores se actualizan cuando se confirme en el servidor.',
            );
            setCerrando(false);
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
          {empateEnLlave && (
            <div className="rounded-2xl bg-ink/10 p-3">
              <b className="text-sm">Es un cruce de llave y terminó empatado: cargá los penales</b>
              <div className="mt-2 grid grid-cols-2 gap-3">
                {[
                  ['penalesLocal', acta.local.nombre],
                  ['penalesVisitante', acta.visitante.nombre],
                ].map(([n, e]) => (
                  <label key={n} className="block">
                    <span className="field-label">{e}</span>
                    <input name={n} type="number" min={0} max={30} required className="input" />
                  </label>
                ))}
              </div>
            </div>
          )}
          <label className="block">
            <span className="field-label">Si falta una firma, justificación del árbitro</span>
            <input name="justificacion" className="input" />
          </label>
          <button className="btn btn-lg w-full">Confirmar cierre</button>
        </form>
      )}
      {acta.estado === 'FINALIZADO' && (
        <p className="text-center text-sm text-mute">
          {pendientes > 0
            ? 'Acta cerrada en este dispositivo. Se enviará apenas haya conexión.'
            : 'Acta cerrada. Las correcciones las hace el administrador y quedan auditadas.'}
        </p>
      )}
    </div>
  );
}
