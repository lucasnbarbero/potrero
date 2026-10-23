/** Convierte un nombre en un slug para URLs: "Liga Barrial Sur" → "liga-barrial-sur". */
export function slugificar(texto: string): string {
  return (
    texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'sin-nombre'
  );
}

/** Slug que no está en uso: agrega -2, -3… si hace falta. */
export async function slugUnico(texto: string, existe: (slug: string) => Promise<boolean>): Promise<string> {
  const base = slugificar(texto);
  for (let i = 1; ; i++) {
    const s = i === 1 ? base : `${base}-${i}`;
    if (!(await existe(s))) return s;
  }
}
