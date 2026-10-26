'use client';
import {
  DATOS,
  type FormatoFlexible,
  PLANTILLAS_DE_FORMATO,
  type PlantillaDeFormato,
  plantillaDeFormato,
  simularFormato,
} from '@potrero/shared';
import { Icono } from '@potrero/ui';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { pesos } from '@/lib/formato';
import { proximoSabado } from './comun';
import { CrearConFormato } from './CrearConFormato';
import { Cronograma } from './Cronograma';
import { DiagramaDeFases } from './DiagramaDeFases';
import { EditorDeFases } from './EditorDeFases';

const INICIAL: PlantillaDeFormato = 'GRUPOS_PLAYOFFS_COPA';
// Cuota de ejemplo para la simulación (el valor por defecto de los torneos es 0: no se cobra).
const CUOTA_DE_EJEMPLO = DATOS.cobrosPorFechaPorDefecto.cuotaPorFecha || DATOS.simulador.cuotaDeEjemplo;

function Numero({
  etiqueta,
  valor,
  onCambio,
  min = 0,
  max,
  step = 1,
  ayuda,
}: {
  etiqueta: string;
  valor: number;
  onCambio: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  ayuda?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="field-label">{etiqueta}</span>
      <input
        className="input num"
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(valor) ? valor : ''}
        onChange={(e) => {
          const n = Math.floor(Number(e.target.value) || 0);
          onCambio(Math.max(min, max === undefined ? n : Math.min(max, n)));
        }}
      />
      {ayuda && <span className="mt-1 block text-xs text-mute">{ayuda}</span>}
    </label>
  );
}

