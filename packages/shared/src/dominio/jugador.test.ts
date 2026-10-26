import { describe, expect, it } from 'vitest';
import { avisosDelJugador, documentacionDelJugador, puedeConfirmarAsistencia } from './jugador.js';
import { NOMBRE_ROL, rolesQuePuedeInvitar } from './usuarios.js';

const hoy = new Date('2026-10-26T12:00:00Z');
const estados = (x: Partial<Record<'DNI' | 'APTO_FISICO' | 'AUTORIZACION_MENOR', string>> = {}) =>
  ({ DNI: 'FALTA', APTO_FISICO: 'FALTA', AUTORIZACION_MENOR: 'FALTA', ...x }) as Parameters<
    typeof documentacionDelJugador
  >[0]['estados'];

describe('cuenta del jugador', () => {
  it('el rol jugador existe pero no se invita desde usuarios: lo invita el capitán desde su plantel', () => {
    expect(NOMBRE_ROL.JUGADOR).toBe('Jugador');
    expect(rolesQuePuedeInvitar('DUENO')).not.toContain('JUGADOR');
  });

  it('confirma asistencia solo antes del partido; un suspendido solo puede decir que no va', () => {
    expect(
      puedeConfirmarAsistencia({ estadoPartido: 'PROGRAMADO', suspendido: false, respuesta: 'VA' }).ok,
    ).toBe(true);
    expect(
      puedeConfirmarAsistencia({ estadoPartido: 'EN_JUEGO', suspendido: false, respuesta: 'VA' }).ok,
    ).toBe(false);
    expect(
      puedeConfirmarAsistencia({ estadoPartido: 'PROGRAMADO', suspendido: true, respuesta: 'VA' }).ok,
    ).toBe(false);
    expect(
      puedeConfirmarAsistencia({ estadoPartido: 'PROGRAMADO', suspendido: true, respuesta: 'NO_VA' }).ok,
    ).toBe(true);
  });
});

describe('documentación del jugador', () => {
  it('muestra lo que exige el torneo, cuenta lo que falta y solo deja subir DNI y apto', () => {
    const d = documentacionDelJugador({
      requeridosTorneos: ['DNI', 'APTO_FISICO', 'AUTORIZACION_MENOR'],
      menor: false,
      estados: estados({ DNI: 'VIGENTE', APTO_FISICO: 'RECHAZADO' }),
    });
    expect(d.items.map((i) => i.tipo)).toEqual(['DNI', 'APTO_FISICO']);
    expect(d.faltan).toBe(1);
    expect(d.items.find((i) => i.tipo === 'DNI')!.puedeSubir).toBe(false);
    expect(d.items.find((i) => i.tipo === 'APTO_FISICO')!.puedeSubir).toBe(true);
  });

  it('al menor le pide la autorización del tutor, pero no la puede subir él', () => {
    const d = documentacionDelJugador({
      requeridosTorneos: ['DNI', 'AUTORIZACION_MENOR'],
      menor: true,
      estados: estados({ DNI: 'PENDIENTE' }),
    });
    const aut = d.items.find((i) => i.tipo === 'AUTORIZACION_MENOR')!;
    expect(aut.requerido).toBe(true);
    expect(aut.puedeSubir).toBe(false);
    // Lo pendiente espera la revisión: no se vuelve a subir.
    expect(d.items.find((i) => i.tipo === 'DNI')!.puedeSubir).toBe(false);
    expect(d.faltan).toBe(2);
  });
});

describe('avisos del jugador', () => {
  const partido = {
    equipo: 'Villa Unión',
    rival: 'Los Pibes',
    inicio: new Date('2026-10-27T22:00:00Z'),
    cancha: 'Cancha 1',
    respuesta: null,
    suspendido: false,
  };

  it('sin responder: pide confirmar la convocatoria y avisa del partido, primero lo urgente', () => {
    const a = avisosDelJugador({
      hoy,
      partidos: [partido],
      sanciones: [],
      documentosFaltantes: [],
      deudaEquipos: [{ equipo: 'Villa Unión', saldo: 1000 }],
    });
    expect(a.map((x) => x.tipo)).toEqual(['CONVOCATORIA', 'PARTIDO', 'DEUDA']);
    expect(a[1]!.urgencia).toBe('ALTA');
  });

  it('si ya respondió no pide confirmar; el suspendido ve la sanción y no la convocatoria', () => {
    expect(
      avisosDelJugador({
        hoy,
        partidos: [{ ...partido, respuesta: 'VA' }],
        sanciones: [],
        documentosFaltantes: [],
        deudaEquipos: [],
      }).map((x) => x.tipo),
    ).toEqual(['PARTIDO']);
    const s = avisosDelJugador({
      hoy,
      partidos: [{ ...partido, suspendido: true }],
      sanciones: [{ equipo: 'Villa Unión', causa: 'Roja directa', restantes: 2 }],
      documentosFaltantes: ['Apto físico'],
      deudaEquipos: [{ equipo: 'Villa Unión', saldo: 0 }],
    });
    expect(s.map((x) => x.tipo)).toEqual(['SANCION', 'DOCUMENTACION', 'PARTIDO']);
    expect(s[0]!.detalle).toContain('faltan 2 fechas');
  });
});
