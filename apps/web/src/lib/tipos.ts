// Formas de las respuestas de la API que usa la web.
// Pendiente (backlog E02-06): reemplazarlas por el cliente tipado generado desde OpenAPI.
import type { FilaTabla, Formato, Modalidad, TipoEvento } from '@potrero/shared';

export interface Torneo {
  id: string;
  nombre: string;
  slug: string;
  modalidad: Modalidad;
  formato: Formato;
  idaYVuelta: boolean;
  estado: string;
  cupo: number;
  inscripcion: number;
  _count?: { inscripciones: number; partidos: number };
}

export interface DetalleTorneo extends Torneo {
  organizacionSlug: string;
  partidosEstimados: number;
  /** Fecha límite de pago de la inscripción (AAAA-MM-DD…), si se fijó. */
  venceInscripcion: string | null;
  reglamento: { puntosVictoria: number; puntosEmpate: number; umbralAmarillas: number; desempates: string[] };
}

export interface Partido {
  id: string;
  fecha: number;
  inicio: string | null;
  estado: string;
  localId?: string;
  visitanteId?: string;
  local: string;
  visitante: string;
  golesLocal: number | null;
  golesVisitante: number | null;
  ganadorWOId: string | null;
  cancha: string | null;
  fase: 'LIGA' | 'GRUPOS' | 'LLAVE';
  grupo: string | null;
  clave: string | null;
  penalesLocal: number | null;
  penalesVisitante: number | null;
}

export interface Estadisticas {
  tabla: (FilaTabla & { equipo: string })[];
  /** Solo en grupos + playoffs: una tabla por grupo. */
  grupos: { grupo: string; tabla: (FilaTabla & { equipo: string })[] }[];
  goleadores: { jugadorId: string; jugador: string; equipo: string; goles: number }[];
  sanciones: {
    id: string;
    jugador: string;
    equipo: string;
    causa: string;
    partidos: number;
    cumplidos: number;
    restantes: number;
    activa: boolean;
  }[];
}

export interface Inscripcion {
  id: string;
  estado: string;
  equipo: { id: string; nombre: string; capitan: string | null; jugadores: number };
  total: number;
  pagado: number;
  debe: number;
  cargos: { id: string; concepto: string; monto: number; estado: string }[];
  pagos: { id: string; metodo: string; monto: number; estado: string; comision: number; fecha: string }[];
}

export interface Equipo {
  id: string;
  nombre: string;
  capitanNombre: string | null;
  capitanTelefono: string | null;
  _count?: { plantel: number };
}

export interface Sede {
  id: string;
  nombre: string;
  direccion: string | null;
  canchas: { id: string; nombre: string }[];
}

export interface JugadorActa {
  id: string;
  nombre: string;
  numero: number | null;
  habilitado: boolean;
  motivo: string | null;
}

export interface Acta {
  id: string;
  torneo: { id: string; nombre: string };
  fecha: number;
  fase: 'LIGA' | 'GRUPOS' | 'LLAVE';
  grupo: string | null;
  clave: string | null;
  penalesLocal: number | null;
  penalesVisitante: number | null;
  inicio: string | null;
  estado: string;
  cancha: string | null;
  local: { id: string; nombre: string; jugadores: JugadorActa[] };
  visitante: { id: string; nombre: string; jugadores: JugadorActa[] };
  marcador: { local: number; visitante: number };
  eventos: {
    id: string;
    clientUuid?: string;
    tipo: TipoEvento;
    equipoId: string;
    jugadorId: string | null;
    minuto: number | null;
    /** Cargado en este dispositivo y todavía sin confirmar por el servidor. */
    pendiente?: boolean;
  }[];
  /** Dispositivo que lleva el acta (un solo dueño por partido). */
  dueno: { dispositivoId: string; usuario: string; desde: string | null } | null;
}

export interface CruceLlave {
  clave: string;
  estado: 'PENDIENTE' | 'LISTO' | 'DEFINIDO' | 'EMPATE_SIN_DEFINIR';
  partidoId: string | null;
  localId: string | null;
  visitanteId: string | null;
  local: string;
  visitante: string;
  golesLocal: number | null;
  golesVisitante: number | null;
  penalesLocal: number | null;
  penalesVisitante: number | null;
  ganadorId: string | null;
  partidoEstado: string | null;
  inicio: string | null;
  cancha: string | null;
}

export interface Llave {
  rondas: { numero: number; nombre: string; partidos: CruceLlave[] }[];
  campeon: { id: string; nombre: string } | null;
}

// ───────────── Comunicación y contingencias ─────────────

