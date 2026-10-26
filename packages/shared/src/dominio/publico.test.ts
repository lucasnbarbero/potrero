// Sitio público: privacidad del jugador, línea de tiempo, crónica y estadísticas (E20, E21).
import { describe, expect, it } from 'vitest';
import {
  cronica,
  enumerar,
  esGoleadorDelTorneo,
  estadisticasDelJugador,
  goleadorDelPartido,
  jugadorPublico,
  lineaDeTiempo,
  logrosDelJugador,
  ordenarTrayectoria,
  sumarEstadisticas,
  type DatosCronica,
} from './publico.js';
import type { EventoPartido, TipoEvento } from './tipos.js';

const hoy = new Date('2026-10-26T12:00:00Z');
const mayor = { nombre: 'Matías', apellido: 'Pérez', fechaNacimiento: '1998-03-01', consentimientos: [] };
const menor = { nombre: 'Tomás', apellido: 'Luna', fechaNacimiento: '2011-03-14', consentimientos: [] };
const imagen = { tipo: 'IMAGEN' as const, version: 1, revocadoEn: null };
const tutor = { tipo: 'TUTOR_PARTICIPACION' as const, version: 1, revocadoEn: null };

describe('jugadorPublico (privacidad)', () => {
  it('por defecto muestra el nombre con la inicial del apellido', () => {
    expect(jugadorPublico(mayor, hoy)).toEqual({ nombre: 'Matías P.', iniciales: 'MP', perfil: true });
  });

  it('respeta la preferencia de apodo y de nombre completo', () => {
    expect(jugadorPublico({ ...mayor, apodo: ' Tucu ', nombrePublico: 'APODO' }, hoy).nombre).toBe('Tucu');
    expect(jugadorPublico({ ...mayor, nombrePublico: 'COMPLETO' }, hoy).nombre).toBe('Matías Pérez');
  });

  it('sin apodo cargado, la preferencia de apodo vuelve a las iniciales', () => {
    expect(jugadorPublico({ ...mayor, apodo: '  ', nombrePublico: 'APODO' }, hoy).nombre).toBe('Matías P.');
  });

  it('un menor sin consentimiento no tiene perfil y solo se ven sus iniciales', () => {
    expect(jugadorPublico({ ...menor, nombrePublico: 'COMPLETO', apodo: 'Tomi' }, hoy)).toEqual({
      nombre: 'T. L.',
      iniciales: 'TL',
      perfil: false,
    });
    // Solo la imagen, sin la autorización del tutor, tampoco alcanza.
    expect(jugadorPublico({ ...menor, consentimientos: [imagen] }, hoy).perfil).toBe(false);
  });

  it('un menor con el consentimiento de imagen del tutor tiene perfil, pero nunca con el nombre completo', () => {
    const j = { ...menor, consentimientos: [imagen, tutor] };
    expect(jugadorPublico(j, hoy)).toEqual({ nombre: 'Tomás L.', iniciales: 'TL', perfil: true });
    expect(jugadorPublico({ ...j, nombrePublico: 'COMPLETO' }, hoy).nombre).toBe('Tomás L.');
    expect(jugadorPublico({ ...j, nombrePublico: 'APODO', apodo: 'Tomi' }, hoy).nombre).toBe('Tomi');
  });

  it('un consentimiento revocado o de una versión vieja no vale', () => {
    const revocado = { ...imagen, revocadoEn: '2026-01-01' };
    expect(jugadorPublico({ ...menor, consentimientos: [revocado, tutor] }, hoy).perfil).toBe(false);
    expect(
      jugadorPublico({ ...menor, consentimientos: [{ ...imagen, version: 0 }, tutor] }, hoy).perfil,
    ).toBe(false);
  });

  it('cumplir 18 le da perfil', () => {
    expect(jugadorPublico({ ...menor, fechaNacimiento: '2008-10-26' }, hoy).perfil).toBe(true);
    expect(jugadorPublico({ ...menor, fechaNacimiento: '2008-10-27' }, hoy).perfil).toBe(false);
  });
});

