'use client';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { MensajeError, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';
import { iniciales } from '@/lib/formato';
import type { EstadoVigencia, FilaDocumentacion } from '@/lib/tipos';
import { Ficha } from './Ficha';

export function PildoraEstado({ estado, falta = 'Sin cargar' }: { estado: EstadoVigencia; falta?: string }) {
  switch (estado) {
    case 'VIGENTE':
      return <span className="pill-volt">OK</span>;
    case 'POR_VENCER':
      return <span className="pill-amber">Vence pronto</span>;
    case 'VENCIDO':
      return <span className="pill-red">Vencido</span>;
    case 'PENDIENTE':
      return <span className="pill-amber">Por revisar</span>;
    case 'RECHAZADO':
      return <span className="pill-red">Rechazado</span>;
    default:
      return <span className="pill">{falta}</span>;
  }
}

type Filtro = 'observaciones' | 'todos' | 'menores';

export function TablaDocumentacion({ filas, torneoId }: { filas: FilaDocumentacion[]; torneoId: string }) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const [filtro, setFiltro] = useState<Filtro>('observaciones');
  const [buscar, setBuscar] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const conObservaciones = filas.filter((f) => !f.habilitado);
  const visibles = useMemo(() => {
    const base =
      filtro === 'observaciones'
        ? conObservaciones
        : filtro === 'menores'
          ? filas.filter((f) => f.menor)
          : filas;
    const q = buscar.trim().toLowerCase();
    return q ? base.filter((f) => `${f.nombre} ${f.equipo}`.toLowerCase().includes(q)) : base;
  }, [filas, conObservaciones, filtro, buscar]);

  const solicitar = (ids: string[]) =>
    enviar(async () => {
      const r = await api<{ enviados: number; equipos: number }>(
        'POST',
        `/documentacion/solicitar?torneoId=${torneoId}`,
        { jugadorIds: ids },
      );
      setAviso(
        r.enviados > 0
          ? `Les avisamos a ${r.enviados} ${r.enviados > 1 ? 'capitanes' : 'capitán'} qué documentación falta.`
          : 'Ya les avisamos hoy a esos capitanes.',
      );
    });

  return (
    <section className="tile rise !p-3 sm:!p-5" style={{ '--d': 5 } as React.CSSProperties}>
      <div className="flex flex-wrap items-center justify-between gap-3 p-2">
        <div className="tabs" role="tablist">
          {(
            [
              ['observaciones', 'Con observaciones', conObservaciones.length],
              ['todos', 'Todos', filas.length],
              ['menores', 'Menores', filas.filter((f) => f.menor).length],
            ] as const
          ).map(([k, texto, n]) => (
            <button
              key={k}
              role="tab"
              aria-selected={filtro === k}
              className={filtro === k ? 'on' : ''}
              onClick={() => setFiltro(k)}
            >
              {texto} {n}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input !w-48"
            placeholder="Buscar jugador o equipo"
            aria-label="Buscar"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
          />
          <button
            className="btn btn-sm"
            disabled={enviando || conObservaciones.length === 0}
            onClick={() => solicitar(conObservaciones.map((f) => f.jugadorId))}
          >
            Pedir faltantes
          </button>
        </div>
      </div>
      {aviso && (
        <p
          role="status"
          className="mx-2 mb-2 rounded-2xl bg-volt/40 px-4 py-2 text-sm font-semibold"
          data-testid="aviso-documentacion"
        >
          {aviso}
        </p>
      )}
      <MensajeError error={error} />
      <div className="scrollx">
        <table className="w-full min-w-[720px] text-sm" data-testid="tabla-documentacion">
          <thead>
            <tr>
              <th className="th">Jugador</th>
              <th className="th">Equipo</th>
              <th className="th">DNI</th>
              <th className="th">Apto físico</th>
              <th className="th">Observación</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody className="[&>tr]:border-t [&>tr]:border-black/5 hover:[&>tr]:bg-white/60">
            {visibles.length === 0 && (
              <tr>
                <td className="td text-mute" colSpan={6}>
                  {filtro === 'observaciones'
                    ? 'No hay jugadores con observaciones. ¡Todo en orden!'
                    : 'No hay jugadores.'}
                </td>
              </tr>
            )}
            {visibles.map((f) => (
              <tr key={`${f.equipoId}-${f.jugadorId}`} className={f.duplicado ? 'bg-red-50/60' : ''}>
                <td className="td">
                  <div className="flex items-center gap-3">
                    <span
                      className={`grid size-10 place-items-center rounded-full text-xs font-bold ${f.duplicado ? 'bg-red-100 text-red-600' : 'bg-black/10'}`}
                    >
                      {iniciales(f.nombre)}
                    </span>
                    <div>
                      <b>{f.nombre}</b>
                      {f.menor && f.edad != null && <span className="pill ml-1">{f.edad} años</span>}
                    </div>
                  </div>
                </td>
                <td className="td">{f.equipo}</td>
                <td className="td">
                  <PildoraEstado estado={f.estados.DNI} falta="Sin verificar" />
                </td>
                <td className="td">
                  <PildoraEstado estado={f.estados.APTO_FISICO} />
                </td>
                <td className="td text-xs text-mute">{f.habilitado ? '—' : f.motivos.join(' · ')}</td>
                <td className="td whitespace-nowrap text-right">
                  <button
                    className="btn-glass btn-sm"
                    onClick={() => setAbierto(abierto === f.jugadorId ? null : f.jugadorId)}
                  >
                    {abierto === f.jugadorId ? 'Cerrar' : 'Revisar'}
                  </button>
                  {!f.habilitado && (
                    <button
                      className="btn-glass btn-sm ml-1"
                      disabled={enviando}
                      onClick={() => solicitar([f.jugadorId])}
                    >
                      Solicitar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {abierto && (
        <Ficha
          key={abierto}
          jugadorId={abierto}
          torneoId={torneoId}
          onCerrar={() => setAbierto(null)}
          onCambio={() => router.refresh()}
        />
      )}
    </section>
  );
}
