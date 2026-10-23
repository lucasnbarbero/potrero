// Almacenamiento del acta en el dispositivo (E11-06): última foto del servidor, cola de operaciones sin enviar y
// operaciones que el servidor rechazó. Usa IndexedDB; si el navegador no la deja usar (modo privado, datos
// bloqueados), cae a memoria: el acta sigue funcionando, pero sin sobrevivir a una recarga.
import type { OperacionActa } from '@potrero/shared';
import type { Acta } from './tipos';

export interface Rechazada {
  operacion: OperacionActa;
  motivo: string;
}

export interface AlmacenActa {
  leerSnapshot(partidoId: string): Promise<Acta | null>;
  guardarSnapshot(partidoId: string, acta: Acta): Promise<void>;
  cola(partidoId: string): Promise<OperacionActa[]>;
  encolar(partidoId: string, op: OperacionActa): Promise<void>;
  quitar(opIds: string[]): Promise<void>;
  rechazadas(partidoId: string): Promise<Rechazada[]>;
  rechazar(partidoId: string, r: Rechazada): Promise<void>;
  descartar(opId: string): Promise<void>;
}

const porOrden = (a: OperacionActa, b: OperacionActa) => a.creadoEn - b.creadoEn;

// ───────────── Respaldo en memoria ─────────────

function almacenEnMemoria(): AlmacenActa {
  const snapshots = new Map<string, Acta>();
  const cola = new Map<string, { partidoId: string; op: OperacionActa }>();
  const rechazadas = new Map<string, { partidoId: string } & Rechazada>();
  return {
    async leerSnapshot(id) {
      return snapshots.get(id) ?? null;
    },
    async guardarSnapshot(id, acta) {
      snapshots.set(id, acta);
    },
    async cola(id) {
      return [...cola.values()]
        .filter((x) => x.partidoId === id)
        .map((x) => x.op)
        .sort(porOrden);
    },
    async encolar(id, op) {
      cola.set(op.id, { partidoId: id, op });
    },
    async quitar(ids) {
      ids.forEach((i) => cola.delete(i));
    },
    async rechazadas(id) {
      return [...rechazadas.values()].filter((x) => x.partidoId === id);
    },
    async rechazar(id, r) {
      rechazadas.set(r.operacion.id, { partidoId: id, ...r });
    },
    async descartar(opId) {
      rechazadas.delete(opId);
    },
  };
}

// ───────────── IndexedDB ─────────────

const NOMBRE = 'potrero-acta';

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    const pedido = indexedDB.open(NOMBRE, 1);
    pedido.onupgradeneeded = () => {
      const db = pedido.result;
      db.createObjectStore('snapshots', { keyPath: 'partidoId' });
      db.createObjectStore('cola', { keyPath: 'id' }).createIndex('partidoId', 'partidoId');
      db.createObjectStore('rechazadas', { keyPath: 'id' }).createIndex('partidoId', 'partidoId');
    };
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => rechazar(pedido.error);
  });
}

const promesa = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolver, rechazar) => {
    r.onsuccess = () => resolver(r.result);
    r.onerror = () => rechazar(r.error);
  });

function almacenIndexedDb(db: IDBDatabase): AlmacenActa {
  const tienda = (nombre: string, escribe = false) =>
    db.transaction(nombre, escribe ? 'readwrite' : 'readonly').objectStore(nombre);
  return {
    async leerSnapshot(id) {
      const r = await promesa<{ partidoId: string; acta: Acta } | undefined>(tienda('snapshots').get(id));
      return r?.acta ?? null;
    },
    async guardarSnapshot(id, acta) {
      await promesa(tienda('snapshots', true).put({ partidoId: id, acta }));
    },
    async cola(id) {
      const filas = await promesa<{ op: OperacionActa }[]>(tienda('cola').index('partidoId').getAll(id));
      return filas.map((f) => f.op).sort(porOrden);
    },
    async encolar(id, op) {
      await promesa(tienda('cola', true).put({ id: op.id, partidoId: id, op }));
    },
    async quitar(ids) {
      const t = tienda('cola', true);
      await Promise.all(ids.map((i) => promesa(t.delete(i))));
    },
    async rechazadas(id) {
      const filas = await promesa<{ operacion: OperacionActa; motivo: string }[]>(
        tienda('rechazadas').index('partidoId').getAll(id),
      );
      return filas.map(({ operacion, motivo }) => ({ operacion, motivo }));
    },
    async rechazar(id, r) {
      await promesa(tienda('rechazadas', true).put({ id: r.operacion.id, partidoId: id, ...r }));
    },
    async descartar(opId) {
      await promesa(tienda('rechazadas', true).delete(opId));
    },
  };
}

let almacen: Promise<AlmacenActa> | undefined;

/** El almacén del dispositivo: IndexedDB si se puede, memoria si no. */
export function almacenDelActa(): Promise<AlmacenActa> {
  almacen ??= (async () => {
    try {
      if (typeof indexedDB === 'undefined') return almacenEnMemoria();
      return almacenIndexedDb(await abrir());
    } catch {
      return almacenEnMemoria();
    }
  })();
  return almacen;
}

// ───────────── Identidad del dispositivo y reloj ─────────────

let dispositivoEnMemoria: string | undefined;

/** Identificador estable de este dispositivo: sirve para que un solo celular sea el dueño del acta. */
export function dispositivoId(): string {
  try {
    const guardado = localStorage.getItem('potrero.dispositivo');
    if (guardado) return guardado;
    const nuevo = crypto.randomUUID();
    localStorage.setItem('potrero.dispositivo', nuevo);
    return nuevo;
  } catch {
    return (dispositivoEnMemoria ??= crypto.randomUUID());
  }
}

let ultimo = 0;
/** Marca de tiempo que nunca se repite ni retrocede: ordena la cola aunque dos toques caigan en el mismo milisegundo. */
export function ahora(): number {
  ultimo = Math.max(Date.now(), ultimo + 1);
  return ultimo;
}
