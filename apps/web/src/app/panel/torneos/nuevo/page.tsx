'use client';
import { cantidadDePartidos, DATOS, type Formato, type Modalidad } from '@potrero/shared';
import { Icono } from '@potrero/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Campo, MensajeError, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';
import { pesos } from '@/lib/formato';

const MODALIDADES: [Modalidad, string][] = [
  ['F5', 'Fútbol 5'],
  ['F7', 'Fútbol 7'],
  ['F8', 'Fútbol 8'],
  ['F11', 'Fútbol 11'],
];
const FORMATOS: [Formato, string, string][] = [
  ['LIGA', 'Liga', 'Todos contra todos. Gana el que más puntos suma.'],
  ['LIGA_PLAYOFFS', 'Liga + playoffs', 'Fase de liga y después llaves con los mejores.'],
  ['GRUPOS_PLAYOFFS', 'Grupos + playoffs', 'Zonas y cruces eliminatorios. (Llaves: próximamente)'],
  ['COPA', 'Copa', 'Eliminación directa. (Llaves: próximamente)'],
];

export default function NuevoTorneo() {
  const router = useRouter();
  const { enviando, error, campos, enviar } = useEnvio();
  const [modalidad, setModalidad] = useState<Modalidad>('F5');
  const [formato, setFormato] = useState<Formato>('LIGA');
  const [cupo, setCupo] = useState(16);
  const [idaYVuelta, setIdaYVuelta] = useState(false);
  const [inscripcion, setInscripcion] = useState(60000);
  const [cuotaPorFecha, setCuotaPorFecha] = useState<number>(DATOS.cobrosPorFechaPorDefecto.cuotaPorFecha);
  const [seguro, setSeguro] = useState<number>(DATOS.cobrosPorFechaPorDefecto.seguroPorJugadorPorFecha);
  const partidos = cantidadDePartidos(cupo, formato, idaYVuelta);

  return (
    <form
      className="grid gap-6 xl:grid-cols-[1fr_22rem]"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        enviar(async () => {
          const t = await api<{ id: string }>('POST', '/torneos', {
            nombre: f.get('nombre'),
            modalidad,
            formato,
            idaYVuelta,
            cupo,
            inscripcion,
            cobrosPorFecha: { cuotaPorFecha, seguroPorJugadorPorFecha: seguro },
            puntosVictoria: Number(f.get('puntosVictoria')),
            puntosEmpate: Number(f.get('puntosEmpate')),
            umbralAmarillas: Number(f.get('umbralAmarillas')),
          });
          router.push(`/panel/torneos/${t.id}`);
        });
      }}
    >
      <div className="space-y-5">
        <div className="rise">
          <p className="eyebrow">Nuevo torneo</p>
          <h1 className="mt-1 text-4xl font-bold tracking-tighter sm:text-5xl">Armá tu torneo</h1>
        </div>

        <section className="tile space-y-4">
          <b className="text-lg">1 · Datos</b>
          <Campo etiqueta="Nombre" name="nombre" required placeholder="Apertura 2027" error={campos.nombre} />
          <div>
            <span className="field-label">Modalidad</span>
            <div className="seg flex-wrap">
              {MODALIDADES.map(([m, t]) => (
                <button
                  type="button"
                  key={m}
                  className={modalidad === m ? 'on' : ''}
                  onClick={() => setModalidad(m)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="tile space-y-3">
          <b className="text-lg">2 · Formato</b>
          <div className="grid gap-3 sm:grid-cols-2">
            {FORMATOS.map(([f, t, d]) => (
              <button
                type="button"
                key={f}
                onClick={() => setFormato(f)}
                className={`rounded-3xl border-2 p-4 text-left transition ${formato === f ? 'border-ink bg-white' : 'border-transparent bg-black/5 hover:bg-black/10'}`}
              >
                <b className="block">{t}</b>
                <span className="text-sm text-mute">{d}</span>
              </button>
            ))}
          </div>
          <label className="flex items-center gap-3 text-sm font-semibold">
            <input
              type="checkbox"
              checked={idaYVuelta}
              onChange={(e) => setIdaYVuelta(e.target.checked)}
              className="size-5 accent-black"
            />
            Ida y vuelta
          </label>
        </section>

        <section className="tile grid gap-4 sm:grid-cols-2">
          <b className="text-lg sm:col-span-2">3 · Cupo y cobro</b>
          <Campo
            etiqueta="Cupo de equipos"
            type="number"
            min={2}
            max={64}
            value={cupo}
            onChange={(e) => setCupo(Number(e.target.value))}
            error={campos.cupo}
          />
          <Campo
            etiqueta="Inscripción por equipo ($)"
            type="number"
            min={0}
            step={1000}
            value={inscripcion}
            onChange={(e) => setInscripcion(Number(e.target.value))}
            error={campos.inscripcion}
          />
          <Campo
            etiqueta="Cuota por fecha, por equipo ($)"
            type="number"
            min={0}
            step={500}
            value={cuotaPorFecha}
            onChange={(e) => setCuotaPorFecha(Number(e.target.value))}
            ayuda="Lo que paga cada equipo en cada fecha que juega. 0 = no se cobra."
          />
          <Campo
            etiqueta="Seguro por jugador, por fecha ($)"
            type="number"
            min={0}
            step={100}
            value={seguro}
            onChange={(e) => setSeguro(Number(e.target.value))}
            ayuda="Por cada jugador del plantel, juegue o no. Cargo aparte, rubro Seguros."
          />
          <p className="text-xs text-mute sm:col-span-2">
            Por defecto no se cobra la fecha libre ni el partido suspendido, y el W.O. sí. Lo cambiás después
            en Inscripciones y pagos.
          </p>
        </section>

        <section className="tile grid gap-4 sm:grid-cols-3">
          <b className="text-lg sm:col-span-3">4 · Reglamento</b>
          <Campo
            etiqueta="Puntos por victoria"
            name="puntosVictoria"
            type="number"
            defaultValue={3}
            min={0}
          />
          <Campo etiqueta="Puntos por empate" name="puntosEmpate" type="number" defaultValue={1} min={0} />
          <Campo
            etiqueta="Amarillas para suspensión"
            name="umbralAmarillas"
            type="number"
            defaultValue={5}
            min={1}
          />
          <p className="text-xs text-mute sm:col-span-3">
            Desempates: diferencia de gol, goles a favor, resultado entre sí, juego limpio y sorteo. Roja
            directa y doble amarilla: 1 fecha.
          </p>
        </section>
        <MensajeError error={error} />
      </div>

      <aside className="tile-ink h-fit xl:sticky xl:top-24">
        <div className="field-pattern pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative space-y-4">
          <span className="eyebrow !text-white/50">Vista previa</span>
          <div>
            <div className="num text-6xl font-bold tracking-tighter text-volt">{partidos}</div>
            <p className="text-sm text-white/60">partidos estimados con {cupo} equipos</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-white/60">Recaudación con cupo lleno</span>
              <b className="num">{pesos(cupo * inscripcion)}</b>
            </div>
            {cuotaPorFecha > 0 && (
              <div className="mt-2 flex justify-between">
                <span className="text-white/60">Cuotas por fecha con cupo lleno</span>
                <b className="num">{pesos(cupo * cuotaPorFecha)}</b>
              </div>
            )}
          </div>
          <button className="btn-volt btn-lg w-full" disabled={enviando}>
            <Icono nombre="check" />
            {enviando ? 'Creando…' : 'Crear y abrir inscripción'}
          </button>
        </div>
      </aside>
    </form>
  );
}
