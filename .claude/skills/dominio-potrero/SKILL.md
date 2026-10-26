---
name: dominio-potrero
description: Reglas de negocio de Potrero (tabla, desempates, fixture, acta, sanciones, habilitación, cobros, comisiones, roles). Usar antes de escribir o cambiar lógica de negocio en packages/shared o en la API.
---

# Lógica de negocio de Potrero

1. Leé `docs/contexto/reglas-de-negocio.md` (resumen). Solo si falta un detalle, buscá la sección puntual del documento 1 (`docs/src/01-guia-desarrollo.html`, secciones 5–8) con Grep, sin leer el archivo completo.
2. Las cifras salen de `docs/datos.json` (en código: `DATOS` y `REGLAMENTO_POR_DEFECTO` de `@potrero/shared`). Nunca escribas un precio, porcentaje o umbral a mano.
3. La regla va como **función pura** en `packages/shared/src/dominio/<tema>.ts`, exportada en `src/index.ts`, con tests en `dominio.test.ts` que cubran casos límite (empates, impares, anulaciones, equipos ausentes).
4. La API solo orquesta: carga datos con `enOrg`, llama a la función pura y guarda. No dupliques reglas en servicios ni en la web.
5. Corré `pnpm --filter @potrero/shared test` y, si cambió la API, `pnpm --filter @potrero/api test`.
6. Si la regla cambia lo que dicen los documentos, actualizá también el documento (y `docs/contexto/reglas-de-negocio.md`) o registrá un ADR.
