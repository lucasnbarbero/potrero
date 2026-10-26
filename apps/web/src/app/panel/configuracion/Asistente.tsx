'use client';
// Asistente de configuración inicial (E25-01, mock 20): cinco pasos, se puede retomar y cada uno se guarda solo.
import {
  COLORES_MARCA,
  DATOS,
  PASOS_CONFIGURACION,
  type PasoConfiguracion,
  TITULO_PASO,
} from '@potrero/shared';
import { Icono } from '@potrero/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Campo, MensajeError, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';
import { iniciales } from '@/lib/formato';
import type { EstadoConfiguracion } from '@/lib/tipos';
import { Importador } from './Importador';

const DESEMPATES: Record<string, string> = {
  DIFERENCIA_GOL: 'Diferencia de gol',
  GOLES_FAVOR: 'Goles a favor',
  ENTRE_SI: 'Resultado entre sí',
  JUEGO_LIMPIO: 'Juego limpio',
  SORTEO: 'Sorteo',
};

const RESUMEN: Record<PasoConfiguracion, (e: EstadoConfiguracion) => string> = {
  organizacion: (e) =>
    [e.organizacion.nombre, [e.organizacion.localidad, e.organizacion.provincia].filter(Boolean).join(', ')]
      .filter(Boolean)
      .join(' · '),
  mercadoPago: (e) =>
    e.organizacion.mpConectado
      ? 'Cuenta conectada. Cobrás directo en tu cuenta.'
      : 'Lo conectás cuando abras las inscripciones.',
  marca: (e) => `Sitio público en /t/${e.organizacion.slug}`,
  reglamento: () => 'Puntos, desempates, tarjetas, tolerancia y equipo ausente',
  importacion: (e) =>
    e.conteos.equipos
      ? `${e.conteos.equipos} equipos, ${e.conteos.jugadores} jugadores y ${e.conteos.canchas} canchas cargados.`
      : 'Subí tus equipos y jugadores actuales desde Excel o CSV.',
};

