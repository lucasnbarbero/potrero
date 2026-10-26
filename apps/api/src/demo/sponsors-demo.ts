// Sponsors de la demo (E23): cuatro auspiciantes con espacios vendidos, cobros en la caja e impresiones y
// clics, para que el panel y el reporte se vean con datos. Lo llama la plantilla (semilla local y sandboxes).
import { ESPACIOS_SPONSOR, type EspacioSponsor, sumarDias } from '@potrero/shared';
import type { Contexto } from '../comun/http.js';
import { hoyEnArgentina } from '../comun/formato.js';
import { DbService } from '../db/db.service.js';
import { SponsorsService } from '../sponsors/sponsors.js';
import type { Resolver } from './plantilla.js';

/** Visitas diarias de base por espacio: la cabecera se ve más que la sección de goleadores. */
const BASE: Record<EspacioSponsor, number> = {
  CABECERA: 420,
  ENTRE_SECCIONES: 260,
  GOLEADORES: 300,
  TARJETA_RESULTADO: 180,
};
/** Clics cada 1000 impresiones, aproximado. */
const CLICS_POR_MIL: Record<EspacioSponsor, number> = {
  CABECERA: 14,
  ENTRE_SECCIONES: 11,
  GOLEADORES: 27,
  TARJETA_RESULTADO: 19,
};

export async function cargarSponsorsDemo(
  app: Resolver,
  c: Contexto,
  torneos: { apertura: string; clausura: string },
  semilla = 2310,
) {
  const db = app.get(DbService);
  const sponsors = app.get(SponsorsService);
  const hoy = hoyEnArgentina();
  let s = semilla;
  const azar = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };

  await sponsors.preferencias(c, { categoriasRechazadas: ['APUESTAS'] });

  const datos = [
    {
      sponsor: {
        nombre: 'Kiosco Don Pepe',
        categoria: 'BEBIDAS' as const,
        descripcion: 'Sponsor oficial · hidratación',
        link: 'https://example.com/kiosco-don-pepe',
      },
      espacio: 'CABECERA' as const,
      torneoId: torneos.apertura,
      desde: sumarDias(hoy, -40),
      hasta: sumarDias(hoy, 50),
      monto: 150_000,
      cobro: { monto: 50_000, cobradoEn: 'MP' as const, dias: -12, comprobante: 'Transferencia 1187' },
    },
    {
      sponsor: {
        nombre: 'Gimnasio Movimiento',
        categoria: 'FITNESS' as const,
        descripcion: 'Pelota oficial · goleadores',
        link: 'https://example.com/gimnasio-movimiento',
      },
      espacio: 'GOLEADORES' as const,
      torneoId: torneos.apertura,
      desde: sumarDias(hoy, -33),
      hasta: sumarDias(hoy, 58),
      monto: 180_000,
      cobro: { monto: 60_000, cobradoEn: 'BANCO' as const, dias: -30, comprobante: 'Factura C 0003-0142' },
    },
    {
      sponsor: {
        nombre: 'Pizzería Roma',
        categoria: 'ALIMENTOS' as const,
        descripcion: 'Tercer tiempo · resultados',
        link: 'https://example.com/pizzeria-roma',
      },
      espacio: 'TARJETA_RESULTADO' as const,
      torneoId: torneos.apertura,
      desde: sumarDias(hoy, -25),
      hasta: sumarDias(hoy, 5),
      monto: 40_000,
      cobro: { monto: 40_000, cobradoEn: 'EFECTIVO' as const, dias: -20, comprobante: 'Recibo 0019' },
    },
    {
      sponsor: {
        nombre: 'Seguros La Cancha',
        categoria: 'SEGUROS' as const,
        descripcion: 'Presenta el Clausura',
        link: 'https://example.com/seguros-la-cancha',
      },
      espacio: 'CABECERA' as const,
      torneoId: torneos.clausura,
      desde: sumarDias(hoy, -6),
      hasta: sumarDias(hoy, 84),
      monto: 90_000,
      cobro: null,
    },
  ];

  const placements: { id: string; espacio: EspacioSponsor; desde: string }[] = [];
  for (const d of datos) {
    const sp = await sponsors.crear(c, d.sponsor);
    const p = await sponsors.crearPlacement(c, sp.id, {
      torneoId: d.torneoId,
      espacio: d.espacio,
      desde: d.desde,
      hasta: d.hasta,
      monto: d.monto,
    });
    placements.push({ id: p.id, espacio: d.espacio, desde: d.desde });
    if (d.cobro)
      await sponsors.cobrar(c, sp.id, {
        monto: d.cobro.monto,
        cobradoEn: d.cobro.cobradoEn,
        fecha: sumarDias(hoy, d.cobro.dias),
        comprobante: d.cobro.comprobante,
        torneoId: d.torneoId,
      });
  }

  // Impresiones y clics desde que empezó cada espacio, hasta 45 días (más los fines de semana, que es cuando se juega y se mira la tabla).
  const filas: {
    organizacionId: string;
    placementId: string;
    dia: Date;
    impresiones: number;
    clics: number;
  }[] = [];
  for (const p of placements) {
    for (let i = 44; i >= 0; i--) {
      const dia = sumarDias(hoy, -i);
      if (dia < p.desde) continue;
      const finde = [0, 6].includes(new Date(`${dia}T12:00:00Z`).getUTCDay());
      const parcial = i === 0 ? 0.5 : 1;
      const impresiones = Math.round(BASE[p.espacio] * (finde ? 1.9 : 1) * (0.75 + azar() * 0.5) * parcial);
      const clics = Math.round((impresiones * CLICS_POR_MIL[p.espacio] * (0.6 + azar() * 0.8)) / 1000);
      filas.push({
        organizacionId: c.organizacionId,
        placementId: p.id,
        dia: new Date(`${dia}T00:00:00Z`),
        impresiones,
        clics,
      });
    }
  }
  await db.enOrg(c.organizacionId, (tx) => tx.metricaPlacement.createMany({ data: filas }));
  return { espacios: ESPACIOS_SPONSOR.length, placements: placements.length };
}