export interface PlantillaMensaje {
  clave: string;
  nombre: string;
  tipo: 'TRANSACCIONAL' | 'MARKETING';
  categoriaWhatsapp: 'UTILIDAD' | 'MARKETING';
  version: number;
  cuerpo: string;
  variables: string[];
  manual: boolean;
}

export type CanalMensaje = 'EMAIL' | 'WHATSAPP' | 'PUSH';

export interface VistaPreviaEnvio {
  destinatarios: number;
  entregas: number;
  porCanal: Record<CanalMensaje, number>;
  cambiosDeCanal: number;
  omitidos: { equipo: string; capitan: string; motivo: string }[];
  costoUsd: number;
  costoArs: number;
  tope: { tope: number; usados: number; restantes: number; excedente: number };
  plan: string;
  problemas: string[];
  ejemplo: { para: string; equipo: string; canal: CanalMensaje; asunto: string; cuerpo: string } | null;
}

export interface HistorialComunicacion {
  envios: {
    id: string;
    titulo: string;
    canal: CanalMensaje;
    estado: 'PROGRAMADA' | 'ENVIADA';
    programadaPara: string | null;
    creadoEn: string;
    total: number;
    entregados: number;
    leidos: number;
    fallidos: number;
    costoUsd: number;
  }[];
  automaticosDelMes: number;
  tope: { tope: number; usados: number; restantes: number; excedente: number };
  plan: string;
}

export interface Automatizacion {
  clave: string;
  nombre: string;
  detalle: string;
  activa: boolean;
  canal: CanalMensaje;
}

export interface AlertaClima {
  dia: string;
  titulo: string;
  probabilidad: number;
  desdeHora: number;
  hastaHora: number;
  actualizadoHaceMin: number;
  partidos: number;
  torneos: number;
  jugadores: number;
}

export interface PropuestaReprogramacion {
  movimientos: {
    partidoId: string;
    torneo: string;
    local: string;
    visitante: string;
    de: { inicio: string; cancha: string | null };
    a: { inicio: string; cancha: string | null };
  }[];
  conflictos: { tipo: string; mensaje: string; partido: string; con: string }[];
  sinResolver: { partido: string; motivo: string }[];
  resumen: { partidos: number; mueve: number; equipos: number; jugadores: number; canchas: number };
  aviso: {
    mensajes: number;
    porCanal: Record<CanalMensaje, number>;
    omitidos: number;
    costoUsd: number;
    costoArs: number;
    tope: { tope: number; usados: number; restantes: number; excedente: number };
    ejemplo: string | null;
  };
}

export interface ContingenciaResumen {
  id: string;
  motivo: string;
  accion: string;
  creadoEn: string;
  partidos: number;
  confirmados: number;
  noPuedo: number;
  sinResponder: number;
}

export interface ContingenciaDetalle {
  id: string;
  motivo: string;
  accion: string;
  creadoEn: string;
  movimientos: PropuestaReprogramacion['movimientos'];
  conflictosAceptados: PropuestaReprogramacion['conflictos'];
  sinResolver: PropuestaReprogramacion['sinResolver'];
  resumen: { confirmados: number; noPuedo: number; sinResponder: number };
  respuestas: {
    equipo: string;
    capitan: string;
    canal: CanalMensaje;
    estado: string;
    respuesta: 'CONFIRMO' | 'NO_PUEDO' | null;
    respondidoEn: string | null;
    /** El mensaje tal como lo recibió (con su link de confirmación). */
    cuerpo: string;
  }[];
}

// ───────────── Caja, árbitros y canchas ─────────────

export interface ResumenCaja {
  plan: { nombre: string; comisionPct: number };
  disponible: { MP: number; EFECTIVO: number; BANCO: number };
  comisionTotal: number;
  resultado: { ingresos: number; comision: number; egresos: number; resultado: number };
  porRubro: { rubro: string; nombre: string; monto: number; pct: number }[];
  porCobrar: { monto: number; equipos: number };
  automatizaciones: { clave: string; nombre: string; detalle: string; activa: boolean }[];
}

export interface MovimientoCaja {
  id: string;
  fecha: string;
  tipo: 'COBRO' | 'COMISION' | 'EGRESO' | 'INGRESO' | 'RETIRO' | 'REVERSA';
  descripcion: string;
  detalle: string;
  /** + ingresos, − egresos, 0 retiros. */
  efecto: number;
  monto: number;
  comprobante: string | null;
  anulado: boolean;
  torneoId: string | null;
}

export interface Arbitro {
  id: string;
  nombre: string;
  apellido: string;
  telefono: string | null;
  email: string | null;
  tarifa: number;
  valoracion: number | null;
  activo: boolean;
  disponibilidad: { dia: number; desde: string; hasta: string }[];
  dirigidos: number;
  proximos: number;
  pagado: number;
}

