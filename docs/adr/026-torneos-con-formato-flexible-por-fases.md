# ADR-026 · Torneos con formato flexible por fases

| Estado | Fecha | Decide |
|---|---|---|
| Propuesta (abierta) | 2026-10-26 | Producto y tech lead |

## Contexto
Hoy un torneo tiene un formato fijo: liga, copa, grupos + playoffs o liga + playoffs (ADR-021). Las ligas reales combinan fases a su manera.

Un ejemplo real, de una liga de 20 equipos:
- Fase 1: 2 grupos.
- Los 8 primeros de cada grupo juegan octavos, cuartos, semifinal y final, todo ida y vuelta menos la final.
- Los eliminados en octavos y los que no clasificaron juegan una "copa estímulo", en grupos de 4, hasta la semifinal y la final.

El objetivo del organizador es que todos los equipos jueguen la mayor cantidad de sábados, porque así recauda siempre lo mismo con la cuota por fecha (E06-20). No queremos imponer el formato actual ni el de esa liga: el organizador arma el suyo.

## Opciones evaluadas
| Opción | A favor | En contra | Costo |
|---|---|---|---|
| Sumar formatos fijos nuevos (por ejemplo, "grupos + playoffs + copa estímulo") | Cambio acotado | Siempre falta el formato de alguna liga; cada variante es código nuevo | Bajo cada vez, alto sumado |
| Torneo como secuencia de fases configurables, con plantillas | Cubre cualquier combinación; los formatos actuales pasan a ser plantillas; la vista previa muestra sábados y recaudación | Cambio de fondo: modelo de datos, fixture, llaves, tabla, acta y sitio público | Alto |
| Varios torneos sueltos encadenados a mano (la copa estímulo como otro torneo) | No cambia el modelo | El organizador mueve equipos a mano; la inscripción, la cuota y las sanciones quedan partidas | Bajo, pero traslada el trabajo al usuario |

## Decisión
Propuesta: un torneo es una **secuencia de fases**.

- **Tipos de fase:** todos contra todos, grupos o eliminación directa.
- **Entradas de una fase:** los inscriptos, o lo que deja otra fase:
  - puestos desde–hasta de cada grupo o tabla;
  - los mejores N de un puesto;
  - ganadores o perdedores de una ronda;
  - los que no clasificaron.

  Una fase puede alimentar a varias. Así se arma, por ejemplo, la principal y la copa estímulo.
- **Partidos por ronda:** en eliminación, cada ronda se juega ida y vuelta o a partido único (por ejemplo, todo ida y vuelta menos la final). Un empate en el global se define por penales.
- **Inicio:** cada fase arranca después de la anterior o en paralelo, compartiendo sábados, canchas y horarios.
- **Plantillas:** los cuatro formatos actuales y "grupos + playoffs + copa estímulo" pasan a ser plantillas editables.

El modelo, la validación (`validarFormato`), la simulación del calendario y de la recaudación (`simularFormato`) y las plantillas ya existen como funciones puras en `packages/shared/src/dominio/formato.ts`, con tests. Hoy los usa el simulador "Armá el formato" (`/panel/torneos/formato`), que todavía no crea torneos.

Para la versión definitiva:
1. **Datos:** tabla `Fase`, con RLS, que guarda el formato validado. `Partido` gana `faseId`, `grupo`, `ronda` y `pierna` (1 o 2). Los torneos existentes migran a la fase equivalente de su plantilla.
2. **Fixture por fase:**
   - La fase 1 se arma al cerrar la inscripción.
   - Cada fase siguiente se arma cuando terminan las fases de las que toma equipos. Una función pura resuelve sus entradas a partir de las tablas y las llaves.
   - La programación respeta la capacidad real de canchas y franjas.
3. **Llaves ida y vuelta:** series de dos partidos con resultado global y penales en la vuelta. Extiende ADR-021 y cierra E10-03.
4. **Tabla y sitio público por fase:** tablas por grupo, "mejores N" con los mismos criterios de desempate, y pestañas por fase con su cronograma.
5. **Cobros:** la cuota por fecha ya se cobra por partido jugado. Falta definir si se cobra la fecha libre de quien espera entre fases.

## Consecuencias
- El formulario de "Nuevo torneo" pasa a usar el editor de fases, con la vista previa antes de crear.
- Acta, sanciones y caja no cambian de fondo: siguen trabajando con `Partido`.
- Hay que decidir con organizadores reales el criterio de "mejores N" cuando los grupos son desparejos: puntos o promedio de puntos.
- El calendario del simulador cuenta semanas corridas; la versión definitiva tiene que saltear feriados y fechas bloqueadas.

| Se revisa si | Relacionados |
|---|---|
| Las entrevistas con organizadores (E00-01) muestran formatos que este modelo no cubre, o el editor resulta difícil de usar. | ADR-005, ADR-006, ADR-015, ADR-021 |
