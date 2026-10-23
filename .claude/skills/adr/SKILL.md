---
name: adr
description: Registrar una decisión técnica o de producto de Potrero como ADR con el formato de la plantilla GT-D2 de Gregal, o cerrar un ADR abierto.
---

# Registrar una decisión (ADR)

1. Mirá `docs/adr/README.md`: si ya existe un ADR del tema (por ejemplo, uno abierto entre 011 y 016), actualizalo en lugar de crear otro.
2. Archivo nuevo: `docs/adr/NNN-titulo-en-kebab.md` con el número siguiente. Estructura obligatoria (GT-D2):
   - `# ADR-NNN · Título`
   - tabla `| Estado | Fecha | Decide |` (Estado: Propuesta (abierta), Aceptada, Reemplazada por ADR-XXX)
   - `## Contexto` · `## Opciones evaluadas` (tabla `| Opción | A favor | En contra | Costo |`) · `## Decisión` · `## Consecuencias`
   - tabla `| Se revisa si | Relacionados |`
3. Agregá la fila en `docs/adr/README.md`.
4. Si la decisión cambia algo de los documentos 1–6 o de `docs/datos.json`, actualizalos y corré `pnpm check:alineacion`.
5. Si cierra una decisión abierta citada en `CLAUDE.md` o en el backlog, actualizá esas referencias.
