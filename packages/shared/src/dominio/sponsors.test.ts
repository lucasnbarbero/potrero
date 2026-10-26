import { describe, expect, it } from 'vitest';
import { placementSchema, sponsorSchema } from '../esquemas.js';
import {
  CATEGORIAS_PROHIBIDAS_CON_MENORES,
  ctr,
  estadoDelPlacement,
  inicialesSponsor,
  linkSeguro,
  motivoDeRechazoSponsor,
  periodosSeSuperponen,
  placementVigente,
  placementVisible,
  resumenDeMetricas,
} from './sponsors.js';

describe('sponsors: rubros aceptados', () => {
  it('en un torneo con menores no se aceptan apuestas, alcohol ni tabaco', () => {
    for (const categoria of CATEGORIAS_PROHIBIDAS_CON_MENORES)
      expect(motivoDeRechazoSponsor({ categoria, torneoConMenores: true, categoriasRechazadas: [] })).toMatch(
        /menores/,
      );
    expect(CATEGORIAS_PROHIBIDAS_CON_MENORES).toEqual(['APUESTAS', 'ALCOHOL', 'TABACO']);
  });

  it('en un torneo de mayores esos rubros se aceptan si la organización no los rechaza', () => {
    expect(
      motivoDeRechazoSponsor({ categoria: 'ALCOHOL', torneoConMenores: false, categoriasRechazadas: [] }),
    ).toBeNull();
  });

  it('un rubro común se acepta aunque haya menores', () => {
    expect(
      motivoDeRechazoSponsor({ categoria: 'BEBIDAS', torneoConMenores: true, categoriasRechazadas: [] }),
    ).toBeNull();
  });

  it('la organización puede rechazar cualquier rubro, aunque el torneo sea de mayores', () => {
    expect(
      motivoDeRechazoSponsor({
        categoria: 'APUESTAS',
        torneoConMenores: false,
        categoriasRechazadas: ['APUESTAS'],
      }),
    ).toMatch(/Tu organización no acepta/);
    expect(
      motivoDeRechazoSponsor({
        categoria: 'DELIVERY',
        torneoConMenores: false,
        categoriasRechazadas: ['DELIVERY'],
      }),
    ).not.toBeNull();
  });
});

describe('sponsors: período y visibilidad', () => {
  const base = {
    desde: '2026-10-01',
    hasta: '2026-10-31',
    activo: true,
    categoria: 'BEBIDAS' as const,
    torneoConMenores: false,
    categoriasRechazadas: [],
  };

  it('el período incluye el primer y el último día', () => {
    expect(placementVigente(base, '2026-10-01')).toBe(true);
    expect(placementVigente(base, '2026-10-31')).toBe(true);
    expect(placementVigente(base, '2026-09-30')).toBe(false);
    expect(placementVigente(base, '2026-11-01')).toBe(false);
  });

  it('fuera de período no se muestra', () => {
    expect(placementVisible({ ...base, hoy: '2026-10-15' })).toBe(true);
    expect(placementVisible({ ...base, hoy: '2026-11-01' })).toBe(false);
    expect(placementVisible({ ...base, hoy: '2026-09-01' })).toBe(false);
  });

  it('pausado, o con un rubro que dejó de ser aceptable, tampoco se muestra', () => {
    expect(placementVisible({ ...base, activo: false, hoy: '2026-10-15' })).toBe(false);
    expect(
      placementVisible({ ...base, categoria: 'ALCOHOL', torneoConMenores: true, hoy: '2026-10-15' }),
    ).toBe(false);
    expect(placementVisible({ ...base, categoriasRechazadas: ['BEBIDAS'], hoy: '2026-10-15' })).toBe(false);
  });

  it('estado para el panel', () => {
    const e = (hoy: string, extra: Partial<{ activo: boolean; bloqueado: boolean }> = {}) =>
      estadoDelPlacement({ ...base, bloqueado: false, ...extra, hoy }).estado;
    expect(e('2026-09-20')).toBe('PROGRAMADO');
    expect(e('2026-10-10')).toBe('ACTIVO');
    expect(e('2026-10-24')).toBe('POR_VENCER');
    expect(e('2026-10-31')).toBe('POR_VENCER');
    expect(e('2026-11-01')).toBe('VENCIDO');
    expect(e('2026-10-10', { activo: false })).toBe('PAUSADO');
    expect(e('2026-10-10', { bloqueado: true })).toBe('BLOQUEADO');
    expect(estadoDelPlacement({ ...base, bloqueado: false, hoy: '2026-10-26' }).diasRestantes).toBe(5);
  });
});

