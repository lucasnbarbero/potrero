'use client';
import {
  CATEGORIAS_PROHIBIDAS_CON_MENORES,
  CATEGORIAS_SPONSOR,
  type CategoriaSponsor,
  ESPACIO_SPONSOR,
  ESPACIOS_SPONSOR,
  type EspacioSponsor,
  NOMBRE_CATEGORIA_SPONSOR,
  sumarDias,
} from '@potrero/shared';
import { Icono } from '@potrero/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Campo, MensajeError, Selector, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';

type TorneoOpcion = { id: string; nombre: string; conMenores: boolean };
type SponsorOpcion = { id: string; nombre: string; categoria: CategoriaSponsor };

/** Ventana sobre la página para un formulario corto. Va en un portal: un ancestro animado (transform) desarmaría el fixed. */
function Dialogo({
  titulo,
  cerrar,
  children,
}: {
  titulo: string;
  cerrar: () => void;
  children: React.ReactNode;
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      onClick={cerrar}
    >
      <div
        className="tile max-h-[90vh] w-full max-w-lg overflow-y-auto !bg-paper hover:!translate-y-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <b className="text-xl tracking-tight">{titulo}</b>
          <button type="button" onClick={cerrar} className="btn-glass btn-sm" aria-label="Cerrar">
            <Icono nombre="x" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

const textoOpcional = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? '').trim();
  return v ? v : undefined;
};

export function NuevoSponsor() {
  const router = useRouter();
  const { enviando, error, campos, enviar } = useEnvio();
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button className="btn-volt" onClick={() => setAbierto(true)}>
        <Icono nombre="plus" />
        Nuevo sponsor
      </button>
      {abierto && (
        <Dialogo titulo="Nuevo sponsor" cerrar={() => setAbierto(false)}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              enviar(async () => {
                await api('POST', '/sponsors', {
                  nombre: f.get('nombre'),
                  categoria: f.get('categoria'),
                  descripcion: textoOpcional(f, 'descripcion'),
                  link: textoOpcional(f, 'link'),
                  logoUrl: textoOpcional(f, 'logoUrl'),
                });
                setAbierto(false);
                router.refresh();
              });
            }}
          >
            <Campo
              etiqueta="Nombre"
              name="nombre"
              required
              placeholder="Kiosco Don Pepe"
              error={campos.nombre}
            />
            <Selector etiqueta="Rubro" name="categoria" defaultValue="BEBIDAS">
              {CATEGORIAS_SPONSOR.map((c) => (
                <option key={c} value={c}>
                  {NOMBRE_CATEGORIA_SPONSOR[c]}
                </option>
              ))}
            </Selector>
            <Campo
              etiqueta="Qué auspicia"
              name="descripcion"
              placeholder="Sponsor oficial · hidratación"
              error={campos.descripcion}
            />
            <Campo
              etiqueta="Link (web o Instagram)"
              name="link"
              type="url"
              placeholder="https://"
              error={campos.link}
              ayuda="Los clics pasan por Potrero para contarlos y después van a este link."
            />
            <Campo
              etiqueta="Logo (link a la imagen, opcional)"
              name="logoUrl"
              type="url"
              error={campos.logoUrl}
            />
            <MensajeError error={error} />
            <button className="btn-volt w-full" disabled={enviando}>
              Guardar sponsor
            </button>
          </form>
        </Dialogo>
      )}
    </>
  );
}

