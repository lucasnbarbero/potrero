---
name: modulo-api
description: Cómo agregar o extender un módulo de dominio en la API de Potrero (NestJS 12 + Prisma 7 con RLS), con permisos, auditoría y tests de integración.
---

# Nuevo módulo o endpoint de la API

Seguí `apps/api/CLAUDE.md`. Patrón de referencia: `apps/api/src/equipos/equipos.ts` (simple) y `apps/api/src/cobros/cobros.ts` (dinero, webhooks).

1. **Esquema**: modelos nuevos en `apps/api/prisma/schema.prisma` con `organizacionId` y `@map` snake_case. Migración: `npx prisma migrate dev --name <nombre>`. Si la tabla es de una organización, creá otra migración `--create-only` que agregue `ENABLE ROW LEVEL SECURITY` y la política `aislamiento_organizacion` (copiá el patrón de `*_rls/migration.sql`). `npx prisma generate`.
2. **Validación**: esquema Zod en `packages/shared/src/esquemas.ts` (mensajes en español) → `pnpm --filter @potrero/shared build`.
3. **Servicio + controlador + módulo** en `src/<dominio>/<dominio>.ts`. Cada método: `this.db.enOrg(c.organizacionId, async (tx) => ...)`; varias consultas en `tx` → `enSerie`. Errores: `ErrorNegocio` / `noEncontrado`. Dinero o resultados → `auditar(...)`.
4. **Permisos**: `@Permiso('x.y')`; si es nuevo, agregalo en `src/comun/permisos.ts` a los roles que correspondan (documento 1, sección 2).
5. Registrá el módulo en `src/app.module.ts`.
6. **Tests**: agregá casos en `test/integracion.test.ts` (camino feliz, validación, permisos, y que otra organización no ve los datos). `pnpm --filter @potrero/api test`.
7. Si la web lo consume, sumá el tipo en `apps/web/src/lib/tipos.ts`.
8. Marcá la tarea en `docs/backlog.md` y actualizá `docs/contexto/estado-actual.md`.
