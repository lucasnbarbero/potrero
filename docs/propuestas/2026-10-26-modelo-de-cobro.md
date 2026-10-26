# Propuesta: modelo de cobro de Gregal

Para la reunión de socios del 26/10/2026. Es una propuesta: no cambia `docs/datos.json` ni el producto hasta que la aprueben. Todas las cifras son supuestos a validar, en pesos al tipo de cambio de referencia de `datos.json` (US$1 = $1.500).

**Propuesta en una línea:** Gregal cobra una **suscripción mensual** al organizador, según su plan. Además, quien paga online (el equipo o el jugador) paga un **cargo por servicio**, como al comprar entradas. El organizador recibe el 100 % de lo que cobra.

## 1. Por qué cambiar

El modelo actual (documento 2) es una comisión del 3,5 % sobre lo que el organizador cobra con Mercado Pago, y el efectivo no paga nada. En la reunión del jueves vimos que la mayoría de las ligas cobra en efectivo. Con eso, la comisión casi no deja ingresos:

| Torneo tipo (16 equipos × $60.000 de inscripción = $960.000) | Ingreso de Gregal |
|---|---|
| Si todo se cobra online (lo que supone el documento 2) | $33.600 |
| Si se cobra online el 20 % (más cerca de lo que vimos) | $6.720 |
| Si todo es en efectivo | $0 |

El ingreso depende de algo que no controlamos, que es cómo paga cada equipo. Para el organizador, además, cobrar online es más caro que cobrar en efectivo, y eso lo empuja a seguir con el efectivo.

## 2. Planes de suscripción

Se cobra por organización y por mes. El límite se mide en **equipos activos** (los que están en torneos sin terminar) y en torneos a la vez, porque el valor crece con el tamaño de la liga.

| | **Torneo** | **Liga** | **Pro** |
|---|---|---|---|
| Precio por mes | $49.900 | $99.900 | $199.900 |
| Para quién | Un torneo de barrio o de empresa | La liga mediana (cliente inicial) | La liga grande o el complejo con varias sedes |
| Torneos a la vez | 1 | 4 | Sin límite |
| Equipos activos | Hasta 16 | Hasta 48 | Sin límite |
| Usuarios | 2 | Sin límite, con roles | Sin límite, con roles |
| Fixture, acta digital, tabla, sitio público | Sí | Sí | Sí |
| Cobros (efectivo y online), caja, sanciones | Sí | Sí | Sí |
| Tribunal, documentación y DNI, cuota por fecha y seguro | — | Sí | Sí |
| Árbitros y canchas, reprogramaciones, métricas | — | Sí | Sí |
| Marca y dominio propios, sponsors con reporte | — | — | Sí |
| WhatsApp incluido por mes | 100 | 300 | 2.000 |
| Soporte | Normal | Normal | Prioritario |

Condiciones:
- **Ligas fundadoras (primeras 15):** 50 % de descuento de por vida en el plan que elijan (el plan Liga les queda en $49.950), con migración desde Excel gratis. Esto reemplaza el 2,5 % de por vida.
- **Pago anual:** 2 meses sin cargo.
- **Primer mes sin cargo**, para que prueben con un torneo real. Ojo: "30 días gratis" hoy figura en los términos prohibidos de `datos.json` y habría que sacarlo de esa lista.
- **Precios en pesos**, ajustados cada 3 meses por inflación y avisados con 30 días de anticipación.
- Sin permanencia, sin costo de alta, con exportación de datos al irse (como hoy).

Cómo venderlo: en una liga de 16 equipos, el plan Liga sale unos **$6.200 por equipo por mes**. Conviene compararlo con lo que paga un equipo por una sola fecha.

## 3. Cargo por servicio en los pagos online

- Quien paga online ve el arancel más el **cargo por servicio**, que incluye el costo de Mercado Pago y la parte de Gregal: **4 %, con un mínimo de $500** (a validar).
- El organizador recibe el arancel completo. Si prefiere, puede elegir absorber el cargo (opción del torneo). Esto cierra el ADR-013 con el cargo visible por defecto.
- El efectivo y la transferencia no pagan cargo. El online pasa a ser un extra para Gregal, no la base del ingreso.

Ejemplo con una inscripción de $60.000 y acreditación inmediata (Mercado Pago ≈ 8 % con IVA, referencia del documento 2):

