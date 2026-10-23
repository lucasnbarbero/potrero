import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { config } from './config.js';

const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn', 'log'] });
app.setGlobalPrefix('api');
if (config.PROXIES_CONFIABLES > 0)
  app.getHttpAdapter().getInstance().set('trust proxy', config.PROXIES_CONFIABLES);
// Los documentos de identidad se suben en base64 dentro del JSON (hasta 2 MB de archivo): el tope por defecto es muy chico.
app.useBodyParser('json', { limit: '6mb' });
app.use(cookieParser());
app.enableShutdownHooks();
await app.listen(config.PORT);
console.log(`API de Potrero en http://localhost:${config.PORT}/api`);
