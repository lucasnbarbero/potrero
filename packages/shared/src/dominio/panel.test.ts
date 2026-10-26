import { describe, expect, it } from 'vitest';
import {
  alertasDelPanel,
  type EntradaAlertas,
  minutoDeJuego,
  sugerenciasDelPanel,
  type TorneoParaSugerir,
} from './panel.js';

const sinNada: EntradaAlertas = {
  suspendidosQueJugaron: [],
  actasSinCargar: [],
  sinArbitro: [],
  documentos: { vencidos: 0, porVencer: 0 },
  pagosSinConciliar: { cantidad: 0, monto: 0 },
  noPuedo: null,
  mensajesFallidos: 0,
};

describe('alertas del panel', () => {
  it('sin problemas no hay alertas', () => {
    expect(alertasDelPanel(sinNada)).toEqual([]);
  });

  it('cada alerta trae su botón y va a la pantalla que la resuelve', () => {
    const a = alertasDelPanel({
      ...sinNada,
      suspendidosQueJugaron: [{ expedienteId: 'x', jugador: 'Ruiz', equipo: 'Dep. Sur', fecha: 5 }],
      actasSinCargar: [
        { partidoId: 'p1', local: 'Pumas', visitante: 'Sparta', fecha: 6 },
        { partidoId: 'p2', local: 'Fénix', visitante: 'Banda', fecha: 6 },
      ],
      sinArbitro: [{ partidoId: 'p3', local: 'Fénix', visitante: 'La Banda', cuando: 'sáb 7/11 · 16:00' }],
      documentos: { vencidos: 2, porVencer: 3 },
      pagosSinConciliar: { cantidad: 1, monto: 30000 },
    });
    expect(a.map((x) => x.tipo)).toEqual([
      'SUSPENDIDO_JUGO',
      'ACTA_SIN_CARGAR',
      'SIN_ARBITRO',
      'DOCUMENTO_VENCIDO',
      'PAGO_SIN_CONCILIAR',
    ]);
    expect(a[0]).toMatchObject({
      titulo: 'Jugó un suspendido',
      detalle: 'Ruiz (Dep. Sur) · fecha 5',
      accion: 'Resolver',
    });
    expect(a[1]).toMatchObject({
      titulo: '2 actas sin cargar',
      detalle: 'Fecha 6 · Pumas vs Sparta y 1 más',
      href: '/panel/partidos/p1',
      cantidad: 2,
    });
    expect(a[2]).toMatchObject({ titulo: 'Partido sin árbitro', href: '/panel/arbitros', accion: 'Asignar' });
    expect(a[3]!.titulo).toBe('2 documentos vencidos');
    expect(a[3]!.cantidad).toBe(5);
    expect(a[4]!.detalle).toContain('30.000');
    expect(a[4]!.href).toBe('/panel/caja');
  });

  it('ordena por gravedad: lo grave primero, aunque llegue después', () => {
    const a = alertasDelPanel({
      ...sinNada,
      mensajesFallidos: 2,
      documentos: { vencidos: 0, porVencer: 1 },
      actasSinCargar: [{ partidoId: 'p', local: 'A', visitante: 'B', fecha: 1 }],
      noPuedo: { contingenciaId: 'c1', cantidad: 1 },
    });
    expect(a.map((x) => x.tipo)).toEqual([
      'ACTA_SIN_CARGAR',
      'NO_PUEDO',
      'DOCUMENTO_VENCIDO',
      'MENSAJES_FALLIDOS',
    ]);
    expect(a.find((x) => x.tipo === 'DOCUMENTO_VENCIDO')!.titulo).toBe('1 documento vence pronto');
    expect(a.find((x) => x.tipo === 'NO_PUEDO')!.href).toBe('/panel/reprogramaciones/c1');
  });

  it('un "No puedo" sin respuestas no alerta', () => {
    expect(alertasDelPanel({ ...sinNada, noPuedo: { contingenciaId: 'c', cantidad: 0 } })).toEqual([]);
  });
});

const torneo = (t: Partial<TorneoParaSugerir> = {}): TorneoParaSugerir => ({
  id: 't1',
  nombre: 'Apertura',
  estado: 'EN_CURSO',
  cupo: 8,
  inscriptos: 8,
  partidos: 28,
  plantelesIncompletos: 0,
  plantelMinimo: 8,
  deudores: 0,
  deuda: 0,
  venceInscripcionEnDias: null,
  proximaFecha: null,
  ...t,
});
const fecha = (f: Partial<NonNullable<TorneoParaSugerir['proximaFecha']>> = {}) => ({
  numero: 8,
  enDias: 2,
  dia: 'sábado',
  sinArbitro: 0,
  capitanes: 16,
  avisada: true,
  ...f,
});

