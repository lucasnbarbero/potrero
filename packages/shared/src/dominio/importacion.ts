// Importación desde Excel o CSV (E25-02): equipos, jugadores con su equipo y canchas.
// Todo lo de acá es puro: la web lee el archivo y lo convierte en tablas de texto, la API agrega lo que ya
// existe en la liga (equipos, canchas y si un DNI ya está registrado) y las dos usan la misma validación.
// La API vuelve a validar al confirmar y, si hay un solo error, no importa nada.
import { DATOS } from '../datos.js';
import { dniValido, normalizarDni } from './documentacion.js';

export const HOJAS_IMPORTACION = ['equipos', 'jugadores', 'canchas'] as const;
export type HojaImportacion = (typeof HOJAS_IMPORTACION)[number];

export const NOMBRE_HOJA: Record<HojaImportacion, string> = {
  equipos: 'Equipos',
  jugadores: 'Jugadores',
  canchas: 'Canchas',
};

interface Columna {
  campo: string;
  titulo: string;
  requerida?: boolean;
  /** Otras formas de escribir el encabezado que también se aceptan (ya normalizadas). */
  sinonimos?: string[];
}

/** Columnas de cada hoja, en el orden de la plantilla. */
export const COLUMNAS_IMPORTACION: Record<HojaImportacion, Columna[]> = {
  equipos: [
    { campo: 'nombre', titulo: 'Equipo', requerida: true, sinonimos: ['nombre', 'nombre del equipo'] },
    { campo: 'color', titulo: 'Color', sinonimos: ['color de camiseta', 'camiseta'] },
    { campo: 'capitanNombre', titulo: 'Capitán', sinonimos: ['capitan', 'delegado', 'responsable'] },
    { campo: 'capitanEmail', titulo: 'Email del capitán', sinonimos: ['email', 'mail', 'correo'] },
    {
      campo: 'capitanTelefono',
      titulo: 'Teléfono del capitán',
      sinonimos: ['telefono', 'celular', 'whatsapp', 'tel'],
    },
  ],
  jugadores: [
    { campo: 'equipo', titulo: 'Equipo', requerida: true },
    { campo: 'nombre', titulo: 'Nombre', requerida: true, sinonimos: ['nombres'] },
    { campo: 'apellido', titulo: 'Apellido', requerida: true, sinonimos: ['apellidos'] },
    { campo: 'dni', titulo: 'DNI', sinonimos: ['documento', 'nro de documento', 'numero de documento'] },
    {
      campo: 'fechaNacimiento',
      titulo: 'Fecha de nacimiento',
      sinonimos: ['nacimiento', 'fecha nac', 'fecha de nac', 'f nacimiento'],
    },
    { campo: 'numero', titulo: 'Número', sinonimos: ['nro', 'camiseta', 'numero de camiseta', 'dorsal'] },
  ],
  canchas: [
    { campo: 'sede', titulo: 'Sede', requerida: true, sinonimos: ['complejo', 'predio'] },
    { campo: 'cancha', titulo: 'Cancha', requerida: true, sinonimos: ['nombre', 'nombre de la cancha'] },
    { campo: 'direccion', titulo: 'Dirección', sinonimos: ['domicilio', 'ubicacion'] },
    { campo: 'superficie', titulo: 'Superficie', sinonimos: ['piso', 'cesped'] },
    {
      campo: 'costoPorPartido',
      titulo: 'Costo por partido',
      sinonimos: ['costo', 'alquiler', 'precio', 'costo por turno'],
    },
  ],
};

/** Tope de filas por archivo: una liga grande tiene unos pocos cientos de jugadores. */
export const MAXIMO_FILAS_IMPORTACION: number = DATOS.importacion.maximoFilas;

/** Una tabla leída del archivo: una hoja del Excel o un CSV. La primera fila son los encabezados. */
export interface TablaCruda {
  /** Nombre de la hoja o del archivo: sirve para saber qué tiene adentro. */
  nombre: string;
  filas: string[][];
}

export interface ProblemaImportacion {
  hoja: HojaImportacion | null;
  /** Fila del archivo tal como la ve el usuario en Excel (los encabezados son la fila 1). 0 = la tabla entera. */
  fila: number;
  columna: string | null;
  motivo: string;
}