describe('sponsors: medición agregada', () => {
  it('CTR con un decimal y cero sin impresiones', () => {
    expect(ctr(1000, 25)).toBe(2.5);
    expect(ctr(3, 1)).toBe(33.3);
    expect(ctr(0, 0)).toBe(0);
  });

  it('el resumen suma por día, completa los días vacíos y respeta el período', () => {
    const r = resumenDeMetricas(
      [
        { dia: '2026-10-01', impresiones: 100, clics: 2 },
        { dia: '2026-10-01', impresiones: 50, clics: 1 },
        { dia: '2026-10-03', impresiones: 200, clics: 7 },
        { dia: '2026-10-09', impresiones: 999, clics: 99 },
      ],
      '2026-10-01',
      '2026-10-03',
    );
    expect(r.serie).toEqual([
      { dia: '2026-10-01', impresiones: 150, clics: 3 },
      { dia: '2026-10-02', impresiones: 0, clics: 0 },
      { dia: '2026-10-03', impresiones: 200, clics: 7 },
    ]);
    expect(r.impresiones).toBe(350);
    expect(r.clics).toBe(10);
    expect(r.ctr).toBe(2.9);
  });

  it('el redirect solo lleva a links http(s)', () => {
    expect(linkSeguro('https://donpepe.com.ar')).toBe('https://donpepe.com.ar');
    expect(linkSeguro('javascript:alert(1)')).toBeNull();
    expect(linkSeguro('no es un link')).toBeNull();
    expect(linkSeguro(null)).toBeNull();
  });

  it('iniciales para el logo', () => {
    expect(inicialesSponsor('Kiosco Don Pepe')).toBe('DP');
    expect(inicialesSponsor('Gimnasio Movimiento')).toBe('GM');
    expect(inicialesSponsor('Roma')).toBe('R');
  });
});

describe('sponsors: validación de entrada', () => {
  it('el período no puede terminar antes de empezar', () => {
    const r = placementSchema.safeParse({
      torneoId: 't',
      espacio: 'CABECERA',
      desde: '2026-10-10',
      hasta: '2026-10-01',
      monto: 1000,
    });
    expect(r.success).toBe(false);
  });

  it('el link del sponsor tiene que ser http(s)', () => {
    expect(sponsorSchema.safeParse({ nombre: 'X', categoria: 'OTROS', link: 'javascript:x' }).success).toBe(
      false,
    );
    expect(sponsorSchema.safeParse({ nombre: 'X', categoria: 'OTROS', link: 'https://x.com' }).success).toBe(
      true,
    );
  });
});

describe('sponsors: un espacio a la vez', () => {
  it('dos períodos se pisan si comparten un día', () => {
    const oct = { desde: '2026-10-01', hasta: '2026-10-31' };
    expect(periodosSeSuperponen(oct, { desde: '2026-10-31', hasta: '2026-11-30' })).toBe(true);
    expect(periodosSeSuperponen(oct, { desde: '2026-11-01', hasta: '2026-11-30' })).toBe(false);
    expect(periodosSeSuperponen(oct, { desde: '2026-09-01', hasta: '2026-12-31' })).toBe(true);
  });
});
