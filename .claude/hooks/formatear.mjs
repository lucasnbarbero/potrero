// Hook de Claude Code (PostToolUse en Edit/Write): formatea con Prettier el archivo de código recién editado.
// No toca docs/ ni mocks/. Nunca bloquea: si Prettier falla, sigue.
import { execFileSync } from 'node:child_process';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../..', import.meta.url));
let entrada = '';
for await (const parte of process.stdin) entrada += parte;
const archivo = JSON.parse(entrada || '{}')?.tool_input?.file_path;
if (!archivo) process.exit(0);
const rel = relative(raiz, archivo).replaceAll('\\', '/');
if (
  !/^(apps|packages|scripts)\//.test(rel) ||
  /\/(generated|dist|\.next)\//.test(rel) ||
  rel.endsWith('/datos.ts') ||
  !/\.(ts|tsx|mjs|css|json)$/.test(rel)
)
  process.exit(0);
try {
  execFileSync(
    process.execPath,
    [`${raiz}/node_modules/prettier/bin/prettier.cjs`, '--write', '--log-level', 'silent', archivo],
    { cwd: raiz },
  );
} catch {
  // Sin formato no es un error para el agente.
}
