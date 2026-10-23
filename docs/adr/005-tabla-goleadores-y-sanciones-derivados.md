# ADR-005 · Tabla, goleadores y sanciones derivados

| Estado | Fecha | Decide |
|---|---|---|
| Aceptada | 2026-10-22 | Tech lead |

## Contexto
La tabla editada a mano genera reclamos y errores.

## Opciones evaluadas
| Opción | A favor | En contra | Costo |
|---|---|---|---|
| Tabla guardada y editable | Lectura rápida | Se desincroniza; reclamos | Bajo |
| Derivada de los partidos cerrados | Siempre correcta y auditable | Cálculo en cada lectura | Bajo |

## Decisión
La tabla y los goleadores se calculan desde los partidos cerrados con funciones puras de @potrero/shared. Las sanciones se generan al cerrar el acta y su cumplimiento se deriva de los partidos jugados después.

## Consecuencias
Hoy se calcula en cada lectura. Cuando haga falta (picos del fin de semana), se cachea con un job al cerrar el acta, sin cambiar la regla.

| Se revisa si | Relacionados |
|---|---|
| Las pruebas de carga (E30-04) muestran que el cálculo en línea no alcanza. | packages/shared/src/dominio |
