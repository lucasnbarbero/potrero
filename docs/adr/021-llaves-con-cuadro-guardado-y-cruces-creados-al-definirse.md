# ADR-021 · Llaves: cuadro guardado y cruces creados cuando se conocen los equipos

| Estado | Fecha | Decide |
|---|---|---|
| Aceptada | 2026-10-23 | Tech lead |

## Contexto
Las llaves (copa, playoffs de liga, playoffs de grupos) tienen cruces cuyos equipos todavía no se conocen: dependen del ganador de otro cruce. El acta, las sanciones y el sitio público ya trabajan con `Partido` (local y visitante obligatorios).

## Opciones evaluadas
| Opción | A favor | En contra | Costo |
|---|---|---|---|
| Crear todos los partidos de la llave al armarla, con equipos vacíos | Todo el calendario existe desde el inicio | `Partido` pasa a tener equipos opcionales: toca acta, sanciones, tabla y sitio público | Alto |
| Guardar solo el cuadro y crear cada partido cuando se conocen sus dos equipos | `Partido` no cambia; el acta funciona igual que en liga | El cuadro completo se deriva en cada lectura | Bajo |

## Decisión
`Torneo.llave` guarda el cuadro (lugares en orden, con `null` para pases libres) y cómo programar las rondas. La estructura y la resolución (quién avanza, quién es campeón) son funciones puras en `packages/shared` (`llaves.ts`). Los partidos de la llave se crean cuando se conocen los dos equipos: al armar el cuadro y cada vez que se cierra un cruce (acta o W.O.). Un empate se define por penales, que el acta exige. Los cruces no suman puntos a la tabla. Los grupos se guardan en `Torneo.grupos`.

## Consecuencias
- Se puede mostrar el cuadro completo con "Ganador de semifinales 1" aunque esos partidos todavía no existan.
- Las rondas siguen la numeración de fechas de la fase regular, así las sanciones se descuentan en orden.
- Pendiente: ida y vuelta en llaves (E10-03), que requiere dos partidos por cruce y resultado global.

| Se revisa si | Relacionados |
|---|---|
| Se agrega ida y vuelta, o se necesita publicar el calendario completo de la llave antes de jugarla. | ADR-004, ADR-005, ADR-006 |
