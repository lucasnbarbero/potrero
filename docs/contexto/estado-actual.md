# Estado actual del producto

Actualizar al cerrar cada bloque de trabajo. Detalle de tareas: `docs/backlog.md`.

## Funciona (demo, octubre 2026)
- Registro e ingreso con sesión segura; organizaciones aisladas por RLS (probado en base y API).
- Torneos: crear (modalidad, formato, cupo, inscripción, reglamento), vista previa de partidos, estados.
- Equipos con plantel, canchas por sede.
- Inscripción: desde el panel o por link público; cobro con pasarela simulada (mismo flujo que Mercado Pago), webhook firmado e idempotente, pagos manuales sin comisión, comisión según plan.
- Fixture automático de liga (rotación + franjas de cancha y horario), sin choques. Copa con sorteo y cabezas de serie, liga + playoffs y grupos + playoffs: la llave se completa sola, con penales y equipos ausentes
- Acta digital: planilla con habilitación, goles/tarjetas/en contra, anulaciones, idempotencia, cierre con firmas o justificación, equipo ausente Funciona sin conexión (cola local + service worker, ADR-020) y tiene un solo dueño por partido; es instalable como app (PWA).
- Tabla, goleadores y sanciones automáticas (roja, doble amarilla, acumulación) derivadas.
- Sitio público del torneo y de la liga (sin datos personales), landing con precios de `datos.json`.
- Panel con dinero cobrado, pendiente, alertas (deudas, actas sin cerrar, "No puedo", mensajes fallidos) y próximos partidos.
- Comunicación: mensajes con plantillas y variables, canal según el consentimiento de cada capitán, costo y tope del plan a la vista, envíos programados, automatizaciones (recordatorio de partido, cobro escalonado, aviso de suspensión), historial y bandeja de lo enviado.
- Documentación: DNI y apto físico con revisión humana, DNI y datos de salud cifrados, duplicados, vencimientos con alerta, autorización del tutor en línea, consentimiento de imagen, requisitos por torneo, acta que marca a los no habilitados y retención automática. La selfie queda apagada.
- Caja: libro de partida doble inmutable con asientos automáticos por cada cobro y comisión, resultado en vivo, egresos por rubro, ingresos de sponsors, retiros, anulaciones, exportación a CSV y cargos automáticos al cerrar el acta (árbitro y cancha).
- Tribunal: expedientes (automáticos por roja y por jugador no habilitado, o abiertos a mano), informe, descargo, resolución que amplía o reduce, multa como cargo al equipo e historial disciplinario.
- Árbitros y canchas: árbitros con tarifa, valoración y disponibilidad; designación manual y automática (un árbitro por franja), confirmación, costo y bloqueo de canchas, ocupación del día y alerta de partidos sin árbitro.
- Reprogramaciones: alerta de clima, propuesta con conflictos, aplicar con aviso a los capitanes, confirmaciones por link y seguimiento de las respuestas. Cuenta regresiva para marcar un equipo ausente en el acta.

- Cobros por fecha: cuota fija por equipo y fecha (con o sin inscripción) y seguro por jugador del plantel, generados solos 7 días antes de cada partido; rubro Seguros en la caja y aviso de deuda en el acta.
- Fixture a mano: grilla por cancha y horario; mover un partido o intercambiar dos (arrastrando o tocando en el celular), con los conflictos explicados y aviso opcional a los capitanes.
- Levantar una suspensión pagando (opción del reglamento, apagada por defecto): cargo de multa por partido; el jugador queda habilitado cuando el pago se acredita.

