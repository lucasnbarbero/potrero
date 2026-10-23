# ADR-010 · Sesión con cookies httpOnly en el mismo origen

| Estado | Fecha | Decide |
|---|---|---|
| Aceptada | 2026-10-22 | Tech lead |

## Contexto
Hace falta una sesión segura para la web y que los componentes de servidor de Next lean la API.

## Opciones evaluadas
| Opción | A favor | En contra | Costo |
|---|---|---|---|
| Token en localStorage | Simple | Expuesto a XSS | Bajo |
| Cookies httpOnly + reenvío /api en el mismo origen | Sin exposición a JS; sin CORS | Renovación del lado del servidor | Bajo |

## Decisión
Token de acceso JWT de 15 minutos y token de renovación rotativo de 30 días (solo se guarda su hash; reusar uno ya rotado revoca la familia). La web reenvía /api/* a la API (rewrite). proxy.ts renueva la sesión antes de renderizar el panel.

## Consecuencias
Falta: 2FA, enlace mágico y código por WhatsApp (E04).

| Se revisa si | Relacionados |
|---|---|
| — | apps/api/src/auth, apps/web/src/proxy.ts |