let n = 0;
const ev = (
  tipo: TipoEvento,
  equipoId: string,
  jugadorId: string | null,
  minuto: number | null,
  anulaA?: string,
) => ({ id: `e${++n}`, tipo, equipoId, jugadorId, minuto, anulaA: anulaA ?? null }) satisfies EventoPartido;

describe('lineaDeTiempo', () => {
  it('ordena por minuto, saca anulaciones y lleva el marcador', () => {
    const g1 = ev('GOL', 'L', 'mp', 12);
    const anulado = ev('GOL', 'V', 'ld', 20);
    const eventos = [
      ev('GOL', 'L', 'mp', 48),
      g1,
      anulado,
      ev('ANULACION', 'V', null, null, anulado.id),
      ev('AMARILLA', 'V', 'rs', 31),
      ev('GOL', 'V', 'ld', 25),
    ];
    const t = lineaDeTiempo(eventos, 'L', 'V');
    expect(t.map((e) => [e.minuto, e.tipo, e.lado])).toEqual([
      [12, 'GOL', 'LOCAL'],
      [25, 'GOL', 'VISITANTE'],
      [31, 'AMARILLA', 'VISITANTE'],
      [48, 'GOL', 'LOCAL'],
    ]);
    expect(t.map((e) => `${e.marcador.local}-${e.marcador.visitante}`)).toEqual(['1-0', '1-1', '1-1', '2-1']);
    expect(t.find((e) => e.id === anulado.id)).toBeUndefined();
  });

  it('un gol en contra suma al rival y los eventos sin minuto van al final', () => {
    const t = lineaDeTiempo([ev('GOL', 'L', 'a', null), ev('GOL_EN_CONTRA', 'L', 'b', 10)], 'L', 'V');
    expect(t[0]).toMatchObject({
      tipo: 'GOL_EN_CONTRA',
      lado: 'LOCAL',
      marcador: { local: 0, visitante: 1 },
    });
    expect(t[1]).toMatchObject({ minuto: null, marcador: { local: 1, visitante: 1 } });
  });

  it('marca la segunda amarilla del mismo jugador e ignora eventos de otros equipos', () => {
    const t = lineaDeTiempo(
      [
        ev('AMARILLA', 'L', 'x', 10),
        ev('AMARILLA', 'L', 'y', 12),
        ev('AMARILLA', 'L', 'x', 40),
        ev('GOL', 'Z', 'q', 5),
      ],
      'L',
      'V',
    );
    expect(t.map((e) => e.segundaAmarilla)).toEqual([false, false, true]);
  });
});

const nombres = { mp: 'Matías P.', ld: 'Lucía D.', rs: 'Rodrigo S.', jg: 'Juan G.', fb: 'Franco B.' };
const base = (eventos: EventoPartido[], extra: Partial<DatosCronica> = {}): DatosCronica => {
  const linea = lineaDeTiempo(eventos, 'L', 'V');
  const fin = linea.at(-1)?.marcador ?? { local: 0, visitante: 0 };
  return {
    id: 'p1',
    local: 'Deportivo Sur',
    visitante: 'Real Barrio',
    estado: 'FINALIZADO',
    golesLocal: fin.local,
    golesVisitante: fin.visitante,
    instancia: 'por la fecha 7',
    lineaDeTiempo: linea,
    nombres,
    ...extra,
  };
};

