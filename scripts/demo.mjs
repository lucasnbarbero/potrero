// Levanta la demo completa con un solo comando: `pnpm demo`.
// 1) PostgreSQL en Docker  2) .env si falta  3) migraciones  4) datos de demo si la base está vacía  5) API + web.
import { execSync, spawn } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const correr = (cmd, cwd = raiz) => execSync(cmd, { cwd, stdio: 'inherit' });
const paso = (t) => console.log(`\n▶ ${t}`);

paso('Base de datos (Docker)');
try {
  execSync('docker info', { stdio: 'ignore' });
} catch {
  console.error('Docker no está corriendo. Abrí Docker Desktop y volvé a ejecutar `pnpm demo`.');
  process.exit(1);
}
correr('docker compose -f infra/docker-compose.yml up -d --wait');

paso('Configuración');
for (const [ejemplo, destino] of [
  ['apps/api/.env.example', 'apps/api/.env'],
  ['apps/web/.env.example', 'apps/web/.env.local'],
]) {
  if (!existsSync(`${raiz}/${destino}`)) {
    copyFileSync(`${raiz}/${ejemplo}`, `${raiz}/${destino}`);
    console.log(`  creado ${destino}`);
  }
}

paso('Compilación y migraciones');
correr('pnpm --filter @potrero/shared build');
correr('pnpm --filter @potrero/api build');
correr('npx prisma migrate deploy', `${raiz}/apps/api`);

paso('Datos de demo');
correr('node dist/seed/seed.js', `${raiz}/apps/api`);

paso('API (http://localhost:4000) y web (http://localhost:3000)');
console.log('  Ingresá con demo@potrero.app / potrero-demo-2026. Ctrl+C para cortar.\n');
const api = spawn('node --enable-source-maps dist/main.js', {
  cwd: `${raiz}/apps/api`,
  stdio: 'inherit',
  shell: true,
});
const web = spawn('pnpm dev', { cwd: `${raiz}/apps/web`, stdio: 'inherit', shell: true });
const cortar = () => {
  api.kill();
  web.kill();
  process.exit(0);
};
process.on('SIGINT', cortar);
process.on('SIGTERM', cortar);
