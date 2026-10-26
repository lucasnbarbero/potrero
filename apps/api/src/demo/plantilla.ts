// Plantilla de datos sintéticos de la demo. La usan la semilla de `pnpm demo` y las sandboxes por visitante (ADR-019).
// Usa los mismos servicios que la API, así las reglas (cobros, fixture, acta, sanciones) son las reales.
import { randomUUID } from 'node:crypto';
import type { Type } from '@nestjs/common';
import type { Contexto } from '../comun/http.js';
import { sumarDias } from '@potrero/shared';
import { ArbitrosService } from '../arbitros/arbitros.js';
import { CajaService } from '../caja/caja.js';
import { TribunalService } from '../tribunal/tribunal.js';
import { CobrosService } from '../cobros/cobros.js';
import { hoyEnArgentina } from '../comun/formato.js';
import { slugificar } from '../comun/slug.js';
import { MensajeriaService } from '../mensajeria/mensajeria.js';
import { DbService } from '../db/db.service.js';
import { cargarDocumentacion } from './documentacion-demo.js';
import { cargarSponsorsDemo } from './sponsors-demo.js';
import { EquiposService } from '../equipos/equipos.js';
import { PartidosService } from '../partidos/partidos.js';
import { TorneosService } from '../torneos/torneos.js';

const SEMILLA_DEMO = 20261022;

const NOMBRES = [
  'Matías',
  'Juan',
  'Lucas',
  'Nicolás',
  'Facundo',
  'Agustín',
  'Tomás',
  'Franco',
  'Gonzalo',
  'Martín',
  'Santiago',
  'Ezequiel',
  'Diego',
  'Pablo',
  'Leandro',
  'Brian',
  'Kevin',
  'Ramiro',
  'Emiliano',
  'Joaquín',
];
const APELLIDOS = [
  'Pérez',
  'Luna',
  'Gómez',
  'Fernández',
  'Rodríguez',
  'Sosa',
  'Díaz',
  'Romero',
  'Benítez',
  'Acosta',
  'Medina',
  'Herrera',
  'Suárez',
  'Castro',
  'Ríos',
  'Molina',
  'Ortiz',
  'Silva',
  'Ledesma',
  'Vera',
];
const EQUIPOS = [
  'Deportivo Sur',
  'Real Barrio',
  'Los Pibes',
  'La Banda',
  'Atlético Norte',
  'Villa Unión',
  'Estrella Roja',
  'Juventud Unida',
];

/** Generador pseudoaleatorio con semilla: la plantilla sale igual cada vez, y cada llamada tiene el suyo. */
function generador(semilla: number) {
  let s = semilla;
  const azar = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const elegir = <T>(xs: readonly T[]) => xs[Math.floor(azar() * xs.length)]!;
  return { azar, elegir };
}

/** Sábado de hace tres semanas: así las fechas 1 a 3 ya se jugaron y la 4 es la próxima, sin importar cuándo se cargue. */
function primerSabado() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7) - 21);
  return d.toISOString().slice(0, 10);
}

/**
 * Carga en la organización de `c` el contenido de la demo: canchas, 9 equipos con plantel, el torneo Apertura 2026
 * (8 inscriptos pagos, 1 moroso, 3 fechas jugadas con una roja) y el torneo Clausura 2026 con inscripción abierta.
 * Devuelve el torneo en curso para quien quiera mostrar el link del sitio público.
 */
/** Lo mínimo que necesita la plantilla para obtener los servicios: lo cumplen el contexto de Nest y un ModuleRef. */
export type Resolver = { get<T>(token: Type<T>): T };