export interface Designaciones {
  dia: string;
  sinArbitro: number;
  partidos: {
    id: string;
    inicio: string;
    estado: string;
    torneo: string;
    local: string;
    visitante: string;
    cancha: string | null;
    arbitroId: string | null;
    arbitro: string | null;
    arbitroEstado: 'PENDIENTE' | 'CONFIRMADO' | null;
    disponibles: { id: string; nombre: string; tarifa: number }[];
  }[];
  arbitros: {
    id: string;
    nombre: string;
    tarifa: number;
    valoracion: number | null;
    partidosDelDia: number;
  }[];
  canchas: {
    id: string;
    nombre: string;
    sede: string;
    superficie: string | null;
    costoPorPartido: number;
    bloqueada: boolean;
    motivoBloqueo: string | null;
    partidos: number;
    pct: number;
  }[];
}

export interface ExpedienteVista {
  id: string;
  tipo: string;
  tipoNombre: string;
  estado: 'ABIERTO' | 'RESUELTO';
  motivo: string;
  jugador: string | null;
  jugadorId: string | null;
  equipo: string;
  fecha: number | null;
  partido: string | null;
  informeArbitro: string | null;
  descargo: string | null;
  sugeridos: number;
  partidosResueltos: number | null;
  multa: number;
  veredicto: string | null;
  resolucion: string | null;
}

export interface ResumenTribunal {
  torneo: { id: string; nombre: string };
  reglamento: {
    umbralAmarillas: number;
    suspensionAcumulacion: number;
    suspensionDobleAmarilla: number;
    suspensionRojaDirecta: number;
  };
  contadores: { suspendidos: number; automaticas: number; abiertos: number; descargos: number };
  expedientes: ExpedienteVista[];
  suspendidos: {
    sancionId: string;
    jugador: string;
    equipo: string;
    causa: string;
    partidos: number;
    restantes: number;
  }[];
  automaticas: {
    id: string;
    jugador: string;
    equipo: string;
    causa: string;
    partidos: number;
    restantes: number;
    activa: boolean;
  }[];
}

export interface FilaDisciplina {
  clave: string;
  nombre: string;
  amarillas: number;
  rojas: number;
  partidosSancionados: number;
  multas: number;
  expedientes: number;
}

// ───────────── Documentación (E15) ─────────────

export type TipoDocumento = 'DNI' | 'APTO_FISICO' | 'AUTORIZACION_MENOR';
export type EstadoVigencia = 'FALTA' | 'PENDIENTE' | 'RECHAZADO' | 'VIGENTE' | 'POR_VENCER' | 'VENCIDO';

export interface FilaDocumentacion {
  jugadorId: string;
  equipoId: string;
  nombre: string;
  equipo: string;
  edad: number | null;
  menor: boolean;
  dniCargado: boolean;
  estados: Record<TipoDocumento, EstadoVigencia>;
  habilitado: boolean;
  motivos: string[];
  duplicado: boolean;
  pendientesDeRevision: number;
  imagenPublicable: boolean;
}

export interface PanelDocumentacion {
  torneos: { id: string; nombre: string }[];
  torneo: { id: string; nombre: string; requeridos: TipoDocumento[] } | null;
  filas: FilaDocumentacion[];
  resumen: { total: number; habilitados: number; conDni: number; conApto: number; menores: number } | null;
  alertas: {
    duplicados: number;
    aptoVencido: number;
    aptoPorVencer: number;
    menoresSinAutorizacion: number;
    pendientesDeRevision: number;
  } | null;
  selfie: { habilitada: boolean; detalle: string };
}

export interface DuplicadoJugador {
  id: string;
  jugadores: { id: string; nombre: string; dni: string | null; equipos: { id: string; nombre: string }[] }[];
}

export interface FichaJugador {
  id: string;
  nombre: string;
  fechaNacimiento: string | null;
  menor: boolean;
  dni: string | null;
  tieneDatosMedicos: boolean;
  habilitacion: { habilitado: boolean; motivos: string[] };
  documentos: {
    id: string;
    tipo: TipoDocumento;
    nombreTipo: string;
    estado: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
    archivoNombre: string;
    mime: string;
    vencimiento: string | null;
    motivoRechazo: string | null;
    creadoEn: string;
    accesos: number;
  }[];
  consentimientos: {
    id: string;
    tipo: 'TUTOR_PARTICIPACION' | 'IMAGEN' | 'DATOS_PERSONALES';
    version: number;
    vigente: boolean;
    otorgante: string;
    vinculo: string | null;
    otorgadoEn: string;
    revocadoEn: string | null;
  }[];
}
