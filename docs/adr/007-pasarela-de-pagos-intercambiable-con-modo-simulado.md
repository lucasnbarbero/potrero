# ADR-007 · Pasarela de pagos intercambiable con modo simulado

| Estado | Fecha | Decide |
|---|---|---|
| Aceptada | 2026-10-22 | Tech lead |

## Contexto
El acuerdo de Mercado Pago Marketplace todavía no existe (E00-03) y la demo necesita cobrar.

## Opciones evaluadas
| Opción | A favor | En contra | Costo |
|---|---|---|---|
| Esperar credenciales | Sin trabajo extra | Bloquea la demo y el desarrollo | Alto |
| Interfaz Pasarela + implementación simulada | Se desarrolla y demuestra hoy; mismo camino que el webhook real | Hay que implementar la real después | Bajo |

## Decisión
Interfaz Pasarela en apps/api/src/cobros. PASARELA_PAGOS=simulada usa un checkout propio (/pago/[id]) que genera la misma notificación que la pasarela real y la procesa por el mismo servicio. El webhook valida firma y es idempotente.

## Consecuencias
Integrar Mercado Pago real (E06-04/05) es agregar una implementación, no cambiar el flujo.

| Se revisa si | Relacionados |
|---|---|
| Se firma el acuerdo con Mercado Pago. | ADR-013 |