export async function cargarPlantilla(app: Resolver, c: Contexto, semilla = SEMILLA_DEMO) {
  const db = app.get(DbService);
  const torneos = app.get(TorneosService);
  const equipos = app.get(EquiposService);
  const cobros = app.get(CobrosService);
  const partidos = app.get(PartidosService);
  const mensajeria = app.get(MensajeriaService);
  const caja = app.get(CajaService);
  const arbitrosSvc = app.get(ArbitrosService);
  const tribunal = app.get(TribunalService);
  const { azar, elegir } = generador(semilla);

  // Plan Pro de liga fundadora (la demo muestra todos los módulos, sponsors incluidos) y cuenta de la pasarela simulada, para que los cobros online funcionen.
  await db.app.organizacion.update({
    where: { id: c.organizacionId },
    data: { plan: 'PRO', fundadora: true, mpCuentaId: 'SIM-CUENTA-DEMO' },
  });

  const canchas = [
    await equipos.crearCancha(c, {
      sede: 'Complejo El Potrero',
      nombre: 'Cancha 1',
      direccion: 'Av. San Martín 1450',
      costoPorPartido: 8000,
      superficie: 'sintético',
    }),
    await equipos.crearCancha(c, {
      sede: 'Complejo El Potrero',
      nombre: 'Cancha 2',
      costoPorPartido: 6500,
      superficie: 'césped',
    }),
  ];

  // Árbitros (uno con disponibilidad acotada) y los cargos automáticos de la caja, encendidos desde el principio.
  const arbitros = [
    { nombre: 'Marcos', apellido: 'Costa', tarifa: 12000, valoracion: 4.7 },
    {
      nombre: 'Julián',
      apellido: 'Vera',
      tarifa: 10000,
      valoracion: 4.5,
      disponibilidad: [
        { dia: 6, desde: '14:00', hasta: '22:00' },
        { dia: 0, desde: '10:00', hasta: '14:00' },
      ],
    },
    { nombre: 'Lucas', apellido: 'Ríos', tarifa: 9000, valoracion: 4.4 },
    { nombre: 'Pablo', apellido: 'Núñez', tarifa: 11000, valoracion: 4.6 },
    { nombre: 'Sofía', apellido: 'Giménez', tarifa: 10000, valoracion: 4.8 },
  ];
  for (const a of arbitros) await arbitrosSvc.crear(c, a);
  for (const clave of ['CAJA_PAGO_ARBITROS', 'CAJA_ALQUILER_CANCHAS'])
    await caja.configurarAutomatizacion(c, clave, { activa: true });

  let ordenEquipo = 0;
  const crearEquipo = async (nombre: string) => {
    const i = ordenEquipo++;
    // Contactos variados: la mayoría acepta WhatsApp y el resto recibe por email (así se ve la regla de canales).
    const e = await equipos.crear(c, {
      nombre,
      capitanNombre: `${elegir(NOMBRES)} ${elegir(APELLIDOS)}`,
      capitanTelefono: `3564 55${5000 + i}`,
      capitanEmail: `${slugificar(nombre)}@ejemplo.com.ar`,
      capitanOptInWhatsapp: i % 3 !== 2,
    });
    for (let n = 1; n <= 9; n++)
      await equipos.agregarJugador(c, e.id, {
        nombre: elegir(NOMBRES),
        apellido: elegir(APELLIDOS),
        numero: n,
      });
    return e;
  };

  // ── Torneo en curso: Apertura 2026, 8 equipos, 3 fechas jugadas ──
  const apertura = await torneos.crear(c, {
    nombre: 'Apertura 2026',
    modalidad: 'F5',
    formato: 'LIGA',
    idaYVuelta: false,
    cupo: 10,
    inscripcion: 60000,
    puntosVictoria: 3,
    puntosEmpate: 1,
    umbralAmarillas: 5,
  });
  const lista = [];
  for (const nombre of EQUIPOS) lista.push(await crearEquipo(nombre));
  for (const [i, e] of lista.entries()) {
    const { cargo } = await cobros.inscribir(c, apertura.id, e.id);
    if (!cargo) continue;
    if (i === 6) {
      await cobros.pagoManual(c, cargo.id, {
        metodo: 'EFECTIVO',
        monto: cargo.monto,
        comprobante: 'Recibo 0012',
      });
    } else {
      // Pago online: link de pago y notificación aprobada de la pasarela (simulada).
      const pref = await cobros.linkDePago(c.organizacionId, cargo.id);
      await cobros.procesarNotificacion({
        preferenciaId: pref.preferenciaId,
        // El id del pago es único en toda la base: lleva la organización para que dos sandboxes no choquen.
        pasarelaPagoId: `SIM-PAGO-SEED-${c.organizacionId}-${i}`,
        estado: 'aprobado',
      });
    }
  }
  // Un noveno equipo que se anotó y todavía debe la inscripción.
  const moroso = await crearEquipo('Sportivo Barrio');
  await cobros.inscribir(c, apertura.id, moroso.id);
  await db.enOrg(c.organizacionId, (tx) =>
    tx.inscripcion.updateMany({ where: { equipoId: moroso.id }, data: { estado: 'PENDIENTE' } }),
  );

  await torneos.generarFixture(c, apertura.id, {
    primerDia: primerSabado(),
    diasEntreFechas: 7,
    horarios: ['19:00', '20:00'],
    canchaIds: canchas.map((x) => x.id),
  });

  await arbitrosSvc.automatico(c, { torneoId: apertura.id });
  const fixture = await torneos.partidos(c, apertura.id);
  const proxima = fixture.filter((x) => x.fecha === 4);
  await arbitrosSvc.designar(c, proxima[0]!.id, { arbitroId: null });
  for (const p of proxima.slice(1, 3)) await arbitrosSvc.confirmar(c, p.id);
  for (const p of fixture.filter((x) => x.fecha <= 3)) {
    const acta = await partidos.acta(c, p.id);
    await partidos.iniciar(c, p.id);
    const evento = (tipo: 'GOL' | 'AMARILLA' | 'ROJA', eq: typeof acta.local, minuto: number) =>
      partidos.cargarEvento(c, p.id, {
        tipo,
        equipoId: eq.id,
        jugadorId: elegir(eq.jugadores.filter((j) => j.habilitado)).id,
        minuto,
        clientUuid: randomUUID(),
      });
    for (const eq of [acta.local, acta.visitante]) {
      const goles = Math.floor(azar() * 4);
      for (let g = 0; g < goles; g++) await evento('GOL', eq, 3 + Math.floor(azar() * 45));
      if (azar() < 0.7) await evento('AMARILLA', eq, 5 + Math.floor(azar() * 40));
    }
    // En la fecha 3 hay una roja directa: el jugador queda suspendido para la fecha 4.
    if (p.fecha === 3 && p === fixture.find((x) => x.fecha === 3)) await evento('ROJA', acta.local, 38);
    await partidos.cerrar(c, p.id, { firmaLocal: true, firmaVisitante: true });
  }

  // ── Torneo con inscripción abierta: Clausura 2026 (para probar el link público) ──
  const clausura = await torneos.crear(c, {
    nombre: 'Clausura 2026',
    modalidad: 'F7',
    formato: 'LIGA',
    idaYVuelta: false,
    cupo: 12,
    inscripcion: 75000,
    puntosVictoria: 3,
    puntosEmpate: 1,
    umbralAmarillas: 5,
  });
  const hoy = hoyEnArgentina();
  await torneos.fijarVencimiento(c, clausura.id, { vence: sumarDias(hoy, 5) });
  for (const e of lista.slice(0, 3)) {
    const { cargo } = await cobros.inscribir(c, clausura.id, e.id);
    if (cargo)
      await cobros.pagoManual(c, cargo.id, {
        metodo: 'TRANSFERENCIA',
        monto: cargo.monto,
        comprobante: 'Transferencia',
      });
  }

  // ── Copa Relámpago: eliminación directa con cabezas de serie. Cuartos y semifinales jugadas, la final lista ──
  const copa = await torneos.crear(c, {
    nombre: 'Copa Relámpago',
    modalidad: 'F5',
    formato: 'COPA',
    idaYVuelta: false,
    cupo: 8,
    inscripcion: 30000,
    puntosVictoria: 3,
    puntosEmpate: 1,
    umbralAmarillas: 5,
  });
  for (const e of lista) {
    const { cargo } = await cobros.inscribir(c, copa.id, e.id);
    if (cargo)
      await cobros.pagoManual(c, cargo.id, {
        metodo: 'EFECTIVO',
        monto: cargo.monto,
        comprobante: 'Efectivo',
      });
  }
  await torneos.generarLlaves(c, copa.id, {
    // Martes: cuartos hace casi dos semanas, semifinales la semana pasada y final la que viene. Así la copa
    // no choca con los sábados de la liga ni con el domingo al que se mueven si llueve.
    primerDia: sumarDias(primerSabado(), 10),
    diasEntreRondas: 7,
    horarios: ['19:00', '20:00'],
    canchaIds: canchas.map((x) => x.id),
    cabezasDeSerie: [lista[0]!.id, lista[1]!.id],
    semilla: 2026,
    porGrupo: 2,
  });
  // Resultados por ronda, en el orden de los cruces. Un cuarto se define por penales.
  const resultados: { gl: number; gv: number; penales?: [number, number] }[][] = [
    [
      { gl: 2, gv: 1 },
      { gl: 1, gv: 1, penales: [4, 3] },
      { gl: 3, gv: 0 },
      { gl: 0, gv: 1 },
    ],
    [
      { gl: 2, gv: 0 },
      { gl: 1, gv: 2 },
    ],
  ];
  for (const [r, ronda] of resultados.entries()) {
    await arbitrosSvc.automatico(c, { torneoId: copa.id });
    const delRonda = (await torneos.partidos(c, copa.id)).filter((p) => p.clave?.startsWith(`${r + 1}-`));
    for (const [i, p] of delRonda.entries()) {
      const res = ronda[i]!;
      const acta = await partidos.acta(c, p.id);
      await partidos.iniciar(c, p.id);
      for (const [eq, goles] of [
        [acta.local, res.gl],
        [acta.visitante, res.gv],
      ] as const)
        for (let g = 0; g < goles; g++)
          await partidos.cargarEvento(c, p.id, {
            tipo: 'GOL',
            equipoId: eq.id,
            jugadorId: elegir(eq.jugadores.filter((j) => j.habilitado)).id,
            minuto: 5 + g * 11,
            clientUuid: randomUUID(),
          });
      await partidos.cerrar(c, p.id, {
        firmaLocal: true,
        firmaVisitante: true,
        ...(res.penales ? { penalesLocal: res.penales[0], penalesVisitante: res.penales[1] } : {}),
      });
    }
  }

  // La final ya tiene árbitro (por confirmar).
  await arbitrosSvc.automatico(c, { torneoId: copa.id });

  // ── Caja: gastos que no salen del acta, un sponsor y un retiro a la cuenta bancaria ──
  await caja.egreso(c, {
    rubro: 'PREMIOS',
    monto: 40000,
    descripcion: 'Trofeos Copa Relámpago',
    pagadoCon: 'EFECTIVO',
    comprobante: 'Recibo 0007',
    torneoId: copa.id,
  });
  await caja.egreso(c, {
    rubro: 'OTROS',
    monto: 12000,
    descripcion: 'Agua y botiquín',
    pagadoCon: 'EFECTIVO',
  });
  await caja.ingreso(c, {
    categoria: 'SPONSORS',
    monto: 50000,
    descripcion: 'Kiosco Don Pepe · cuota mensual',
    cobradoEn: 'BANCO',
  });
  await caja.retiro(c, { monto: 200000, destino: 'CBU ...4321' });

  // ── Tribunal: la roja de la fecha 3 ya abrió su expediente; sumamos uno resuelto (con multa) y un incidente con descargo ──
  const partidoF2 = fixture.find((x) => x.fecha === 2)!;
  const actaF2 = await partidos.acta(c, partidoF2.id);
  const agresivo = actaF2.visitante.jugadores[0]!;
  const resuelto = await tribunal.abrir(c, {
    tipo: 'AGRESION',
    torneoId: apertura.id,
    partidoId: partidoF2.id,
    equipoId: actaF2.visitante.id,
    jugadorId: agresivo.id,
    motivo: 'Agresión verbal al árbitro',
    informeArbitro:
      'Insultos reiterados al terminar el primer tiempo; se le pidió que se retire y no lo hizo.',
  });
  await tribunal.descargo(c, resuelto.id, {
    descargo: 'Reconoce que se acaloró; pide disculpas y que se tenga en cuenta que es la primera vez.',
  });
  const resolucion = await tribunal.resolver(c, resuelto.id, {
    partidos: 1,
    multa: 5000,
    resolucion: 'Se reduce a 1 fecha por ser la primera falta y se suma una multa.',
  });
  // La multa ya está paga en efectivo: entra a la caja como ingreso de multas y no suma deuda al panel.
  await cobros.pagoManual(c, resolucion.cargoId!, { metodo: 'EFECTIVO', monto: 5000 });
  await tribunal.abrir(c, {
    tipo: 'INCIDENTE_HINCHADA',
    torneoId: apertura.id,
    partidoId: partidoF2.id,
    equipoId: actaF2.local.id,
    motivo: 'Incidentes en la tribuna',
    informeArbitro: 'La hinchada local arrojó objetos a la cancha durante el segundo tiempo.',
  });

  // ── Comunicación: avisos automáticos encendidos y algunos envíos ya hechos, con lecturas ──
  // El que debe la inscripción de Apertura vence en 3 días: el cobro escalonado lo avisa en el próximo ciclo.
  await torneos.fijarVencimiento(c, apertura.id, { vence: sumarDias(hoy, 3) });
  for (const clave of ['RECORDATORIO_PARTIDO', 'COBRO_ESCALONADO', 'AVISO_SUSPENSION'] as const)
    await mensajeria.configurarAutomatizacion(c, clave, { activa: true, canal: 'WHATSAPP' });
  const envios = [
    await mensajeria.enviar(c, {
      plantilla: 'FIXTURE_PUBLICADO',
      canal: 'WHATSAPP',
      segmento: { tipo: 'TORNEO', torneoId: apertura.id },
    }),
    await mensajeria.enviar(c, {
      plantilla: 'RECORDATORIO_PAGO',
      canal: 'EMAIL',
      segmento: { tipo: 'MOROSOS', torneoId: apertura.id },
    }),
  ];
  // Casi todos leyeron el primero; el segundo quedó sin leer.
  for (const [i, e] of envios.entries()) {
    if (e.programada) continue;
    await db.enOrg(c.organizacionId, async (tx) => {
      const ms = await tx.mensaje.findMany({
        where: { difusionId: e.difusionId },
        orderBy: { creadoEn: 'asc' },
      });
      const leer = i === 0 ? ms.slice(0, Math.max(0, ms.length - 1)) : [];
      await tx.mensaje.updateMany({
        where: { id: { in: leer.map((m) => m.id) } },
        data: { estado: 'LEIDO', leidoEn: new Date() },
      });
    });
  }

  // ── Documentación: el plantel de Apertura con su DNI y apto, y casos para mostrar la revisión (E15) ──
  await cargarDocumentacion(db, c, apertura.id);

  // ── Sponsors (E23): auspiciantes con espacios vendidos, cobros y 30 días de impresiones y clics ──
  await cargarSponsorsDemo(app, c, { apertura: apertura.id, clausura: clausura.id });

  return { apertura, clausura, copa };
}