export function Simulador() {
  const [equipos, setEquipos] = useState(20);
  const [canchas, setCanchas] = useState(2);
  const [franjasPorDia, setFranjas] = useState(5);
  const [inscripcion, setInscripcion] = useState(60000);
  const [cuotaPorFecha, setCuota] = useState<number>(CUOTA_DE_EJEMPLO);
  const [plantilla, setPlantilla] = useState<PlantillaDeFormato | null>(INICIAL);
  const [formato, setFormato] = useState<FormatoFlexible>(() => plantillaDeFormato(INICIAL, 20));
  const [primerSabado, setPrimerSabado] = useState<Date | null>(null);
  useEffect(() => setPrimerSabado(proximoSabado()), []);

  const datos = { equipos, canchas, franjasPorDia, inscripcion, cuotaPorFecha };
  const sim = useMemo(
    () => simularFormato(formato, { equipos, canchas, franjasPorDia, inscripcion, cuotaPorFecha }),
    [formato, equipos, canchas, franjasPorDia, inscripcion, cuotaPorFecha],
  );
  const errores = sim.problemas.filter((p) => p.nivel === 'ERROR');
  const avisos = sim.problemas.filter((p) => p.nivel === 'AVISO');
  const t = sim.totales;

  const cambiarEquipos = (n: number) => {
    setEquipos(n);
    // Mientras sigue una plantilla sin tocar, se rearma para la nueva cantidad.
    if (plantilla && n >= 2) setFormato(plantillaDeFormato(plantilla, n));
  };
  const elegirPlantilla = (p: PlantillaDeFormato) => {
    setPlantilla(p);
    setFormato(plantillaDeFormato(p, Math.max(2, equipos)));
  };
  const editar = (f: FormatoFlexible) => {
    setPlantilla(null);
    setFormato(f);
  };

  return (
    <div className="space-y-6">
      <div className="rise flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Link href="/panel/torneos" className="eyebrow inline-flex items-center gap-1 hover:text-ink">
            <Icono nombre="back" /> Torneos
          </Link>
          <h1 className="mt-1 text-4xl font-bold tracking-tighter sm:text-5xl">Armá el formato</h1>
          <p className="mt-1 max-w-2xl text-sm text-mute">
            Combiná fases como juega tu liga: grupos, tablas, llaves ida y vuelta y copas para los que quedan
            afuera. Mirá cuántos sábados juega cada equipo y cuánto recaudás.
          </p>
        </div>
      </div>

      <div
        role="note"
        className="rise flex items-start gap-3 rounded-3xl border border-ink/10 bg-volt/70 px-4 py-3 text-sm sm:items-center"
        style={{ '--d': 1 } as React.CSSProperties}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-volt">
          <Icono nombre="spark" />
        </span>
        <p>
          <b>Simulador: así quedaría tu torneo.</b> Cuando te cierre, creá el torneo con este formato y generá
          cada fase a medida que se juega.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <section className="tile rise space-y-4" style={{ '--d': 2 } as React.CSSProperties}>
          <b className="text-lg">1 · Datos</b>
          <div className="grid grid-cols-2 gap-3">
            <Numero etiqueta="Equipos" valor={equipos} onCambio={cambiarEquipos} min={0} max={128} />
            <Numero etiqueta="Canchas" valor={canchas} onCambio={setCanchas} min={0} max={30} />
            <Numero
              etiqueta="Franjas por sábado"
              valor={franjasPorDia}
              onCambio={setFranjas}
              min={0}
              max={24}
              ayuda="Turnos por cancha."
            />
            <Numero
              etiqueta="Inscripción ($)"
              valor={inscripcion}
              onCambio={setInscripcion}
              step={1000}
              ayuda="Por equipo."
            />
            <div className="col-span-2">
              <Numero
                etiqueta="Cuota por fecha ($)"
                valor={cuotaPorFecha}
                onCambio={setCuota}
                step={500}
                ayuda="Lo que paga cada equipo cada sábado que juega."
              />
            </div>
          </div>
          <p className="text-xs text-mute">
            Entran <b className="num text-ink">{t.capacidadPorSabado}</b> partidos por sábado ({canchas}{' '}
            cancha
            {canchas === 1 ? '' : 's'} × {franjasPorDia} franja{franjasPorDia === 1 ? '' : 's'}).
          </p>
        </section>

        <section className="tile rise space-y-3" style={{ '--d': 3 } as React.CSSProperties}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <b className="text-lg">2 · Elegí una plantilla</b>
            {!plantilla && <span className="pill-amber">Personalizado</span>}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
            {PLANTILLAS_DE_FORMATO.map((p) => (
              <button
                type="button"
                key={p.clave}
                aria-pressed={plantilla === p.clave}
                onClick={() => elegirPlantilla(p.clave)}
                className={`rounded-3xl border-2 p-3.5 text-left transition ${plantilla === p.clave ? 'border-ink bg-white' : 'border-transparent bg-black/5 hover:bg-black/10'}`}
              >
                <b className="block text-sm">{p.nombre}</b>
                <span className="text-xs text-mute">{p.descripcion}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-mute">
            Es un punto de partida: abajo cambiás grupos, ruedas, quiénes pasan y qué se juega ida y vuelta.
          </p>
        </section>
      </div>

      <section aria-label="Totales" className="tile-ink rise" style={{ '--d': 4 } as React.CSSProperties}>
        <div className="field-pattern pointer-events-none absolute inset-0 opacity-50" />
        <div className="relative grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-5">
          <Kpi etiqueta="Sábados" valor={t.sabados} testid="total-sabados" destacado />
          <Kpi etiqueta="Partidos" valor={t.partidos} testid="total-partidos" />
          <Kpi
            etiqueta="Sábados con todos jugando"
            valor={`${t.porcentajeConTodos}%`}
            detalle={`${t.sabadosConTodos} de ${t.sabados}`}
            testid="total-con-todos"
          />
          <Kpi
            etiqueta="Sábados por equipo"
            valor={t.sabadosPorEquipo.toLocaleString('es-AR')}
            detalle="en promedio"
          />
          <div className="col-span-2 md:col-span-1">
            <Kpi
              etiqueta="Recaudación estimada"
              valor={pesos(t.recaudacion)}
              detalle={`${pesos(t.inscripcion)} inscripción + ${pesos(t.cuotas)} cuotas`}
              testid="total-recaudacion"
              chico
            />
          </div>
        </div>
      </section>

      {(errores.length > 0 || avisos.length > 0) && (
        <section aria-label="Revisá el formato" className="space-y-2">
          {errores.map((p, i) => (
            <p
              key={`e${i}`}
              role="alert"
              className="flex items-start gap-2 rounded-2xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700"
            >
              <Icono nombre="x" className="mt-0.5 shrink-0" />
              {p.mensaje}
            </p>
          ))}
          {avisos.map((p, i) => (
            <p
              key={`a${i}`}
              className="flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-2.5 text-sm text-amber-900"
            >
              <Icono nombre="bell" className="mt-0.5 shrink-0" />
              {p.mensaje}
            </p>
          ))}
        </section>
      )}

      <CrearConFormato
        formato={formato}
        equipos={equipos}
        inscripcion={inscripcion}
        cuotaPorFecha={cuotaPorFecha}
        conErrores={errores.length > 0}
      />

      <DiagramaDeFases formato={formato} sim={sim} equipos={equipos} primerSabado={primerSabado} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <EditorDeFases formato={formato} sim={sim} equipos={equipos} onCambio={editar} />
        <Cronograma formato={formato} sim={sim} equipos={datos.equipos} primerSabado={primerSabado} />
      </div>
    </div>
  );
}

function Kpi({
  etiqueta,
  valor,
  detalle,
  destacado,
  chico,
  testid,
}: {
  etiqueta: string;
  valor: React.ReactNode;
  detalle?: string;
  destacado?: boolean;
  chico?: boolean;
  testid?: string;
}) {
  return (
    <div className="min-w-0">
      <span className="eyebrow !text-white/50">{etiqueta}</span>
      <div
        data-testid={testid}
        className={`num mt-1 font-bold tracking-tighter ${chico ? 'text-3xl' : 'text-4xl sm:text-5xl'} ${destacado ? 'text-volt' : ''}`}
      >
        {valor}
      </div>
      {detalle && <p className="mt-0.5 text-xs text-white/60">{detalle}</p>}
    </div>
  );
}
