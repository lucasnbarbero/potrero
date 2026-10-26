// Todavía no hay proveedor de email: en desarrollo la API devuelve el link que "mandó" y se muestra acá.
// En producción y en la demo pública la API no lo devuelve, así que este recuadro no aparece.
export function LinkDeDesarrollo({ href, texto }: { href: string; texto: string }) {
  const local = href.replace(/^https?:\/\/[^/]+/, '');
  return (
    <div className="rounded-2xl border border-dashed border-black/20 bg-black/5 px-4 py-3 text-xs text-mute">
      <b className="block text-ink">Email simulado (modo desarrollo)</b>
      Sin proveedor de email, el link no sale a ninguna casilla. Abrilo desde acá:
      <a href={local} className="btn-glass btn-sm mt-2 w-full" data-testid="link-dev">
        {texto}
      </a>
    </div>
  );
}