export function Asistente({
  estado,
  inicial,
}: {
  estado: EstadoConfiguracion;
  inicial: PasoConfiguracion | null;
}) {
  const [activo, setActivo] = useState<PasoConfiguracion | null>(inicial);
  const [marca, setMarca] = useState({
    color: estado.organizacion.colorMarca ?? COLORES_MARCA[0],
    logo: estado.organizacion.logo,
  });
  const { progreso: p } = estado;
  /** Al guardar un paso se abre el siguiente que falte (o ninguno si ya está todo). */
  const avanzar = (desde: PasoConfiguracion) => {
    const orden = PASOS_CONFIGURACION.indexOf(desde);
    const resto = [...PASOS_CONFIGURACION.slice(orden + 1), ...PASOS_CONFIGURACION.slice(0, orden)];
    setActivo(resto.find((x) => !p.completos[x]) ?? null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        {PASOS_CONFIGURACION.map((paso, i) => {
          const listo = p.completos[paso];
          const abierto = activo === paso;
          return (
            <section
              key={paso}
              data-testid={`paso-${paso}`}
              className={`tile rise ${abierto ? 'ring-2 ring-volt' : ''} ${!abierto && !listo ? 'opacity-70' : ''}`}
              style={{ '--d': i + 1 } as React.CSSProperties}
            >
              <div className="flex items-center gap-4">
                <span
                  className={`grid size-11 shrink-0 place-items-center rounded-full font-bold ${listo ? 'bg-ink text-volt' : abierto ? 'bg-volt' : 'bg-black/10'}`}
                >
                  {listo ? <Icono nombre="check" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <b>
                    {listo ? `${i + 1} · ` : ''}
                    {TITULO_PASO[paso]}
                  </b>
                  <p className="text-sm text-mute">{RESUMEN[paso](estado)}</p>
                </div>
                {listo && (
                  <span className="pill-volt hidden sm:inline-flex">
                    {paso === 'mercadoPago' && estado.organizacion.mpConectado ? 'Conectado' : 'Listo'}
                  </span>
                )}
                {!abierto && (
                  <button className="btn-glass btn-sm" onClick={() => setActivo(paso)}>
                    {listo ? 'Editar' : 'Abrir'}
                  </button>
                )}
              </div>
              {abierto && (
                <div className="mt-5">
                  {paso === 'organizacion' && (
                    <PasoOrganizacion estado={estado} listo={() => avanzar(paso)} />
                  )}
                  {paso === 'mercadoPago' && <PasoMercadoPago estado={estado} listo={() => avanzar(paso)} />}
                  {paso === 'marca' && (
                    <PasoMarca
                      estado={estado}
                      marca={marca}
                      setMarca={setMarca}
                      listo={() => avanzar(paso)}
                    />
                  )}
                  {paso === 'reglamento' && <PasoReglamento estado={estado} listo={() => avanzar(paso)} />}
                  {paso === 'importacion' && <Importador />}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <aside className="space-y-4 xl:sticky xl:top-24">
        <section className="tile-ink rise" style={{ '--d': 2 } as React.CSSProperties}>
          <div className="field-pattern pointer-events-none absolute inset-0 opacity-70" />
          <div className="relative">
            <span className="eyebrow !text-white/50">Progreso</span>
            <div className="num mt-2 text-6xl font-bold tracking-tighter" data-testid="progreso">
              {p.porcentaje}%
            </div>
            <div className="bar mt-3 !bg-white/15">
              <i style={{ width: `${p.porcentaje}%`, background: '#d6ff3d' }} />
            </div>
            <p className="mt-3 text-sm text-white/60">
              {p.siguiente
                ? `${p.cantidad} de ${p.total} pasos completos. Al terminar, ya podés abrir inscripciones.`
                : 'Configuración completa. Ya podés crear tu torneo y abrir inscripciones.'}
            </p>
            {!p.siguiente && (
              <a href="/panel/torneos/nuevo" className="btn-volt btn-sm mt-4">
                Crear torneo
                <Icono nombre="arrow" />
              </a>
            )}
          </div>
        </section>
        <section className="tile rise" style={{ '--d': 3 } as React.CSSProperties}>
          <b>Vista previa de tu sitio</b>
          <div className="mt-3 overflow-hidden rounded-3xl bg-ink p-4 text-white">
            <div className="flex items-center gap-2">
              {marca.logo ? (
                <img src={marca.logo} alt="" className="size-9 rounded-xl bg-white object-contain p-0.5" />
              ) : (
                <span
                  className="grid size-9 place-items-center rounded-xl text-xs font-extrabold text-ink"
                  style={{ background: marca.color }}
                >
                  {iniciales(estado.organizacion.nombre)}
                </span>
              )}
              <span className="pill border-transparent text-ink" style={{ background: marca.color }}>
                Torneo
              </span>
            </div>
            <div className="mt-2 text-3xl font-bold tracking-tighter">{estado.organizacion.nombre}</div>
            <div className="mt-3 grid grid-cols-3 gap-1.5 text-center text-[11px] text-white/60">
              <div className="rounded-xl bg-white/10 py-2">Tabla</div>
              <div className="rounded-xl bg-white/10 py-2">Fixture</div>
              <div className="rounded-xl py-2 font-bold text-ink" style={{ background: marca.color }}>
                Inscribirse
              </div>
            </div>
          </div>
          <a
            href={`/t/${estado.organizacion.slug}`}
            className="mt-3 inline-flex text-sm font-semibold underline"
          >
            Abrir el sitio público
          </a>
        </section>
      </aside>
    </div>
  );
}

function Guardar({ enviando, texto = 'Guardar y continuar' }: { enviando: boolean; texto?: string }) {
  return (
    <div className="mt-5 flex justify-end">
      <button className="btn-volt" disabled={enviando}>
        {enviando ? 'Guardando…' : texto}
        <Icono nombre="arrow" />
      </button>
    </div>
  );
}

function PasoOrganizacion({ estado, listo }: { estado: EstadoConfiguracion; listo: () => void }) {
  const router = useRouter();
  const { enviando, error, campos, enviar } = useEnvio();
  const o = estado.organizacion;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.currentTarget));
        enviar(async () => {
          await api('PATCH', '/configuracion/organizacion', f);
          router.refresh();
          listo();
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo
          etiqueta="Nombre de la liga"
          name="nombre"
          defaultValue={o.nombre}
          required
          error={campos.nombre}
        />
        <Campo etiqueta="Localidad" name="localidad" defaultValue={o.localidad ?? ''} placeholder="Lanús" />
        <Campo
          etiqueta="Provincia"
          name="provincia"
          defaultValue={o.provincia ?? ''}
          placeholder="Buenos Aires"
        />
      </div>
      <MensajeError error={error} />
      <Guardar enviando={enviando} />
    </form>
  );
}

function PasoMercadoPago({ estado, listo }: { estado: EstadoConfiguracion; listo: () => void }) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const conectado = estado.organizacion.mpConectado;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        enviar(async () => {
          await api('POST', '/configuracion/pasos', { paso: 'mercadoPago' });
          router.refresh();
          listo();
        });
      }}
    >
      <p className="text-sm text-mute">
        {conectado
          ? 'Tu cuenta de Mercado Pago ya está conectada. Cobrás directo en tu cuenta y Potrero descuenta su comisión.'
          : 'Las inscripciones y cuotas se cobran con Mercado Pago, directo en tu cuenta. Podés conectarla después: mientras tanto registrás los pagos a mano.'}
      </p>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-2xl bg-black/5 p-3">
          <span className="text-xs text-mute">Dónde cobrás</span>
          <b className="block">Directo en tu cuenta</b>
        </div>
        <div className="rounded-2xl bg-black/5 p-3">
          <span className="text-xs text-mute">Acreditación</span>
          <b className="block">Según el plazo que elijas</b>
        </div>
        <div className="rounded-2xl bg-black/5 p-3">
          <span className="text-xs text-mute">Medios</span>
          <b className="block">Tarjeta, dinero en cuenta</b>
        </div>
      </div>
      <MensajeError error={error} />
      <Guardar enviando={enviando} texto={conectado ? 'Continuar' : 'Conectar después'} />
    </form>
  );
}

const TIPOS_LOGO = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_LOGO = 300 * 1024;

function PasoMarca({
  estado,
  marca,
  setMarca,
  listo,
}: {
  estado: EstadoConfiguracion;
  marca: { color: string; logo: string | null };
  setMarca: (m: { color: string; logo: string | null }) => void;
  listo: () => void;
}) {
  const router = useRouter();
  const { enviando, error, campos, enviar } = useEnvio();
  const [errorLogo, setErrorLogo] = useState<string | null>(null);
  const [slug, setSlug] = useState(estado.organizacion.slug);

  const elegirLogo = (archivo: File | undefined) => {
    setErrorLogo(null);
    if (!archivo) return;
    if (!TIPOS_LOGO.includes(archivo.type)) return setErrorLogo('El logo tiene que ser PNG, JPG o WEBP.');
    if (archivo.size > MAX_LOGO) return setErrorLogo('El logo pesa más de 300 KB. Probá con uno más chico.');
    const lector = new FileReader();
    lector.onload = () => setMarca({ ...marca, logo: String(lector.result) });
    lector.readAsDataURL(archivo);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        enviar(async () => {
          await api('PATCH', '/configuracion/marca', { slug, colorMarca: marca.color, logo: marca.logo });
          router.refresh();
          listo();
        });
      }}
    >
      <p className="text-sm text-mute">Así se verá el sitio público y las tarjetas que se comparten.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="field-label">Dirección web</span>
          <div
            className={`flex items-center rounded-2xl border bg-white/80 px-4 text-sm ${campos.slug ? 'border-red-500' : 'border-black/10'}`}
          >
            <span className="text-mute">/t/</span>
            <input
              name="slug"
              className="w-full bg-transparent py-3 font-semibold outline-none"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
              required
              minLength={3}
              maxLength={40}
            />
          </div>
          {campos.slug && <span className="mt-1 block text-xs font-medium text-red-600">{campos.slug}</span>}
          {slug !== estado.organizacion.slug && (
            <span className="mt-1 block text-xs text-mute">
              Los links que ya compartiste dejan de funcionar.
            </span>
          )}
        </label>
        <div>
          <span className="field-label">Escudo</span>
          <label
            className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-black/15 p-3"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              elegirLogo(e.dataTransfer.files[0]);
            }}
          >
            {marca.logo ? (
              <img src={marca.logo} alt="Logo de la liga" className="size-12 rounded-2xl object-contain" />
            ) : (
              <span
                className="crest size-12"
                style={{ '--c': marca.color, color: '#0a0a0a' } as React.CSSProperties}
              >
                {iniciales(estado.organizacion.nombre)}
              </span>
            )}
            <span className="text-sm text-mute">
              Arrastrá tu logo o <b className="text-ink">elegí un archivo</b>
            </span>
            <input
              type="file"
              accept={TIPOS_LOGO.join(',')}
              className="sr-only"
              aria-label="Logo"
              onChange={(e) => elegirLogo(e.target.files?.[0])}
            />
          </label>
          {marca.logo && (
            <button
              type="button"
              className="mt-1 text-xs font-semibold underline"
              onClick={() => setMarca({ ...marca, logo: null })}
            >
              Quitar el logo
            </button>
          )}
          {errorLogo && <span className="mt-1 block text-xs font-medium text-red-600">{errorLogo}</span>}
        </div>
        <div className="sm:col-span-2">
          <span className="field-label">Color principal</span>
          <div className="flex flex-wrap items-center gap-2">
            {COLORES_MARCA.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                aria-pressed={marca.color === c}
                onClick={() => setMarca({ ...marca, color: c })}
                className={`size-10 rounded-full ${marca.color === c ? 'ring-4 ring-ink' : ''}`}
                style={{ background: c }}
              />
            ))}
            <label className="flex items-center gap-2 text-sm text-mute">
              <input
                type="color"
                value={marca.color}
                onChange={(e) => setMarca({ ...marca, color: e.target.value })}
                className="size-10 cursor-pointer rounded-full border-0 bg-transparent"
                aria-label="Otro color"
              />
              Otro
            </label>
          </div>
        </div>
      </div>
      <MensajeError error={error} />
      <Guardar enviando={enviando} />
    </form>
  );
}

