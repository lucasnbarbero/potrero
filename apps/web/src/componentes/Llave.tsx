import { Icono } from '@potrero/ui';
import Link from 'next/link';
import { fechaCorta, hora } from '@/lib/formato';
import type { CruceLlave, Llave as LlaveDatos } from '@/lib/tipos';
import { Escudo } from './ui';

function Lado({
  nombre,
  conocido,
  goles,
  penales,
  gano,
  perdio,
}: {
  nombre: string;
  conocido: boolean;
  goles: number | null;
  penales: number | null;
  gano: boolean;
  perdio: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-1 py-1 ${perdio ? 'text-mute' : ''} ${gano ? 'font-bold' : 'font-medium'}`}
    >
      {conocido ? (
        <Escudo nombre={nombre} className="!size-7 !text-[9px]" />
      ) : (
        <span className="grid size-7 shrink-0 place-items-center rounded-full border border-dashed border-black/20 text-mute">
          ?
        </span>
      )}
      <span className={`min-w-0 flex-1 truncate ${conocido ? '' : 'text-xs italic text-mute'}`}>
        {nombre}
      </span>
      {goles !== null && (
        <span className="num text-base">
          {goles}
          {penales !== null && <sup className="ml-0.5 text-[10px] font-semibold text-mute">({penales})</sup>}
        </span>
      )}
    </div>
  );
}

function Cruce({ c, enlazarActa }: { c: CruceLlave; enlazarActa: boolean }) {
  const jugado = c.partidoEstado === 'FINALIZADO' || c.partidoEstado === 'WO';
  const wo = c.partidoEstado === 'WO';
  return (
    <div
      className={`rounded-2xl border bg-white p-2 text-sm ${c.estado === 'LISTO' && !jugado ? 'border-ink/30' : 'border-black/10'}`}
    >
      <Lado
        nombre={c.local}
        conocido={!!c.localId}
        goles={jugado && !wo ? c.golesLocal : null}
        penales={jugado && !wo ? c.penalesLocal : null}
        gano={!!c.ganadorId && c.ganadorId === c.localId}
        perdio={!!c.ganadorId && c.ganadorId !== c.localId}
      />
      <Lado
        nombre={c.visitante}
        conocido={!!c.visitanteId}
        goles={jugado && !wo ? c.golesVisitante : null}
        penales={jugado && !wo ? c.penalesVisitante : null}
        gano={!!c.ganadorId && c.ganadorId === c.visitanteId}
        perdio={!!c.ganadorId && c.ganadorId !== c.visitanteId}
      />
      {(c.inicio || wo || c.partidoId) && (
        <div className="mt-1 flex items-center justify-between gap-2 border-t border-black/5 px-1 pt-1.5 text-[11px] text-mute">
          <span className="min-w-0 truncate">
            {wo ? 'Equipo ausente' : c.inicio ? `${fechaCorta(c.inicio)} · ${hora(c.inicio)}` : ''}
            {c.cancha && !jugado ? ` · ${c.cancha}` : ''}
          </span>
          {enlazarActa && c.partidoId && (
            <Link
              href={`/panel/partidos/${c.partidoId}`}
              className={`shrink-0 font-semibold text-ink underline ${jugado ? 'opacity-60' : ''}`}
            >
              Acta
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/** Cuadro de eliminación directa: una columna por ronda, de izquierda a derecha, con el campeón al final. */
export function Llave({ llave, enlazarActa = false }: { llave: LlaveDatos; enlazarActa?: boolean }) {
  return (
    <div className="tile !p-4 sm:!p-6">
      <div className="scrollx">
        <div className="flex min-w-[640px] items-stretch gap-4">
          {llave.rondas.map((r) => (
            <div key={r.numero} className="flex min-w-44 flex-1 flex-col">
              <p className="eyebrow text-center">{r.nombre}</p>
              <div className="mt-3 flex flex-1 flex-col justify-around gap-3">
                {r.partidos.map((c) => (
                  <Cruce key={c.clave} c={c} enlazarActa={enlazarActa} />
                ))}
              </div>
            </div>
          ))}
          <div className="flex min-w-32 flex-col">
            <p className="eyebrow text-center">Campeón</p>
            <div className="mt-3 flex flex-1 flex-col justify-center">
              <div
                className={`grid place-items-center gap-2 rounded-2xl p-4 text-center ${llave.campeon ? 'bg-volt ring-4 ring-volt/60' : 'border border-dashed border-black/20 text-mute'}`}
              >
                <Icono nombre="trophy" className="text-2xl" />
                <b className="text-sm">{llave.campeon?.nombre ?? 'A definir'}</b>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