- Panel del organizador (mock 01): partido en vivo con goles y acceso al acta, alertas con su botón para resolverlas (suspendido que jugó, acta sin cargar, partido sin árbitro, documento vencido, pago sin conciliar), sugerencias del próximo paso, cobrado de los últimos 30 días y avance de cada torneo.
- Cuenta: recuperar la contraseña y verificar el email con links de un solo uso (email simulado), límite de intentos de ingreso, cambio de organización activa y "Mi cuenta".
- Usuarios: invitación con rol (administrador, tesorero, árbitro, tribunal o capitán de un equipo) por link de un solo uso; reenviar, anular y quitar acceso.
- Panel del capitán (mock 07): próximo partido, convocatoria, plantel con altas y bajas, documentación que falta, sanciones y descargo en el expediente, tabla y deuda del equipo.
- Sitio público: página de cada partido (crónica automática, línea de tiempo, tarjeta para WhatsApp e Instagram) y perfil del jugador con estadísticas y trayectoria. Por defecto el nombre sale con iniciales; los menores no tienen perfil sin consentimiento.
- Sponsors (mock 18): auspiciantes, espacios por torneo y período, impresiones y clics sin datos del visitante, reporte en CSV, cobros en la caja y rubros prohibidos con menores.
- Métricas (mock 19): retención de equipos, tasa de cobro y cobro antes del inicio, medios de pago, ocupación de canchas y mapa de horarios.
- Configuración inicial (mock 20): asistente de 5 pasos e importación de equipos, jugadores y canchas desde Excel o CSV, con validación fila por fila y todo o nada.

- Pagos manuales completos o parciales (efectivo o transferencia) con comprobante y anulación; editar el torneo y cambiar su estado (cerrar o reabrir la inscripción, finalizar).
- Menú y pantallas según el rol, con aviso amable cuando una sección no corresponde.
- Simulador "Armá el formato" (ADR-026): torneos por fases con plantillas, incluida una copa estímulo, y vista previa de sábados, partidos y recaudación. Crea el torneo por fases: cada fase se genera cuando sus equipos están definidos, con tablas por grupo, llaves ida y vuelta (penales en la vuelta) y copa en paralelo; se ve por fases en el panel y en el sitio público.

- Panel del jugador (`/jugador`): cuenta propia invitada por el capitán con aceptación de términos, "Voy" / "No voy" que ve el capitán, estadísticas, sanciones, documentación, cómo aparece su nombre y avisos personales.
- Panel interno de Gregal (`/gregal`): staff con login y roles propios, métricas de la plataforma, organizaciones con su salud (ligas para llamar), dinero por mes y por liga, y auditoría inmutable de cada acceso.
- Cifras configurables en `docs/datos.json`: además de precios y reglamento, plazos de cuentas e invitaciones, límites de ingreso, plantel mínimo, tribunal, simulador, sponsors, importación, panel, pronóstico y umbrales de salud de las ligas.

- Demo pública (ADR-019, `pnpm demo --publica`): cada visitante entra desde la landing a su propia sandbox con los datos de la plantilla, aislada por RLS; vence a las 24 h y un job la elimina; botón "Reiniciar demo"; sin registro abierto; tope de sandboxes por IP y en total. Falta el despliegue del entorno (E37-08).

## Límites conocidos del producto
Limitaciones de alcance (las fallas puntuales que hay que tener en cuenta al probar la demo están en `docs/guia-demo.md`, "Fallas ya conocidas").

- Mercado Pago real, WhatsApp, email y push: no integrados; los canales de mensajería son simulados (E06-04, ADR-022). El pronóstico de clima también es simulado (E17-06).
- El acta sin conexión está probada en el navegador (incluido con el servidor apagado), no en celulares reales de gama baja (E11-13). Hay que abrirla una vez con señal antes del partido.
- Llaves de los formatos fijos sin ida y vuelta (solo partido único con penales); la ida y vuelta existe en los torneos por fases.
- Sin mercado de pases ni fotos de partido; el backoffice de Gregal es una versión mínima dentro de la web (`/gregal`, sin 2FA ni app aparte). Torneos por fases: fase 1 a mano, sin editar el formato ni grilla a mano (E10-07). Invitaciones, recuperación de contraseña y verificación de email: el link se muestra o se comparte a mano hasta tener proveedor de email.
- Cuota por fecha: con `deudaBloqueaJugar` el acta solo avisa, todavía no impide cargar al equipo.
- Caja: sin reembolsos (E06-12), sin PDF ni comprobantes como archivo; el retiro es solo un registro y falta la verificación en dos pasos.
- Cliente de la API tipado a mano (`apps/web/src/lib/tipos.ts`), pendiente OpenAPI (E02-06).
- Aviso interno de Prisma 7 sobre consultas concurrentes (ADR-018).
