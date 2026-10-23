# Documentación

- `src/0N-*.html` son los documentos 1–6 (fuente). Estilos: `base.css` (A4), `slides.css` (presentación), `gregal.css` (endoso y tipografía Geist). Los PDF se generan con `pnpm docs:pdf` (Chrome headless); nunca se editan a mano.
- Todos llevan la marca Gregal: portada con "Un producto de gregal.tech", encabezado y pie por página (A4), colofón final; logo por slide en la presentación.
- `datos.json`: cifras oficiales (ADR-009). `backlog.md`: tareas en orden. `adr/`: decisiones. `contexto/`: resumen compacto para trabajar sin releer los HTML.
- `_obsoletos/` está fuera de git: material viejo, no usar.
- Publicación en Google Drive: skill `docs-publicar` (se edita acá y se sube; no se edita en Drive).
- Al cambiar un documento: mantener coherencia con los otros cinco y correr `pnpm check:alineacion`.
