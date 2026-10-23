# ADR-008 · Idioma del código

| Estado | Fecha | Decide |
|---|---|---|
| Aceptada | 2026-10-22 | Tech lead |

## Contexto
El dominio, la documentación y los usuarios están en español rioplatense.

## Opciones evaluadas
| Opción | A favor | En contra | Costo |
|---|---|---|---|
| Todo en inglés | Convención habitual | Traducción constante entre docs y código | Bajo |
| Dominio en español | El código habla como el negocio | Mezcla con términos del framework | Bajo |

## Decisión
Nombres de dominio, mensajes, comentarios y commits en español (Torneo, Partido, Sancion, enOrg). Términos técnicos del framework en inglés. Tablas en snake_case. El documento 1 usa nombres en inglés para las entidades: la equivalencia está en docs/contexto/glosario.md.

## Consecuencias
—

| Se revisa si | Relacionados |
|---|---|
| — | docs/contexto/glosario.md |
