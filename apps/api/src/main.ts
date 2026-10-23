import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { config } from './config.js';

const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
app.setGlobalPrefix('api');
app.use(cookieParser());
app.enableShutdownHooks();
await app.listen(config.PORT);
console.log(`API de Potrero en http://localhost:${config.PORT}/api`);
