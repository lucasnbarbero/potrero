import { Icono } from './Icono';

/** Logo de Potrero (nombre provisorio). */
export function Logo({ conTexto = true, className = '' }: { conTexto?: boolean; className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 text-lg font-bold tracking-tight ${className}`}>
      <span className="grid size-9 place-items-center rounded-2xl bg-volt text-lg text-ink">
        <Icono nombre="ball" />
      </span>
      {conTexto && 'Potrero'}
    </span>
  );
}

/** Endoso de Gregal Tech: "Un producto de gregal.tech". */
export function ProductoDeGregal({
  oscuro = false,
  className = '',
}: {
  oscuro?: boolean;
  className?: string;
}) {
  return (
    <a
      href="https://gregal.tech"
      className={`flex items-center gap-2 text-xs ${oscuro ? 'text-white/60' : 'text-mute'} ${className}`}
    >
      Un producto de
      <img
        src={oscuro ? '/gregal-oscuro.svg' : '/gregal-claro.svg'}
        alt="Gregal Tech"
        className="h-5 w-auto"
      />
    </a>
  );
}
