# ADR-004 · Acta con eventos inmutables e idempotentes

| Estado | Fecha | Decide |
|---|---|---|
| Aceptada | 2026-10-22 | Tech lead |

## Contexto
El acta se carga en la cancha, a veces sin señal, y es la base de resultados y sanciones: tiene que ser auditable y tolerar reintentos.

## Opciones evaluadas
| Opción | A favor | En contra | Costo |
|---|---|---|---|
| Editar el resultado del partido | Simple | Sin historial, conflictos con sincronización | Bajo |
| Eventos solo de agregado con client_uuid | Auditable, reintentos seguros, base del modo offline | Las correcciones son eventos de anulación | Bajo |

## Decisión
EventoPartido solo se agrega. Cada evento trae un client_uuid generado en el dispositivo (único en la base): si llega dos veces, se devuelve el existente. Las correcciones son eventos ANULACION. El marcador se deriva de los eventos.

## Consecuencias
El modo offline (E11-06) solo agrega una cola local; la API ya es idempotente.

| Se revisa si | Relacionados |
|---|---|
| — | Documento 1, sección 7 |
