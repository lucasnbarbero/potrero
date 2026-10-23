import { Global, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from '../config.js';
import { PrismaClient, type Prisma } from '../generated/prisma/client.js';

export type Tx = Prisma.TransactionClient;

/**
 * Acceso a la base de datos.
 * - `app`: rol sin privilegios, sujeto a Row Level Security. Es el que usa toda la aplicación.
 * - `sistema`: rol administrador, saltea RLS. Solo para tareas sin organización conocida de antemano
 *   (por ejemplo, identificar a qué organización pertenece una notificación de pago). Usarlo lo mínimo posible.
 */
@Injectable()
export class DbService implements OnModuleDestroy {
  readonly app = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.DATABASE_URL }) });
  readonly sistema = new PrismaClient({
    adapter: new PrismaPg({ connectionString: config.DATABASE_URL_ADMIN }),
  });

  /**
   * Ejecuta `fn` dentro de una transacción con la organización fijada para RLS.
   * Toda lectura o escritura de datos de una organización pasa por acá.
   */
  enOrg<T>(organizacionId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.app.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.organizacion_id', ${organizacionId}, true)`;
      return fn(tx);
    });
  }

  async onModuleDestroy() {
    await Promise.all([this.app.$disconnect(), this.sistema.$disconnect()]);
  }
}

@Global()
@Module({ providers: [DbService], exports: [DbService] })
export class DbModule {}

/**
 * Ejecuta consultas de a una. Dentro de una transacción no se pueden lanzar consultas en paralelo
 * (comparten la misma conexión), así que en lugar de Promise.all se usa esto. Recibe funciones para no arrancarlas antes.
 */
export async function enSerie<T extends readonly (() => Promise<unknown>)[]>(
  fns: readonly [...T],
): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const resultados: unknown[] = [];
  for (const f of fns) resultados.push(await f());
  return resultados as never;
}