export interface FilaRevisada {
  fila: number;
  valores: Record<string, string>;
  estado: 'ok' | 'aviso' | 'error' | 'existente';
  errores: ProblemaImportacion[];
  avisos: ProblemaImportacion[];
}

export interface EquipoImportado {
  nombre: string;
  color: string | null;
  capitanNombre: string | null;
  capitanEmail: string | null;
  capitanTelefono: string | null;
}

export interface JugadorImportado {
  fila: number;
  /** Nombre del equipo tal como quedará (el de la planilla o el que ya existe en la liga). */
  equipo: string;
  nombre: string;
  apellido: string;
  /** Solo números. */
  dni: string | null;
  /** AAAA-MM-DD. */
  fechaNacimiento: string | null;
  numero: number | null;
  /** Ya hay un jugador de la liga con ese DNI: se importa igual y queda como duplicado para revisar. */
  dniRegistrado: boolean;
}

export interface CanchaImportada {
  sede: string;
  nombre: string;
  direccion: string | null;
  superficie: string | null;
  costoPorPartido: number;
}

export interface ExistentesImportacion {
  equipos: readonly string[];
  canchas: readonly { sede: string; nombre: string }[];
  /** Si ya hay un jugador de la liga con ese DNI (normalizado). La API lo resuelve con el hash del DNI. */
  dniRegistrado?: (dni: string) => boolean;
}

export interface ResultadoImportacion {
  valido: boolean;
  errores: ProblemaImportacion[];
  avisos: ProblemaImportacion[];
  hojas: Record<HojaImportacion, FilaRevisada[]>;
  /** Lo que se va a crear (sin lo que ya existía). */
  datos: { equipos: EquipoImportado[]; jugadores: JugadorImportado[]; canchas: CanchaImportada[] };
  resumen: {
    equipos: { nuevos: number; existentes: number };
    jugadores: { nuevos: number; duplicados: number };
    canchas: { nuevas: number; existentes: number };
  };
}

// ───────────── Lectura de texto ─────────────

/** Minúsculas, sin acentos ni signos y con un solo espacio: "Teléfono del capitán:" → "telefono del capitan". */
export const normalizarTexto = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Para comparar nombres de equipos y canchas: "LOS  Pibes " y "los pibes" son el mismo. */
export const claveDeNombre = (t: string) => normalizarTexto(t);

/** Separa un CSV en filas y celdas. Acepta coma, punto y coma (el Excel en español) o tabulación, y comillas. */
export function parsearCsv(texto: string): string[][] {
  const limpio = texto.replace(/^\uFEFF/, '');
  const primera = limpio.split(/\r?\n/, 1)[0] ?? '';
  const cuenta = (c: string) => primera.split(c).length - 1;
  const separador = [';', ',', '\t'].sort((a, b) => cuenta(b) - cuenta(a))[0]!;
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = '';
  let entreComillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const ch = limpio[i]!;
    if (entreComillas) {
      if (ch === '"' && limpio[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (ch === '"') entreComillas = false;
      else celda += ch;
    } else if (ch === '"' && celda === '') entreComillas = true;
    else if (ch === separador) {
      fila.push(celda);
      celda = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && limpio[i + 1] === '\n') i++;
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = '';
    } else celda += ch;
  }
  if (celda !== '' || fila.length) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas;
}

/** Fecha en DD/MM/AAAA, D-M-AA o AAAA-MM-DD → AAAA-MM-DD. null si no es una fecha válida. */
export function leerFecha(valor: string, hoy: Date = new Date()): string | null {
  const v = valor.trim();
  let a: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(v);
  const local = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(v);
  if (iso) [a, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (local) {
    [d, m, a] = [Number(local[1]), Number(local[2]), Number(local[3])];
    // Año de dos dígitos: un jugador nació en este siglo o en el anterior.
    if (local[3]!.length === 2) a += a > hoy.getUTCFullYear() % 100 ? 1900 : 2000;
  } else return null;
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return f.toISOString().slice(0, 10);
}

/** Monto en pesos: "$ 25.000", "25000", "25.000,00" → 25000. null si no es un número entero de pesos. */
export function leerMonto(valor: string): number | null {
  const v = valor.replace(/\$|\s|ars/gi, '');
  if (!v) return null;
  let n: number;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(v)) n = Number(v.replace(/\./g, '').replace(',', '.'));
  else if (/^\d+(,\d{1,2})?$/.test(v)) n = Number(v.replace(',', '.'));
  else if (/^\d+(\.\d{1,2})?$/.test(v)) n = Number(v);
  else return null;
  return Number.isInteger(n) ? n : null;
}

