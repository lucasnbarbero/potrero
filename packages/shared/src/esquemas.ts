// Validaciones de entrada compartidas entre la API y los formularios de la web.
import { z } from 'zod';
import { CUENTAS_DE_PLATA, RUBROS_EGRESO } from './dominio/caja.js';
import { CANALES } from './dominio/mensajeria.js';
import { FORMATOS, METODOS_PAGO, MODALIDADES, TIPOS_EVENTO } from './dominio/tipos.js';

const texto = (max = 120) => z.string().trim().min(1, 'Completá este campo.').max(max);
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usá el formato AAAA-MM-DD.');
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usá el formato HH:MM.');

export const registroSchema = z.object({
  nombre: texto(),
  email: z.email('Ingresá un email válido.').toLowerCase(),
  password: z.string().min(10, 'La contraseña necesita al menos 10 caracteres.').max(200),
  organizacion: texto(),
});
export type RegistroInput = z.infer<typeof registroSchema>;

export const loginSchema = z.object({
  email: z.email('Ingresá un email válido.').toLowerCase(),
  password: z.string().min(1, 'Ingresá tu contraseña.'),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** Cuota por fecha y seguro por jugador (E06-20, E06-21). Montos en pesos enteros; 0 = no se cobra. */
export const cobrosPorFechaSchema = z.object({
  cuotaPorFecha: z.number().int('Usá pesos enteros.').min(0, 'No puede ser negativo.').max(10_000_000),
  seguroPorJugadorPorFecha: z
    .number()
    .int('Usá pesos enteros.')
    .min(0, 'No puede ser negativo.')
    .max(1_000_000),
  cobrarFechaLibre: z.boolean(),
  cobrarPartidoSuspendido: z.boolean(),
  cobrarWO: z.boolean(),
  deudaBloqueaJugar: z.boolean(),
});
export type CobrosPorFechaInput = z.infer<typeof cobrosPorFechaSchema>;

export const crearTorneoSchema = z.object({
  nombre: texto(),
  modalidad: z.enum(MODALIDADES),
  formato: z.enum(FORMATOS),
  idaYVuelta: z.boolean().default(false),
  cupo: z.number().int().min(2).max(64),
  inscripcion: z.number().int().min(0),
  puntosVictoria: z.number().int().min(0).max(10).default(3),
  puntosEmpate: z.number().int().min(0).max(10).default(1),
  umbralAmarillas: z.number().int().min(1).max(20).default(5),
  /** Lo que no se indique toma el valor por defecto de datos.json. */
  cobrosPorFecha: cobrosPorFechaSchema.partial().optional(),
});
export type CrearTorneoInput = z.infer<typeof crearTorneoSchema>;

export const crearEquipoSchema = z.object({
  nombre: texto(80),
  capitanNombre: texto(80).optional(),
  capitanEmail: z
    .email()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  capitanTelefono: z.string().trim().max(30).optional(),
  capitanOptInWhatsapp: z.boolean().optional(),
});
export type CrearEquipoInput = z.infer<typeof crearEquipoSchema>;

export const crearJugadorSchema = z.object({
  nombre: texto(60),
  apellido: texto(60),
  numero: z.number().int().min(0).max(99).optional(),
});
export type CrearJugadorInput = z.infer<typeof crearJugadorSchema>;

export const crearCanchaSchema = z.object({
  sede: texto(80),
  nombre: texto(40),
  direccion: z.string().trim().max(160).optional(),
  costoPorPartido: z.number().int().min(0).max(10_000_000).optional(),
  superficie: z.string().trim().max(40).optional(),
});
export type CrearCanchaInput = z.infer<typeof crearCanchaSchema>;

export const generarFixtureSchema = z.object({
  primerDia: dia,
  diasEntreFechas: z.number().int().min(1).max(31).default(7),
  horarios: z.array(hora).min(1),
  canchaIds: z.array(z.string().min(1)).min(1),
  /** Grupos + playoffs: cantidad de grupos (los equipos se reparten en serpentina). */
  grupos: z.number().int().min(2).max(16).optional(),
});
export type GenerarFixtureInput = z.infer<typeof generarFixtureSchema>;

/** Mover un partido a mano o intercambiar su lugar con otro de la misma fecha (E09-07). */
export const moverPartidoSchema = z.object({
  cambio: z.discriminatedUnion('tipo', [
    z.object({ tipo: z.literal('MOVER'), dia, hora, canchaId: z.string().min(1, 'Elegí la cancha.') }),
    z.object({ tipo: z.literal('INTERCAMBIAR'), conPartidoId: z.string().min(1, 'Elegí el otro partido.') }),
  ]),
  /** El organizador vio los conflictos y quiere seguir (advierte, no bloquea). */
  aceptarConflictos: z.boolean().default(false),
  /** Avisar a los capitanes del cambio, con "Confirmo" / "No puedo" (como en Reprogramaciones). */
  avisar: z.boolean().default(false),
  canal: z.enum(CANALES).default('WHATSAPP'),
  motivo: z.string().trim().max(120).optional(),
});
export type MoverPartidoInput = z.infer<typeof moverPartidoSchema>;

export const generarLlavesSchema = z.object({
  primerDia: dia,
  diasEntreRondas: z.number().int().min(1).max(31).default(7),
  horarios: z.array(hora).min(1),
  canchaIds: z.array(z.string().min(1)).min(1),
  /** Liga + playoffs: cuántos clasifican (potencia de dos). Por defecto, según la cantidad de equipos. */
  clasificados: z.number().int().min(2).max(16).optional(),
  /** Grupos + playoffs: cuántos pasan por grupo. */
  porGrupo: z.number().int().min(1).max(2).default(2),
  /** Copa: cabezas de serie, en orden de semilla. */
  cabezasDeSerie: z.array(z.string().min(1)).default([]),
  /** Copa: semilla del sorteo. Con la misma, el sorteo sale igual (se puede auditar). */
  semilla: z.number().int().optional(),
});
export type GenerarLlavesInput = z.infer<typeof generarLlavesSchema>;

export const eventoSchema = z.object({
  tipo: z.enum(TIPOS_EVENTO).exclude(['ANULACION']),
  equipoId: z.string().min(1),
  jugadorId: z.string().min(1).optional(),
  minuto: z.number().int().min(0).max(150).optional(),
  /** Identificador generado en el dispositivo: hace idempotente la carga (base del acta offline). */
  clientUuid: z.uuid(),
  /** Dispositivo que carga el evento: solo el dueño del acta puede escribir en ella. */
  dispositivoId: z.string().min(8).max(64).optional(),
});
export type EventoInput = z.infer<typeof eventoSchema>;

export const dispositivoSchema = z.object({ dispositivoId: z.string().min(8).max(64).optional() });
export type DispositivoInput = z.infer<typeof dispositivoSchema>;

export const tomarActaSchema = z.object({
  dispositivoId: z.string().min(8).max(64),
  /** Quitarle el acta al dispositivo que la tiene (por ejemplo, si se le rompió el celular). */
  forzar: z.boolean().default(false),
});
export type TomarActaInput = z.infer<typeof tomarActaSchema>;

export const pagoManualSchema = z.object({
  metodo: z.enum(METODOS_PAGO).exclude(['MERCADO_PAGO']),
  monto: z.number().int().positive(),
  comprobante: z.string().trim().max(200).optional(),
});
export type PagoManualInput = z.infer<typeof pagoManualSchema>;

export const inscripcionPublicaSchema = z.object({
  equipo: texto(80),
  capitanNombre: texto(80),
  capitanEmail: z.email('Ingresá un email válido.'),
  capitanTelefono: z.string().trim().min(6, 'Ingresá un teléfono.').max(30),
});
export type InscripcionPublicaInput = z.infer<typeof inscripcionPublicaSchema>;

// ───────────── Comunicación (E16) ─────────────

export const segmentoSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('TODOS') }),
  z.object({ tipo: z.literal('TORNEO'), torneoId: z.string().min(1) }),
  z.object({ tipo: z.literal('MOROSOS'), torneoId: z.string().min(1).optional() }),
  z.object({ tipo: z.literal('EQUIPOS'), equipoIds: z.array(z.string().min(1)).min(1) }),
]);
export type Segmento = z.infer<typeof segmentoSchema>;

