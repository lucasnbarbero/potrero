# Reglas de negocio (resumen operativo)

Fuente: documento 1 (secciones 5–8) y documento 2. Cifras: `docs/datos.json`. Implementación: `packages/shared/src/dominio`.

## Producto
- Cliente que paga: organizador de liga (12–24 equipos, canchas alquiladas). Capitanes, jugadores y público entran solos.
- 20 módulos (mocks 01–20) + backoffice de Gregal (E36). Lanzamiento único, beta con 15 ligas fundadoras.
- Modalidades F5/F7/F8/F11. Formatos: liga, copa, grupos + playoffs, liga + playoffs.

## Planes y cobros
- Liga 3,5 % · Ligas fundadoras 2,5 % de por vida (primeras 15) · Pro $24.900/mes + 2 %. Sin permanencia.
- La comisión se cobra solo sobre pagos con Mercado Pago (split 1:1, `application_fee`). Efectivo y transferencia: sin comisión.
- Mercado Pago cobra aparte su costo; el organizador elige absorberlo o mostrarlo como "cargo por servicio" (default: ADR-013 abierto).
- Una inscripción genera cargos; el cargo queda PAGADO cuando los pagos aprobados cubren el monto; sin cargos pendientes, la inscripción pasa a CONFIRMADA.
- Cuota por fecha (E06-20): monto fijo por equipo y por fecha, con o sin inscripción. Un cargo por equipo y fecha, vence el día del partido. Por defecto: no se cobra la fecha libre ni el partido suspendido; el W.O. sí. La deuda alerta y recuerda; bloquear al deudor es opcional. Activada con el torneo empezado, se cobra desde la próxima fecha (la siguiente a la última con partidos jugados), nunca las ya jugadas; cuota y seguro guardan cada uno su inicio (`cuotaDesdeFecha`, `seguroDesdeFecha`). Valores en `datos.json` (`cobrosPorFechaPorDefecto`).
- Seguro por jugador (E06-21): monto × jugadores del plantel en cada fecha que el equipo juega (juegue o no cada jugador). Cargo aparte al equipo, rubro Seguros en la caja.
- Cuotas y seguros se generan 7 días antes del partido (`anticipacionDias`), uno por equipo, tipo y fecha (clave única: idempotente). Siguen al partido si se mueve; si se suspende, el cargo pendiente sin pagos se anula; un cargo con pagos no se toca. El monto queda fijo al generarse, salvo que el organizador cambie la configuración (se recalculan los pendientes sin pagos). La cuota entra en Inscripciones de la caja.
- La inscripción se confirma solo con los cargos de inscripción y seña: cuotas por fecha, seguros y multas no la traban.
- Notificaciones de pago: firma validada, idempotentes por id de pago, conciliación nocturna (pendiente).

## Tabla
- Puntos por defecto 3/1/0. Desempates en orden: diferencia de gol, goles a favor, resultado entre sí, juego limpio (amarilla 1, roja 3; menos es mejor), sorteo.
- W.O.: gana el presente por 3-0 (configurable); no suma estadísticas individuales.
- La tabla es derivada de los partidos cerrados; nunca se edita.

## Fixture
- Todos contra todos por rotación; impares: un libre por fecha; ida y vuelta invierte localía. Localía equilibrada.
- Restricciones duras: una cancha por franja, un equipo una vez por fecha, árbitro una vez por franja (pendiente). Blandas y por equipo: pendientes (E09).
- Mover un partido (día, cancha, horario) o intercambiar horarios dentro de una fecha (E09-07) advierte conflictos, no bloquea. Objetivo: 24 equipos < 10 s.