| Concepto | Monto aproximado |
|---|---|
| Arancel que fija el organizador | $60.000 |
| Parte de Gregal (4 %) | $2.400 |
| Costo de Mercado Pago | ≈ $5.400 |
| **Paga el equipo** | **≈ $67.800** |
| **Recibe el organizador** | **$60.000** |

Con acreditación a más días, Mercado Pago cobra menos y el cargo baja. Para una cuota por fecha de $25.000, el equipo pagaría ≈ $28.300 y Gregal se quedaría con $1.000.

## 4. Cuánto gana Gregal por liga

Supuestos: una liga mueve $15 millones por año (el caso medio del documento 2), cobra online el 20 % ($3 millones) y está en el plan Liga. Margen de contribución del 80 % y costos fijos del documento 2: equipo de 3 personas (US$124.000 por año) o de 5 (US$198.000 por año).

| | Modelo actual (3,5 % de comisión) | Propuesta (suscripción + cargo) |
|---|---|---|
| Ingreso por liga y por año | $105.000 (≈ US$70) | $1.198.800 + $120.000 = $1.318.800 (≈ US$880) |
| Depende de cómo pagan los equipos | Totalmente | Solo el 9 % |
| Ligas para cubrir el equipo de 3 (US$124.000/año) | ≈ 2.200 | ≈ 180 |
| Ligas para cubrir el equipo de 5 (US$198.000/año) | ≈ 3.500 | ≈ 280 |

La propuesta deja unas **12 veces más por liga** y es previsible. Con la meta de 250 ligas a 24 meses, el equipo de 3 queda cubierto con margen. El de 5 pide unas 280 ligas, apenas por encima de la meta. Las 15 fundadoras pagan la mitad, así que suben un poco ese número (unas 8 ligas más). Para cerrar esa diferencia:
- Que más ligas tomen el plan Pro.
- Vender packs de WhatsApp y servicios.
- Ajustar los precios con lo que digan las entrevistas (E00-01).

## 5. Riesgos y cómo los cubrimos

| Riesgo | Cómo lo cubrimos |
|---|---|
| El organizador no quiere pagar una cuota fija; algunas alternativas tienen versión gratis | Mes de prueba, plan Torneo como entrada y demo pública. Validar el precio en las entrevistas antes de publicarlo |
| Los equipos evitan pagar online por el cargo | No afecta la base del ingreso, que es la suscripción. El organizador puede absorber el cargo para empujar el pago online |
| Defensa del consumidor: el cargo tiene que estar claro antes de pagar | Mostrar siempre el total final en el checkout. Validar con el abogado (E00-05) |
| Mercado Pago tiene que permitir cobrar el cargo con el split | Confirmarlo en el acuerdo Marketplace (E00-03) |
| Facturación: Gregal factura la suscripción al organizador y el cargo a quien paga | Definir el régimen con el contador (E00-08) |
| Cobro de la suscripción todos los meses | Débito automático con Mercado Pago (E26-04); mientras tanto, transferencia con aviso |

## 6. Qué decidir hoy

- [ ] Modelo: suscripción más cargo por servicio (sí o no).
- [ ] Planes: nombres, precios y límites (tabla de la sección 2).
- [ ] Cargo por servicio: porcentaje y mínimo, y si el organizador puede absorberlo.
- [ ] Ligas fundadoras: 50 % de por vida u otro beneficio.
- [ ] Primer mes sin cargo y descuento por pago anual.
- [ ] Ajuste de precios por inflación.

## 7. Qué cambia en el producto después

Si lo aprueban, el cambio en el código es acotado, porque las cifras viven en un solo lugar (`docs/datos.json`):
1. **`datos.json`:** los planes pasan a tener precio, límites y cargo por servicio en vez de comisión; se actualiza la lista de términos prohibidos.
2. **Cobros:** el checkout muestra el cargo por servicio. La caja registra el arancel completo como ingreso del organizador, y el cargo no cuenta como suyo.
3. **Planes (E26):** límites por plan (equipos, torneos, usuarios, módulos), pantalla de plan y cobro de la suscripción.
4. **Landing y guía de la demo:** la sección de precios.
5. **Documentos 2, 3 y 4, y un ADR nuevo** con la decisión. El ADR-013 queda cerrado.