export const envioSchema = z.object({
  plantilla: z.string().min(1),
  canal: z.enum(CANALES),
  segmento: segmentoSchema,
  /** Texto del mensaje libre. Las demás plantillas ya traen el suyo. */
  texto: z.string().trim().max(1000).optional(),
  /** Si es posterior a ahora, el envío queda programado. */
  programadaPara: z.iso.datetime({ offset: true }).optional(),
});
export type EnvioInput = z.infer<typeof envioSchema>;

export const automatizacionSchema = z.object({ activa: z.boolean(), canal: z.enum(CANALES).optional() });
export type AutomatizacionInput = z.infer<typeof automatizacionSchema>;

export const confirmacionSchema = z.object({ respuesta: z.enum(['CONFIRMO', 'NO_PUEDO']) });
export type ConfirmacionInput = z.infer<typeof confirmacionSchema>;

export const contactoEquipoSchema = z.object({
  capitanNombre: texto(80).optional(),
  capitanEmail: z
    .email()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  capitanTelefono: z.string().trim().max(30).optional(),
  capitanOptInWhatsapp: z.boolean().optional(),
  capitanBajaMarketing: z.boolean().optional(),
});
export type ContactoEquipoInput = z.infer<typeof contactoEquipoSchema>;

export const vencimientoSchema = z.object({ vence: dia.nullable() });
export type VencimientoInput = z.infer<typeof vencimientoSchema>;