describe('sugerencias del próximo paso', () => {
  it('sin torneos activos sugiere crear uno', () => {
    const s = sugerenciasDelPanel({ torneos: [torneo({ estado: 'FINALIZADO' })], expedientesAbiertos: 0 });
    expect(s.map((x) => x.clave)).toEqual(['CREAR_TORNEO']);
    expect(s[0]!.href).toBe('/panel/torneos/nuevo');
  });

  it('con la liga al día no sugiere nada', () => {
    expect(
      sugerenciasDelPanel({ torneos: [torneo({ proximaFecha: fecha() })], expedientesAbiertos: 0 }),
    ).toEqual([]);
  });

  it('próxima fecha: primero los árbitros, después avisar a los capitanes', () => {
    const s = sugerenciasDelPanel({
      torneos: [torneo({ proximaFecha: fecha({ sinArbitro: 2, avisada: false }) })],
      expedientesAbiertos: 0,
    });
    expect(s.map((x) => x.clave)).toEqual(['ARBITROS:t1', 'AVISAR:t1']);
    expect(s[0]!.texto).toBe(
      'Designá árbitros para el sábado: 2 partidos de la fecha 8 de Apertura no tienen árbitro.',
    );
    expect(s[1]!.texto).toBe(
      'Publicá el fixture de la fecha 8 de Apertura y avisá a 16 capitanes por WhatsApp.',
    );
  });

  it('dice "hoy" o "mañana" cuando corresponde y no mira fechas lejanas', () => {
    const hoy = sugerenciasDelPanel({
      torneos: [torneo({ proximaFecha: fecha({ sinArbitro: 1, enDias: 0 }) })],
      expedientesAbiertos: 0,
    });
    expect(hoy[0]!.texto).toContain('para hoy: 1 partido de la fecha 8 de Apertura no tiene árbitro');
    expect(
      sugerenciasDelPanel({
        torneos: [torneo({ proximaFecha: fecha({ sinArbitro: 1, enDias: 1 }) })],
        expedientesAbiertos: 0,
      })[0]!.texto,
    ).toContain('para mañana');
    expect(
      sugerenciasDelPanel({
        torneos: [torneo({ proximaFecha: fecha({ sinArbitro: 1, enDias: 12, avisada: false }) })],
        expedientesAbiertos: 0,
      }),
    ).toEqual([]);
  });

  it('inscripción: con el cupo lleno, generar el fixture; si no, compartir el link', () => {
    const lleno = sugerenciasDelPanel({
      torneos: [torneo({ estado: 'INSCRIPCION', partidos: 0, inscriptos: 8, cupo: 8 })],
      expedientesAbiertos: 0,
    });
    expect(lleno[0]).toMatchObject({ clave: 'FIXTURE:t1', href: '/panel/torneos/t1?tab=fixture' });
    const faltan = sugerenciasDelPanel({
      torneos: [
        torneo({ estado: 'INSCRIPCION', partidos: 0, inscriptos: 3, cupo: 12, venceInscripcionEnDias: 5 }),
      ],
      expedientesAbiertos: 0,
    });
    expect(faltan[0]!.texto).toBe(
      'Faltan 9 equipos para llenar Apertura y la inscripción cierra en 5 días. Compartí el link de inscripción.',
    );
    // Inscripción vencida con equipos suficientes: a armar el fixture con los que hay.
    const vencida = sugerenciasDelPanel({
      torneos: [
        torneo({ estado: 'INSCRIPCION', partidos: 0, inscriptos: 6, cupo: 8, venceInscripcionEnDias: -1 }),
      ],
      expedientesAbiertos: 0,
    });
    expect(vencida[0]!.clave).toBe('FIXTURE:t1');
    expect(vencida[0]!.texto).toBe('Apertura ya tiene 6 equipos: generá el fixture y arrancá.');
  });

  it('planteles incompletos, deuda y tribunal, ordenados por urgencia y como mucho tres', () => {
    const s = sugerenciasDelPanel({
      torneos: [
        torneo({ plantelesIncompletos: 3, plantelMinimo: 10, deudores: 1, deuda: 60000 }),
        torneo({ id: 't2', nombre: 'Clausura', estado: 'INSCRIPCION', partidos: 0, inscriptos: 3, cupo: 12 }),
      ],
      expedientesAbiertos: 2,
    });
    expect(s.map((x) => x.clave)).toEqual(['TRIBUNAL', 'PLANTELES:t1', 'DEUDA:t1']);
    expect(s[1]!.texto).toBe(
      '3 equipos de Apertura no tienen el plantel completo (mínimo 10 jugadores). Pediles que lo carguen.',
    );
    expect(s[2]!.texto).toContain('debe');
    expect(
      sugerenciasDelPanel({ torneos: [torneo({ deudores: 1, deuda: 1 })], expedientesAbiertos: 0 }, 5),
    ).toHaveLength(1);
  });
});

describe('minuto del partido en vivo', () => {
  const ahora = new Date('2026-11-07T18:32:30Z');
  it('cuenta desde el inicio', () => {
    expect(minutoDeJuego(new Date('2026-11-07T18:00:00Z'), ahora)).toBe(32);
    expect(minutoDeJuego('2026-11-07T18:32:00Z', ahora)).toBe(1);
  });
  it('sin inicio, antes de empezar o mucho después no muestra minuto', () => {
    expect(minutoDeJuego(null, ahora)).toBeNull();
    expect(minutoDeJuego(new Date('2026-11-07T19:00:00Z'), ahora)).toBeNull();
    expect(minutoDeJuego(new Date('2026-11-07T10:00:00Z'), ahora)).toBeNull();
  });
});
