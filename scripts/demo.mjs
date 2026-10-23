// Levanta la demo completa con un solo comando: `pnpm demo`.
// 1) PostgreSQL en Docker  2) .env si falta  3) migraciones  4) datos de demo si la base está vacía  5) API + web.
// `pnpm demo --publica` levanta el entorno de la demo pública (ADR-019): DEMO_MODE, una sandbox por visitante
// y una base aparte (potrero_demo_publica), así no se mezcla con los datos de desarrollo.
import { execSync, spawn } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const publica = process.argv.includes('--publica');
const admin = 'postgresql://potrero_admin:potrero_admin@localhost:55432';
const entorno = publica
  ? {
      DEMO_MODE: 'true',
      NEXT_PUBLIC_DEMO_MODE: 'true',
      PROXIES_CONFIABLES: '1',
      // En local se prueba y se corren E2E desde una sola IP: el tope por hora de producción estorbaría.
      DEMO_MAX_POR_IP_HORA: '1000',
      DEMO_MAX_SANDBOXES: '1000',
      DATABASE_URL: 'postgresql://potrero_app:potrero_app@localhost:55432/potrero_demo_publica',
      DATABASE_URL_ADMIN: `${admin}/potrero_demo_publica`,
    }
  : {};
Object.assign(process.env, entorno);
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

if (publica) {
  paso('Base de la demo pública');
  const psql = (base, sql) =>
    execSync(
      `docker compose -f infra/docker-compose.yml exec -T postgres psql -U potrero_admin -d ${base} -c "${sql}"`,
      {
        cwd: raiz,
        stdio: 'inherit',
      },
    );
  try {
    psql('potrero', 'CREATE DATABASE potrero_demo_publica OWNER potrero_admin');
  } catch {
    console.log('  la base potrero_demo_publica ya existe');
  }
  for (const q of [
    'GRANT CONNECT ON DATABASE potrero_demo_publica TO potrero_app',
    'GRANT USAGE ON SCHEMA public TO potrero_app',
    'ALTER DEFAULT PRIVILEGES FOR ROLE potrero_admin IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO potrero_app',
  ])
    psql('potrero_demo_publica', q);
}

paso('Compilación y migraciones');
correr('pnpm --filter @potrero/shared build');
correr('pnpm --filter @potrero/api build');
correr('npx prisma migrate deploy', `${raiz}/apps/api`);

if (!publica) {
  paso('Datos de demo');
  correr('node dist/seed/seed.js', `${raiz}/apps/api`);
}

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
