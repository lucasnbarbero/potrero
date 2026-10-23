import { describe, expect, it } from 'vitest';
import {
  CONSENTIMIENTOS,
  debeBorrarse,
  dniValido,
  edadEn,
  enmascararDni,
  esMenor,
  estadoDeDocumento,
  habilitacionDelJugador,
  normalizarDni,
  puedePublicarImagen,
  requeridosPara,
  consentimientoVigente,
  type DocumentoBasico,
} from './documentacion.js';

const hoy = new Date('2026-10-24T12:00:00Z');
const doc = (
  tipo: DocumentoBasico['tipo'],
  estado: DocumentoBasico['estado'],
  vencimiento: string | null = null,
): DocumentoBasico => ({ tipo, estado, vencimiento });

describe('edad y menores', () => {
  it('cuenta la edad cumplida', () => {
    expect(edadEn('2008-10-25', hoy)).toBe(17);
    expect(edadEn('2008-10-24', hoy)).toBe(18);
  });
  it('es menor por debajo de la mayoría de edad; sin fecha no se afirma', () => {
    expect(esMenor('2010-01-01', hoy)).toBe(true);
    expect(esMenor('2000-01-01', hoy)).toBe(false);
    expect(esMenor(null, hoy)).toBe(false);
  });
});

describe('estado de un documento', () => {
  it('sin documentos, falta', () => expect(estadoDeDocumento([], 'DNI', hoy)).toBe('FALTA'));
  it('aprobado sin vencimiento es vigente', () =>
    expect(estadoDeDocumento([doc('DNI', 'APROBADO')], 'DNI', hoy)).toBe('VIGENTE'));
  it('avisa cuando vence dentro del plazo y marca el vencido', () => {
    expect(estadoDeDocumento([doc('APTO_FISICO', 'APROBADO', '2026-11-10')], 'APTO_FISICO', hoy)).toBe(
      'POR_VENCER',
    );
    expect(estadoDeDocumento([doc('APTO_FISICO', 'APROBADO', '2027-06-01')], 'APTO_FISICO', hoy)).toBe(
      'VIGENTE',
    );
    expect(estadoDeDocumento([doc('APTO_FISICO', 'APROBADO', '2026-10-02')], 'APTO_FISICO', hoy)).toBe(
      'VENCIDO',
    );
  });
  it('el mejor documento gana: uno vigente pesa más que uno rechazado viejo', () => {
    const docs = [doc('DNI', 'RECHAZADO'), doc('DNI', 'APROBADO')];
    expect(estadoDeDocumento(docs, 'DNI', hoy)).toBe('VIGENTE');
  });
  it('una renovación pendiente pesa más que el apto vencido', () => {
    const docs = [doc('APTO_FISICO', 'APROBADO', '2026-10-02'), doc('APTO_FISICO', 'PENDIENTE')];
    expect(estadoDeDocumento(docs, 'APTO_FISICO', hoy)).toBe('PENDIENTE');
  });
  it('ignora documentos de otro tipo', () =>
    expect(estadoDeDocumento([doc('DNI', 'APROBADO')], 'APTO_FISICO', hoy)).toBe('FALTA'));
});

describe('requisitos del torneo', () => {
  it('la autorización solo se pide a los menores', () => {
    expect(requeridosPara(['DNI', 'AUTORIZACION_MENOR'], false)).toEqual(['DNI']);
    expect(requeridosPara(['DNI', 'AUTORIZACION_MENOR'], true)).toEqual(['DNI', 'AUTORIZACION_MENOR']);
  });
});

