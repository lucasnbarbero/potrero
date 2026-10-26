import { defineConfig } from 'vitest/config';

// Los tests de integración usan la API compilada (NestJS necesita los metadatos de decoradores que emite tsc)
// y una base de datos propia (potrero_test, o la que indique POTRERO_TEST_DB para correr varias copias en paralelo).
const base = process.env.POTRERO_TEST_DB ?? 'potrero_test';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    env: {
      DATABASE_URL: `postgresql://potrero_app:potrero_app@localhost:55432/${base}`,
      DATABASE_URL_ADMIN: `postgresql://potrero_admin:potrero_admin@localhost:55432/${base}`,
      JWT_SECRET: 'secreto-de-tests-con-mas-de-32-caracteres',
      WEBHOOK_SECRET: 'secreto-webhook-tests',
      WEB_URL: 'http://localhost:3000',
      PASARELA_PAGOS: 'simulada',
      NODE_ENV: 'test',
    },
  },
});
