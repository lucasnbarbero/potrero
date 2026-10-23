# ADR-022 · Mensajería con canales intercambiables y envíos simulados

| Estado | Fecha | Decide |
|---|---|---|
| Aceptada | 2026-10-23 | Tech lead |

## Contexto
La comunicación (cobros, fixture, reprogramaciones, suspensiones) es parte de lo que "nunca se recorta". El BSP de WhatsApp (ADR-012) y el proveedor de email todavía no están elegidos, y cada mensaje de WhatsApp tiene costo (documento 1, sección 7). Hay que poder construir, probar y mostrar todo el flujo sin mandarle nada a nadie.

## Opciones evaluadas
| Opción | A favor | En contra | Costo |
|---|---|---|---|
| Esperar al proveedor para construir | Sin trabajo descartable | Bloquea la demo y las pruebas de contingencias | Alto |
| Interfaz de canal con implementación simulada (como la pasarela, ADR-007) | Se desarrolla y se muestra hoy; el proveedor real es otra implementación | Hay que integrar el real después | Bajo |
| Llamar a un proveedor desde ya, con una cuenta de prueba | Más realista | Dependencia externa en cada prueba; riesgo de mandar mensajes de verdad desde la demo | Medio |

## Decisión
`apps/api/src/mensajeria/canales.ts` define la interfaz `CanalDespacho` y un `CanalSimulado` (`MENSAJERIA=simulada`, por defecto). La demo pública lo exige: la API no arranca con `DEMO_MODE` y `MENSAJERIA=real`. Cada mensaje se guarda en `Mensaje` (historial, estado de entrega y costo) y se despacha por el canal; en la demo, ese historial funciona como bandeja: se ve lo que habría recibido cada capitán.

Reglas (puras, en `packages/shared/src/dominio/mensajeria.ts`):
- **Canal por destinatario:** WhatsApp solo con consentimiento y teléfono; si no, baja a email y después a push. Los mensajes de marketing respetan la baja; los transaccionales (cobro, partido, sanción) no.
- **Costo visible antes de enviar** y **tope mensual de WhatsApp por plan**: un envío que se pasa no sale. Las cifras viven en `docs/datos.json` (provisorias hasta validarlas con el BSP, E00-10).
- **Plantillas versionadas** con variables; una plantilla con variables sin completar se rechaza al enviar o programar, no a la hora de salir.
- **Envíos automáticos idempotentes** por una clave del mensaje (`rec24:partido:equipo`): reintentar un ciclo no manda dos veces.
- Las reprogramaciones llevan un token por mensaje para los botones "Confirmo" / "No puedo", sin sesión.

Con un proveedor real, el despacho sale de la transacción de la base y pasa a un worker que toma los mensajes PENDIENTES (E02-07), y el estado de entrega llega por el webhook firmado (`/api/webhooks/mensajeria`).

## Consecuencias
- Integrar WhatsApp, email y push reales es agregar implementaciones de `CanalDespacho` y un worker, sin cambiar reglas ni pantallas.
- El ciclo de automatizaciones corre dentro de la API (cada minuto) hasta que existan las colas.
- Pendiente: Web Push (E16-04), packs de mensajes adicionales (E16-09) y las preferencias por usuario (hoy son por capitán de cada equipo).

| Se revisa si | Relacionados |
|---|---|
| Se elige el BSP (ADR-012), cambian los costos de Meta o aparecen envíos que superen lo que aguanta la API en un ciclo. | ADR-007, ADR-012, ADR-019 |
