# ADR-002 · Stack técnico

| Estado | Fecha | Decide |
|---|---|---|
| Aceptada | 2026-10-22 | Tech lead |

## Contexto
El documento 1 define Next.js, NestJS, Prisma, PostgreSQL y monorepo con pnpm y Turborepo. Había que fijar versiones al iniciar (octubre 2026).

## Opciones evaluadas
| Opción | A favor | En contra | Costo |
|---|---|---|---|
| Últimas estables | Soporte largo | Cambios grandes: NestJS 12 es solo ESM, Prisma 7 usa adaptador de driver, Next 16 renombra middleware a proxy | Bajo |
| Versiones anteriores | Más ejemplos conocidos | Migración obligada en meses | Medio |

## Decisión
Node 24, pnpm 12, Turborepo 2, TypeScript 6.0 (la 7 todavía no es compatible con typescript-eslint), NestJS 12 (ESM), Prisma 7 con @prisma/adapter-pg, PostgreSQL 17, Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS 4, Zod 4, Vitest 5, Playwright.

## Consecuencias
La API se compila con tsc (NestJS necesita los metadatos de decoradores; esbuild/tsx no los emite). Los imports de la API usan extensión .js; los de packages/ui no llevan extensión (Turbopack).

| Se revisa si | Relacionados |
|---|---|
| Sale TypeScript 7 compatible con el lint, o Prisma corrige el aviso de consultas concurrentes en transacciones (ADR-018). | ADR-018 |
