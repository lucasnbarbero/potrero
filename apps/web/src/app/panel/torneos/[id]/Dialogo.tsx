'use client';
import { Icono } from '@potrero/ui';
import { createPortal } from 'react-dom';

/** Ventana sobre la página para un formulario corto. Va en un portal: un ancestro animado (transform) desarmaría el fixed. */
export function Dialogo({
  titulo,
  cerrar,
  children,
}: {
  titulo: string;
  cerrar: () => void;
  children: React.ReactNode;
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      onClick={cerrar}
    >
      <div
        className="tile max-h-[90vh] w-full max-w-lg overflow-y-auto !bg-paper text-left hover:!translate-y-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <b className="text-xl tracking-tight">{titulo}</b>
          <button type="button" onClick={cerrar} className="btn-glass btn-sm" aria-label="Cerrar">
            <Icono nombre="x" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Hoy en Buenos Aires (AAAA-MM-DD), para el valor por defecto de los campos de fecha. */
export const hoyEnArgentina = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
