# Potrero · un producto de Gregal Tech

Sistema para organizar ligas y torneos de fútbol amateur en Argentina: cobros con Mercado Pago, fixture automático, acta digital, sanciones, sitio público. "Potrero" es nombre provisorio. Marca de Gregal: `C:\dev\gregal\marca`.

## Reglas de trabajo
- Idioma: español rioplatense con voseo en UI, docs, comentarios y commits. Dominio en español, framework en inglés (ADR-008).
- Claude implementa todo (frontend y backend). Guía: `docs/backlog.md` (E00–E37, en orden). Al terminar una tarea, marcala `[x]` con su ID.
- Fuente de verdad: documentos 1–6 en `docs/src/*.html` (los PDF se generan). Si algo contradice esos documentos, se corrige lo otro o se actualiza el documento a propósito.
- Cifras (precios, comisiones, metas, reglamento por defecto): solo en `docs/datos.json`. Después de cambiarlo: `pnpm datos` y `pnpm check:alineacion`.
- Decisiones técnicas: `docs/adr/` (formato GT-D2). Nueva decisión → skill `adr`. Abiertas: 011–016 y 026.
- Repo solo local por ahora (sin remoto). No commitear sin pedido explícito.
- Para contexto de negocio NO leer los HTML/PDF completos: usar `docs/contexto/` (reglas, glosario, estado actual). Modelo de datos: `apps/api/prisma/schema.prisma`.

## Mapa
| Ruta | Qué es |
|---|---|
| `apps/api` | NestJS 12 (ESM) + Prisma 7 + PostgreSQL con RLS. Ver su CLAUDE.md |
| `apps/web` | Next.js 16 + Tailwind 4: landing, panel, acta, sitio público. Ver su CLAUDE.md |
| `packages/shared` | Reglas de negocio puras (tabla, fixture, sanciones, cobros), esquemas Zod, `datos.ts` generado |
| `packages/ui` | Tema (tokens de los mocks), íconos, logo y endoso de Gregal |
| `docs/` | Documentos 1–6, backlog, ADR, contexto. Ver su CLAUDE.md |
| `mocks/` | Diseño de referencia (HTML + Tailwind). La UI real copia este sistema visual |
| `infra/` | Docker Compose (PostgreSQL) e init de roles |
| `scripts/` | `demo.mjs`, `gen-datos.mjs`, `check-alineacion.mjs` |

## Comandos
- `pnpm demo` — levanta todo (Docker, migraciones, datos de demo, API :4000 y web :3000). Usuario: demo@potrero.app / potrero-demo-2026.
- `pnpm demo --publica` — entorno de la demo pública (ADR-019): una sandbox por visitante en `/demo`, base aparte `potrero_demo_publica`. E2E: `pnpm --filter @potrero/web test:e2e:publica`.
- `pnpm test` (dominio + integración API, base `potrero_test`) · `pnpm typecheck` · `pnpm lint` · `pnpm check:alineacion`
- E2E: `pnpm --filter @potrero/web test:e2e` (requiere demo corriendo)
- `pnpm docs:pdf` regenera los PDF de `docs/src`.
- Base de desarrollo: `pnpm db:reset` borra y recarga. Prisma bloquea `migrate reset` si lo corre un agente: pedirle al usuario que lo ejecute o que dé su consentimiento explícito. Para pruebas, usar una base aparte.

## Definición de terminado
Tipos, lint y tests en verde; reglas de negocio con tests en `packages/shared`; endpoints con test de integración; pantalla verificada en el navegador (Playwright); `check:alineacion` OK; backlog actualizado.
