import { describe, expect, it } from 'vitest';
import { progresoConfiguracion, slugValido } from './configuracion.js';
import {
  describirProblema,
  identificarHoja,
  leerColor,
  leerFecha,
  leerMonto,
  parsearCsv,
  validarImportacion,
  type ExistentesImportacion,
  type TablaCruda,
} from './importacion.js';

const hoy = new Date('2026-10-26T12:00:00Z');
const vacio: ExistentesImportacion = { equipos: [], canchas: [] };

const equipos = (...filas: string[][]): TablaCruda => ({
  nombre: 'Equipos',
  filas: [['Equipo', 'Color', 'Capitán', 'Email del capitán', 'Teléfono del capitán'], ...filas],
});
const jugadores = (...filas: string[][]): TablaCruda => ({
  nombre: 'Jugadores',
  filas: [['Equipo', 'Nombre', 'Apellido', 'DNI', 'Fecha de nacimiento', 'Número'], ...filas],
});
const canchas = (...filas: string[][]): TablaCruda => ({
  nombre: 'Canchas',
  filas: [['Sede', 'Cancha', 'Dirección', 'Superficie', 'Costo por partido'], ...filas],
});

describe('lectura de valores', () => {
  it('entiende fechas argentinas e ISO y rechaza las imposibles', () => {
    expect(leerFecha('05/03/1998')).toBe('1998-03-05');
    expect(leerFecha('5-3-98', hoy)).toBe('1998-03-05');
    expect(leerFecha('5/3/08', hoy)).toBe('2008-03-05');
    expect(leerFecha('1998-03-05')).toBe('1998-03-05');
    expect(leerFecha('31/02/2000')).toBeNull();
    expect(leerFecha('ayer')).toBeNull();
  });
  it('lee montos en pesos con signo y separadores', () => {
    expect(leerMonto('$ 25.000')).toBe(25000);
    expect(leerMonto('25000')).toBe(25000);
    expect(leerMonto('25.000,00')).toBe(25000);
    expect(leerMonto('25.000,50')).toBeNull();
    expect(leerMonto('mucho')).toBeNull();
  });
  it('lee colores por nombre o hexadecimal', () => {
    expect(leerColor('Rojo')).toBe('#dc2626');
    expect(leerColor('celeste y blanco')).toBe('#38bdf8');
    expect(leerColor('#ABC')).toBe('#aabbcc');
    expect(leerColor('112233')).toBe('#112233');
    expect(leerColor('fucsia rayado')).toBeNull();
  });
  it('parsea CSV con punto y coma, comillas y saltos de Windows', () => {
    expect(parsearCsv('\uFEFFEquipo;Capitán\r\n"Los ""Pibes""";Ana\r\nLa 12;"Gómez; Juan"\r\n')).toEqual([
      ['Equipo', 'Capitán'],
      ['Los "Pibes"', 'Ana'],
      ['La 12', 'Gómez; Juan'],
    ]);
    expect(parsearCsv('Sede,Cancha\nNorte,1')).toEqual([
      ['Sede', 'Cancha'],
      ['Norte', '1'],
    ]);
  });
  it('identifica la hoja por el nombre o por los encabezados', () => {
    expect(identificarHoja({ nombre: 'planteles.csv', filas: [] })).toBe('jugadores');
    expect(identificarHoja({ nombre: 'Hoja1', filas: [['Sede', 'Cancha']] })).toBe('canchas');
    expect(identificarHoja({ nombre: 'datos.csv', filas: [['Nombre', 'Apellido', 'Equipo']] })).toBe(
      'jugadores',
    );
    expect(identificarHoja({ nombre: 'Hoja2', filas: [['Equipo', 'Capitán']] })).toBe('equipos');
    expect(identificarHoja({ nombre: 'Hoja3', filas: [['Cosa']] })).toBeNull();
  });
});