// ───────────── Contingencias (E17) ─────────────

export const alcanceSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('DIA'), dia, torneoId: z.string().min(1).optional() }),
  z.object({ tipo: z.literal('FECHA'), torneoId: z.string().min(1), fecha: z.number().int().min(1) }),
  z.object({ tipo: z.literal('PARTIDOS'), partidoIds: z.array(z.string().min(1)).min(1) }),
]);
export type Alcance = z.infer<typeof alcanceSchema>;

export const accionSchema = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('MOVER'),
    dias: z
      .number()
      .int()
      .min(-14)
      .max(60)
      .refine((n) => n !== 0, 'Indicá cuántos días se mueven.'),
  }),
  z.object({ tipo: z.literal('CAMBIAR_CANCHA'), canchaIds: z.array(z.string().min(1)).min(1) }),
]);

export const contingenciaSchema = z.object({
  motivo: texto(120),
  alcance: alcanceSchema,
  accion: accionSchema,
  canal: z.enum(CANALES).default('WHATSAPP'),
  /** Para aplicar con conflictos a la vista: el organizador los vio y quiere seguir (advierte, no bloquea). */
  aceptarConflictos: z.boolean().default(false),
});
export type ContingenciaInput = z.infer<typeof contingenciaSchema>;

// ───────────── Caja (E07) ─────────────

const pesos = z
  .number()
  .int('Ingresá un monto en pesos, sin centavos.')
  .positive('El monto tiene que ser mayor a cero.');

export const egresoSchema = z.object({
  rubro: z.enum(RUBROS_EGRESO),
  monto: pesos,
  descripcion: texto(160),
  /** De dónde salió la plata. */
  pagadoCon: z.enum(CUENTAS_DE_PLATA),
  fecha: dia.optional(),
  /** Número de recibo, factura o link al comprobante. */
  comprobante: z.string().trim().max(200).optional(),
  torneoId: z.string().min(1).optional(),
});
export type EgresoInput = z.infer<typeof egresoSchema>;

/** Los ingresos por inscripción y multas salen solos de los cobros: acá se cargan los demás (sponsors, otros). */
export const ingresoSchema = z.object({
  categoria: z.enum(['SPONSORS', 'OTROS']),
  monto: pesos,
  descripcion: texto(160),
  cobradoEn: z.enum(CUENTAS_DE_PLATA),
  fecha: dia.optional(),
  comprobante: z.string().trim().max(200).optional(),
  torneoId: z.string().min(1).optional(),
});
export type IngresoInput = z.infer<typeof ingresoSchema>;

