# ADR-006 · Reglamento en datos y versionado

| Estado | Fecha | Decide |
|---|---|---|
| Aceptada | 2026-10-22 | Producto |

## Contexto
Cada liga tiene sus reglas (puntos, desempates, tarjetas, W.O.).

## Opciones evaluadas
| Opción | A favor | En contra | Costo |
|---|---|---|---|
| Reglas en el código | Rápido | Una liga distinta obliga a cambiar código | Bajo |
| Reglamento como datos | Configurable por torneo | Hay que versionarlo | Bajo |

## Decisión
Modelo Reglamento con versión; cada torneo apunta a uno. Valores por defecto en docs/datos.json.

## Consecuencias
—

| Se revisa si | Relacionados |
|---|---|
| — | ADR-009 |
