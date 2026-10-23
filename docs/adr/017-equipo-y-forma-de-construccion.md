# ADR-017 · Equipo y forma de construcción

| Estado | Fecha | Decide |
|---|---|---|
| Aceptada | 2026-10-22 | Dirección |

## Contexto
Los plazos del documento 1 suponen 3–4 personas de ingeniería.

## Opciones evaluadas
| Opción | A favor | En contra | Costo |
|---|---|---|---|
| Equipo del documento 1 | Plazos documentados | Costo | Alto |
| Desarrollo asistido por Claude Code, dirigido por Gregal | Menor costo | Los plazos del documento 1 no aplican tal cual | Bajo |

## Decisión
Por ahora la implementación completa (frontend y backend) la hace Claude Code, guiado por el backlog y este repositorio. Se revisan los plazos del documento 5 cuando se defina el equipo definitivo.

## Consecuencias
El contexto vive en CLAUDE.md, docs/contexto y las skills de .claude/skills para que cada sesión arranque rápido.

| Se revisa si | Relacionados |
|---|---|
| Se incorpora gente al equipo. | CLAUDE.md |
