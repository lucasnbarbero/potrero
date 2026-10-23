# Web (Next.js 16 + Tailwind 4)

Leé también `AGENTS.md` (lo genera Next): esta versión de Next tiene cambios grandes. Ante una duda de API, consultá `node_modules/next/dist/docs/`.

- Rutas: `/` landing · `/ingresar`, `/registro` · `/panel/**` (organizador, protegido por `src/proxy.ts`) · `/t/[org]/[torneo]` sitio público · `/pago/[pref]` checkout simulado.
- `params` y `searchParams` son promesas (`await params`). Tipos: `PageProps<'/ruta/[id]'>` (correr `next typegen`).
- Datos en servidor: `apiServidor` (privado, sin caché) y `apiPublica` (revalida cada 10 s) en `src/lib/api.ts`. En cliente: `api()` de `src/lib/cliente.ts` (renueva la sesión sola) y después `router.refresh()`.
- `/api/*` se reenvía a la API (mismo origen, cookies httpOnly). No llamar a la API por otra URL desde el navegador.
- Diseño: clases del sistema de los mocks (`tile`, `tile-ink`, `tile-volt`, `btn`, `btn-volt`, `pill-*`, `eyebrow`, `input`, `th`/`td`...) definidas en `packages/ui/src/tema.css`. Íconos: `<Icono nombre="..."/>`. Antes de una pantalla nueva, mirá su mock en `mocks/NN-*.html`. Skill: `pantalla-web`.
- Formularios: `useEnvio`, `Campo`, `Selector`, `MensajeError` (`src/componentes/formulario.tsx`).
- Formatos: `pesos`, `fechaCorta`, `hora` (24 h, zona de Buenos Aires) en `src/lib/formato.ts`.
- Textos con voseo. Precios: siempre desde `DATOS` de `@potrero/shared`, nunca escritos a mano.
- E2E: `e2e/demo.spec.ts` (Playwright con el Chrome instalado). `CAPTURAS=<carpeta>` guarda capturas.
