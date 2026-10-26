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
- Tests: `test/<dominio>.test.ts` (uno por módulo) contra la API compilada y la base `potrero_test` (`pnpm test`; `POTRERO_TEST_DB` para usar otra base).
- Semilla de demo: `src/seed/seed.ts` usa los servicios reales y carga la organización principal con `cargarPlantilla` (`src/demo/plantilla.ts`), la misma plantilla de las sandboxes.
- Demo pública (ADR-019): `src/demo/demo.ts` solo se carga con `DEMO_MODE=true`. Las tablas con `organizacion_id` no tienen clave foránea a `organizacion`: **una tabla nueva de una organización se suma a `TABLAS_DE_ORGANIZACION`** o el borrado de sandboxes la deja con datos (lo detecta `test/demo.test.ts`). Los tokens llevan el entorno que los emitió (`ent`).
- Llaves (ADR-021): la lógica está en `packages/shared/src/dominio/llaves.ts`; `src/torneos/llaves.ts` solo guarda y crea los cruces cuando se conocen sus equipos (`avanzarLlave`, que se llama al cerrar un partido de llave).
- Caja (ADR-023): **todo movimiento de plata pasa por el libro** (`caja/libro.ts`: `crearAsiento`, `registrarPago`), nunca por una tabla propia. La base rechaza editar o borrar asientos; se corrige con un asiento que revierte. Las funciones de caja son puras en `packages/shared/src/dominio/caja.ts`.
- Tribunal (`src/tribunal`): `abrirPorRoja` y `abrirPorNoHabilitado` se llaman desde el acta; resolver modifica la sanción o crea una `TRIBUNAL` y la multa es un `Cargo` de categoría MULTAS (entra a la caja al cobrarse por `registrarPago`). Reglas puras en `shared/dominio/tribunal.ts`.
- Documentación (ADR-025): los datos personales sensibles se cifran con `documentacion/seguridad.ts` (`cifrar`, `hashDeDni`), los archivos van por `AlmacenArchivos` y se entregan con link firmado; leer el DNI completo se audita. La habilitación (`habilitacionDelJugador`) vive en `shared/dominio/documentacion.ts` y el acta la consulta con `motivosDeNoHabilitacion`.
- Mensajería (ADR-022): reglas puras en `packages/shared/src/dominio/mensajeria.ts`; `src/mensajeria` despacha por `CanalDespacho` (hoy simulado) y guarda cada `Mensaje`. Cualquier aviso nuevo pasa por `MensajeriaService.emitir` con una `clave` si es automático (idempotente). Contingencias (`src/contingencias`) usa `proponerReprogramacion` de `reprogramacion.ts`.
- Acta (ADR-020): el evento a anular se indica por id o por `clientUuid`; las escrituras del acta aceptan `dispositivoId` y se rechazan si otro dispositivo es el dueño.
