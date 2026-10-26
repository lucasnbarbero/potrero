// Torneo por fases de la demo (ADR-026): 12 equipos con el formato "grupos + playoffs + copa estímulo", armado desde
// el simulador, con la fase de grupos jugada hasta la fecha 3. Sirve para mostrar las fases sin jugar todo.
// Domingos a la mañana: no choca con los sábados de la liga ni con la copa de los martes. Sin arancel ni cuota (no mueve
// plata de la caja ni las cifras de cobranza de la demo).
import { plantillaGruposPlayoffsCopa } from '@potrero/shared';
import type { Contexto } from '../comun/http.js';
import { CobrosService } from '../cobros/cobros.js';
import { DbService } from '../db/db.service.js';
import { EquiposService } from '../equipos/equipos.js';
import { FasesService } from '../torneos/fases.js';
import type { Resolver } from './plantilla.js';

/** Equipos nuevos que completan los 12 (los primeros vienen del Apertura). */
const EQUIPOS = [
  'Defensores de Pompeya',
  'Sportivo Barracas',
  'Atlético Lugano',
  'Unión Mataderos',
  'Racing de Soldati',
  'Fénix del Sur',
  'Tigres del Parque',
  'Los Amigos FC',
  'San Telmo Juniors',
  'Riachuelo FC',
  'Estrella de Boedo',
  'Juventud Floresta',
];
const JUGADORES = ['Pérez', 'Luna', 'Gómez', 'Sosa', 'Díaz', 'Romero', 'Acosta'];
const NOMBRES = ['Matías', 'Juan', 'Facundo', 'Tomás', 'Franco', 'Brian', 'Ramiro'];

/** Domingo de hace tres semanas (el día después del primer sábado de la plantilla): las fechas 1 a 3 ya se jugaron. */
function primerDomingo() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7) - 21 + 1);
  return d.toISOString().slice(0, 10);
}

export async function cargarTorneoPorFasesDemo(app: Resolver, c: Contexto) {
  const db = app.get(DbService);
  const fases = app.get(FasesService);
  const equipos = app.get(EquiposService);
  const cobros = app.get(CobrosService);

  const formato = plantillaGruposPlayoffsCopa(12, { grupos: 2, clasificanPorGrupo: 4 });
  const torneo = await fases.crear(c, {
    nombre: 'Torneo Primavera 2026',
    modalidad: 'F7',
    cupo: 12,
    inscripcion: 0,
    puntosVictoria: 3,
    puntosEmpate: 1,
    umbralAmarillas: 5,
    formato,
  });
  // Los equipos del Apertura (así la retención de las métricas lo cuenta como el torneo siguiente) y nuevos hasta 12.
  const delApertura = await db.enOrg(c.organizacionId, (tx) =>
    tx.inscripcion.findMany({
      where: { torneo: { slug: 'apertura-2026' }, estado: { not: 'BAJA' } },
      orderBy: { creadoEn: 'asc' },
    }),
  );
  for (const i of delApertura.slice(0, 12)) await cobros.inscribir(c, torneo.id, i.equipoId);
  for (const [i, nombre] of EQUIPOS.slice(0, Math.max(0, 12 - delApertura.length)).entries()) {
    const e = await equipos.crear(c, {
      nombre,
      capitanNombre: `${NOMBRES[i % 7]} ${JUGADORES[(i + 3) % 7]}`,
    });
    for (let n = 0; n < 7; n++)
      await equipos.agregarJugador(c, e.id, {
        nombre: NOMBRES[(n + i) % 7]!,
        apellido: JUGADORES[(n * 3 + i) % 7]!,
        numero: n + 1,
      });
    await cobros.inscribir(c, torneo.id, e.id);
  }
  const canchas = await db.enOrg(c.organizacionId, (tx) =>
    tx.cancha.findMany({ orderBy: { nombre: 'asc' } }),
  );
  const vista = await fases.vista(c, torneo.id);
  await fases.generar(c, torneo.id, vista.fases[0]!.id, {
    primerDia: primerDomingo(),
    diasEntreFechas: 7,
    horarios: ['10:00', '11:00', '12:00'],
    canchaIds: canchas.slice(0, 2).map((x) => x.id),
  });
  // Fechas 1 a 3 jugadas. Los resultados se cargan directo (sin acta), como la historia de las métricas: no disparan
  // avisos ni gastos de la caja. Ganan más seguido los de mejor semilla, para que las tablas tengan forma.
  await db.enOrg(c.organizacionId, async (tx) => {
    const orden = new Map(
      (await tx.inscripcion.findMany({ where: { torneoId: torneo.id }, orderBy: { creadoEn: 'asc' } })).map(
        (x, i) => [x.equipoId, i],
      ),
    );
    // Árbitros designados y confirmados en toda la fase (que no aparezcan como pendientes en el panel).
    const arbitros = await tx.arbitro.findMany({ orderBy: { apellido: 'asc' } });
    const todos = await tx.partido.findMany({
      where: { torneoId: torneo.id },
      orderBy: [{ fecha: 'asc' }, { inicio: 'asc' }],
    });
    if (arbitros.length)
      for (const [k, p] of todos.entries())
        await tx.partido.update({
          where: { id: p.id },
          data: { arbitroId: arbitros[k % arbitros.length]!.id, arbitroEstado: 'CONFIRMADO' },
        });
    const jugados = todos.filter((p) => p.fecha <= 3);
    for (const [k, p] of jugados.entries()) {
      const dif = (orden.get(p.visitanteId) ?? 0) - (orden.get(p.localId) ?? 0);
      const golesLocal = Math.max(0, 1 + Math.sign(dif) + (k % 3));
      const golesVisitante = Math.max(0, 1 - Math.sign(dif) + ((k + 1) % 2));
      await tx.partido.update({
        where: { id: p.id },
        data: {
          estado: 'FINALIZADO',
          golesLocal,
          golesVisitante,
          cerradoEn: new Date(p.inicio!.getTime() + 60 * 60 * 1000),
        },
      });
    }
  });
  return torneo;
}