describe('validación de la importación', () => {
  it('importa equipos, jugadores con su equipo y canchas', () => {
    const r = validarImportacion(
      [
        equipos(
          ['Los Pibes', 'rojo', 'Ana Paz', 'ana@mail.com', '11 5555-0000'],
          ['La Doce', '', '', '', ''],
        ),
        jugadores(
          ['los pibes', 'Juan', 'Pérez', '30.123.456', '05/03/1998', '10'],
          ['La Doce', 'Pedro', 'Gómez', '', '', ''],
        ),
        canchas(['Complejo Norte', 'Cancha 1', 'Av. Siempreviva 742', 'Sintético', '$ 25.000']),
      ],
      vacio,
      hoy,
    );
    expect(r.valido).toBe(true);
    expect(r.errores).toEqual([]);
    expect(r.datos.equipos).toEqual([
      {
        nombre: 'Los Pibes',
        color: '#dc2626',
        capitanNombre: 'Ana Paz',
        capitanEmail: 'ana@mail.com',
        capitanTelefono: '11 5555-0000',
      },
      { nombre: 'La Doce', color: null, capitanNombre: null, capitanEmail: null, capitanTelefono: null },
    ]);
    expect(r.datos.jugadores[0]).toMatchObject({
      equipo: 'Los Pibes',
      dni: '30123456',
      fechaNacimiento: '1998-03-05',
      numero: 10,
      dniRegistrado: false,
    });
    expect(r.datos.canchas).toEqual([
      {
        sede: 'Complejo Norte',
        nombre: 'Cancha 1',
        direccion: 'Av. Siempreviva 742',
        superficie: 'Sintético',
        costoPorPartido: 25000,
      },
    ]);
    expect(r.resumen).toEqual({
      equipos: { nuevos: 2, existentes: 0 },
      jugadores: { nuevos: 2, duplicados: 0 },
      canchas: { nuevas: 1, existentes: 0 },
    });
  });

  it('marca cada error con hoja, fila, columna y motivo', () => {
    const r = validarImportacion(
      [
        equipos(['Los Pibes', 'fucsia', '', 'no-es-mail', ''], ['', '', '', '', '']),
        jugadores(
          ['Los Pibes', 'Juan', 'Pérez', '123', '31/02/1999', '100'],
          ['Inexistente', 'Ana', '', '', '', ''],
        ),
      ],
      vacio,
      hoy,
    );
    expect(r.valido).toBe(false);
    const motivos = r.errores.map((e) => [e.hoja, e.fila, e.columna]);
    expect(motivos).toEqual([
      ['equipos', 2, 'Color'],
      ['equipos', 2, 'Email del capitán'],
      ['jugadores', 2, 'DNI'],
      ['jugadores', 2, 'Fecha de nacimiento'],
      ['jugadores', 2, 'Número'],
      ['jugadores', 3, 'Apellido'],
      ['jugadores', 3, 'Equipo'],
    ]);
    // La fila 3 de equipos estaba vacía: no cuenta.
    expect(r.hojas.equipos).toHaveLength(1);
    expect(describirProblema(r.errores[2]!)).toBe(
      'Jugadores · fila 2 · DNI: "123" no es un DNI: son 7 u 8 números.',
    );
    expect(r.hojas.jugadores[1]!.estado).toBe('error');
  });

  it('no deja repetir DNI, equipos, canchas ni números de camiseta dentro del archivo', () => {
    const r = validarImportacion(
      [
        equipos(['Los Pibes', '', '', '', ''], ['LOS  PIBES', '', '', '', '']),
        jugadores(
          ['Los Pibes', 'Juan', 'Pérez', '30123456', '', '9'],
          ['Los Pibes', 'Juan', 'Pérez', '30.123.456', '', '9'],
        ),
        canchas(['Norte', '1', '', '', ''], ['norte', '1', '', '', '']),
      ],
      vacio,
      hoy,
    );
    expect(r.errores.map((e) => e.motivo)).toEqual([
      'El equipo "LOS PIBES" ya está en la fila 2.',
      'El DNI se repite con la fila 2.',
      'El 9 ya lo usa otro jugador de Los Pibes (fila 2).',
      'La cancha "1" de norte ya está en la fila 2.',
    ]);
  });

  it('reutiliza lo que ya está en la liga y avisa los DNI ya registrados (quedan como duplicado)', () => {
    const r = validarImportacion(
      [
        equipos(['los pibes', '', '', '', '']),
        jugadores(
          ['Los Pibes', 'Juan', 'Pérez', '30123456', '', ''],
          ['Viejos Crack', 'Luis', 'Sosa', '', '', ''],
        ),
        canchas(['Norte', 'Cancha 1', '', '', ''], ['Norte', 'Cancha 2', '', '', '']),
      ],
      {
        equipos: ['Los Pibes', 'Viejos Crack'],
        canchas: [{ sede: 'Norte', nombre: 'cancha 1' }],
        dniRegistrado: (dni) => dni === '30123456',
      },
      hoy,
    );
    expect(r.valido).toBe(true);
    expect(r.datos.equipos).toEqual([]);
    expect(r.datos.jugadores.map((j) => [j.equipo, j.dniRegistrado])).toEqual([
      ['Los Pibes', true],
      ['Viejos Crack', false],
    ]);
    expect(r.datos.canchas.map((c) => c.nombre)).toEqual(['Cancha 2']);
    expect(r.resumen).toEqual({
      equipos: { nuevos: 0, existentes: 1 },
      jugadores: { nuevos: 2, duplicados: 1 },
      canchas: { nuevas: 1, existentes: 1 },
    });
    expect(r.hojas.equipos[0]!.estado).toBe('existente');
    expect(r.hojas.jugadores[0]!.estado).toBe('aviso');
    expect(r.avisos).toHaveLength(3);
  });

  it('avisa las columnas obligatorias que faltan, las hojas desconocidas y el archivo vacío', () => {
    const r = validarImportacion(
      [
        {
          nombre: 'Jugadores',
          filas: [
            ['Equipo', 'Nombre'],
            ['A', 'B'],
          ],
        },
        { nombre: 'Otra cosa', filas: [['x'], ['1']] },
        { nombre: 'Instrucciones', filas: [['Completá cada hoja'], ['…']] },
      ],
      vacio,
      hoy,
    );
    expect(r.errores.map(describirProblema)).toEqual([
      'Jugadores · fila 1 · Apellido: Falta la columna "Apellido" en la hoja Jugadores.',
      'No reconocemos qué tiene "Otra cosa". Usá la plantilla: hojas Equipos, Jugadores y Canchas.',
    ]);
    expect(validarImportacion([{ nombre: 'Equipos', filas: [] }], vacio, hoy).errores[0]!.motivo).toBe(
      'El archivo no tiene filas con datos.',
    );
  });

  it('acepta encabezados con otras palabras y en otro orden', () => {
    const r = validarImportacion(
      [
        {
          nombre: 'Hoja1',
          filas: [
            ['Apellidos', 'Nombres', 'Documento', 'Equipo'],
            ['Paz', 'Ana', '20111222', 'X'],
          ],
        },
      ],
      { equipos: ['X'], canchas: [] },
      hoy,
    );
    expect(r.valido).toBe(true);
    expect(r.datos.jugadores[0]).toMatchObject({
      nombre: 'Ana',
      apellido: 'Paz',
      dni: '20111222',
      equipo: 'X',
    });
  });

  it('si todo ya existe no hay nada para importar', () => {
    const r = validarImportacion(
      [equipos(['Los Pibes', '', '', '', ''])],
      { equipos: ['Los Pibes'], canchas: [] },
      hoy,
    );
    expect(r.valido).toBe(false);
    expect(r.errores[0]!.motivo).toMatch(/No hay nada nuevo/);
  });
});

