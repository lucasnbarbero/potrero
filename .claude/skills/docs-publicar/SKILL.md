---
name: docs-publicar
description: Editar los documentos 1–6 de Potrero, regenerar los PDF y publicarlos en la carpeta de Google Drive del proyecto. Usar también para aplicar comentarios hechos en Drive.
---

# Editar y publicar la documentación

Regla: **se edita en el repo y se publica en Drive**. Nunca se edita el PDF en Drive.

1. Editá `docs/src/0N-*.html` (no leas el archivo entero: buscá la sección con Grep). Si tocás cifras, cambiá primero `docs/datos.json` y corré `pnpm datos`.
2. Revisá coherencia con los otros documentos (Grep del término en `docs/src`) y corré `pnpm check:alineacion`.
3. Regenerá: `pnpm docs:pdf` (o `node docs/src/build.mjs 02` para uno solo).
4. Publicá en Drive con `mcp__google-drive__uploadFile` (cargala con ToolSearch). IDs en `docs/drive.json` (carpeta Mi unidad/Desarrollos/Potrero/Documentación, cuenta gregaltech.sf@gmail.com).
   - Archivo existente: `uploadFile` con `fileId` (sube una versión nueva: mismo link, historial conservado). Nunca borres y vuelvas a subir.
   - Archivo nuevo: `uploadFile` con `parentFolderId` de documentación y agregá su id a `docs/drive.json`.
5. Comentarios desde Drive: leelos con `listComments`, aplicalos en el HTML, regenerá, publicá y respondé el comentario (`replyToComment`) diciendo qué se cambió.
6. Contale al usuario qué documentos se publicaron.
