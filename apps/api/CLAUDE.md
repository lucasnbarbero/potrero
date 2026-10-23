# API (NestJS 12 + Prisma 7)

- ESM: los imports relativos llevan `.js`. Se compila con `tsc` (decoradores con metadatos); no usar tsx/esbuild.
- Un archivo por dominio en `src/<dominio>/<dominio>.ts` con servicio, controlador y módulo. Registrar el módulo en `app.module.ts`. Skill: `modulo-api`.
- **Datos de una organización: siempre `db.enOrg(c.organizacionId, tx => ...)`** (RLS, ADR-003). Dentro de `tx` las consultas van en serie: usar `enSerie([() => ..., () => ...])`, nunca `Promise.all`.
- `db.sistema` saltea RLS: solo para identificar la organización (webhooks) o tareas de sistema. Justificarlo en un comentario.
- Validación: `@Body(new Zod(esquema))` con esquemas de `@potrero/shared`. Errores de negocio: `ErrorNegocio('mensaje para el usuario')`.
- Permisos: `@Permiso('torneo.escribir')` (mapa en `comun/permisos.ts`); rutas sin sesión: `@Publico()`.
- Dinero, resultados y cierres: `auditar(tx, c, accion, entidad, id, { antes, despues })`.
- Reglas de negocio puras van en `packages/shared` (con tests), no en el servicio.
- Esquema: `prisma/schema.prisma`. Tabla nueva de una organización → agregar la política RLS en una migración (`prisma migrate dev --create-only`). Después: `prisma generate`.
- Tests: `test/integracion.test.ts` contra la API compilada y la base `potrero_test` (`pnpm test`).
- Semilla de demo: `src/seed/seed.ts` usa los servicios reales.
