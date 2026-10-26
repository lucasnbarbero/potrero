# ADR-009 · Fuente única de cifras (docs/datos.json)

| Estado | Fecha | Decide |
|---|---|---|
| Aceptada | 2026-10-22 | Producto |

## Contexto
Los precios quedaron desalineados entre documentos, mocks y landing.

## Opciones evaluadas
| Opción | A favor | En contra | Costo |
|---|---|---|---|
| Revisión manual | Sin herramientas | Ya falló | Bajo |
| Archivo único + chequeo automático | Detecta cifras viejas | Hay que mantener la lista de términos | Bajo |

## Decisión
docs/datos.json tiene precios de los planes, cargo por servicio, metas y reglamento por defecto. `pnpm datos` genera packages/shared/src/datos.ts; `pnpm check:alineacion` busca términos desactualizados en docs, mocks y código.

## Consecuencias
Un cambio de precio es: editar datos.json, `pnpm datos`, actualizar los HTML de docs, `pnpm check:alineacion`, `pnpm docs:pdf`.

| Se revisa si | Relacionados |
|---|---|
| — | scripts/ |