describe('asistente de configuración', () => {
  const base = { confirmados: {}, mpConectado: false, tieneMarca: false, equipos: 0, torneos: 0 };
  it('una liga recién creada arranca en el primer paso', () => {
    const p = progresoConfiguracion(base);
    expect(p).toMatchObject({ cantidad: 0, total: 5, porcentaje: 0, siguiente: 'organizacion' });
  });
  it('cuenta lo confirmado y lo que la liga ya tiene', () => {
    const p = progresoConfiguracion({
      ...base,
      confirmados: { organizacion: '2026-10-26' },
      mpConectado: true,
      equipos: 3,
    });
    expect(p.completos).toEqual({
      organizacion: true,
      mercadoPago: true,
      marca: false,
      reglamento: false,
      importacion: true,
    });
    expect(p).toMatchObject({ cantidad: 3, porcentaje: 60, siguiente: 'marca' });
    expect(
      progresoConfiguracion({
        ...base,
        confirmados: { organizacion: 'x', mercadoPago: 'x', marca: 'x', reglamento: 'x', importacion: 'x' },
      }).siguiente,
    ).toBeNull();
  });
  it('valida la dirección del sitio', () => {
    expect(slugValido('liga-barrial-sur')).toBe(true);
    expect(slugValido('-liga')).toBe(false);
    expect(slugValido('Liga')).toBe(false);
    expect(slugValido('ab')).toBe(false);
  });
});
