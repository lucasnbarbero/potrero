// Prepara la base de tests (potrero_test, o POTRERO_TEST_DB): la crea si no existe y aplica las migraciones.
// Es una base aparte: los tests nunca tocan la base de desarrollo.
import { execSync } from 'node:child_process';
import pg from 'pg';

const base = process.env.POTRERO_TEST_DB ?? 'potrero_test';
const admin = 'postgresql://potrero_admin:potrero_admin@localhost:55432';
const c = new pg.Client({ connectionString: `${admin}/potrero` });
await c.connect();
const existe = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [base]);
if (!existe.rowCount) await c.query(`CREATE DATABASE "${base}" OWNER potrero_admin`);
await c.end();
const t = new pg.Client({ connectionString: `${admin}/${base}` });
await t.connect();
await t.query(`GRANT CONNECT ON DATABASE "${base}" TO potrero_app`);
await t.query('GRANT USAGE ON SCHEMA public TO potrero_app');
await t.query(
  'ALTER DEFAULT PRIVILEGES FOR ROLE potrero_admin IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO potrero_app',
);
await t.end();
execSync('npx prisma migrate deploy', {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL_ADMIN: `${admin}/${base}` },
});
