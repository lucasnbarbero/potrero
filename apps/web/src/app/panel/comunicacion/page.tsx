import { Icono } from '@potrero/ui';
import { Encabezado, Vacio } from '@/componentes/ui';
import { apiServidor } from '@/lib/api';
import { fechaCorta, hora } from '@/lib/formato';
import type { Automatizacion, Equipo, HistorialComunicacion, PlantillaMensaje, Torneo } from '@/lib/tipos';
import { Automatizaciones } from './Automatizaciones';
import { DetalleEnvio } from './DetalleEnvio';
import { Redactor } from './Redactor';

export const metadata = { title: 'Comunicación' };

const NOMBRE_CANAL = { WHATSAPP: 'WhatsApp', EMAIL: 'Email', PUSH: 'Push' } as const;

export default async function Comunicacion() {
  const [plantillas, historial, automatizaciones, torneos, equipos] = await Promise.all([
    apiServidor<PlantillaMensaje[]>('/comunicacion/plantillas'),
    apiServidor<HistorialComunicacion>('/comunicacion/historial'),
    apiServidor<Automatizacion[]>('/comunicacion/automatizaciones'),
    apiServidor<Torneo[]>('/torneos'),
    apiServidor<Equipo[]>('/equipos'),
  ]);
  const { tope } = historial;
  return (
    <div className="space-y-6">
      <Encabezado eyebrow="Difusión" titulo="Comunicación">
        <span className="pill">
          <Icono nombre="whatsapp" />
          WhatsApp del mes: {tope.usados}/{tope.tope}
        </span>
      </Encabezado>
      <p className="-mt-3 max-w-xl text-mute">
        Un solo mensaje, a quien corresponde. Se completa solo para cada destinatario y te mostramos cuánto
        cuesta antes de enviar.
      </p>

      <div className="grid items-start gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Redactor
          plantillas={plantillas.filter((p) => p.manual)}
          torneos={torneos
            .filter((t) => t.estado !== 'BORRADOR')
            .map((t) => ({ id: t.id, nombre: t.nombre }))}
          equipos={equipos.map((e) => ({ id: e.id, nombre: e.nombre }))}
        />

        <div className="space-y-4">
          <Automatizaciones inicial={automatizaciones} />

          <section className="tile rise" style={{ '--d': 3 } as React.CSSProperties}>
            <span className="eyebrow">Últimos envíos</span>
            <ul className="mt-2" data-testid="historial-envios">
              {historial.envios.map((e) => {
                const pct = e.total ? Math.round((e.leidos / e.total) * 100) : 0;
                return (
                  <li key={e.id} className="list-row text-sm">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-volt">
                      <Icono nombre={e.canal === 'WHATSAPP' ? 'whatsapp' : 'send'} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate">{e.titulo}</b>
                      <span className="text-xs text-mute">
                        {e.estado === 'PROGRAMADA' && e.programadaPara
                          ? `Programado · ${fechaCorta(e.programadaPara)} ${hora(e.programadaPara)}`
                          : `${e.total} ${e.total === 1 ? 'destinatario' : 'destinatarios'} · ${NOMBRE_CANAL[e.canal]} · ${fechaCorta(e.creadoEn)}`}
                        {e.costoUsd > 0 ? ` · US$ ${e.costoUsd.toFixed(2).replace('.', ',')}` : ''}
                      </span>
                      {e.estado === 'ENVIADA' && <DetalleEnvio id={e.id} />}
                    </span>
                    {e.estado === 'PROGRAMADA' ? (
                      <span className="pill-amber">Programado</span>
                    ) : e.fallidos > 0 ? (
                      <span className="pill-red">{e.fallidos} fallidos</span>
                    ) : (
                      <span className="pill">{pct}% leído</span>
                    )}
                  </li>
                );
              })}
              {historial.envios.length === 0 && (
                <li className="py-3 text-sm text-mute">Todavía no enviaste mensajes.</li>
              )}
            </ul>
            {historial.automaticosDelMes > 0 && (
              <p className="mt-3 text-xs text-mute">
                Además, este mes se mandaron {historial.automaticosDelMes} avisos automáticos.
              </p>
            )}
          </section>
        </div>
      </div>
      {plantillas.length === 0 && <Vacio titulo="Sin plantillas" texto="No hay plantillas disponibles." />}
    </div>
  );
}
