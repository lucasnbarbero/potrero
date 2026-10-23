# ADR-020 · Acta sin conexión: cola local en IndexedDB y service worker acotado

| Estado | Fecha | Decide |
|---|---|---|
| Aceptada | 2026-10-23 | Tech lead |

## Contexto
El acta se carga en la cancha, donde la señal es mala o no hay (documento 1, sección 7). Perder un gol o un cierre por una caída de conexión es inaceptable. El servidor ya es idempotente por `clientUuid` (ADR-004), así que reenviar nunca duplica.

## Opciones evaluadas
| Opción | A favor | En contra | Costo |
|---|---|---|---|
| Solo en línea, con reintento al fallar | Simple | Se pierde lo cargado si se cierra la pantalla; no se puede reabrir sin señal | Bajo |
| Cola local + service worker que guarda pantalla y archivos | El acta abre y funciona sin señal; nada se pierde; sincroniza en orden | Más piezas; hay que cuidar qué guarda el worker | Medio |
| App nativa | Control total del almacenamiento | Fuera del alcance del lanzamiento (ADR-016) | Alto |
| Sincronización automática de los datos del servidor al navegador (réplica) | Lectura completa sin señal | Complejo, riesgo de datos viejos y de filtrar datos de otros partidos | Alto |

## Decisión
Cola local de operaciones (iniciar, evento, anular, cerrar) en IndexedDB, con la última foto del acta que confirmó el servidor. La pantalla muestra siempre la foto del servidor más la cola (`vistaLocal`, función pura en `packages/shared`), así el marcador se actualiza al instante. El envío (`procesarCola`) va en orden, corta si se cae la conexión y no se frena por una operación rechazada: esas se informan al delegado. Si IndexedDB no está disponible, cae a memoria.

El service worker (`apps/web/public/sw.js`) guarda solo la pantalla del acta y los archivos de la app (`/_next/static/**`), con red primero. **Nunca guarda respuestas de la API**: una lectura vieja devuelta por el worker haría creer que hay conexión. Al cerrar sesión se borra lo guardado.

Un solo dueño del acta por partido (E11-05): el primer dispositivo que la abre se la queda; otro dispositivo ve quién la tiene y puede tomarla a propósito. El servidor rechaza las escrituras de un dispositivo que no es el dueño (cuando el pedido informa su dispositivo).

## Consecuencias
- Un evento cargado sin señal se puede anular con su `clientUuid`, sin conocer su id del servidor.
- Operaciones rechazadas por el servidor (por ejemplo, otro dispositivo tomó el acta) quedan visibles hasta que el delegado las descarte.
- Hay que abrir el acta una vez con señal antes del partido para que el navegador guarde la pantalla.
- El W.O. necesita conexión (lo resuelve el servidor).
- Pendiente: probar en 3–4 celulares de gama media o baja con conexión mala (E11-13).

| Se revisa si | Relacionados |
|---|---|
| Se decide hacer la app nativa (ADR-016) o aparecen pérdidas de datos en la beta. | ADR-004, ADR-016, ADR-010 |
