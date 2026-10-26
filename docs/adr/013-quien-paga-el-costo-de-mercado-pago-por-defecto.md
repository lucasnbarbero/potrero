# ADR-013 · Quién paga el costo de Mercado Pago por defecto

| Estado | Fecha | Decide |
|---|---|---|
| Aceptada | 2026-10-26 | Socios de Gregal |

## Contexto
Cada pago online tiene un costo de procesamiento de Mercado Pago. Hay que definir quién lo paga por defecto, sin que el organizador reciba menos de lo que cobra. El modelo de cobro (ADR-027) suma un cargo por servicio en los pagos online.

## Opciones evaluadas
| Opción | A favor | En contra | Costo |
|---|---|---|---|
| Lo paga quien paga online, dentro del cargo por servicio | El organizador recibe el 100 % del arancel; el costo es visible y lo paga quien elige pagar online | El equipo paga un poco más que en efectivo | — |
| Lo absorbe el organizador | Precio limpio para el equipo | El organizador recibe menos | — |

## Decisión
Por defecto, el costo de Mercado Pago lo paga quien paga online, sumado al cargo por servicio (4 % con mínimo de $500, más el costo de Mercado Pago). El organizador recibe el 100 % de lo que cobra. Puede elegir absorber el cargo por servicio y el costo de Mercado Pago en su liga. Efectivo y transferencia, sin cargo.

## Consecuencias
- El checkout muestra el arancel, el cargo por servicio y el total antes de pagar.
- Configuración por organización para absorber el cargo (E06-08).
- La caja asienta el cobro completo del arancel; el cargo por servicio y el costo de Mercado Pago no son ingreso ni egreso del organizador, salvo que los absorba.

| Se revisa si | Relacionados |
|---|---|
| Las ligas reportan que el cargo frena los pagos online | ADR-027 · Documento 2, sección 3 · E06-08 |