const COLORES: Record<string, string> = {
  rojo: '#dc2626',
  azul: '#2563eb',
  celeste: '#38bdf8',
  verde: '#16a34a',
  amarillo: '#facc15',
  naranja: '#f97316',
  negro: '#0a0a0a',
  blanco: '#ffffff',
  violeta: '#7c3aed',
  bordo: '#7f1d1d',
  gris: '#6b7280',
  rosa: '#ec4899',
};

/** Color como #RRGGBB o por nombre ("rojo", "celeste"). null si no lo reconoce. */
export function leerColor(valor: string): string | null {
  const v = valor.trim().toLowerCase();
  if (/^#?[0-9a-f]{6}$/.test(v)) return v.startsWith('#') ? v : `#${v}`;
  if (/^#?[0-9a-f]{3}$/.test(v)) {
    const h = v.replace('#', '');
    return `#${[...h].map((c) => c + c).join('')}`;
  }
  return COLORES[normalizarTexto(v).split(' ')[0] ?? ''] ?? null;
}

// ───────────── Hojas ─────────────

/** Qué tiene una tabla: por el nombre de la hoja o del archivo y, si no alcanza, por sus encabezados. */
export function identificarHoja(t: TablaCruda): HojaImportacion | null {
  const nombre = normalizarTexto(t.nombre.replace(/\.(csv|xlsx|txt)$/i, ''));
  if (/jugador|plantel/.test(nombre)) return 'jugadores';
  if (/cancha|sede/.test(nombre)) return 'canchas';
  if (/equipo/.test(nombre)) return 'equipos';
  // Por encabezados: la hoja con todas sus columnas obligatorias y más columnas reconocidas.
  const encabezados = (t.filas.find((f) => f.some((c) => String(c ?? '').trim() !== '')) ?? []).map(String);
  let mejor: HojaImportacion | null = null;
  let puntaje = 0;
  for (const hoja of ['jugadores', 'canchas', 'equipos'] as const) {
    const { indices, faltan } = mapearColumnas(hoja, encabezados);
    const n = Object.keys(indices).length;
    if (!faltan.length && n > puntaje) [mejor, puntaje] = [hoja, n];
  }
  return mejor;
}

/** Ubica cada columna conocida por su encabezado. Las columnas que no se reconocen se ignoran. */
function mapearColumnas(hoja: HojaImportacion, encabezados: string[]) {
  const norm = encabezados.map(normalizarTexto);
  const indices: Record<string, number> = {};
  const faltan: string[] = [];
  for (const c of COLUMNAS_IMPORTACION[hoja]) {
    const aceptados = [normalizarTexto(c.titulo), ...(c.sinonimos ?? [])];
    const i = norm.findIndex((e) => aceptados.includes(e));
    if (i >= 0) indices[c.campo] = i;
    else if (c.requerida) faltan.push(c.titulo);
  }
  return { indices, faltan };
}

const titulo = (hoja: HojaImportacion, campo: string) =>
  COLUMNAS_IMPORTACION[hoja].find((c) => c.campo === campo)!.titulo;

/** Lleva las tablas del archivo a filas con sus valores por campo, más los problemas de forma. */
function leerTablas(tablas: readonly TablaCruda[]) {
  const problemas: ProblemaImportacion[] = [];
  const filas: Record<HojaImportacion, FilaRevisada[]> = { equipos: [], jugadores: [], canchas: [] };
  const vistas = new Set<HojaImportacion>();
  let total = 0;
  for (const t of tablas) {
    const filasConDatos = t.filas.filter((f) => f.some((c) => String(c ?? '').trim() !== ''));
    if (!filasConDatos.length) continue;
    // La hoja de instrucciones de la plantilla no se importa.
    if (/^(instrucciones|ayuda|leeme)/.test(normalizarTexto(t.nombre))) continue;
    const hoja = identificarHoja(t);
    if (!hoja) {
      problemas.push({
        hoja: null,
        fila: 0,
        columna: null,
        motivo: `No reconocemos qué tiene "${t.nombre}". Usá la plantilla: hojas Equipos, Jugadores y Canchas.`,
      });
      continue;
    }
    if (vistas.has(hoja)) {
      problemas.push({
        hoja,
        fila: 0,
        columna: null,
        motivo: `Hay dos tablas de ${NOMBRE_HOJA[hoja].toLowerCase()} ("${t.nombre}"). Juntalas en una sola.`,
      });
      continue;
    }
    vistas.add(hoja);
    const encabezadoIdx = t.filas.findIndex((f) => f.some((c) => String(c ?? '').trim() !== ''));
    const { indices, faltan } = mapearColumnas(hoja, t.filas[encabezadoIdx]!.map(String));
    if (faltan.length) {
      for (const f of faltan)
        problemas.push({
          hoja,
          fila: encabezadoIdx + 1,
          columna: f,
          motivo: `Falta la columna "${f}" en la hoja ${NOMBRE_HOJA[hoja]}.`,
        });
      continue;
    }
    for (let i = encabezadoIdx + 1; i < t.filas.length; i++) {
      const crudas = t.filas[i]!;
      if (!crudas.some((c) => String(c ?? '').trim() !== '')) continue;
      const valores: Record<string, string> = {};
      for (const [campo, idx] of Object.entries(indices))
        valores[campo] = String(crudas[idx] ?? '')
          .replace(/\s+/g, ' ')
          .trim();
      filas[hoja].push({ fila: i + 1, valores, estado: 'ok', errores: [], avisos: [] });
      total++;
    }
  }
  if (total > MAXIMO_FILAS_IMPORTACION)
    problemas.push({
      hoja: null,
      fila: 0,
      columna: null,
      motivo: `El archivo tiene ${total} filas y el máximo es ${MAXIMO_FILAS_IMPORTACION}. Dividilo en partes.`,
    });
  if (!total && !problemas.length)
    problemas.push({ hoja: null, fila: 0, columna: null, motivo: 'El archivo no tiene filas con datos.' });
  return { filas, problemas };
}

// ───────────── Validación ─────────────

/**
 * Revisa el archivo fila por fila. Un error frena toda la importación; un aviso no (por ejemplo, un equipo
 * que ya existe se reutiliza, o un DNI que ya está en la liga queda como duplicado para revisar, como al cargarlo a mano).
 */
export function validarImportacion(
  tablas: readonly TablaCruda[],
  existentes: ExistentesImportacion,
  hoy: Date = new Date(),
): ResultadoImportacion {
  const { filas: hojas, problemas: generales } = leerTablas(tablas);
  const datos: ResultadoImportacion['datos'] = { equipos: [], jugadores: [], canchas: [] };
  const resumen: ResultadoImportacion['resumen'] = {
    equipos: { nuevos: 0, existentes: 0 },
    jugadores: { nuevos: 0, duplicados: 0 },
    canchas: { nuevas: 0, existentes: 0 },
  };

  const error = (r: FilaRevisada, hoja: HojaImportacion, campo: string | null, motivo: string) =>
    r.errores.push({ hoja, fila: r.fila, columna: campo ? titulo(hoja, campo) : null, motivo });
  const aviso = (r: FilaRevisada, hoja: HojaImportacion, campo: string | null, motivo: string) =>
    r.avisos.push({ hoja, fila: r.fila, columna: campo ? titulo(hoja, campo) : null, motivo });
  const obligatorio = (r: FilaRevisada, hoja: HojaImportacion, campo: string, max: number) => {
    const v = r.valores[campo] ?? '';
    if (!v) error(r, hoja, campo, 'Está vacío y es obligatorio.');
    else if (v.length > max) error(r, hoja, campo, `Es muy largo (máximo ${max} caracteres).`);
    return v;
  };
  const opcional = (r: FilaRevisada, hoja: HojaImportacion, campo: string, max: number) => {
    const v = r.valores[campo] ?? '';
    if (v.length > max) error(r, hoja, campo, `Es muy largo (máximo ${max} caracteres).`);
    return v || null;
  };

  // Equipos: el nombre identifica al equipo; uno que ya existe en la liga no se vuelve a crear.
  const equiposDeLaLiga = new Map(existentes.equipos.map((n) => [claveDeNombre(n), n]));
  const equiposDelArchivo = new Map<string, { nombre: string; fila: number }>();
  for (const r of hojas.equipos) {
    const nombre = obligatorio(r, 'equipos', 'nombre', 80);
    const color = r.valores.color ? leerColor(r.valores.color) : null;
    if (r.valores.color && !color)
      error(
        r,
        'equipos',
        'color',
        `"${r.valores.color}" no es un color: usá un nombre (rojo, celeste…) o #RRGGBB.`,
      );
    const capitanNombre = opcional(r, 'equipos', 'capitanNombre', 80);
    const capitanEmail = opcional(r, 'equipos', 'capitanEmail', 120);
    if (capitanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(capitanEmail))
      error(r, 'equipos', 'capitanEmail', `"${capitanEmail}" no es un email válido.`);
    const capitanTelefono = opcional(r, 'equipos', 'capitanTelefono', 30);
    if (capitanTelefono && !/^[\d\s()+-]{6,30}$/.test(capitanTelefono))
      error(r, 'equipos', 'capitanTelefono', 'El teléfono solo puede tener números, espacios, + y guiones.');
    if (!nombre) continue;
    const clave = claveDeNombre(nombre);
    const repetido = equiposDelArchivo.get(clave);
    if (repetido) {
      error(r, 'equipos', 'nombre', `El equipo "${nombre}" ya está en la fila ${repetido.fila}.`);
      continue;
    }
    equiposDelArchivo.set(clave, { nombre, fila: r.fila });
    if (equiposDeLaLiga.has(clave)) {
      aviso(
        r,
        'equipos',
        'nombre',
        'Ya existe en tu liga: no se vuelve a crear y sus jugadores se suman a ese equipo.',
      );
      r.estado = 'existente';
    } else if (!r.errores.length)
      datos.equipos.push({ nombre, color, capitanNombre, capitanEmail, capitanTelefono });
  }

  // Jugadores: el equipo tiene que estar en la hoja Equipos o en la liga. El DNI no se puede repetir en el archivo.
  const dnis = new Map<string, number>();
  const numeros = new Map<string, number>();
  for (const r of hojas.jugadores) {
    const equipo = obligatorio(r, 'jugadores', 'equipo', 80);
    const nombre = obligatorio(r, 'jugadores', 'nombre', 60);
    const apellido = obligatorio(r, 'jugadores', 'apellido', 60);
    let equipoFinal = '';
    if (equipo) {
      const clave = claveDeNombre(equipo);
      const encontrado = equiposDelArchivo.get(clave)?.nombre ?? equiposDeLaLiga.get(clave);
      if (encontrado) equipoFinal = equiposDeLaLiga.get(clave) ?? encontrado;
      else error(r, 'jugadores', 'equipo', `El equipo "${equipo}" no está en la hoja Equipos ni en tu liga.`);
    }
    let dni: string | null = null;
    let dniRegistrado = false;
    if (r.valores.dni) {
      dni = normalizarDni(r.valores.dni);
      if (!dniValido(dni)) {
        error(r, 'jugadores', 'dni', `"${r.valores.dni}" no es un DNI: son 7 u 8 números.`);
        dni = null;
      } else if (dnis.has(dni)) {
        error(r, 'jugadores', 'dni', `El DNI se repite con la fila ${dnis.get(dni)}.`);
      } else {
        dnis.set(dni, r.fila);
        if (existentes.dniRegistrado?.(dni)) {
          dniRegistrado = true;
          aviso(
            r,
            'jugadores',
            'dni',
            'Ya hay un jugador con este DNI en tu liga: se importa y queda como duplicado para revisar en Documentación.',
          );
        }
      }
    }
    let fechaNacimiento: string | null = null;
    if (r.valores.fechaNacimiento) {
      fechaNacimiento = leerFecha(r.valores.fechaNacimiento, hoy);
      if (!fechaNacimiento)
        error(
          r,
          'jugadores',
          'fechaNacimiento',
          `"${r.valores.fechaNacimiento}" no es una fecha: usá DD/MM/AAAA.`,
        );
      else if (fechaNacimiento > hoy.toISOString().slice(0, 10) || fechaNacimiento < '1920-01-01')
        error(r, 'jugadores', 'fechaNacimiento', 'La fecha de nacimiento no es posible.');
    }
    let numero: number | null = null;
    if (r.valores.numero) {
      numero = /^\d{1,2}$/.test(r.valores.numero) ? Number(r.valores.numero) : null;
      if (numero === null)
        error(r, 'jugadores', 'numero', `"${r.valores.numero}" no es un número de camiseta (0 a 99).`);
      else if (equipoFinal) {
        const clave = `${claveDeNombre(equipoFinal)}|${numero}`;
        const otra = numeros.get(clave);
        if (otra)
          error(
            r,
            'jugadores',
            'numero',
            `El ${numero} ya lo usa otro jugador de ${equipoFinal} (fila ${otra}).`,
          );
        else numeros.set(clave, r.fila);
      }
    }
    if (!r.errores.length && equipoFinal) {
      datos.jugadores.push({
        fila: r.fila,
        equipo: equipoFinal,
        nombre,
        apellido,
        dni,
        fechaNacimiento,
        numero,
        dniRegistrado,
      });
      if (dniRegistrado) resumen.jugadores.duplicados++;
    }
  }

  // Canchas: sede + cancha identifican a una cancha; la sede se crea si no existe.
  const canchasDeLaLiga = new Set(
    existentes.canchas.map((c) => `${claveDeNombre(c.sede)}|${claveDeNombre(c.nombre)}`),
  );
  const canchasDelArchivo = new Map<string, number>();
  for (const r of hojas.canchas) {
    const sede = obligatorio(r, 'canchas', 'sede', 80);
    const nombre = obligatorio(r, 'canchas', 'cancha', 40);
    const direccion = opcional(r, 'canchas', 'direccion', 160);
    const superficie = opcional(r, 'canchas', 'superficie', 40);
    let costoPorPartido = 0;
    if (r.valores.costoPorPartido) {
      const m = leerMonto(r.valores.costoPorPartido);
      if (m === null || m > 10_000_000)
        error(r, 'canchas', 'costoPorPartido', `"${r.valores.costoPorPartido}" no es un monto en pesos.`);
      else costoPorPartido = m;
    }
    if (!sede || !nombre) continue;
    const clave = `${claveDeNombre(sede)}|${claveDeNombre(nombre)}`;
    const repetida = canchasDelArchivo.get(clave);
    if (repetida) {
      error(r, 'canchas', 'cancha', `La cancha "${nombre}" de ${sede} ya está en la fila ${repetida}.`);
      continue;
    }
    canchasDelArchivo.set(clave, r.fila);
    if (canchasDeLaLiga.has(clave)) {
      aviso(r, 'canchas', 'cancha', 'Ya existe en tu liga: no se vuelve a crear.');
      r.estado = 'existente';
      resumen.canchas.existentes++;
    } else if (!r.errores.length)
      datos.canchas.push({ sede, nombre, direccion, superficie, costoPorPartido });
  }

  for (const hoja of HOJAS_IMPORTACION)
    for (const r of hojas[hoja]) {
      if (r.errores.length) r.estado = 'error';
      else if (r.estado !== 'existente' && r.avisos.length) r.estado = 'aviso';
    }
  resumen.equipos.nuevos = datos.equipos.length;
  resumen.equipos.existentes = hojas.equipos.filter((r) => r.estado === 'existente').length;
  resumen.jugadores.nuevos = datos.jugadores.length;
  resumen.canchas.nuevas = datos.canchas.length;

  const errores = [...generales, ...HOJAS_IMPORTACION.flatMap((h) => hojas[h].flatMap((r) => r.errores))];
  const avisos = HOJAS_IMPORTACION.flatMap((h) => hojas[h].flatMap((r) => r.avisos));
  const hayAlgo = datos.equipos.length + datos.jugadores.length + datos.canchas.length > 0;
  if (!errores.length && !hayAlgo)
    errores.push({
      hoja: null,
      fila: 0,
      columna: null,
      motivo: 'No hay nada nuevo para importar: todo ya está en tu liga.',
    });
  return { valido: errores.length === 0, errores, avisos, hojas, datos, resumen };
}

/** "Jugadores · fila 7 · DNI: El DNI se repite con la fila 4." */
export function describirProblema(p: ProblemaImportacion): string {
  const donde = [p.hoja ? NOMBRE_HOJA[p.hoja] : null, p.fila ? `fila ${p.fila}` : null, p.columna]
    .filter(Boolean)
    .join(' · ');
  return donde ? `${donde}: ${p.motivo}` : p.motivo;
}
