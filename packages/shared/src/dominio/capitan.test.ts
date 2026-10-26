import { describe, expect, it } from 'vitest';
import { faltantesDelEquipo, resumenConvocatoria, textoPedidoDeFaltantes } from './capitan.js';
import {
  estadoInvitacion,
  puedeInvitar,
  puedeQuitarAcceso,
  rolesQuePuedeInvitar,
  vencimientoInvitacion,
} from './usuarios.js';

describe('invitaciones y permisos de usuarios', () => {
  it('el dueño invita a cualquier rol; el administrador solo a roles sin plata; el resto a nadie', () => {
    expect(rolesQuePuedeInvitar('DUENO')).toEqual([
      'ADMINISTRADOR',
      'TESORERO',
      'ARBITRO',
      'TRIBUNAL',
      'CAPITAN',
    ]);
    expect(rolesQuePuedeInvitar('ADMINISTRADOR')).toEqual(['ARBITRO', 'TRIBUNAL', 'CAPITAN']);
    for (const r of ['TESORERO', 'ARBITRO', 'TRIBUNAL', 'CAPITAN', 'X'])
      expect(rolesQuePuedeInvitar(r)).toEqual([]);
  });

  it('nadie invita a un dueño y el capitán necesita equipo', () => {
    expect(puedeInvitar('DUENO', 'DUENO').ok).toBe(false);
    expect(puedeInvitar('ADMINISTRADOR', 'TESORERO').ok).toBe(false);
    expect(puedeInvitar('DUENO', 'CAPITAN').ok).toBe(false);
    expect(puedeInvitar('DUENO', 'CAPITAN', 'eq1').ok).toBe(true);
    expect(puedeInvitar('ADMINISTRADOR', 'ARBITRO').ok).toBe(true);
  });

  it('estado de la invitación: usada pesa más que vencida', () => {
    const ahora = new Date('2026-10-26T12:00:00Z');
    const vence = vencimientoInvitacion(new Date('2026-10-20T12:00:00Z'));
    expect(vence.toISOString()).toBe('2026-10-27T12:00:00.000Z');
    expect(estadoInvitacion({ venceEn: vence }, ahora)).toBe('PENDIENTE');
    expect(estadoInvitacion({ venceEn: vence }, new Date('2026-10-27T12:00:00Z'))).toBe('VENCIDA');
    expect(estadoInvitacion({ venceEn: '2020-01-01', aceptadaEn: '2019-12-31' }, ahora)).toBe('ACEPTADA');
    expect(estadoInvitacion({ venceEn: vence, anuladaEn: ahora }, ahora)).toBe('ANULADA');
    expect(estadoInvitacion({ venceEn: vence, rechazadaEn: ahora }, ahora)).toBe('RECHAZADA');
  });

  it('nunca se le quita el acceso al último dueño ni a uno mismo', () => {
    const base = { actor: 'DUENO', esUnoMismo: false, duenos: 1 };
    expect(puedeQuitarAcceso({ ...base, objetivo: 'DUENO' }).ok).toBe(false);
    expect(puedeQuitarAcceso({ ...base, objetivo: 'DUENO', duenos: 2 }).ok).toBe(true);
    expect(puedeQuitarAcceso({ ...base, objetivo: 'TESORERO', esUnoMismo: true }).ok).toBe(false);
    expect(puedeQuitarAcceso({ ...base, objetivo: 'TESORERO' }).ok).toBe(true);
    expect(puedeQuitarAcceso({ ...base, actor: 'ADMINISTRADOR', objetivo: 'CAPITAN' }).ok).toBe(true);
    expect(puedeQuitarAcceso({ ...base, actor: 'ADMINISTRADOR', objetivo: 'TESORERO' }).ok).toBe(false);
    expect(puedeQuitarAcceso({ ...base, actor: 'TESORERO', objetivo: 'ARBITRO' }).ok).toBe(false);
  });
});

describe('panel del capitán', () => {
  it('convocatoria: el suspendido no cuenta y el que no respondió queda pendiente', () => {
    const r = resumenConvocatoria([
      { jugadorId: 'a', suspendido: false, respuesta: 'VA' },
      { jugadorId: 'b', suspendido: false, respuesta: 'NO_VA' },
      { jugadorId: 'c', suspendido: false },
      { jugadorId: 'd', suspendido: true, respuesta: 'VA' },
      { jugadorId: 'e', suspendido: false, respuesta: null },
    ]);
    expect(r).toMatchObject({ va: 1, noVa: 1, pendientes: 2, suspendidos: 1, convocables: 4 });
    expect(r.jugadores.find((j) => j.jugadorId === 'd')!.estado).toBe('SUSPENDIDO');
    expect(resumenConvocatoria([])).toMatchObject({ va: 0, convocables: 0 });
  });

  it('faltantes por documento: pendiente, rechazado y vencido faltan; la autorización solo para menores', () => {
    const fila = (nombre: string, dni: string, apto: string, aut = 'FALTA', menor = false) => ({
      nombre,
      menor,
      estados: { DNI: dni, APTO_FISICO: apto, AUTORIZACION_MENOR: aut } as never,
    });
    const filas = [
      fila('Ana', 'VIGENTE', 'POR_VENCER'),
      fila('Beto', 'PENDIENTE', 'VENCIDO'),
      fila('Ciro', 'VIGENTE', 'FALTA', 'FALTA', true),
      fila('Dani', 'RECHAZADO', 'VIGENTE', 'VIGENTE', true),
    ];
    const r = faltantesDelEquipo(filas, ['DNI', 'APTO_FISICO', 'AUTORIZACION_MENOR']);
    const por = Object.fromEntries(r.map((d) => [d.tipo, d]));
    expect(por.DNI!.faltan.map((f) => f.nombre)).toEqual(['Beto', 'Dani']);
    expect(por.APTO_FISICO!).toMatchObject({ total: 4, completos: 2 });
    expect(por.AUTORIZACION_MENOR!).toMatchObject({ total: 2, completos: 1 });
    expect(por.AUTORIZACION_MENOR!.faltan.map((f) => f.nombre)).toEqual(['Ciro']);
    // Sin requisitos del torneo no falta nada.
    expect(faltantesDelEquipo(filas, [])).toEqual([]);
    // Sin menores, la autorización no aparece.
    expect(faltantesDelEquipo(filas.slice(0, 2), ['AUTORIZACION_MENOR'])).toEqual([]);
    expect(textoPedidoDeFaltantes('Los Pibes', r)).toContain('• DNI: Beto, Dani');
    expect(textoPedidoDeFaltantes('Los Pibes', [])).toContain('al día');
  });
});

describe('bajas del plantel', () => {
  it('no se da de baja a quien ya figura en actas del torneo en curso', async () => {
    const { puedeDarDeBaja } = await import('./capitan.js');
    expect(puedeDarDeBaja({ eventosEnTorneoEnCurso: 0 }).ok).toBe(true);
    expect(puedeDarDeBaja({ eventosEnTorneoEnCurso: 2 }).ok).toBe(false);
  });
});
