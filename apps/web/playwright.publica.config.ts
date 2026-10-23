import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// E2E de la demo pública (ADR-019). Requiere el entorno levantado con `pnpm demo --publica`.
// En modo desarrollo, la primera vez que se abre cada pantalla Next la compila: 60 s en vez de los 30 s por defecto.
export default defineConfig({ ...base, timeout: 60_000, testIgnore: undefined, testMatch: /demo-publica/ });