describe('cronica', () => {
  it('cuenta resultado, doblete, goles del rival, expulsión y tabla', () => {
    const [p1, p2] = cronica(
      base(
        [
          ev('GOL', 'L', 'mp', 12),
          ev('GOL', 'V', 'ld', 25),
          ev('AMARILLA', 'V', 'rs', 31),
          ev('GOL', 'L', 'mp', 48),
          ev('ROJA', 'V', 'ld', 52),
        ],
        { tabla: { local: { posicion: 1, pts: 16 }, visitante: { posicion: 6, pts: 7 } } },
      ),
    );
    expect(p1).toMatch(
      /^Deportivo Sur (le ganó 2 a 1 a Real Barrio|se impuso 2 a 1 ante Real Barrio) por la fecha 7\./,
    );
    expect(p1).toContain('Matías P. hizo un doblete para Deportivo Sur.');
    expect(p1).toContain('Lucía D. marcó para Real Barrio.');
    expect(p1).toContain("Real Barrio terminó con uno menos por la expulsión de Lucía D. a los 52'.");
    expect(p1).toContain('una amarilla');
    expect(p2).toBe(
      'En la tabla, Deportivo Sur es puntero con 16 puntos y Real Barrio está 6° con 7 puntos.',
    );
  });

  it('detecta la remontada del visitante y la goleada', () => {
    const [remontada] = cronica(
      base([ev('GOL', 'L', 'jg', 5), ev('GOL', 'V', 'ld', 30), ev('GOL', 'V', 'rs', 40)]),
    );
    expect(remontada).toContain('lo dio vuelta después de ir abajo en el marcador');
    expect(remontada).toContain('Para Real Barrio convirtieron Lucía D. y Rodrigo S.');
    expect(remontada).not.toContain('..'); // el nombre abreviado no suma otro punto
    const [goleada] = cronica(
      base([
        ev('GOL', 'L', 'mp', 5),
        ev('GOL', 'L', 'mp', 10),
        ev('GOL', 'L', 'mp', 20),
        ev('GOL', 'L', 'fb', 30),
      ]),
    );
    expect(goleada).toMatch(/Goleada de Deportivo Sur|Deportivo Sur goleó 4 a 0/);
    expect(goleada).toContain('Para Deportivo Sur convirtieron Matías P. (3) y Franco B.');
  });

  it('empate sin goles y sin tarjetas', () => {
    const [p] = cronica(base([]));
    expect(p).toMatch(/igualaron sin goles|Empate en cero/);
    expect(p).toContain('Partido limpio: no hubo tarjetas.');
  });

  it('empate definido por penales', () => {
    const [p] = cronica(
      base([ev('GOL', 'L', 'mp', 5), ev('GOL', 'V', 'ld', 9)], {
        instancia: 'por la semifinal',
        penalesLocal: 3,
        penalesVisitante: 4,
      }),
    );
    expect(p).toContain('y se definió por penales: Real Barrio ganó 4 a 3.');
  });

  it('W.O. y partido sin jugar', () => {
    expect(cronica({ ...base([]), estado: 'WO', ganadorWO: 'VISITANTE' })).toEqual([
      'Real Barrio ganó por la fecha 7 porque Deportivo Sur no se presentó a jugar.',
    ]);
    expect(cronica({ ...base([]), estado: 'PROGRAMADO', golesLocal: null, golesVisitante: null })).toEqual(
      [],
    );
  });

  it('un gol en contra se nombra a favor del rival; los goles sin autor no se nombran', () => {
    const [p] = cronica(base([ev('GOL_EN_CONTRA', 'V', 'rs', 3), ev('GOL', 'L', null, 8)]));
    expect(p).toContain('Deportivo Sur también sumó un gol en contra de Rodrigo S.');
    expect(p).not.toContain('marcó para Deportivo Sur');
  });

  it('la misma entrada da siempre la misma crónica', () => {
    const d = base([ev('GOL', 'L', 'mp', 5)]);
    expect(cronica(d)).toEqual(cronica(d));
  });

  it('enumerar', () => {
    expect(enumerar(['A'])).toBe('A');
    expect(enumerar(['A', 'B', 'C'])).toBe('A, B y C');
  });
});

