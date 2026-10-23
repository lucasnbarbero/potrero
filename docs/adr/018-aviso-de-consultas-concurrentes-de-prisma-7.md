# ADR-018 · Aviso de consultas concurrentes de Prisma 7

| Estado | Fecha | Decide |
|---|---|---|
| Aceptada | 2026-10-22 | Tech lead |

## Contexto
pg 8 advierte "client.query() when the client is already executing a query". Nuestro código ya no lanza consultas en paralelo dentro de transacciones (enSerie), pero el motor de Prisma 7.10 lo hace internamente con algunos include.

## Opciones evaluadas
| Opción | A favor | En contra | Costo |
|---|---|---|---|
| Ignorar hasta que Prisma lo corrija | Sin trabajo | Romperá con pg 9 | Bajo |
| Quitar los include anidados | Elimina el aviso | Más código | Medio |

## Decisión
No actualizar a pg 9 hasta que Prisma lo resuelva. Revisar en cada actualización de Prisma.

## Consecuencias
—

| Se revisa si | Relacionados |
|---|---|
| Prisma publica la corrección o pg 9 se vuelve obligatorio. | ADR-002, ADR-003 |