/** Vender un espacio del sitio del torneo a un sponsor, por un período y un monto. */
export function VenderEspacio({
  sponsors,
  torneos,
  sponsorId,
  espacio,
  torneoId,
  hoy,
  children,
  className = 'btn btn-sm',
}: {
  sponsors: SponsorOpcion[];
  torneos: TorneoOpcion[];
  sponsorId?: string;
  espacio?: EspacioSponsor;
  torneoId?: string;
  hoy: string;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const { enviando, error, campos, enviar } = useEnvio();
  const [abierto, setAbierto] = useState(false);
  const [sponsor, setSponsor] = useState(sponsorId ?? sponsors[0]?.id ?? '');
  const [torneo, setTorneo] = useState(torneoId ?? torneos[0]?.id ?? '');
  const cat = sponsors.find((s) => s.id === sponsor)?.categoria;
  const conMenores = torneos.find((t) => t.id === torneo)?.conMenores ?? false;
  const aviso =
    cat && conMenores && CATEGORIAS_PROHIBIDAS_CON_MENORES.includes(cat)
      ? 'Este torneo tiene jugadores menores: no se aceptan sponsors de apuestas, alcohol ni tabaco.'
      : null;
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => setAbierto(true)}
        disabled={!sponsors.length}
      >
        {children}
      </button>
      {abierto && (
        <Dialogo titulo="Vender un espacio" cerrar={() => setAbierto(false)}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              enviar(async () => {
                await api('POST', `/sponsors/${sponsor}/placements`, {
                  torneoId: torneo,
                  espacio: f.get('espacio'),
                  desde: f.get('desde'),
                  hasta: f.get('hasta'),
                  monto: Number(f.get('monto')),
                });
                setAbierto(false);
                router.refresh();
              });
            }}
          >
            <Selector etiqueta="Sponsor" value={sponsor} onChange={(e) => setSponsor(e.target.value)}>
              {sponsors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Selector>
            <Selector etiqueta="Torneo" value={torneo} onChange={(e) => setTorneo(e.target.value)}>
              {torneos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                  {t.conMenores ? ' · con menores' : ''}
                </option>
              ))}
            </Selector>
            <Selector etiqueta="Espacio" name="espacio" defaultValue={espacio ?? 'CABECERA'}>
              {ESPACIOS_SPONSOR.map((e) => (
                <option key={e} value={e}>
                  {ESPACIO_SPONSOR[e].nombre} · {ESPACIO_SPONSOR[e].descripcion}
                </option>
              ))}
            </Selector>
            <div className="grid grid-cols-2 gap-3">
              <Campo
                etiqueta="Desde"
                name="desde"
                type="date"
                required
                defaultValue={hoy}
                error={campos.desde}
              />
              <Campo
                etiqueta="Hasta"
                name="hasta"
                type="date"
                required
                defaultValue={sumarDias(hoy, 30)}
                error={campos.hasta}
              />
            </div>
            <Campo
              etiqueta="Monto acordado por el período ($)"
              name="monto"
              type="number"
              min={0}
              required
              error={campos.monto}
            />
            {aviso && <p className="rounded-2xl bg-amber-100 px-4 py-3 text-sm text-amber-900">{aviso}</p>}
            <MensajeError error={error} />
            <button className="btn-volt w-full" disabled={enviando}>
              Vender espacio
            </button>
            <p className="text-xs text-mute">
              En el sitio público se ve con la etiqueta &quot;Publicidad&quot;, solo dentro del período.
            </p>
          </form>
        </Dialogo>
      )}
    </>
  );
}