describe('goleadorDelPartido', () => {
  it('el que más goles hizo; sin goles, nadie', () => {
    const t = lineaDeTiempo(
      [ev('GOL', 'V', 'ld', 1), ev('GOL', 'L', 'mp', 2), ev('GOL', 'L', 'mp', 3)],
      'L',
      'V',
    );
    expect(goleadorDelPartido(t)).toEqual({ jugadorId: 'mp', lado: 'LOCAL', goles: 2 });
    expect(goleadorDelPartido(lineaDeTiempo([ev('AMARILLA', 'L', 'mp', 2)], 'L', 'V'))).toBeNull();
  });
});

describe('estadísticas y trayectoria', () => {
  const partidos = [
    {
      estado: 'FINALIZADO',
      eventos: [ev('GOL', 'L', 'mp', 1), ev('GOL', 'L', 'mp', 2), ev('AMARILLA', 'L', 'mp', 3)],
    },
    { estado: 'FINALIZADO', eventos: [ev('GOL', 'L', 'jg', 1)] },
    // Los goles de un W.O. no son de nadie y el partido no cuenta como jugado.
    { estado: 'WO', eventos: [ev('GOL', 'L', 'mp', 1)] },
    { estado: 'PROGRAMADO', eventos: [] },
  ];

  it('cuenta partidos jugados, goles y tarjetas sin W.O. ni anulados', () => {
    const anulado = ev('GOL', 'L', 'mp', 50);
    const conAnulado = [
      ...partidos,
      {
        estado: 'FINALIZADO',
        eventos: [anulado, ev('ANULACION', 'L', null, null, anulado.id), ev('ROJA', 'L', 'mp', 9)],
      },
    ];
    expect(estadisticasDelJugador('mp', conAnulado)).toEqual({
      pj: 3,
      goles: 2,
      amarillas: 1,
      rojas: 1,
      golesPorPartido: 0.67,
      maximoEnUnPartido: 2,
    });
    expect(estadisticasDelJugador('mp', []).golesPorPartido).toBe(0);
  });

  it('suma torneos y calcula logros', () => {
    const a = estadisticasDelJugador('mp', partidos);
    const total = sumarEstadisticas([a, { ...a, goles: 3, maximoEnUnPartido: 3, pj: 2 }]);
    expect(total).toMatchObject({ pj: 4, goles: 5, golesPorPartido: 1.25, maximoEnUnPartido: 3 });
    expect(logrosDelJugador(total, ['Apertura 2026'])).toEqual([
      { tipo: 'GOLEADOR', torneo: 'Apertura 2026' },
      { tipo: 'HAT_TRICK' },
      { tipo: 'SIN_ROJAS' },
    ]);
    expect(logrosDelJugador(a, [])).toEqual([{ tipo: 'DOBLETE' }]);
  });

  it('máximo goleador del torneo, con empate compartido', () => {
    expect(esGoleadorDelTorneo('mp', partidos)).toBe(true);
    expect(esGoleadorDelTorneo('jg', partidos)).toBe(false);
    const empatados = [{ estado: 'FINALIZADO', eventos: [ev('GOL', 'L', 'a', 1), ev('GOL', 'V', 'b', 2)] }];
    expect(esGoleadorDelTorneo('a', empatados) && esGoleadorDelTorneo('b', empatados)).toBe(true);
    expect(esGoleadorDelTorneo('a', [])).toBe(false);
  });

  it('ordena la trayectoria: en curso, inscripción y terminados del más nuevo al más viejo', () => {
    const t = ordenarTrayectoria([
      { id: 'viejo', estadoTorneo: 'FINALIZADO', creadoEn: '2025-03-01' },
      { id: 'nuevo', estadoTorneo: 'FINALIZADO', creadoEn: '2025-08-01' },
      { id: 'abre', estadoTorneo: 'INSCRIPCION', creadoEn: '2026-10-01' },
      { id: 'curso', estadoTorneo: 'EN_CURSO', creadoEn: '2026-03-01' },
    ]);
    expect(t.map((x) => x.id)).toEqual(['curso', 'abre', 'nuevo', 'viejo']);
  });
});
