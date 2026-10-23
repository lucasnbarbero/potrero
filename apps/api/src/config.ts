import 'dotenv/config';
import { z } from 'zod';

// Variables de entorno validadas al arrancar: si falta una, la API no levanta y dice cuál.
const esquema = z.object({
  DATABASE_URL: z.url(),
  DATABASE_URL_ADMIN: z.url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET necesita al menos 32 caracteres'),
  PORT: z.coerce.number().int().default(4000),
  WEB_URL: z.url().default('http://localhost:3000'),
  PASARELA_PAGOS: z.enum(['simulada', 'mercadopago']).default('simulada'),
  WEBHOOK_SECRET: z.string().min(16),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

const r = esquema.safeParse(process.env);
if (!r.success) {
  console.error('Configuración inválida. Revisá apps/api/.env (ver .env.example):');
  for (const i of r.error.issues) console.error(`  - ${i.path.join('.')}: ${i.message}`);
  process.exit(1);
}
export const config = r.data;
