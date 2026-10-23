# ADR-003 · Aislamiento entre organizaciones con Row Level Security

| Estado | Fecha | Decide |
|---|---|---|
| Aceptada | 2026-10-22 | Tech lead |

## Contexto
Cada liga es un tenant con datos sensibles. Un error en un filtro del código no puede exponer datos de otra liga.

## Opciones evaluadas
| Opción | A favor | En contra | Costo |
|---|---|---|---|
| Filtro por organizacionId en el código | Simple | Un olvido expone datos | Bajo |
| RLS en PostgreSQL + rol sin privilegios | La base garantiza el aislamiento | Más configuración | Bajo |
| Una base por tenant | Aislamiento total | Operación costosa | Alto |

## Decisión
RLS en todas las tablas con organizacion_id. La app usa el rol potrero_app (sin BYPASSRLS, no dueño de las tablas) y fija la organización con set_config dentro de cada transacción (DbService.enOrg). El rol administrador (DbService.sistema) solo se usa para migraciones, semillas y para identificar la organización de una notificación de pago.

## Consecuencias
Toda consulta de datos de una organización pasa por enOrg. Dentro de la transacción las consultas van en serie (enSerie), no con Promise.all. Probado en tests de integración y directamente en la base.

| Se revisa si | Relacionados |
|---|---|
| El rendimiento de las transacciones por pedido se vuelve un problema medible. | apps/api/prisma/migrations/*_rls, infra/postgres/init.sql |