export const retiroSchema = z.object({
  monto: pesos,
  /** A dónde va: alias o últimos dígitos de la cuenta, solo para el registro. */
  destino: z.string().trim().max(80).optional(),
});
export type RetiroInput = z.infer<typeof retiroSchema>;

export const anularMovimientoSchema = z.object({ motivo: z.string().trim().max(200).optional() });
export type AnularMovimientoInput = z.infer<typeof anularMovimientoSchema>;

export const automatizacionCajaSchema = z.object({ activa: z.boolean() });
export type AutomatizacionCajaInput = z.infer<typeof automatizacionCajaSchema>;

// ───────────── Árbitros y canchas (E08) ─────────────

const franjaDisponible = z
  .object({
    dia: z.number().int().min(0).max(6),
    desde: hora,
    hasta: hora,
  })
  .refine((f) => f.desde < f.hasta, 'La hora de inicio tiene que ser anterior a la de fin.');

export const arbitroSchema = z.object({
  nombre: texto(60),
  apellido: texto(60),
  telefono: z.string().trim().max(30).optional(),
  email: z
    .email()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  // Sin valor por defecto a propósito: la versión parcial (editar) no tiene que pisar la tarifa con cero.
  tarifa: z.number().int().min(0).max(10_000_000).optional(),
  valoracion: z.number().min(1).max(5).optional(),
  disponibilidad: z.array(franjaDisponible).max(21).optional(),
  activo: z.boolean().optional(),
});
export type ArbitroInput = z.infer<typeof arbitroSchema>;
export const actualizarArbitroSchema = arbitroSchema.partial();
export type ActualizarArbitroInput = z.infer<typeof actualizarArbitroSchema>;

export const designarArbitroSchema = z.object({ arbitroId: z.string().min(1).nullable() });
export type DesignarArbitroInput = z.infer<typeof designarArbitroSchema>;

export const designacionAutomaticaSchema = z
  .object({ dia: dia.optional(), torneoId: z.string().min(1).optional() })
  .refine((d) => d.dia || d.torneoId, 'Indicá el día o el torneo.');
export type DesignacionAutomaticaInput = z.infer<typeof designacionAutomaticaSchema>;

export const actualizarCanchaSchema = z.object({
  costoPorPartido: z.number().int().min(0).max(10_000_000).optional(),
  superficie: z.string().trim().max(40).optional(),
  bloqueada: z.boolean().optional(),
  motivoBloqueo: z.string().trim().max(120).optional(),
});
export type ActualizarCanchaInput = z.infer<typeof actualizarCanchaSchema>;

// ───────────── Tribunal de disciplina (E14) ─────────────

export const expedienteSchema = z.object({
  tipo: z.enum(['ROJA_DIRECTA', 'AGRESION', 'INCIDENTE_HINCHADA', 'JUGADOR_NO_HABILITADO', 'OTRO']),
  torneoId: z.string().min(1),
  partidoId: z.string().min(1).optional(),
  equipoId: z.string().min(1),
  jugadorId: z.string().min(1).optional(),
  motivo: z.string().trim().min(3).max(160),
  informeArbitro: z.string().trim().max(1000).optional(),
});
export type ExpedienteInput = z.infer<typeof expedienteSchema>;

export const informeExpedienteSchema = z.object({ informeArbitro: z.string().trim().min(3).max(1000) });
export type InformeExpedienteInput = z.infer<typeof informeExpedienteSchema>;

export const descargoExpedienteSchema = z.object({ descargo: z.string().trim().min(3).max(1000) });
export type DescargoExpedienteInput = z.infer<typeof descargoExpedienteSchema>;

export const resolverExpedienteSchema = z.object({
  partidos: z.number().int().min(0).max(20),
  multa: z.number().int().min(0).max(1_000_000).default(0),
  resolucion: z.string().trim().min(3).max(500),
});
export type ResolverExpedienteInput = z.infer<typeof resolverExpedienteSchema>;

