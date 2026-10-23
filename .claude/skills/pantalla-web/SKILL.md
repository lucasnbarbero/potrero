---
name: pantalla-web
description: Cómo construir una pantalla de la web de Potrero (Next.js 16) a partir de su mock, con el sistema de diseño, datos de la API y verificación en el navegador.
---

# Nueva pantalla web

Seguí `apps/web/CLAUDE.md`.

1. **Mock**: abrí el mock que corresponde (`mocks/NN-*.html`, índice en `mocks/index.html`). Leé solo el bloque de la sección que vas a hacer. Respetá jerarquía, textos con voseo y clases (`tile`, `btn-volt`, `pill-*`, `eyebrow`, `th`/`td`, etc.).
2. **Datos**: página como componente de servidor con `apiServidor` (o `apiPublica` en páginas públicas). Las acciones van en un componente de cliente (`'use client'`) con `api()` + `useEnvio` + `router.refresh()`.
3. **Rutas**: `src/app/...`. Panel bajo `/panel` (protegido por `proxy.ts`). `params` es una promesa. Corré `npx next typegen` si usás `PageProps<'/ruta'>`.
4. **Componentes comunes**: `Encabezado`, `Escudo`, `Estado`, `Vacio` (`src/componentes/ui.tsx`); `Campo`, `Selector`, `MensajeError` (`formulario.tsx`). Íconos con `<Icono nombre>`; si falta uno, agregalo en `packages/ui/src/trazos.ts`.
5. **Precios y cifras**: desde `DATOS` de `@potrero/shared`.
6. **Responsive y accesibilidad**: probá 390 px de ancho; botones táctiles grandes en pantallas de cancha; etiquetas en todos los campos.
7. **Verificación**: `npx tsc --noEmit` en `apps/web`; agregá o ajustá el recorrido en `e2e/demo.spec.ts`; corré `CAPTURAS=<scratchpad> pnpm test:e2e` y mirá las capturas antes de dar la pantalla por terminada.
8. Si la pantalla estaba en "Próximamente" de `BarraLateral.tsx`, movela al menú.