function PasoReglamento({ estado, listo }: { estado: EstadoConfiguracion; listo: () => void }) {
  const router = useRouter();
  const { enviando, error, enviar } = useEnvio();
  const r = estado.reglamento;
  const fechas = (n: number) => (n === 1 ? '1 fecha' : `${n} fechas`);
  const filas: [string, string][] = [
    [
      'Puntos',
      `${r.puntosVictoria} por ganar · ${r.puntosEmpate} por empatar · ${r.puntosDerrota} por perder`,
    ],
    ['Desempates', r.desempates.map((d) => DESEMPATES[d] ?? d).join(' → ')],
    ['Roja directa', fechas(r.suspensionRojaDirecta)],
    ['Doble amarilla', fechas(r.suspensionDobleAmarilla)],
    ['Acumulación', `${r.umbralAmarillas} amarillas = ${fechas(r.suspensionAcumulacion)}`],
    ['Tolerancia', `${DATOS.reglamentoPorDefecto.toleranciaWOMinutos} minutos`],
    ['Equipo ausente', `${r.golesWO} a 0 para el que se presentó`],
  ];
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        enviar(async () => {
          await api('POST', '/configuracion/pasos', { paso: 'reglamento' });
          router.refresh();
          listo();
        });
      }}
    >
      <p className="text-sm text-mute">
        Es el reglamento con el que arranca cada torneo nuevo. Los puntos y las amarillas los ajustás al crear
        el torneo.
      </p>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        {filas.map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-black/5 p-3">
            <dt className="text-xs text-mute">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <MensajeError error={error} />
      <Guardar enviando={enviando} texto="Usar este reglamento" />
    </form>
  );
}
