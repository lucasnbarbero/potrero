# ADR-023 · Libro de caja de partida doble, inmutable y con asientos automáticos

| Estado | Fecha | Decide |
|---|---|---|
| Aceptada | 2026-10-23 | Tech lead |

## Contexto
La caja del torneo (documento 1, módulo 14) tiene que decirle al organizador cuánto entró, cuánto debe pagar y cuánto le queda, y tiene que poder auditarse: la plata es lo más sensible del producto. Ya existen cobros (`Pago`) y comisiones, pero faltan los egresos, los retiros y los gastos que nacen del acta (árbitro y cancha).

## Opciones evaluadas
| Opción | A favor | En contra | Costo |
|---|---|---|---|
| Sumar y restar sobre los pagos y una tabla de gastos | Simple | Sin una sola fuente de verdad: los saldos se recalculan de varias tablas; difícil auditar y corregir | Bajo |
| Libro de partida doble (asientos con líneas de debe y haber) | Una fuente de verdad; todo cierra en cero; saldos y resultado salen del mismo lugar | Más conceptos; hay que armar los asientos | Medio |
| Libro mutable con edición | Corregir es fácil | Pierde la trazabilidad | Bajo, pero no se acepta |

## Decisión
Libro de partida doble (`Asiento` + `LineaAsiento`). Las reglas puras viven en `packages/shared/src/dominio/caja.ts`:
- Cuentas de plata (`MP`, `EFECTIVO`, `BANCO`), de ingresos (`INGRESOS:*`), de egresos (`EGRESOS:*`) y la comisión de la plataforma. Saldo = debe − haber.
- **Inmutable:** un trigger de la base rechaza editar o borrar asientos y líneas. Una corrección es otro asiento que revierte al original (`revierteAId`, una sola vez). La única excepción es la limpieza de una sandbox de demo (ADR-019), que lo declara en su transacción.
- **Automático e idempotente:** cada pago aprobado genera su asiento de cobro y, si es de Mercado Pago, el de la comisión (`clave: pago:<id>`). Al abrir la caja se asientan los pagos anteriores que faltaran. Al cerrar un acta, y si el organizador lo enciende, se asienta el pago al árbitro (en efectivo) y el alquiler de la cancha (por transferencia).
- Los ingresos del resultado son los cobrados (base caja); "por cobrar" sale de los cargos pendientes. Un retiro de Mercado Pago al banco mueve plata de lugar y no toca el resultado.
- Solo el dueño retira. Falta la verificación en dos pasos obligatoria (E04-11).

## Consecuencias
- Saldos, resultado, egresos por rubro y exportación salen de las mismas líneas; el libro siempre suma cero y hay una prueba que lo verifica.
- Los reembolsos (E06-12) y las multas (E14-05) se asientan con el mismo mecanismo cuando existan.
- Una tabla nueva de la organización que guarde plata tiene que pasar por el libro, no por su cuenta.
- Pendiente: comprobantes como archivos (E02-14) y exportación a PDF.

| Se revisa si | Relacionados |
|---|---|
| Aparecen retiros automáticos con Mercado Pago real, impuestos que haya que asentar, o la contadora pide otro plan de cuentas. | ADR-004, ADR-007, ADR-013, ADR-019 |
