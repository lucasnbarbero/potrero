/** Colores pastel del mock para el logo con iniciales. El color sale del nombre: es el mismo en el panel y en el sitio. */
const COLORES = [
  'bg-amber-100 text-amber-800',
  'bg-sky-100 text-sky-800',
  'bg-rose-100 text-rose-800',
  'bg-emerald-100 text-emerald-800',
  'bg-violet-100 text-violet-800',
];

function colorDe(nombre: string) {
  let h = 0;
  for (const c of nombre) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORES[h % COLORES.length]!;
}

/** Logo del sponsor; si no cargó uno, sus iniciales sobre un color pastel. */
export function LogoSponsor({
  nombre,
  iniciales,
  logoUrl,
  className = 'size-12 text-lg',
}: {
  nombre: string;
  iniciales: string;
  logoUrl: string | null;
  className?: string;
}) {
  if (logoUrl)
    return (
      <img
        src={logoUrl}
        alt={nombre}
        className={`${className} shrink-0 rounded-2xl bg-white object-contain`}
      />
    );
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-2xl font-bold ${colorDe(nombre)} ${className}`}
    >
      {iniciales}
    </span>
  );
}
