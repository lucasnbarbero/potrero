import { Icono } from '@potrero/ui';
import { colorEquipo, iniciales } from '@/lib/formato';

export function Escudo({ nombre, className = '' }: { nombre: string; className?: string }) {
  return (
    <span className={`crest ${className}`} style={{ '--c': colorEquipo(nombre) } as React.CSSProperties}>
      {iniciales(nombre)}
    </span>
  );
}

export function Encabezado({
  eyebrow,
  titulo,
  children,
}: {
  eyebrow?: string;
  titulo: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rise flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-1 text-4xl font-bold tracking-tighter sm:text-5xl">{titulo}</h1>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function Vacio({
  titulo,
  texto,
  children,
}: {
  titulo: string;
  texto: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="tile grid place-items-center gap-2 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-volt text-xl">
        <Icono nombre="spark" />
      </span>
      <b className="mt-2 text-lg">{titulo}</b>
      <p className="max-w-sm text-sm text-mute">{texto}</p>
      {children}
    </div>
  );
}

const ESTADOS: Record<string, [string, string]> = {
  BORRADOR: ['pill', 'Borrador'],
  INSCRIPCION: ['pill-amber', 'Inscripción abierta'],
  EN_CURSO: ['pill-volt', 'En curso'],
  FINALIZADO: ['pill-ink', 'Finalizado'],
  PENDIENTE: ['pill-amber', 'Pendiente'],
  CONFIRMADA: ['pill-volt', 'Confirmada'],
  PAGADO: ['pill-volt', 'Pagado'],
  ANULADO: ['pill', 'Anulado'],
  PROGRAMADO: ['pill', 'Programado'],
  EN_JUEGO: ['pill-live', 'En juego'],
  SUSPENDIDO: ['pill-red', 'Suspendido'],
  WO: ['pill-red', 'W.O.'],
};

export function Estado({ estado }: { estado: string }) {
  const [clase, texto] = ESTADOS[estado] ?? ['pill', estado];
  return <span className={clase}>{texto}</span>;
}
