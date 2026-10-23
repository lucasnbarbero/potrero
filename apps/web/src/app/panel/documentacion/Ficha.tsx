'use client';
import { useCallback, useEffect, useState } from 'react';
import { Campo, MensajeError, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';
import type { FichaJugador, TipoDocumento } from '@/lib/tipos';

const MB = 2;

const aBase64 = (archivo: File) =>
  new Promise<string>((ok, mal) => {
    const lector = new FileReader();
    lector.onload = () => ok(String(lector.result).split(',')[1] ?? '');
    lector.onerror = () => mal(new Error('No pudimos leer el archivo.'));
    lector.readAsDataURL(archivo);
  });

const fechaCorta = (f: string) =>
  new Date(f).toLocaleDateString('es-AR', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

/** Ficha del jugador: identidad, documentos con revisión humana, consentimientos y habilitación. */
export function Ficha({
  jugadorId,
  torneoId,
  onCerrar,
  onCambio,
}: {
  jugadorId: string;
  torneoId: string;
  onCerrar: () => void;
  onCambio: () => void;
}) {
  const [f, setF] = useState<FichaJugador | null>(null);
  const [dniCompleto, setDniCompleto] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [rechazando, setRechazando] = useState<string | null>(null);
  const { enviando, error, enviar } = useEnvio();

  const cargar = useCallback(
    () => api<FichaJugador>('GET', `/documentacion/jugadores/${jugadorId}?torneoId=${torneoId}`).then(setF),
    [jugadorId, torneoId],
  );
  useEffect(() => {
    void cargar();
  }, [cargar]);
  const hecho = async () => {
    await cargar();
    onCambio();
  };

  if (!f) return <p className="mt-4 text-mute">Cargando ficha…</p>;

  return (
    <div className="mt-4 space-y-5 rounded-3xl border border-black/10 bg-white/70 p-5" data-testid="ficha">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Ficha del jugador</p>
          <h3 className="text-2xl font-bold tracking-tight">{f.nombre}</h3>
          <p className="text-sm text-mute">
            {f.fechaNacimiento
              ? `Nació el ${fechaCorta(f.fechaNacimiento)}${f.menor ? ' · menor de edad' : ''}`
              : 'Sin fecha de nacimiento'}
          </p>
        </div>
        <div className="text-right">
          <span className={f.habilitacion.habilitado ? 'pill-volt' : 'pill-red'} data-testid="habilitacion">
            {f.habilitacion.habilitado ? 'Habilitado' : 'No habilitado'}
          </span>
          {!f.habilitacion.habilitado && (
            <p className="mt-1 text-xs text-mute">{f.habilitacion.motivos.join(' · ')}</p>
          )}
          <button className="mt-2 text-xs font-semibold underline" onClick={onCerrar}>
            Cerrar ficha
          </button>
        </div>
      </div>
      <MensajeError error={error} />

      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <span className="eyebrow">Identidad</span>
          <form
            className="mt-2 grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              void enviar(async () => {
                await api('PATCH', `/documentacion/jugadores/${jugadorId}/identidad`, {
                  dni: d.get('dni'),
                  fechaNacimiento: (d.get('nacimiento') as string) || undefined,
                  datosMedicos: (d.get('medicos') as string) || undefined,
                });
                setDniCompleto(null);
                await hecho();
              });
            }}
          >
            <Campo
              etiqueta="DNI"
              name="dni"
              required
              defaultValue={dniCompleto ?? ''}
              placeholder={f.dni ? `Cargado (${f.dni})` : '30.123.456'}
              key={dniCompleto ?? 'oculto'}
            />
            <Campo
              etiqueta="Fecha de nacimiento"
              name="nacimiento"
              type="date"
              defaultValue={f.fechaNacimiento?.slice(0, 10) ?? ''}
            />
            <Campo
              etiqueta="Datos de salud (alergias, medicación)"
              name="medicos"
              placeholder={f.tieneDatosMedicos ? 'Cargados · solo los ve quien tiene permiso' : 'Opcional'}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn btn-sm" disabled={enviando}>
                Guardar identidad
              </button>
              {f.dni && (
                <button
                  type="button"
                  className="text-xs font-semibold underline"
                  onClick={() =>
                    void enviar(async () => {
                      const r = await api<{ dni: string | null }>(
                        'GET',
                        `/documentacion/jugadores/${jugadorId}/identidad`,
                      );
                      setDniCompleto(r.dni);
                    })
                  }
                >
                  Ver DNI completo (queda registrado)
                </button>
              )}
            </div>
          </form>
          <p className="mt-1 text-xs text-mute">El DNI y los datos de salud se guardan cifrados.</p>
        </section>

        <section>
          <span className="eyebrow">Subir documento</span>
          <form
            className="mt-2 grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const d = new FormData(form);
              const archivo = d.get('archivo') as File;
              void enviar(async () => {
                if (!archivo?.size) throw new Error('Elegí un archivo.');
                if (archivo.size > MB * 1024 * 1024) throw new Error(`El archivo pesa más de ${MB} MB.`);
                await api('POST', `/documentacion/jugadores/${jugadorId}/documentos`, {
                  tipo: d.get('tipo'),
                  nombreArchivo: archivo.name,
                  mime: archivo.type,
                  contenido: await aBase64(archivo),
                  vencimiento: (d.get('vencimiento') as string) || undefined,
                });
                form.reset();
                await hecho();
              });
            }}
          >
            <label className="block">
              <span className="field-label">Tipo</span>
              <select name="tipo" className="input" defaultValue="DNI">
                <option value="DNI">DNI</option>
                <option value="APTO_FISICO">Apto físico</option>
                <option value="AUTORIZACION_MENOR">Autorización del tutor</option>
              </select>
            </label>
            <label className="block">
              <span className="field-label">Archivo (JPG, PNG o PDF · hasta {MB} MB)</span>
              <input
                name="archivo"
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                className="input"
              />
            </label>
            <Campo etiqueta="Vence (si corresponde)" name="vencimiento" type="date" />
            <button className="btn btn-sm w-fit" disabled={enviando}>
              Subir
            </button>
          </form>
        </section>
      </div>

      <section>
        <span className="eyebrow">Documentos</span>
        {f.documentos.length === 0 && <p className="mt-2 text-sm text-mute">Todavía no subió ninguno.</p>}
        <ul className="mt-2" data-testid="documentos">
          {f.documentos.map((d) => (
            <li key={d.id} className="list-row flex-wrap items-center text-sm">
              <span className="min-w-0 flex-1">
                <b className="block">{d.nombreTipo}</b>
                <span className="text-xs text-mute">
                  {d.archivoNombre}
                  {d.vencimiento ? ` · vence ${fechaCorta(d.vencimiento)}` : ''}
                  {d.motivoRechazo ? ` · ${d.motivoRechazo}` : ''}
                  {d.accesos > 0 ? ` · ${d.accesos} acceso${d.accesos > 1 ? 's' : ''}` : ''}
                </span>
              </span>
              <span
                className={
                  d.estado === 'APROBADO' ? 'pill-volt' : d.estado === 'RECHAZADO' ? 'pill-red' : 'pill-amber'
                }
              >
                {d.estado === 'APROBADO'
                  ? 'Aprobado'
                  : d.estado === 'RECHAZADO'
                    ? 'Rechazado'
                    : 'Por revisar'}
              </span>
              <button
                className="btn-glass btn-sm"
                onClick={() =>
                  void enviar(async () => {
                    const r = await api<{ url: string }>('POST', `/documentacion/documentos/${d.id}/url`);
                    window.open(r.url, '_blank', 'noopener');
                  })
                }
              >
                Ver
              </button>
              {d.estado === 'PENDIENTE' && (
                <>
                  <form
                    className="flex items-center gap-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const v = (new FormData(e.currentTarget).get('vence') as string) || undefined;
                      void enviar(async () => {
                        await api('POST', `/documentacion/documentos/${d.id}/revisar`, {
                          decision: 'APROBAR',
                          vencimiento: v,
                        });
                        await hecho();
                      });
                    }}
                  >
                    {d.tipo === 'APTO_FISICO' && !d.vencimiento && (
                      <input
                        name="vence"
                        type="date"
                        required
                        className="input !w-auto !py-1 text-xs"
                        aria-label="Vence"
                      />
                    )}
                    <button className="btn btn-sm" disabled={enviando}>
                      Aprobar
                    </button>
                  </form>
                  <button
                    className="btn-glass btn-sm"
                    onClick={() => setRechazando(rechazando === d.id ? null : d.id)}
                  >
                    Rechazar
                  </button>
                  {rechazando === d.id && (
                    <form
                      className="flex w-full items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const motivo = new FormData(e.currentTarget).get('motivo') as string;
                        void enviar(async () => {
                          await api('POST', `/documentacion/documentos/${d.id}/revisar`, {
                            decision: 'RECHAZAR',
                            motivo,
                          });
                          setRechazando(null);
                          await hecho();
                        });
                      }}
                    >
                      <input
                        name="motivo"
                        required
                        minLength={3}
                        className="input"
                        placeholder="Motivo (lo ve el capitán)"
                        aria-label="Motivo del rechazo"
                      />
                      <button className="btn btn-sm" disabled={enviando}>
                        Confirmar rechazo
                      </button>
                    </form>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <span className="eyebrow">Consentimientos</span>
        <ul className="mt-2" data-testid="consentimientos">
          {f.consentimientos.map((c) => (
            <li key={c.id} className="list-row items-center text-sm">
              <span className="min-w-0 flex-1">
                <b className="block">
                  {c.tipo === 'TUTOR_PARTICIPACION'
                    ? 'Autorización del tutor'
                    : c.tipo === 'IMAGEN'
                      ? 'Uso de imagen'
                      : 'Datos personales'}
                </b>
                <span className="text-xs text-mute">
                  {c.otorgante}
                  {c.vinculo ? ` (${c.vinculo.toLowerCase()})` : ''} · versión {c.version} ·{' '}
                  {fechaCorta(c.otorgadoEn)}
                </span>
              </span>
              <span className={c.vigente ? 'pill-volt' : 'pill'}>
                {c.revocadoEn ? 'Revocado' : c.vigente ? 'Vigente' : 'Versión vieja'}
              </span>
              {!c.revocadoEn && (
                <button
                  className="btn-glass btn-sm"
                  onClick={() =>
                    void enviar(async () => {
                      await api('POST', `/documentacion/consentimientos/${c.id}/revocar`);
                      await hecho();
                    })
                  }
                >
                  Revocar
                </button>
              )}
            </li>
          ))}
        </ul>
        {f.menor && (
          <div className="mt-2">
            <button
              className="btn btn-sm"
              disabled={enviando}
              onClick={() =>
                void enviar(async () => {
                  const r = await api<{ link: string }>(
                    'POST',
                    `/documentacion/jugadores/${jugadorId}/consentimiento-tutor`,
                  );
                  setLink(r.link);
                })
              }
            >
              Pedir autorización al tutor
            </button>
            {link && (
              <p className="mt-2 break-all rounded-2xl bg-volt/30 px-3 py-2 text-xs" data-testid="link-tutor">
                Mandale este link al padre, madre o tutor (vale 14 días y se usa una vez): <b>{link}</b>
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

export type { TipoDocumento };
