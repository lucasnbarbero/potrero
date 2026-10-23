import { describe, expect, it } from 'vitest';
import {
  type Destinatario,
  diasEntre,
  esRecordatorio24h,
  estimarEnvio,
  etapaDeCobro,
  evaluarTope,
  PLANTILLAS,
  planificarEnvio,
  renderizar,
  variablesDe,
  variablesDesconocidas,
} from './mensajeria.js';

const dest = (extra: Partial<Destinatario> = {}): Destinatario => ({
  equipoId: 'e1',
  nombre: 'Matías',
  email: 'm@test.com',
  telefono: '3564111222',
  optInWhatsapp: true,
  bajaMarketing: false,
  ...extra,
});

describe('mensajería: plantillas', () => {
  it('completa las variables, también con tilde', () => {
    const r = renderizar('Hola {capitán}! Juega {equipo}.', { capitán: 'Matías', equipo: 'Los Pibes' });
    expect(r).toEqual({ texto: 'Hola Matías! Juega Los Pibes.', faltantes: [] });
  });

  it('informa las variables que faltan y las deja a la vista', () => {
    const r = renderizar('Pagá en {link_pago}, {capitán}', { capitán: 'Ana' });
    expect(r.texto).toBe('Pagá en {link_pago}, Ana');
    expect(r.faltantes).toEqual(['link_pago']);
  });

  it('lista las variables de un texto sin repetir', () => {
    expect(variablesDe('{a} {b} {a} sin llaves {c_1}')).toEqual(['a', 'b', 'c_1']);
  });

  it('detecta variables desconocidas en un mensaje libre', () => {
    expect(variablesDesconocidas('Hola {capitán}, pagá {link_pago}')).toEqual(['link_pago']);
    expect(variablesDesconocidas('Hola {capitán} de {equipo}')).toEqual([]);
  });

  it('todas las plantillas tienen sus variables bien formadas y la de contingencia pide confirmación', () => {
    for (const p of Object.values(PLANTILLAS)) {
      expect(p.version).toBeGreaterThan(0);
      expect(renderizar(p.cuerpo, {}).faltantes.length).toBe(variablesDe(p.cuerpo).length);
    }
    expect(PLANTILLAS.CONTINGENCIA!.conConfirmacion).toBe(true);
    expect(variablesDe(PLANTILLAS.CONTINGENCIA!.cuerpo)).toContain('link_confirmacion');
  });
});

describe('mensajería: canal por destinatario', () => {
  it('WhatsApp si aceptó y tiene teléfono', () => {
    const { entregas } = planificarEnvio([dest()], 'WHATSAPP', 'TRANSACCIONAL');
    expect(entregas).toMatchObject([{ canal: 'WHATSAPP' }]);
    expect(entregas[0]!.pedido).toBeUndefined();
  });

  it('sin opt-in, WhatsApp baja a email y lo avisa', () => {
    const { entregas } = planificarEnvio([dest({ optInWhatsapp: false })], 'WHATSAPP', 'TRANSACCIONAL');
    expect(entregas).toMatchObject([{ canal: 'EMAIL', pedido: 'WHATSAPP' }]);
  });

  it('con opt-in pero sin teléfono, también baja a email', () => {
    const { entregas } = planificarEnvio([dest({ telefono: null })], 'WHATSAPP', 'TRANSACCIONAL');
    expect(entregas[0]!.canal).toBe('EMAIL');
  });

  it('sin opt-in ni email, queda omitido con el motivo', () => {
    const r = planificarEnvio([dest({ optInWhatsapp: false, email: null })], 'WHATSAPP', 'TRANSACCIONAL');
    expect(r.entregas).toHaveLength(0);
    expect(r.omitidos[0]!.motivo).toMatch(/No aceptó WhatsApp/);
  });

  it('push pedido sin push activo baja a email; con push activo, va por push', () => {
    expect(planificarEnvio([dest()], 'PUSH', 'TRANSACCIONAL').entregas[0]).toMatchObject({
      canal: 'EMAIL',
      pedido: 'PUSH',
    });
    expect(planificarEnvio([dest({ push: true })], 'PUSH', 'TRANSACCIONAL').entregas[0]!.canal).toBe('PUSH');
  });

  it('email pedido sin email, pero con push, usa push', () => {
    const r = planificarEnvio([dest({ email: null, push: true })], 'EMAIL', 'TRANSACCIONAL');
    expect(r.entregas[0]!.canal).toBe('PUSH');
  });

  it('el marketing respeta la baja y lo transaccional no', () => {
    const d = dest({ bajaMarketing: true });
    expect(planificarEnvio([d], 'EMAIL', 'MARKETING').omitidos[0]!.motivo).toMatch(/no recibir novedades/);
    expect(planificarEnvio([d], 'EMAIL', 'TRANSACCIONAL').entregas).toHaveLength(1);
  });
});

