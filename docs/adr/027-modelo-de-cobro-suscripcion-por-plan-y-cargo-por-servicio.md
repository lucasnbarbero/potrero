# ADR-027 · Modelo de cobro: suscripción por plan y cargo por servicio

| Estado | Fecha | Decide |
|---|---|---|
| Aceptada | 2026-10-26 | Socios de Gregal |

## Contexto
La mayoría de las ligas amateur cobra en efectivo o por transferencia. Un ingreso atado solo a los pagos online dejaría a Gregal sin ingresos justo en las ligas que más usan el producto, y haría difícil prever los ingresos. El organizador valora la gestión del torneo (fixture, acta, sanciones, sitio público) más allá de cómo cobra.

## Opciones evaluadas
| Opción | A favor | En contra | Costo |
|---|---|---|---|
| Suscripción mensual por plan + cargo por servicio en pagos online | Ingreso previsible que no depende de cómo cobra la liga; el organizador recibe el 100 % de lo cobrado; los planes ordenan los límites y los módulos | Barrera de entrada por el precio fijo; hay que cobrar la suscripción y facturar dos conceptos | Cobro recurrente y facturación electrónica (E26) |
| Solo suscripción | Simple de explicar y de facturar | Los pagos online no aportan ingresos y su costo cae en el organizador | Cobro recurrente |
| Solo cargo por servicio | Sin barrera de entrada | Sin ingresos en las ligas que cobran en efectivo, que son la mayoría; ingreso imprevisible | — |

## Decisión
Suscripción mensual que paga el organizador según su plan:
- **Torneo** $100.000/mes: 1 torneo activo, hasta 16 equipos, 2 usuarios, módulos básicos, 100 WhatsApp por mes.
- **Liga** $200.000/mes: 4 torneos, 48 equipos, usuarios sin límite; suma tribunal, documentación, cuota por fecha y seguro, árbitros, reprogramaciones y métricas; 300 WhatsApp por mes.
- **Pro** $350.000/mes: sin límites; suma marca y dominio propios, sponsors con reporte y soporte prioritario; 2.000 WhatsApp por mes.

En los pagos online, quien paga abona un **cargo por servicio** del 4 % con mínimo de $500, más el costo de Mercado Pago (ADR-013). El organizador recibe el 100 %; puede absorber el cargo. Efectivo y transferencia, sin cargo.

**Ligas fundadoras:** las primeras 15 tienen 50 % de descuento de por vida, más alta y migración gratis. Es un descuento sobre el plan, no un plan aparte.

Pago anual con 2 meses sin cargo; primer mes sin cargo; los precios se ajustan cada 3 meses con aviso de 30 días.

## Consecuencias
- Cifras en `docs/datos.json` (ADR-009); límites por plan leídos de la configuración (E26).
- El split de Mercado Pago (`application_fee`) cobra el cargo por servicio (E06-05).
- Gregal factura la suscripción al organizador y el cargo por servicio a quien paga online (E00-08, E26-07).
- Las métricas internas miden ingresos por suscripción y por cargos (E24-05, E36-12).

| Se revisa si | Relacionados |
|---|---|
| La validación de precios (E00-10) o la beta (E33) muestran otra disposición a pagar | ADR-009 · ADR-013 · ADR-023 · Documento 2 · E26 |
