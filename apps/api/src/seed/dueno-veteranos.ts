// Veteranos del Oeste tiene su propio dueño (F19): demo@ queda como administradora, como en una liga ajena real.
import argon2 from 'argon2';
import type { Resolver } from '../demo/plantilla.js';
import { DbService } from '../db/db.service.js';

export const DUENO_VETERANOS = {
  email: 'veteranos@potrero.app',
  nombre: 'Héctor Sosa',
};

export async function cargarDuenoDeVeteranos(app: Resolver, password: string) {
  const db = app.get(DbService);
  const org = await db.app.organizacion.findUniqueOrThrow({ where: { slug: 'veteranos-del-oeste' } });
  await db.app.usuario.create({
    data: {
      ...DUENO_VETERANOS,
      passwordHash: await argon2.hash(password),
      emailVerificadoEn: new Date(),
      membresias: { create: { organizacionId: org.id, rol: 'DUENO' } },
    },
  });
}
