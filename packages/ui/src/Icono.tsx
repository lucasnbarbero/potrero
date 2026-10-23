import { TRAZOS, type NombreIcono } from './trazos';

/** Ícono de línea del sistema de diseño. Hereda el color del texto; por defecto mide 1.2em. */
export function Icono({ nombre, className = '' }: { nombre: NombreIcono; className?: string }) {
  return (
    <svg
      className={`${/size-/.test(className) ? '' : 'size-[1.2em]'} shrink-0 fill-none stroke-current ${className}`}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: TRAZOS[nombre] }}
    />
  );
}
