// Verifica que docs, mocks y la app no tengan cifras viejas y que el código use docs/datos.json.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const datos = JSON.parse(readFileSync(join(raiz, 'docs/datos.json'), 'utf8'));
const carpetas = ['docs/src', 'mocks', 'apps/web/src', 'apps/api/src', 'packages'];
const ignorar = /node_modules|dist|\.next|generated|_obsoletos|assets[\\/]tw\.css|datos\.ts$/;
const extensiones = /\.(html|[jt]sx?|mjs|css|md)$/;
const errores = [];

function recorrer(dir) {
  let entradas;
  try {
    entradas = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entradas) {
    const p = join(dir, e);
    if (ignorar.test(p)) continue;
    if (statSync(p).isDirectory()) recorrer(p);
    else if (extensiones.test(p)) revisar(p);
  }
}
function revisar(p) {
  const texto = readFileSync(p, 'utf8');
  texto.split('\n').forEach((linea, i) => {
    for (const t of datos.terminosProhibidos)
      if (linea.includes(t)) errores.push(`${relative(raiz, p)}:${i + 1}  término desactualizado: "${t}"`);
  });
}
carpetas.forEach((c) => recorrer(join(raiz, c)));

// El código compartido tiene que estar generado desde la versión actual de datos.json.
try {
  const generado = readFileSync(join(raiz, 'packages/shared/src/datos.ts'), 'utf8');
  const { $comentario, terminosProhibidos, ...resto } = datos;
  if (!generado.includes(JSON.stringify(resto, null, 2)))
    errores.push('packages/shared/src/datos.ts está desactualizado: correr `pnpm datos`');
} catch {
  errores.push('Falta packages/shared/src/datos.ts: correr `pnpm datos`');
}

if (errores.length) {
  console.error(`Alineación: ${errores.length} problema(s)\n` + errores.join('\n'));
  process.exit(1);
}
console.log('Alineación OK: docs, mocks y código usan las cifras vigentes.');