## Llaves y playoffs
- Eliminación directa. Si los equipos no son potencia de dos, las mejores semillas pasan la primera ronda libres. Siembra estándar: la 1ª y la 2ª solo se cruzan en la final (1-8, 4-5, 2-7, 3-6).
- Copa: sorteo con cabezas de serie (ocupan las primeras semillas; el resto se mezcla con un número de sorteo reproducible).
- Liga + playoffs: clasifican los primeros de la tabla (por defecto, la mayor potencia de dos hasta 8). Grupos + playoffs: grupos en serpentina (mínimo 3 equipos por grupo); avanzan 1 o 2 por grupo y el 1º de un grupo se cruza con el 2º del vecino.
- Los cruces no suman puntos a la tabla (sí goles a goleadores). Un empate se define por penales, que el acta exige; un W.O. define al ganador. Cada cruce se crea cuando se conocen sus dos equipos; al definirse la final, el torneo pasa a finalizado.
- Pendiente: ida y vuelta en llaves.

## Acta
- Eventos solo de agregado con `clientUuid`; correcciones = anulación (por id o por `clientUuid`). Un dueño del acta por partido: el primer dispositivo que la abre; otro puede tomarla a propósito y el dueño anterior queda afuera.
- Sin conexión, el dispositivo guarda las operaciones en una cola y las envía en orden al volver la señal; el servidor las reconoce por `clientUuid` y nunca duplica. Lo que el servidor rechaza se le informa al delegado.
- Cierre: firma de ambos capitanes o justificación del árbitro. Al cerrar: resultado, sanciones; tabla/goleadores se derivan.
- Planilla con habilitación visible antes de empezar. Cargar a un suspendido: se registra con advertencia y (E14) abre expediente.

## Caja
- Libro de partida doble inmutable (ADR-023): cada cobro, comisión, egreso, ingreso manual y retiro es un asiento que suma cero. No se edita ni se borra (lo impide la base): se corrige con un asiento que lo revierte.
- Cada pago aprobado se asienta solo (con la comisión si fue por Mercado Pago). Resultado = ingresos cobrados − comisión − egresos. "Por cobrar" sale de los cargos pendientes. Un retiro mueve plata de Mercado Pago al banco y no cambia el resultado.
- Egresos por rubro: canchas, árbitros, premios, otros (con comprobante). Ingresos manuales: sponsors y otros.
- Cargos automáticos al cerrar el acta (se encienden en Caja): pago al árbitro designado (su tarifa, en efectivo) y alquiler de la cancha (su costo por partido, por transferencia).
- Permisos: el dueño retira; el tesorero opera la caja; el administrador la ve. Pendiente: verificación en dos pasos para retirar (E04-11).

## Tribunal de disciplina
- Cada roja directa abre sola un expediente con lo que sugiere el reglamento. Un jugador suspendido que figura en el acta (la pantalla no deja elegirlo, pero un acta sin conexión puede traerlo) abre un expediente "jugador no habilitado", una vez por partido y jugador.
- El expediente reúne el informe del árbitro, el descargo del capitán y la resolución. El tribunal puede aplicar, ampliar, reducir o anular lo sugerido (0 a 20 partidos); modifica la sanción automática o crea una del tribunal. Solo se suspende a jugadores.
- La multa genera un cargo al equipo (rubro Multas) y entra a la caja como ingreso cuando se cobra.
- Historial disciplinario por jugador y por equipo: amarillas, rojas, partidos sancionados, multas y expedientes.
- Permiso: `sancion.resolver` (dueño, administrador y tribunal).

## Árbitros y canchas
- Un árbitro tiene tarifa, valoración y disponibilidad (franjas por día de la semana; sin franjas = siempre). Dirige un solo partido por franja.
- Designación a mano (choque de franja = error; fuera de su disponibilidad = advertencia) o automática: reparte parejo respetando franjas y disponibilidad, y avisa lo que no pudo cubrir.
- Las canchas tienen costo por partido, superficie y bloqueo (mantenimiento): una cancha bloqueada no se ofrece para fixtures ni reprogramaciones. Ocupación del día = partidos de la cancha sobre las franjas que usa la liga.

