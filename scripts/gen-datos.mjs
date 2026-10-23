// Genera packages/shared/src/datos.ts a partir de docs/datos.json (fuente única de cifras).
import { readFileSync, writeFileSync } from 'node:fs';
const raiz = new URL('..', import.meta.url);
const datos = JSON.parse(readFileSync(new URL('docs/datos.json', raiz), 'utf8'));
delete datos.$comentario;
delete datos.terminosProhibidos;
const ts = `// GENERADO por scripts/gen-datos.mjs desde docs/datos.json. No editar a mano.\nexport const DATOS = ${JSON.stringify(datos, null, 2)} as const;\n`;
writeFileSync(new URL('packages/shared/src/datos.ts', raiz), ts);
console.log('packages/shared/src/datos.ts actualizado');
