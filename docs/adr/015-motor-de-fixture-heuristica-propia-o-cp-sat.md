# ADR-015 · Motor de fixture: heurística propia o CP-SAT

| Estado | Fecha | Decide |
|---|---|---|
| Propuesta (abierta) | 2026-10-22 | Tech lead |

## Contexto
Hoy: método de rotación + asignación por franjas (24 equipos ida y vuelta en milisegundos, probado). Faltan restricciones blandas y por equipo.

## Opciones evaluadas
| Opción | A favor | En contra | Costo |
|---|---|---|---|
| Heurística propia | Sin dependencias | Puede no alcanzar con muchas restricciones | Bajo |
| OR-Tools CP-SAT | Óptimo con restricciones complejas | Servicio aparte (Python) o binding | Medio |

## Decisión
Pendiente de la prueba técnica E09-01.

## Consecuencias
—

| Se revisa si | Relacionados |
|---|---|
| — | packages/shared/src/dominio/fixture.ts |