## Comunicación
- Plantillas versionadas con variables ({capitán}, {equipo}, {torneo}, {monto}, {link_pago}…). Manuales: recordatorio de pago, fixture publicado y mensaje libre; el resto (recordatorio de partido, suspensión, reprogramación) las manda el sistema.
- Canal por destinatario: WhatsApp solo con consentimiento y teléfono; si no, baja a email y después a push. Marketing respeta la baja; cobro, partido y sanción siempre llegan.
- Costo de WhatsApp a la vista antes de enviar; tope mensual por plan (cifras provisorias en `docs/datos.json`): un envío que se pasa no sale. Email y push no cuestan.
- Automatizaciones (el organizador las enciende): recordatorio 24 h antes de cada partido, cobro escalonado (3 días antes del vencimiento, el día y 2 días después) y aviso de suspensión al cerrar el acta. Cada aviso es idempotente por clave.
- Canales simulados hasta elegir BSP y proveedor de email (ADR-022).

## Contingencias
- Se calcula una propuesta antes de aplicar: mover días (un día después, una semana) o pasar a otras canchas en el mismo horario, los que entren. Advierte conflictos de cancha y de equipos con dos partidos el mismo día; no bloquea, pero hay que confirmar que se vieron.
- Al aplicar se mueven los partidos, se registra la contingencia y se avisa a los capitanes con "Confirmo" / "No puedo" (link sin sesión). Un "No puedo" queda como alerta en el panel.
- Alerta de clima con proveedor simulado (a elegir). Pendiente: resolución automática del W.O. por tolerancia.

## Sanciones
- Roja directa 1 partido · doble amarilla 1 (sus amarillas no acumulan) · acumulación: cada 5 amarillas, 1 partido.
- Se cumplen con partidos oficiales del equipo jugados después; W.O. y suspendidos no descuentan. El tribunal puede modificar (E14).
- Levantar pagando (E14-08, opcional, apagado por defecto): el reglamento elige qué tipos se levantan (por defecto ACUMULACION y DOBLE_AMARILLA; nunca roja directa, sanción del tribunal ni sanción con expediente) y el monto por partido (0 = no disponible). Cada pedido es un `LevantamientoSancion` con su cargo al equipo (rubro Multas).
- Se acredita cuando el cargo queda PAGADO y levanta el primer partido oficial del equipo jugado después; ese partido no cuenta como cumplido. Permisos: editar el reglamento `torneo.escribir`; pedir o anular `sancion.resolver`.

## Habilitación del jugador
Documentación vigente (DNI validado, apto físico, autorización si es menor) + sin sanción activa + sin duplicado abierto (ADR-025).
- Cada torneo elige qué documentos exige (DNI, apto físico, autorización de menores); sin nada elegido no exige nada. La autorización solo se pide a menores (18 por defecto, provisorio) y la reemplaza el consentimiento del tutor firmado en línea.
- Un documento subido queda pendiente y no habilita hasta que una persona lo aprueba. El apto se aprueba con su vencimiento; avisa 30 días antes y vencido inhabilita. Un rechazo lleva motivo.
- Mismo DNI en dos jugadores = duplicado abierto: ambos quedan sin habilitar hasta resolverlo.
- El acta marca como no habilitado a quien no cumple, con el motivo.
- Consentimientos versionados (tutor, imagen, datos): vale la versión vigente y no revocada. Un menor solo se publica con imagen si el tutor también autorizó.
- Retención: rechazados 30 días, vencidos 365, accesos 730 (provisorio); borrado automático diario.

## Datos personales
Nunca públicos: DNI, fecha de nacimiento exacta, teléfono, email, domicilio. Menores: consentimiento del tutor, sin foto pública sin autorización. DNI y datos de salud cifrados (AES-256-GCM); se muestra solo el final del DNI y ver el número completo queda auditado. Archivos en almacenamiento privado con link firmado de pocos minutos y registro de quién lo pidió.

## Roles
Dueño (todo) · Administrador de torneo (sin dinero ni plan) · Tesorero (cobros) · Árbitro/delegado (acta) · Tribunal (sanciones) · Capitán · Jugador · Tutor · Público · Staff interno (backoffice, acceso auditado).
