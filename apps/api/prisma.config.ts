import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Las migraciones corren con el rol administrador; la aplicación usa DATABASE_URL (rol sujeto a RLS).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL_ADMIN'), shadowDatabaseUrl: env('DATABASE_URL_SHADOW') },
});
