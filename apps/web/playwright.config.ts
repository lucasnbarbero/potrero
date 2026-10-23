import { defineConfig, devices } from '@playwright/test';

// E2E de la demo. Requiere la API y la web corriendo (`pnpm dev`) con los datos de demo (`pnpm db:seed`).
// Usa el Chrome instalado en la máquina: no descarga navegadores.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  use: {
    baseURL: process.env.WEB_URL ?? 'http://localhost:3000',
    channel: 'chrome',
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
  },
  projects: [{ name: 'escritorio', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
});
