# Convenciones de trabajo

## Ramas y commits
- `main` siempre funciona. Trabajo en ramas `tipo/ID-descripcion` (por ejemplo `feat/E06-04-mercado-pago-oauth`).
- Commits en español, en imperativo, con el ID del backlog: `feat(cobros): conectar Mercado Pago por OAuth [E06-04]`. Tipos: feat, fix, refactor, test, docs, chore.
- Un merge request por tarea o grupo chico de tareas de la misma épica.

## Definición de terminado
1. Hace lo que dice el criterio de la tarea en `docs/backlog.md` y en el documento 1.
2. Reglas de negocio con tests en `packages/shared`; endpoints con tests de integración (incluido el aislamiento entre organizaciones).
3. Pantallas verificadas en el navegador, en escritorio y en 390 px de ancho; recorrido E2E actualizado si corresponde.
4. `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm check:alineacion` en verde.
5. Tarea marcada `[x]` en el backlog; `docs/contexto/estado-actual.md` actualizado si cambia lo que el producto hace.
6. Si hubo una decisión, ADR escrito (skill `adr`).

## Revisión de código
Correctitud y reglas de negocio primero; después seguridad (RLS, permisos, datos personales), luego legibilidad. Dinero, actas y datos personales requieren revisión siempre.

## Base de datos
- Migraciones con Prisma, versionadas y revisadas; nunca se editan migraciones ya aplicadas.
- Tabla nueva de una organización = política RLS en la misma entrega.
- Nunca datos reales fuera de producción.

## Documentación
Se edita en el repo (`docs/src`) y se publica en Drive (skill `docs-publicar`). Las cifras viven en `docs/datos.json`.
