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
- Demo pública (ADR-019): `/demo` crea la sandbox del visitante; `NEXT_PUBLIC_DEMO_MODE` muestra el banner y pone `noindex`; las direcciones de los dos entornos salen de `src/lib/entornos.ts`. Con `pnpm demo --publica` corre el entorno de demo y su E2E es `pnpm --filter @potrero/web test:e2e:publica`.
- E2E: `e2e/demo.spec.ts` (Playwright con el Chrome instalado). `CAPTURAS=<carpeta>` guarda capturas.
- Acta sin conexión (ADR-020): `ActaDigital` es "primero offline". Cada toque va a la cola (`src/lib/acta-offline.ts`, IndexedDB) y se ve al instante con `vistaLocal` (de `@potrero/shared`); `src/lib/acta-sync.ts` la envía. El service worker `public/sw.js` guarda solo la pantalla del acta y `/_next/static`, **nunca respuestas de la API**. Para probar sin conexión usar la compilación de producción (`pnpm build` + `next start`): en `next dev` la página no se hidrata sin el servidor.
