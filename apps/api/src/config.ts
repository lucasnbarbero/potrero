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
  // Canales de mensajería: "simulada" (desarrollo y demo) o "real" (requiere el BSP de WhatsApp y el proveedor de email).
  MENSAJERIA: z.enum(['simulada', 'real']).default('simulada'),
  WEBHOOK_SECRET: z.string().min(16),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Entorno de demo pública (ADR-019): sandboxes por visitante, sin efectos reales.
  DEMO_MODE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  // Límites de abuso de la demo (E37-05). Los captchas se activan al definir TURNSTILE_SECRET (Cloudflare Turnstile).
  DEMO_MAX_SANDBOXES: z.coerce.number().int().positive().default(200),
  DEMO_MAX_POR_IP_HORA: z.coerce.number().int().positive().default(5),
  TURNSTILE_SECRET: z.string().min(1).optional(),
  // Cantidad de proxies delante de la API (por ejemplo, el servidor de Next): sin esto la IP del visitante no se ve.
  PROXIES_CONFIABLES: z.coerce.number().int().min(0).default(0),
  // Documentación (E15): clave de cifrado de campos sensibles y carpeta del almacenamiento privado local.
  // Sin CLAVE_CIFRADO se deriva de JWT_SECRET (alcanza para demo; en producción definirla aparte).
  CLAVE_CIFRADO: z.string().min(32).optional(),
  ALMACEN_DIR: z.string().default('.almacen'),
});

const r = esquema
  .refine((c) => !c.DEMO_MODE || c.MENSAJERIA === 'simulada', {
    path: ['MENSAJERIA'],
    message: 'con DEMO_MODE=true la mensajería tiene que ser "simulada": la demo nunca le escribe a nadie',
  })
  .refine((c) => !c.DEMO_MODE || c.PASARELA_PAGOS === 'simulada', {
    path: ['PASARELA_PAGOS'],
    message: 'con DEMO_MODE=true la pasarela tiene que ser "simulada": la demo nunca cobra de verdad',
  })
  .safeParse(process.env);
if (!r.success) {
  console.error('Configuración inválida. Revisá apps/api/.env (ver .env.example):');
  for (const i of r.error.issues) console.error(`  - ${i.path.join('.')}: ${i.message}`);
  process.exit(1);
}
export const config = r.data;
