'use client';
import { Icono } from '@potrero/ui';

export function Imprimir() {
  return (
    <button type="button" className="btn-glass btn-sm" onClick={() => window.print()}>
      <Icono nombre="file" />
      Imprimir o guardar PDF
    </button>
  );
}
