'use client';
import { Icono } from '@potrero/ui';

/** El reporte es la misma pantalla impresa (o guardada como PDF desde el diálogo del navegador). */
export function Reporte() {
  return (
    <button className="btn-glass btn-sm no-imprimir" onClick={() => window.print()}>
      <Icono nombre="download" />
      Reporte
    </button>
  );
}
