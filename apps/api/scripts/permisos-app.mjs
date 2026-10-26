// Devuelve al rol de la aplicación (potrero_app) los permisos sobre el esquema public.
// `prisma migrate reset` borra y recrea el esquema, y con eso se pierden el USAGE y los privilegios por defecto
// que infra/postgres/init.sql da una sola vez al crear la base. Sin esto, la semilla falla con
// "permission denied for schema public".
import pg from 'pg';

const url = process.env.DATABASE_URL_ADMIN ?? 'postgresql://potrero_admin:potrero_admin@localhost:55432/potrero';
const c = new pg.Client({ connectionString: url });
await c.connect();
for (const q of [
  'GRANT USAGE ON SCHEMA public TO potrero_app',
  'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO potrero_app',
  'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO potrero_app',
  'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO potrero_app',
  'ALTER DEFAULT PRIVILEGES FOR ROLE potrero_admin IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO potrero_app',
  'ALTER DEFAULT PRIVILEGES FOR ROLE potrero_admin IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO potrero_app',
])
  await c.query(q);
await c.end();
console.log('Permisos de potrero_app restablecidos.');
