# Estado actual del producto

Actualizar al cerrar cada bloque de trabajo. Detalle de tareas: `docs/backlog.md`.

## Funciona (demo, octubre 2026)
- Registro e ingreso con sesión segura; organizaciones aisladas por RLS (probado en base y API).
- Torneos: crear (modalidad, formato, cupo, inscripción, reglamento), vista previa de partidos, estados.
- Equipos con plantel, canchas por sede.
- Inscripción: desde el panel o por link público; cobro con pasarela simulada (mismo flujo que Mercado Pago), webhook firmado e idempotente, pagos manuales sin comisión, comisión según plan.
- Fixture automático de liga (rotación + franjas de cancha y horario), sin choques. Copa con sorteo y cabezas de serie, liga + playoffs y grupos + playoffs: la llave se completa sola, con penales y W.O.
- Acta digital: planilla con habilitación, goles/tarjetas/en contra, anulaciones, idempotencia, cierre con firmas o justificación, W.O. Funciona sin conexión (cola local + service worker, ADR-020) y tiene un solo dueño por partido; es instalable como app (PWA).
- Tabla, goleadores y sanciones automáticas (roja, doble amarilla, acumulación) derivadas.
- Sitio público del torneo y de la liga (sin datos personales), landing con precios de `datos.json`.
- Panel con dinero cobrado, pendiente, alertas (deudas, actas sin cerrar, "No puedo", mensajes fallidos) y próximos partidos.
- Comunicación: mensajes con plantillas y variables, canal según el consentimiento de cada capitán, costo y tope del plan a la vista, envíos programados, automatizaciones (recordatorio de partido, cobro escalonado, aviso de suspensión), historial y bandeja de lo enviado.
- Documentación: DNI y apto físico con revisión humana, DNI y datos de salud cifrados, duplicados, vencimientos con alerta, autorización del tutor en línea, consentimiento de imagen, requisitos por torneo, acta que marca a los no habilitados y retención automática. La selfie queda apagada.
- Caja: libro de partida doble inmutable con asientos automáticos por cada cobro y comisión, resultado en vivo, egresos por rubro, ingresos de sponsors, retiros, anulaciones, exportación a CSV y cargos automáticos al cerrar el acta (árbitro y cancha).
- Tribunal: expedientes (automáticos por roja y por jugador no habilitado, o abiertos a mano), informe, descargo, resolución que amplía o reduce, multa como cargo al equipo e historial disciplinario.
- Árbitros y canchas: árbitros con tarifa, valoración y disponibilidad; designación manual y automática (un árbitro por franja), confirmación, costo y bloqueo de canchas, ocupación del día y alerta de partidos sin árbitro.
- Reprogramaciones: alerta de clima, propuesta con conflictos, aplicar con aviso a los capitanes, confirmaciones por link y seguimiento de las respuestas. Cuenta regresiva de W.O. en el acta.

- Demo pública (ADR-019, `pnpm demo --publica`): cada visitante entra desde la landing a su propia sandbox con los datos de la plantilla, aislada por RLS; vence a las 24 h y un job la elimina; botón "Reiniciar demo"; sin registro abierto; tope de sandboxes por IP y en total. Falta el despliegue del entorno (E37-08).

## Límites conocidos de la demo
- Mercado Pago real, WhatsApp, email y push: no integrados; los canales de mensajería son simulados (E06-04, ADR-022). El pronóstico de clima también es simulado (E17-06).
- El acta sin conexión está probada en el navegador (incluido con el servidor apagado), no en celulares reales de gama baja (E11-13). Hay que abrirla una vez con señal antes del partido.
- Llaves sin ida y vuelta (solo partido único con penales).
- Sin backoffice, documentación, capitán, perfiles (ver backlog).
- Caja: sin reembolsos (E06-12), sin PDF ni comprobantes como archivo; el retiro es solo un registro y falta la verificación en dos pasos.
- Cliente de la API tipado a mano (`apps/web/src/lib/tipos.ts`), pendiente OpenAPI (E02-06).
- Aviso interno de Prisma 7 sobre consultas concurrentes (ADR-018).
