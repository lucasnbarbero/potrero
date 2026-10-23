# Potrero

Sistema para organizar ligas y torneos de fútbol amateur: cobros con Mercado Pago, fixture automático, acta digital, sanciones y sitio público del torneo. **Un producto de [Gregal Tech](https://gregal.tech).** "Potrero" es un nombre provisorio.

## Empezar

Requisitos: Node 24, pnpm 12, Docker Desktop.

```bash
pnpm install
pnpm demo
```

`pnpm demo` levanta PostgreSQL en Docker, aplica las migraciones, carga los datos de demo y arranca la API (http://localhost:4000) y la web (http://localhost:3000). Ingresá con **demo@potrero.app** / **potrero-demo-2026**. Cómo mostrarla: [docs/guia-demo.md](docs/guia-demo.md).

## Estructura

| Carpeta | Contenido |
|---|---|
| `apps/api` | API NestJS 12 + Prisma 7 + PostgreSQL con Row Level Security |
| `apps/web` | Web Next.js 16 + Tailwind 4: landing, panel del organizador, acta, sitio público |
| `packages/shared` | Reglas de negocio (tabla, fixture, sanciones, cobros) y validaciones |
| `packages/ui` | Sistema de diseño, íconos y marca |
| `docs` | Documentos 1–6, [backlog](docs/backlog.md), [decisiones (ADR)](docs/adr/README.md), [contexto](docs/contexto) |
| `mocks` | Diseño de referencia de las 20 pantallas y la landing |
| `infra` | Servicios locales (Docker Compose) |

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm demo` | Todo listo para usar o mostrar |
| `pnpm test` | Tests de reglas de negocio e integración de la API |
| `pnpm --filter @potrero/web test:e2e` | Recorrido de punta a punta en Chrome (con la demo corriendo) |
| `pnpm typecheck` · `pnpm lint` | Tipos y lint |
| `pnpm check:alineacion` | Verifica que docs, mocks y código usen las cifras de `docs/datos.json` |
| `pnpm docs:pdf` | Regenera los PDF de la documentación |
| `pnpm db:reset` | Borra la base de desarrollo y recarga la demo |

Convenciones de trabajo: [docs/convenciones.md](docs/convenciones.md).
