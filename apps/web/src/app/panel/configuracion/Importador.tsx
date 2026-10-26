'use client';
// Importación desde Excel o CSV (E25-02): el archivo se lee en el navegador, la API valida fila por fila
// (vista previa) y al confirmar importa todo junto o nada.
import {
  COLUMNAS_IMPORTACION,
  describirProblema,
  HOJAS_IMPORTACION,
  type HojaImportacion,
  NOMBRE_HOJA,
  parsearCsv,
  type TablaCruda,
} from '@potrero/shared';
import { Icono } from '@potrero/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MensajeError, useEnvio } from '@/componentes/formulario';
import { api } from '@/lib/cliente';
import type { VistaPreviaImportacion } from '@/lib/tipos';

const PLANTILLAS = '/plantillas';
/** Filas que se muestran por hoja en la vista previa (los errores se listan todos arriba). */
const FILAS_VISIBLES = 150;

/** Celda del Excel a texto: las fechas como AAAA-MM-DD, los números tal cual. */
function aTexto(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  return String(v);
}

/** Un CSV guardado desde Excel suele venir en Windows-1252: si no es UTF-8 válido, se lee así. */
async function leerTextoCsv(archivo: File) {
  const bytes = await archivo.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

async function leerArchivos(archivos: File[]): Promise<TablaCruda[]> {
  const tablas: TablaCruda[] = [];
  for (const a of archivos) {
    const nombre = a.name.toLowerCase();
    if (nombre.endsWith('.csv') || nombre.endsWith('.txt')) {
      tablas.push({ nombre: a.name, filas: parsearCsv(await leerTextoCsv(a)) });
    } else if (nombre.endsWith('.xlsx')) {
      const { default: leerExcel } = await import('read-excel-file/browser');
      const hojas = await leerExcel(a);
      for (const h of hojas) tablas.push({ nombre: h.sheet, filas: h.data.map((f) => f.map(aTexto)) });
    } else if (nombre.endsWith('.xls')) {
      throw new Error(`"${a.name}" es un Excel viejo (.xls). Abrilo y guardalo como .xlsx o CSV.`);
    } else throw new Error(`"${a.name}" no es un Excel (.xlsx) ni un CSV.`);
  }
  return tablas;
}

const ESTADO_FILA: Record<string, [string, string]> = {
  ok: ['pill-volt', 'Nuevo'],
  aviso: ['pill-amber', 'Revisar'],
  existente: ['pill', 'Ya existe'],
  error: ['pill-red', 'Error'],
};

export function Importador() {
  const router = useRouter();
  const [tablas, setTablas] = useState<TablaCruda[] | null>(null);
  const [archivos, setArchivos] = useState<string[]>([]);
  const [previa, setPrevia] = useState<VistaPreviaImportacion | null>(null);
  const [hoja, setHoja] = useState<HojaImportacion>('equipos');
  const [hecho, setHecho] = useState<VistaPreviaImportacion['resumen'] | null>(null);
  const lectura = useEnvio();
  const confirmacion = useEnvio();

  const elegir = (lista: FileList | null) => {
    if (!lista?.length) return;
    const elegidos = [...lista];
    setPrevia(null);
    setHecho(null);
    lectura.enviar(async () => {
      const t = await leerArchivos(elegidos);
      const r = await api<VistaPreviaImportacion>('POST', '/importacion/vista-previa', { tablas: t });
      setTablas(t);
      setArchivos(elegidos.map((a) => a.name));
      setPrevia(r);
      setHoja(
        HOJAS_IMPORTACION.find((h) => r.hojas[h].some((f) => f.estado === 'error')) ??
          HOJAS_IMPORTACION.find((h) => r.hojas[h].length) ??
          'equipos',
      );
    });
  };

  const reiniciar = () => {
    setTablas(null);
    setPrevia(null);
    setArchivos([]);
  };

  if (hecho)
    return (
      <div className="rounded-3xl bg-volt/30 p-5" data-testid="importacion-lista">
        <b className="flex items-center gap-2 text-lg">
          <Icono nombre="check" />
          Listo: importamos todo.
        </b>
        <p className="mt-1 text-sm">
          {hecho.equipos.nuevos} equipos, {hecho.jugadores.nuevos} jugadores y {hecho.canchas.nuevas} canchas
          nuevos.
          {hecho.jugadores.duplicados > 0 &&
            ` ${hecho.jugadores.duplicados} DNI ya estaban en tu liga: quedaron como duplicados para revisar.`}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/panel/equipos" className="btn-volt btn-sm">
            Ver equipos
            <Icono nombre="arrow" />
          </Link>
          {hecho.jugadores.duplicados > 0 && (
            <Link href="/panel/documentacion" className="btn-glass btn-sm">
              Revisar duplicados
            </Link>
          )}
          <button className="btn-glass btn-sm" onClick={() => setHecho(null)}>
            Importar otro archivo
          </button>
        </div>
      </div>
    );

  return (
    <div className="space-y-4">
      <p className="text-sm text-mute">
        Subí tus equipos, jugadores y canchas actuales. Usá la plantilla (una hoja para cada cosa) o tus
        propios archivos CSV: revisamos fila por fila antes de importar y, si algo está mal, no se importa
        nada.
      </p>
      <div className="flex flex-wrap gap-2">
        <a href={`${PLANTILLAS}/potrero-plantilla.xlsx`} download className="btn-glass btn-sm">
          <Icono nombre="download" />
          Plantilla Excel
        </a>
        <a href={`${PLANTILLAS}/potrero-ejemplo.xlsx`} download className="btn-glass btn-sm">
          <Icono nombre="file" />
          Ejemplo con 8 equipos
        </a>
        <span className="flex items-center gap-1 px-1 text-xs text-mute">
          En CSV:
          {HOJAS_IMPORTACION.map((h) => (
            <a
              key={h}
              href={`${PLANTILLAS}/plantilla-${h}.csv`}
              download
              className="font-semibold text-ink underline"
            >
              {NOMBRE_HOJA[h].toLowerCase()}
            </a>
          ))}
        </span>
      </div>

      <label
        className="flex cursor-pointer flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-black/15 p-6 text-center hover:border-ink/40"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          elegir(e.dataTransfer.files);
        }}
      >
        <span className="grid size-12 place-items-center rounded-2xl bg-volt text-xl">
          <Icono nombre="up" />
        </span>
        <b>{archivos.length ? archivos.join(', ') : 'Arrastrá tu Excel o tus CSV'}</b>
        <span className="text-sm text-mute">
          {lectura.enviando ? (
            'Revisando el archivo…'
          ) : (
            <>
              o <b className="text-ink underline">elegí un archivo</b> (.xlsx o .csv)
            </>
          )}
        </span>
        <input
          type="file"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          multiple
          className="sr-only"
          aria-label="Archivo para importar"
          data-testid="archivo-importacion"
          onChange={(e) => {
            elegir(e.target.files);
            e.target.value = '';
          }}
        />
      </label>
      <MensajeError error={lectura.error} />

      {previa && (
        <div className="space-y-4" data-testid="vista-previa">
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <Cifra
              titulo="Equipos"
              n={previa.resumen.equipos.nuevos}
              extra={
                previa.resumen.equipos.existentes ? `${previa.resumen.equipos.existentes} ya existían` : null
              }
            />
            <Cifra
              titulo="Jugadores"
              n={previa.resumen.jugadores.nuevos}
              extra={
                previa.resumen.jugadores.duplicados
                  ? `${previa.resumen.jugadores.duplicados} con DNI repetido en tu liga`
                  : null
              }
            />
            <Cifra
              titulo="Canchas"
              n={previa.resumen.canchas.nuevas}
              extra={
                previa.resumen.canchas.existentes ? `${previa.resumen.canchas.existentes} ya existían` : null
              }
            />
          </div>

          {previa.errores.length > 0 && (
            <div
              className="rounded-3xl bg-red-50 p-4 text-sm text-red-800"
              role="alert"
              data-testid="errores-importacion"
            >
              <b className="block">
                {previa.errores.length === 1 ? 'Hay 1 error' : `Hay ${previa.errores.length} errores`}:
                corregilos en tu archivo y volvé a subirlo. No se importa nada hasta que esté todo bien.
              </b>
              <ul className="mt-2 max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5">
                {previa.errores.map((e, i) => (
                  <li key={i}>{describirProblema(e)}</li>
                ))}
              </ul>
            </div>
          )}
          {previa.avisos.length > 0 && (
            <div className="rounded-3xl bg-amber-50 p-4 text-sm text-amber-900">
              <b className="block">Para tener en cuenta ({previa.avisos.length})</b>
              <ul className="mt-2 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5">
                {previa.avisos.map((e, i) => (
                  <li key={i}>{describirProblema(e)}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="tabs w-fit max-w-full">
            {HOJAS_IMPORTACION.map((h) => (
              <button key={h} type="button" className={hoja === h ? 'on' : ''} onClick={() => setHoja(h)}>
                {NOMBRE_HOJA[h]} ({previa.hojas[h].length})
              </button>
            ))}
          </div>
          <TablaHoja hoja={hoja} previa={previa} />

          <MensajeError error={confirmacion.error} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" className="btn-glass" onClick={reiniciar}>
              Elegir otro archivo
            </button>
            <button
              type="button"
              className="btn-volt"
              disabled={!previa.valido || confirmacion.enviando}
              data-testid="confirmar-importacion"
              onClick={() =>
                confirmacion.enviar(async () => {
                  const r = await api<{ resumen: VistaPreviaImportacion['resumen'] }>(
                    'POST',
                    '/importacion',
                    { tablas },
                  );
                  setHecho(r.resumen);
                  reiniciar();
                  router.refresh();
                })
              }
            >
              {confirmacion.enviando
                ? 'Importando…'
                : previa.valido
                  ? `Importar ${previa.resumen.equipos.nuevos} equipos, ${previa.resumen.jugadores.nuevos} jugadores y ${previa.resumen.canchas.nuevas} canchas`
                  : 'Corregí los errores para importar'}
              <Icono nombre="arrow" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Cifra({ titulo, n, extra }: { titulo: string; n: number; extra: string | null }) {
  return (
    <div className="rounded-2xl bg-black/5 p-3">
      <span className="text-xs text-mute">{titulo} nuevos</span>
      <b className="num block text-2xl">{n}</b>
      {extra && <span className="text-xs text-mute">{extra}</span>}
    </div>
  );
}

function TablaHoja({ hoja, previa }: { hoja: HojaImportacion; previa: VistaPreviaImportacion }) {
  const filas = previa.hojas[hoja];
  const columnas = COLUMNAS_IMPORTACION[hoja];
  if (!filas.length) return <p className="text-sm text-mute">Esta hoja no tiene filas en tu archivo.</p>;
  return (
    <div className="scrollx max-h-[28rem] overflow-auto rounded-2xl border border-black/5">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr>
            <th className="th w-14">Fila</th>
            {columnas.map((c) => (
              <th key={c.campo} className="th">
                {c.titulo}
              </th>
            ))}
            <th className="th">Estado</th>
          </tr>
        </thead>
        <tbody>
          {filas.slice(0, FILAS_VISIBLES).map((f) => {
            const conError = new Set(f.errores.map((e) => e.columna));
            const [clase, texto] = ESTADO_FILA[f.estado]!;
            return (
              <tr key={f.fila} className={f.estado === 'error' ? 'bg-red-50/70' : ''}>
                <td className="td num text-mute">{f.fila}</td>
                {columnas.map((c) => (
                  <td
                    key={c.campo}
                    className={`td ${conError.has(c.titulo) ? 'font-semibold text-red-700' : ''}`}
                    title={f.errores.find((e) => e.columna === c.titulo)?.motivo}
                  >
                    {f.valores[c.campo] || <span className="text-black/25">—</span>}
                  </td>
                ))}
                <td className="td">
                  <span className={clase} title={[...f.errores, ...f.avisos].map((e) => e.motivo).join(' ')}>
                    {texto}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {filas.length > FILAS_VISIBLES && (
        <p className="p-3 text-xs text-mute">
          Se muestran las primeras {FILAS_VISIBLES} de {filas.length} filas. Los errores están todos en la
          lista de arriba.
        </p>
      )}
    </div>
  );
}