describe('mensajería: costo y topes', () => {
  it('email y push son gratis; WhatsApp cuesta según la categoría', () => {
    const entregas = [
      { destinatario: dest(), canal: 'EMAIL' as const },
      { destinatario: dest(), canal: 'WHATSAPP' as const },
      { destinatario: dest(), canal: 'WHATSAPP' as const },
    ];
    const util = estimarEnvio(entregas, 'UTILIDAD');
    expect(util.porCanal).toEqual({ EMAIL: 1, WHATSAPP: 2, PUSH: 0 });
    expect(util.costoUsd).toBe(0.052);
    expect(estimarEnvio(entregas, 'MARKETING').costoUsd).toBe(0.12);
    expect(util.costoArs).toBe(Math.round(0.052 * 1500));
  });

  it('un envío vacío no cuesta nada', () => {
    expect(estimarEnvio([], 'UTILIDAD')).toMatchObject({ costoUsd: 0, costoArs: 0 });
  });

  it('el tope depende del plan y avisa cuánto se pasa', () => {
    expect(evaluarTope('LIGA', 190, 5)).toEqual({ tope: 200, usados: 190, restantes: 10, excedente: 0 });
    expect(evaluarTope('LIGA', 190, 25)).toMatchObject({ restantes: 10, excedente: 15 });
    expect(evaluarTope('PRO', 0, 25).excedente).toBe(0);
    expect(evaluarTope('LIGA', 250, 1)).toMatchObject({ restantes: 0, excedente: 1 });
  });
});

describe('mensajería: automatizaciones', () => {
  it('cobro escalonado: 3 días antes, el día y 2 días después', () => {
    expect(etapaDeCobro('2026-11-10', '2026-11-13')).toBe('T-3');
    expect(etapaDeCobro('2026-11-13', '2026-11-13')).toBe('T0');
    expect(etapaDeCobro('2026-11-15', '2026-11-13')).toBe('T+2');
    expect(etapaDeCobro('2026-11-11', '2026-11-13')).toBeNull();
    expect(etapaDeCobro('2026-11-16', '2026-11-13')).toBeNull();
  });

  it('cuenta días entre fechas, incluso cruzando de mes y de año', () => {
    expect(diasEntre('2026-12-30', '2027-01-02')).toBe(3);
    expect(diasEntre('2026-03-01', '2026-02-27')).toBe(-2);
  });

  it('recordatorio: desde 24 horas antes hasta el inicio, no después', () => {
    const inicio = new Date('2026-11-14T22:00:00Z');
    expect(esRecordatorio24h(inicio, new Date('2026-11-13T21:00:00Z'))).toBe(false); // faltan 25 h
    expect(esRecordatorio24h(inicio, new Date('2026-11-13T22:00:00Z'))).toBe(true); // faltan 24 h justas
    expect(esRecordatorio24h(inicio, new Date('2026-11-14T10:00:00Z'))).toBe(true);
    expect(esRecordatorio24h(inicio, new Date('2026-11-14T22:00:00Z'))).toBe(false); // ya empezó
  });
});
