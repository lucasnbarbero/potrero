// Datos de demo del sitio público (E20, E21): un torneo pasado ya terminado (Verano 2025) para que haya trayectoria
// entre torneos, un jugador destacado que jugó en dos equipos y un par de preferencias de nombre (apodo, completo).
// El torneo pasado se carga directo en la base (es historia: no dispara cobros, caja ni avisos).
import { randomUUID } from 'node:crypto';
import { esMenor, goleadores, marcador, todosContraTodos } from '@potrero/shared';
import type { Contexto } from '../comun/http.js';
import { CobrosService } from '../cobros/cobros.js';
import { DbService } from '../db/db.service.js';
import { EquiposService } from '../equipos/equipos.js';
import { TorneosService } from '../torneos/torneos.js';
import type { Resolver } from './plantilla.js';

const FENIX = ['Bruno', 'Iván', 'Ulises', 'Alan', 'Maxi', 'Thiago', 'Lautaro', 'Germán'];
const FENIX_AP = ['Quiroga', 'Paz', 'Aguirre', 'Correa', 'Godoy', 'Ponce', 'Navarro', 'Ojeda'];

/** Generador con semilla: la demo sale igual cada vez. */
function generador(semilla: number) {
  let s = semilla;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

export async function cargarSitioPublicoDemo(app: Resolver, c: Contexto, aperturaId: string) {
  const db = app.get(DbService);
  const torneos = app.get(TorneosService);
  const equipos = app.get(EquiposService);
  const cobros = app.get(CobrosService);
  const azar = generador(2025);
  const hoy = new Date();

  // ── El goleador del Apertura (mayor de edad) es el jugador destacado: se muestra con nombre completo ──
  const { destacado, segundo, equipoDestacado, rivales, canchaId } = await db.enOrg(
    c.organizacionId,
    async (tx) => {
      const partidos = await tx.partido.findMany({
        where: { torneoId: aperturaId, estado: 'FINALIZADO' },
        include: { eventos: true },
      });
      const tabla = goleadores(partidos.flatMap((p) => p.eventos));
      const jugadores = await tx.jugador.findMany({ where: { id: { in: tabla.map((g) => g.jugadorId) } } });
      const mayores = tabla.filter((g) => {
        const j = jugadores.find((x) => x.id === g.jugadorId);
        return j && !esMenor(j.fechaNacimiento, hoy);
      });
      const ins = await tx.inscripcion.findMany({
        where: { torneoId: aperturaId, estado: 'CONFIRMADA' },
        orderBy: { creadoEn: 'asc' },
      });
      const cancha = await tx.cancha.findFirst({ orderBy: { nombre: 'asc' } });
      return {
        destacado: mayores[0]!,
        segundo: mayores.find((g) => g.equipoId !== mayores[0]!.equipoId) ?? mayores[1]!,
        equipoDestacado: mayores[0]!.equipoId,
        rivales: ins.map((i) => i.equipoId).filter((id) => id !== mayores[0]!.equipoId),
        canchaId: cancha?.id ?? null,
      };
    },
  );
  await db.enOrg(c.organizacionId, async (tx) => {
    await tx.jugador.update({ where: { id: destacado.jugadorId }, data: { nombrePublico: 'COMPLETO' } });
    await tx.jugador.update({
      where: { id: segundo.jugadorId },
      data: { apodo: 'Pipa', nombrePublico: 'APODO' },
    });
  });

  // ── Verano 2025: el destacado jugaba en Fénix FC, contra tres equipos que siguen en la liga ──
  const fenix = await equipos.crear(c, { nombre: 'Fénix FC' });
  for (const [i, nombre] of FENIX.entries())
    await equipos.agregarJugador(c, fenix.id, { nombre, apellido: FENIX_AP[i]!, numero: i + 2 });
  await db.enOrg(c.organizacionId, (tx) =>
    tx.plantelJugador.create({
      data: {
        organizacionId: c.organizacionId,
        equipoId: fenix.id,
        jugadorId: destacado.jugadorId,
        numero: 9,
      },
    }),
  );
  const pasado = await torneos.crear(c, {
    nombre: 'Verano 2025',
    modalidad: 'F5',
    formato: 'LIGA',
    idaYVuelta: false,
    cupo: 4,
    inscripcion: 0,
    puntosVictoria: 3,
    puntosEmpate: 1,
    umbralAmarillas: 5,
  });
  const participantes = [fenix.id, ...rivales.slice(0, 3)];
  for (const id of participantes) await cobros.inscribir(c, pasado.id, id);

  await db.enOrg(c.organizacionId, async (tx) => {
    const planteles = new Map<string, string[]>();
    for (const id of participantes)
      planteles.set(
        id,
        (await tx.plantelJugador.findMany({ where: { equipoId: id }, orderBy: { numero: 'asc' } }))
          .map((p) => p.jugadorId)
          .filter((j) => j !== destacado.jugadorId || id === fenix.id),
      );
    const fechas = todosContraTodos(participantes, false);
    const primerSabado = Date.UTC(2025, 0, 11, 22); // sábado 11/1/2025, 19:00 en Buenos Aires
    for (const [f, fecha] of fechas.entries()) {
      for (const [k, cruce] of fecha.cruces.entries()) {
        const inicio = new Date(primerSabado + f * 7 * 86_400_000 + k * 3_600_000);
        const p = await tx.partido.create({
          data: {
            organizacionId: c.organizacionId,
            torneoId: pasado.id,
            fecha: f + 1,
            localId: cruce.localId,
            visitanteId: cruce.visitanteId,
            canchaId,
            inicio,
            estado: 'FINALIZADO',
            cerradoEn: new Date(inicio.getTime() + 3_600_000),
          },
        });
        const eventos: {
          tipo: 'GOL' | 'AMARILLA' | 'ROJA';
          equipoId: string;
          jugadorId: string;
          minuto: number;
        }[] = [];
        for (const eq of [cruce.localId, cruce.visitanteId]) {
          const plantel = planteles.get(eq)!;
          const elegir = () => plantel[Math.floor(azar() * plantel.length)]!;
          const goles = 1 + Math.floor(azar() * 3);
          for (let g = 0; g < goles; g++) {
            // En Fénix, el destacado hace la mitad de los goles: fue el goleador de ese torneo.
            const autor = eq === fenix.id && g % 2 === 0 ? destacado.jugadorId : elegir();
            eventos.push({
              tipo: 'GOL',
              equipoId: eq,
              jugadorId: autor,
              minuto: 2 + Math.floor(azar() * 46),
            });
          }
          if (azar() < 0.8)
            eventos.push({
              tipo: 'AMARILLA',
              equipoId: eq,
              jugadorId: elegir(),
              minuto: 5 + Math.floor(azar() * 40),
            });
        }
        if (f === 1 && k === 0)
          eventos.push({
            tipo: 'ROJA',
            equipoId: cruce.visitanteId,
            jugadorId: planteles.get(cruce.visitanteId)![1]!,
            minuto: 41,
          });
        const creados = eventos.map((e) => ({
          ...e,
          id: randomUUID(),
          organizacionId: c.organizacionId,
          partidoId: p.id,
          clientUuid: randomUUID(),
          creadoEn: new Date(inicio.getTime() + e.minuto * 60_000),
        }));
        await tx.eventoPartido.createMany({ data: creados });
        const m = marcador(creados, cruce.localId, cruce.visitanteId);
        await tx.partido.update({
          where: { id: p.id },
          data: { golesLocal: m.local, golesVisitante: m.visitante },
        });
      }
    }
    await tx.torneo.update({
      where: { id: pasado.id },
      data: { estado: 'FINALIZADO', creadoEn: new Date(Date.UTC(2024, 11, 1)) },
    });
  });

  return { destacadoId: destacado.jugadorId, equipoDestacado };
}
