-- Anular un pago manual mal cargado (efectivo o transferencia): queda ANULADO y su cobro se revierte en la caja.
ALTER TYPE "EstadoPago" ADD VALUE 'ANULADO';
