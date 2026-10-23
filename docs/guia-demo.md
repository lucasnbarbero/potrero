# Guía de la demo

Cómo levantar y mostrar la demo de Potrero en 10–15 minutos. Es un producto en construcción: lo que se ve funciona de verdad (base de datos, reglas, cobros simulados), pero hay módulos que todavía no están (ver "Lo que todavía no está").

## Antes de mostrar
1. Abrí Docker Desktop.
2. En la carpeta del proyecto: `pnpm demo`. Esperá el mensaje "Ingresá con demo@potrero.app".
3. Abrí http://localhost:3000. Para empezar con datos limpios: cortá con Ctrl+C, `pnpm db:reset` y `pnpm demo`.

Los datos de demo se calculan desde el día en que se cargan: la liga **Liga Barrial Sur** tiene el torneo **Apertura 2026** con 3 fechas jugadas y la 4 el próximo sábado, y el **Clausura 2026** con la inscripción abierta.

## Recorrido sugerido

| Paso | Dónde | Qué mostrar | Qué decir |
|---|---|---|---|
| 1 | `/` (landing) | Promesa, problemas, precios | "Pagás solo cuando cobrás: 3,5 %, o 2,5 % de por vida si sos liga fundadora." |
| 2 | `/ingresar` | demo@potrero.app / potrero-demo-2026 | — |
| 3 | Panel | Cobrado, neto, pendiente, alertas, próximos partidos | "Lo urgente primero, cada mañana." |
| 4 | Torneos → Apertura 2026 → Inscripciones y pagos | Estado por equipo, comisión solo en pagos online, botón "Cobré en efectivo" | "El efectivo lo registrás y no paga comisión." |
| 5 | Pestaña Fixture | Fechas con horario y cancha | "Se armó solo, sin choques." |
| 6 | Pestaña Tabla | Posiciones y goleadores | "Nadie la edita: sale de las actas." |
| 7 | Pestaña Sanciones | Roja directa con fechas pendientes | "Las tarjetas se vuelven suspensiones según tu reglamento." |
| 8 | Fixture → Fecha 4 → Acta del equipo sancionado | Jugador marcado "No habilitado" antes de empezar | "El árbitro lo ve antes de que entre a la cancha." |
| 9 | Acta | Iniciar partido, cargar goles y tarjetas desde el celular, anular, cerrar con firmas | Mostralo en el celular (misma red: `http://IP-de-tu-PC:3000`). |
| 10 | Tabla de nuevo | Se actualizó sola | — |
| 11 | "Sitio público" (arriba a la derecha) | Tabla, goleadores, suspendidos, próxima fecha | "Esto lo comparten los equipos. Sin datos personales." |
| 12 | `/t/liga-barrial-sur/clausura-2026` → Inscribir mi equipo | Inscripción por link → checkout → "Pagar (aprobar)" | "El capitán se inscribe y paga solo. La plata va a tu cuenta de Mercado Pago." |
| 13 | Volver a Clausura 2026 en el panel | El equipo nuevo aparece pagado | — |

## Lo que todavía no está
Mercado Pago real (el checkout es simulado), WhatsApp, acta sin señal, copa y playoffs, reprogramaciones por lluvia, documentación e identidad, caja, sponsors, métricas, panel del capitán y perfiles de jugador. En el panel figuran como "Próximamente". Orden de construcción: `docs/backlog.md`.

## Si algo falla
- "Docker no está corriendo": abrí Docker Desktop y esperá a que diga que está activo.
- Puerto ocupado (3000, 4000 o 55432): cerrá la otra aplicación o la demo anterior.
- La inscripción pública dice "cupo completo": el Clausura acepta 12 equipos. Hacé `pnpm db:reset` para volver al estado inicial.