/** Registrar lo que pagó el sponsor: entra a la caja como ingreso de Sponsors, enlazado a él. */
export function RegistrarCobro({
  sponsor,
  torneos,
  torneoId,
}: {
  sponsor: { id: string; nombre: string };
  torneos: TorneoOpcion[];
  torneoId?: string;
}) {
  const router = useRouter();
  const { enviando, error, campos, enviar } = useEnvio();
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" className="btn-glass btn-sm" onClick={() => setAbierto(true)}>
        <Icono nombre="wallet" />
        Cobro
      </button>
      {abierto && (
        <Dialogo titulo={`Cobro de ${sponsor.nombre}`} cerrar={() => setAbierto(false)}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              enviar(async () => {
                await api('POST', `/sponsors/${sponsor.id}/cobros`, {
                  monto: Number(f.get('monto')),
                  cobradoEn: f.get('cobradoEn'),
                  fecha: textoOpcional(f, 'fecha'),
                  comprobante: textoOpcional(f, 'comprobante'),
                  torneoId: textoOpcional(f, 'torneoId'),
                });
                setAbierto(false);
                router.refresh();
              });
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Monto ($)" name="monto" type="number" min={1} required error={campos.monto} />
              <Selector etiqueta="Cobrado en" name="cobradoEn" defaultValue="BANCO">
                <option value="BANCO">Transferencia / banco</option>
                <option value="EFECTIVO">Efectivo</option>
                <option value="MP">Mercado Pago</option>
              </Selector>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Fecha" name="fecha" type="date" />
              <Campo etiqueta="Comprobante" name="comprobante" placeholder="Recibo 0021" />
            </div>
            <Selector etiqueta="Torneo" name="torneoId" defaultValue={torneoId ?? ''}>
              <option value="">Ninguno en particular</option>
              {torneos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </Selector>
            <MensajeError error={error} />
            <button className="btn-volt w-full" disabled={enviando}>
              Registrar en la caja
            </button>
            <p className="text-xs text-mute">
              Queda como ingreso de Sponsors en la{' '}
              <Link href="/panel/caja" className="underline">
                caja
              </Link>
              . Si te equivocás, se anula desde ahí.
            </p>
          </form>
        </Dialogo>
      )}
    </>
  );
}

export function PausarEspacio({ id, activo }: { id: string; activo: boolean }) {
  const router = useRouter();
  const { enviando, enviar } = useEnvio();
  return (
    <button
      type="button"
      className="text-xs font-semibold text-mute underline hover:text-ink"
      disabled={enviando}
      onClick={() =>
        enviar(async () => {
          await api('PATCH', `/sponsors/placements/${id}`, { activo: !activo });
          router.refresh();
        })
      }
    >
      {activo ? 'Pausar' : 'Reanudar'}
    </button>
  );
}

/** Rubros que la organización no acepta, además de los prohibidos en torneos con menores. */
export function RubrosRechazados({ rechazadas }: { rechazadas: CategoriaSponsor[] }) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const [marcadas, setMarcadas] = useState<CategoriaSponsor[]>(rechazadas);
  const cambiar = (c: CategoriaSponsor) => {
    const nuevas = marcadas.includes(c) ? marcadas.filter((x) => x !== c) : [...marcadas, c];
    setMarcadas(nuevas);
    enviar(async () => {
      await api('PATCH', '/sponsors/preferencias', { categoriasRechazadas: nuevas });
      router.refresh();
    });
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {CATEGORIAS_SPONSOR.filter((c) => c !== 'OTROS').map((c) => {
          const on = marcadas.includes(c);
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              disabled={enviando}
              onClick={() => cambiar(c)}
              className={on ? 'pill-red' : 'pill'}
            >
              {on && <Icono nombre="x" />}
              {NOMBRE_CATEGORIA_SPONSOR[c]}
            </button>
          );
        })}
      </div>
      <MensajeError error={error} />
    </div>
  );
}

export function ElegirReporte({ sponsors }: { sponsors: { id: string; nombre: string }[] }) {
  const [id, setId] = useState(sponsors[0]?.id ?? '');
  const nombre = sponsors.find((s) => s.id === id)?.nombre ?? '';
  if (!sponsors.length)
    return <p className="mt-3 text-sm text-mute">Cargá un sponsor para generar su reporte.</p>;
  return (
    <div className="mt-3 space-y-2">
      <Selector etiqueta="Sponsor" value={id} onChange={(e) => setId(e.target.value)}>
        {sponsors.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nombre}
          </option>
        ))}
      </Selector>
      <Link href={`/panel/sponsors/${id}`} className="btn-glass w-full" data-testid="generar-reporte">
        <Icono nombre="file" />
        Generar reporte de {nombre}
      </Link>
    </div>
  );
}