describe('habilitación del jugador', () => {
  const base = {
    requeridos: ['DNI', 'APTO_FISICO', 'AUTORIZACION_MENOR'] as const,
    documentos: [doc('DNI', 'APROBADO'), doc('APTO_FISICO', 'APROBADO', '2027-03-01')],
    nacimiento: '1998-05-05',
    tutorAutorizo: false,
    sancionActiva: false,
    duplicadoAbierto: false,
    hoy,
  };
  it('habilita con todo en regla', () => {
    const h = habilitacionDelJugador(base);
    expect(h.habilitado).toBe(true);
    expect(h.motivos).toEqual([]);
  });
  it('si el torneo no exige nada, solo importan sanción y duplicado', () => {
    expect(habilitacionDelJugador({ ...base, requeridos: [], documentos: [] }).habilitado).toBe(true);
    expect(habilitacionDelJugador({ ...base, requeridos: [], sancionActiva: true }).habilitado).toBe(false);
  });
  it('explica cada motivo', () => {
    const h = habilitacionDelJugador({
      ...base,
      documentos: [doc('APTO_FISICO', 'APROBADO', '2026-10-02')],
      sancionActiva: true,
      duplicadoAbierto: true,
    });
    expect(h.habilitado).toBe(false);
    expect(h.motivos).toEqual([
      'Falta DNI',
      'Apto físico vencido',
      'Suspendido por sanción',
      'Posible duplicado sin resolver',
    ]);
  });
  it('un documento pendiente todavía no habilita', () => {
    const h = habilitacionDelJugador({ ...base, documentos: [doc('DNI', 'PENDIENTE'), base.documentos[1]!] });
    expect(h.motivos).toEqual(['DNI pendiente de revisión']);
  });
  it('el menor necesita autorización: por documento o porque el tutor la firmó en línea', () => {
    const menor = { ...base, nacimiento: '2010-03-03' };
    expect(habilitacionDelJugador(menor).motivos).toEqual(['Menor sin autorización del tutor']);
    expect(habilitacionDelJugador({ ...menor, tutorAutorizo: true }).habilitado).toBe(true);
    expect(
      habilitacionDelJugador({
        ...menor,
        documentos: [...menor.documentos, doc('AUTORIZACION_MENOR', 'APROBADO')],
      }).habilitado,
    ).toBe(true);
  });
});

describe('identidad', () => {
  it('normaliza y valida el DNI', () => {
    expect(normalizarDni('30.123.456')).toBe('30123456');
    expect(dniValido('30.123.456')).toBe(true);
    expect(dniValido('123')).toBe(false);
  });
  it('enmascara dejando los últimos tres', () => expect(enmascararDni('30.123.456')).toBe('•••••456'));
});

describe('consentimientos', () => {
  const v = CONSENTIMIENTOS.IMAGEN.version;
  it('vale solo la versión actual y mientras no se revoque', () => {
    expect(consentimientoVigente([{ tipo: 'IMAGEN', version: v, revocadoEn: null }], 'IMAGEN')).toBe(true);
    expect(consentimientoVigente([{ tipo: 'IMAGEN', version: v - 1, revocadoEn: null }], 'IMAGEN')).toBe(
      false,
    );
    expect(consentimientoVigente([{ tipo: 'IMAGEN', version: v, revocadoEn: '2026-01-01' }], 'IMAGEN')).toBe(
      false,
    );
  });
  it('un menor se publica solo con el consentimiento del tutor además del de imagen', () => {
    const imagen = { tipo: 'IMAGEN' as const, version: v, revocadoEn: null };
    const tutor = {
      tipo: 'TUTOR_PARTICIPACION' as const,
      version: CONSENTIMIENTOS.TUTOR_PARTICIPACION.version,
      revocadoEn: null,
    };
    expect(puedePublicarImagen(false, [imagen])).toBe(true);
    expect(puedePublicarImagen(true, [imagen])).toBe(false);
    expect(puedePublicarImagen(true, [imagen, tutor])).toBe(true);
    expect(puedePublicarImagen(false, [])).toBe(false);
  });
});

describe('retención', () => {
  it('borra los rechazados a los 30 días y no antes', () => {
    expect(debeBorrarse('RECHAZADO', '2026-09-20', hoy)).toBe(true);
    expect(debeBorrarse('RECHAZADO', '2026-10-10', hoy)).toBe(false);
  });
});
