# Estado actual del producto

Actualizar al cerrar cada bloque de trabajo. Detalle de tareas: `docs/backlog.md`.

## Funciona (demo, octubre 2026)
- Registro e ingreso con sesión segura; organizaciones aisladas por RLS (probado en base y API).
- Torneos: crear (modalidad, formato, cupo, inscripción, reglamento), vista previa de partidos, estados.
- Equipos con plantel, canchas por sede.
- Inscripción: desde el panel o por link público; cobro con pasarela simulada (mismo flujo que Mercado Pago), webhook firmado e idempotente, pagos manuales sin comisión, comisión según plan.
- Fixture automático de liga (rotación + franjas de cancha y horario), sin choques.
- Acta digital: planilla con habilitación, goles/tarjetas/en contra, anulaciones, idempotencia, cierre con firmas o justificación, W.O.
- Tabla, goleadores y sanciones automáticas (roja, doble amarilla, acumulación) derivadas.
- Sitio público del torneo y de la liga (sin datos personales), landing con precios de `datos.json`.
- Panel con dinero cobrado, pendiente, alertas y próximos partidos.

## Límites conocidos de la demo
- Mercado Pago real, WhatsApp, email: no integrados (E06-04, E16).
- Acta sin modo offline todavía (la API ya es idempotente; falta la cola local, E11-06).
- Formatos copa/grupos/llaves: solo la fase de liga (E10).
- Sin backoffice, caja, documentación, contingencias, capitán, perfiles (ver backlog).
- Cliente de la API tipado a mano (`apps/web/src/lib/tipos.ts`), pendiente OpenAPI (E02-06).
- Aviso interno de Prisma 7 sobre consultas concurrentes (ADR-018).