/** Opción del reglamento del torneo: levantar una suspensión pagando una multa (E14-08). */
export const levantarSancionReglamentoSchema = z
  .object({
    levantarSancionPagando: z.boolean(),
    levantarSancionTipos: z.array(z.enum(['ACUMULACION', 'DOBLE_AMARILLA'])).max(2),
    levantarSancionMonto: z
      .number('Ingresá el monto por partido.')
      .int('El monto va en pesos enteros.')
      .min(0, 'El monto no puede ser negativo.')
      .max(1_000_000, 'El monto no puede pasar de 1.000.000.'),
  })
  .refine((d) => !d.levantarSancionPagando || d.levantarSancionMonto > 0, {
    message: 'Para encender la opción, fijá un monto por partido.',
    path: ['levantarSancionMonto'],
  })
  .refine((d) => !d.levantarSancionPagando || d.levantarSancionTipos.length > 0, {
    message: 'Elegí al menos un tipo de sanción.',
    path: ['levantarSancionTipos'],
  });
export type LevantarSancionReglamentoInput = z.infer<typeof levantarSancionReglamentoSchema>;

// ───────────── Documentación e identidad (E15) ─────────────

const tipoDocumento = z.enum(['DNI', 'APTO_FISICO', 'AUTORIZACION_MENOR']);

export const identidadSchema = z.object({
  dni: z
    .string()
    .trim()
    .regex(/^[\d.\s]{7,12}$/, 'El DNI son 7 u 8 números'),
  fechaNacimiento: z.iso.date().optional(),
  datosMedicos: z.string().trim().max(500).optional(),
});
export type IdentidadInput = z.infer<typeof identidadSchema>;

export const subirDocumentoSchema = z.object({
  tipo: tipoDocumento,
  nombreArchivo: z.string().trim().min(1).max(120),
  mime: z.enum(['image/jpeg', 'image/png', 'application/pdf']),
  /** Contenido en base64 (hasta el tamaño máximo de DATOS.documentacion). */
  contenido: z.string().min(1).max(3_500_000),
  vencimiento: z.iso.date().optional(),
});
export type SubirDocumentoInput = z.infer<typeof subirDocumentoSchema>;

export const revisarDocumentoSchema = z
  .object({
    decision: z.enum(['APROBAR', 'RECHAZAR']),
    motivo: z.string().trim().max(200).optional(),
    vencimiento: z.iso.date().optional(),
  })
  .refine((d) => d.decision === 'APROBAR' || (d.motivo && d.motivo.length >= 3), {
    path: ['motivo'],
    message: 'Para rechazar, escribí el motivo',
  });
export type RevisarDocumentoInput = z.infer<typeof revisarDocumentoSchema>;

export const requisitosTorneoSchema = z.object({ documentos: z.array(tipoDocumento).max(3) });
export type RequisitosTorneoInput = z.infer<typeof requisitosTorneoSchema>;

export const resolverDuplicadoSchema = z.object({
  accion: z.enum(['QUITAR_DEL_PLANTEL', 'DESCARTAR']),
  /** El jugador (de los dos) sobre el que se actúa: se lo saca del plantel o se descarta su DNI mal cargado. */
  jugadorId: z.string().min(1),
  nota: z.string().trim().max(200).optional(),
});
export type ResolverDuplicadoInput = z.infer<typeof resolverDuplicadoSchema>;

export const solicitarDocumentacionSchema = z.object({
  jugadorIds: z.array(z.string().min(1)).min(1).max(100),
});
export type SolicitarDocumentacionInput = z.infer<typeof solicitarDocumentacionSchema>;

export const consentimientoPublicoSchema = z.object({
  tutorNombre: z.string().trim().min(3).max(80),
  tutorDni: z
    .string()
    .trim()
    .regex(/^[\d.\s]{7,12}$/, 'El DNI son 7 u 8 números'),
  vinculo: z.enum(['PADRE', 'MADRE', 'TUTOR']),
  imagen: z.boolean().default(false),
});
export type ConsentimientoPublicoInput = z.infer<typeof consentimientoPublicoSchema>;
