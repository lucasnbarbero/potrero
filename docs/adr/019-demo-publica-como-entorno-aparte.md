# ADR-019 · Demo pública como entorno aparte con sandbox por visitante

| Estado | Fecha | Decide |
|---|---|---|
| Aceptada | 2026-10-23 | Tech lead |

## Contexto
La landing tiene que ofrecer una demo que cualquiera pueda usar sin riesgo, y en la misma landing tiene que haber acceso a la liga real. Hoy la demo es `pnpm demo`: un usuario fijo (demo@potrero.app) con datos cargados por un script, en la base local de desarrollo. Sirve para trabajar, no para exponerla al público: el usuario es compartido, los datos se pisan y no hay límites de abuso.

## Opciones evaluadas
| Opción | A favor | En contra | Costo |
|---|---|---|---|
| Cuenta de demo dentro de producción | Un solo despliegue | Mezcla datos de prueba con los de clientes; abre abuso sobre la base real; ensucia métricas (GMV, ligas activas) y backups | Bajo al inicio, alto después |
| Proyecto o copia aparte para la demo | Aislamiento total | Se desactualiza con cada cambio; doble mantenimiento | Alto |
| Mismo código, entorno de demo aparte con sandbox por visitante | Muestra el producto real; base, Redis y archivos separados; sin datos pisados entre visitantes | Un despliegue más; módulo de sandboxes | Medio |
| Video o demo guiada estática | Sin riesgo | No se prueba el producto | Bajo |

## Decisión
Mismo monorepo y mismo código, desplegado como entorno distinto (`DEMO_MODE=true`) con su propia base, Redis y almacenamiento. La landing vive en producción y tiene dos puertas: "Probá la demo" (lleva al entorno de demo) e "Ingresar" (lleva a la app real).

- Cada visitante recibe una **sandbox**: una organización propia creada desde una plantilla de datos sintéticos, aislada de las demás por RLS (ADR-003). Expira sola (24 h por defecto) y un job la elimina; hay botón "Reiniciar demo".
- La demo solo cambia por configuración y en pocos puntos: pasarela simulada (ADR-007), mensajería apagada o capturada, subida de archivos limitada, `noindex`, banner fijo "Demo" y límites de abuso (sandboxes por IP, captcha, tope de tamaño). La lógica de negocio no conoce la demo.
- Sesiones y cookies separadas por entorno (ADR-010). No se migran datos de la demo a una cuenta real.
- El módulo que crea y expira sandboxes vive en `apps/api/src/demo` y solo se carga con `DEMO_MODE`.

## Consecuencias
- Cada mejora del producto aparece en la demo sin trabajo extra.
- Producción nunca toca la base de la demo ni al revés; las métricas del negocio no se contaminan.
- Hace falta un despliegue más, que depende del hosting (ADR-011).
- `pnpm demo` sigue siendo la demo local de desarrollo; la sandbox por visitante la reemplaza para el público.

| Se revisa si | Relacionados |
|---|---|
| El costo de un entorno aparte pesa más que el valor de la demo, o el abuso supera los límites previstos. | ADR-003, ADR-007, ADR-010, ADR-011 |
