// Almacenamiento privado de documentos detrás de una interfaz (E15-02). La implementación local escribe en disco,
// fuera de cualquier carpeta pública; en producción se cambia por un bucket privado sin tocar el resto.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { config } from '../config.js';

export interface AlmacenArchivos {
  guardar(clave: string, contenido: Buffer): Promise<void>;
  leer(clave: string): Promise<Buffer>;
  borrar(clave: string): Promise<void>;
}

export class AlmacenLocal implements AlmacenArchivos {
  private readonly raiz = resolve(config.ALMACEN_DIR);

  /** La clave nunca puede salirse de la carpeta del almacén. */
  private ruta(clave: string) {
    const r = resolve(this.raiz, clave);
    if (!r.startsWith(this.raiz + sep)) throw new Error('Clave de archivo inválida');
    return r;
  }

  async guardar(clave: string, contenido: Buffer) {
    const r = this.ruta(clave);
    await mkdir(dirname(r), { recursive: true });
    await writeFile(r, contenido);
  }

  leer(clave: string) {
    return readFile(this.ruta(clave));
  }

  async borrar(clave: string) {
    await rm(this.ruta(clave), { force: true });
  }
}

export const ALMACEN = Symbol('ALMACEN_DE_ARCHIVOS');
