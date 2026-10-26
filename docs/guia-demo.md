# Guía de la demo y prueba completa

Este documento tiene dos usos:
1. **Probar todo** lo que hace Potrero hoy, en un orden que no rompe las pruebas siguientes (partes 1 a 6).
2. **Mostrarlo** en una reunión (parte 7, recorrido corto).

Lo que se ve funciona de verdad: base de datos, reglas y permisos. Mercado Pago, WhatsApp, email y el pronóstico del clima están **simulados**.

Cómo usarla:
- Marcá cada casilla cuando el resultado coincida.
- Si algo no coincide, anotá el número de la prueba y qué viste.
- Los valores marcados con **(≈)** se calcularon leyendo el código y la semilla, sin abrir el navegador. Si no coinciden, puede estar mal la guía y no el sistema: anotalo igual.
- La sección **"Fallas ya conocidas"** (al final) lista lo que ya sabemos que está mal. No hace falta reportarlo de nuevo.

---

## 0. Preparación

1. Abrí Docker Desktop.
2. En la carpeta del proyecto, cargá la demo desde cero:
   ```
   pnpm db:reset
   ```
   **Copiá dos líneas que imprime al final**, porque no se muestran en ningún otro lado:
   - `Capitán (Villa Unión): capitan@potrero.app / potrero-demo-2026`
   - `Invitación pendiente: http://localhost:3000/invitacion/<token>`
3. Levantá todo: `pnpm demo`. Esperá "Ingresá con demo@potrero.app". Abrí http://localhost:3000.
4. Tené a mano **dos ventanas de incógnito** además de la normal: una para el capitán y otra para links públicos (tutor, confirmaciones, invitaciones).
5. **Arrancá por la parte 1 enseguida.** El partido "en vivo" se calcula desde el momento de la carga: pasadas unas 2 horas deja de estar en vivo.

**Cuidado con el ingreso.** La API cuenta los intentos fallidos:
- 5 por cuenta cada 15 minutos.
- 20 en total para todos los usuarios (en local todos los pedidos llegan desde la misma IP).

Si te equivocás mucho de contraseña, vas a tener que esperar 15 minutos o volver a hacer `pnpm db:reset`.

Para repetir todo desde cero: cortá con Ctrl+C, `pnpm db:reset` y `pnpm demo`.

### Datos de la demo

Las fechas se calculan desde el día de la carga. Liga **Liga Barrial Sur** (dirección `liga-barrial-sur`, plan Pro con el descuento de liga fundadora (50 %), así la demo muestra todos los módulos):

| Torneo | Formato | Estado | Detalle |
|---|---|---|---|
| Apertura 2026 | Fútbol 5 · Liga | En curso | 9 inscriptos (8 en el fixture), 7 fechas. Fechas 1–3 jugadas. De la fecha 4: un partido **en juego hoy**, uno **hoy más tarde sin árbitro**, uno **de ayer sin acta** y uno el sábado |
| Clausura 2026 | Fútbol 7 · Liga | Inscripción abierta | 3 de 12 equipos, $ 75.000 por equipo |
| Copa Relámpago | Fútbol 5 · Copa | En curso | Llave de 8: cuartos y semis jugados, final pendiente |
| Torneo Primavera 2026 | Fútbol 7 · Por fases | En curso | 12 equipos: 2 grupos de 6, clasifican 4 por grupo a playoffs (ida y vuelta, final única) + copa estímulo. Fase de grupos jugada hasta la fecha 3, domingos a la mañana |
| Clausura 2025, Apertura 2025, Verano 2025 | Liga | Finalizados | Historia para métricas y perfiles. Clausura 2025 tiene un partido con equipo ausente |

- **Equipos (13):**
  - Deportivo Sur, Real Barrio, Los Pibes, La Banda, Atlético Norte, Villa Unión, Estrella Roja, Juventud Unida y Sportivo Barrio, con 9 jugadores cada uno.
  - Fénix FC, con 9 jugadores, sin capitán.
  - Defensores del Oeste, Unión Vecinal y Los Halcones, sin jugadores ni contacto.
  - Los capitanes de Los Pibes, Villa Unión y Sportivo Barrio no aceptan WhatsApp.
- **Canchas:** Complejo El Potrero (Av. San Martín 1450): Cancha 1 sintético a $ 8.000 por partido; Cancha 2 césped a $ 6.500.
- **Árbitros:**

  | Árbitro | Tarifa | Valoración |
  |---|---|---|
  | Marcos Costa | $ 12.000 | 4,7 |
  | Julián Vera | $ 10.000 | 4,5 (solo sáb 14–22 y dom 10–14) |
  | Lucas Ríos | $ 9.000 | 4,4 |
  | Pablo Núñez | $ 11.000 | 4,6 |
  | Sofía Giménez | $ 10.000 | 4,8 |

- **Otras ligas:**
  - **Veteranos del Oeste:** segunda liga de demo@, donde es administradora. Tiene el torneo Senior +40.
  - **Complejo Norte:** de norte@potrero.app. Tiene la Copa Nocturna. Sirve para probar el aislamiento entre ligas.

### Usuarios

Todos usan la contraseña `potrero-demo-2026`.

| Usuario | Rol | Nombre |
|---|---|---|
| demo@potrero.app | Dueña de Liga Barrial Sur | Carla Organizadora |
| admin@potrero.app | Administrador de torneo | Lucía Fernández |
| tesoreria@potrero.app | Tesorero | Jorge Medina |
| tribunal@potrero.app | Tribunal de disciplina | Raúl Acosta |
| capitan@potrero.app | Capitán de Villa Unión | Matías Gómez |
| jugador@potrero.app | Jugador de Villa Unión (#8), con cuenta propia | Facundo Ledesma |
| veteranos@potrero.app | Dueño de Veteranos del Oeste (donde demo@ es administradora) | Héctor Sosa |
| norte@potrero.app | Dueño de otra liga (Complejo Norte) | — |
| marcos.costa@ejemplo.com.ar | Invitación pendiente como árbitro (todavía no tiene cuenta) | Marcos Costa |
| staff@gregal.tech | Equipo de Gregal, superadmin (entra por `/gregal/ingresar`) | — |
| soporte@gregal.tech | Equipo de Gregal, soporte (no ve Dinero ni Auditoría) | — |

Las cifras que se pueden cambiar sin tocar código (plazos, límites, montos por defecto, umbrales) están en `docs/datos.json`. Después de cambiarlas: `pnpm datos` y reiniciar la demo.

---

## Parte 1 · Mirar sin tocar (hacela primero)

Estas pruebas no modifican datos, salvo donde se aclara.

### 1.1 Landing `/`
- [ ] **Barra superior:** "Problemas", "Producto", "Precios", "Preguntas", "Probá la demo", "Ingresar" y "Crear mi liga".
- [ ] **Hero:** título "Tu torneo, sin planillas ni grupos de WhatsApp.", botones "Quiero ser liga fundadora" (va a `/registro`) y "Probá la demo".
- [ ] **Precios:** tres planes con su precio por mes: Torneo $100.000, Liga $200.000 y Pro $350.000, cada uno con sus límites (torneos, equipos, usuarios, WhatsApp por mes) y módulos. Aparte, las ligas fundadoras (primeras 15, 50 % de descuento de por vida, alta y migración gratis) y el cargo por servicio de los pagos online (lo paga quien paga online: 4 % con mínimo $500 más el costo de Mercado Pago; el organizador recibe el 100 %; efectivo y transferencia sin cargo). Las cifras salen de `docs/datos.json` (ADR-027).
- [ ] **Preguntas:** 5, y la primera ("¿Necesito instalar algo?") viene abierta.
- [ ] **"Probá la demo":** con `pnpm demo` normal muestra "La demo no está activa acá". Es lo esperado: la demo pública se prueba en la parte 6.

### 1.2 Ingreso y panel del organizador (`/panel`)
- [ ] Entrá a `/panel/caja` sin sesión: te manda a `/ingresar?volver=…`. Ingresá con demo@ y volvés a Caja. **No mires la caja todavía:** volvé a `/panel`. Abrir Caja resuelve una alerta (ver 1.10).
- [ ] **Saludo:** "Buen día / Buenas tardes / Buenas noches, Carla.", con los botones "Compartir inscripción" y "Nuevo torneo".
- [ ] **En vivo:**
  - Pastilla "En vivo · NN'" con el minuto, que avanza cada 15 s.
  - "Apertura 2026 · Fecha 4 · Cancha 1".
  - Marcador **2 : 1** (≈ Deportivo Sur vs Atlético Norte), con los goleadores y su minuto.
  - Botón "Abrir acta".
- [ ] **Cobrado en total:** número grande (≈ $ 1.575.000), la aclaración de que el organizador recibe el 100 % y la línea "Evolución en los últimos 30 días · Online $…".
- [ ] **Equipos:** 9, "en 3 torneos activos".
- [ ] **Partidos de hoy:** 2, "1 en juego · 1 sin árbitro".
- [ ] **Pendiente:** ≈ $ 55.000, con las pastillas "Sportivo Barrio · $ 30.000" y "Unión Vecinal · $ 25.000". Cada una lleva a su torneo.
- [ ] **Requiere atención: 5 alertas**, cada una con su botón:

  | Alerta | Detalle | Botón |
  |---|---|---|
  | Jugó un suspendido | Un jugador de Deportivo Sur, fecha 4 | "Resolver" → Sanciones |
  | Acta sin cargar | El partido de ayer de la fecha 4 | "Cargar" → acta |
  | Partido sin árbitro | El partido de hoy más tarde | "Asignar" → Árbitros |
  | 1 documento vencido | "Y 1 por vencer en 30 días" | "Revisar" → Documentación |
  | 1 pago sin conciliar | "$ 30.000 cobrados que todavía no están en la caja" | "Conciliar" → Caja |

- [ ] **Sugerencias:** la principal es "Designá árbitros para hoy…" con el botón "Designar árbitros". Debajo hay hasta 3 más (fixture, tribunal, deudores).
- [ ] **Tus torneos:** Apertura "Fecha 3/7", Clausura "Inscripción 3/12" y Copa "Ronda 2/3".
- [ ] **Barra lateral:** Panel, Torneos, Equipos, Canchas, Árbitros, Caja, Sanciones, Documentación, Reprogramar, Comunicación, Métricas, Configuración, Sponsors y Usuarios. Abajo muestra el plan de la liga con su precio por mes (y el descuento de fundadora) y "Mercado Pago conectado. Cobrás directo en tu cuenta.".
- [ ] **Celular:** con la ventana a ~390 px de ancho, el panel se ve sin scroll horizontal.

### 1.3 Torneos
- [ ] **`/panel/torneos`:** 7 tarjetas con modalidad, estado, formato, "Equipos x/cupo", "Partidos" e "Inscripción" (tabla de la sección 0).
- [ ] **Apertura 2026, pestañas:** "Inscripciones y pagos", "Fixture", "Tabla" y "Sanciones".
- [ ] **"Inscripciones y pagos":**
  - Cuadros "Equipos" 9/10, "Cobrado" y "Pendiente" $ 30.000.
  - En la tabla, 7 equipos "Al día" por Mercado Pago (el cargo por servicio lo pagó el equipo) y Estrella Roja en "Efectivo".
  - Sportivo Barrio "Pendiente" "$ 30.000 / $ 60.000", con los botones "Link de pago", "Cobré $30.000 en efectivo" y "Registrar pago". **No lo cobres todavía** (parte 6).
  - Cada equipo con pagos tiene "Ver pagos (n)".
- [ ] **Encabezado del torneo:** "Ver sitio público", "Editar" y los botones de estado ("Finalizar torneo" en un torneo en curso; "Cerrar inscripción" en uno con inscripción abierta). No los toques todavía (3.3).
- [ ] **"Fixture":**
  - Botones "Fecha 1" a "Fecha 7" y la grilla con las columnas "Cancha 1 · sintético" y "Cancha 2 · césped".
  - La Fecha 4 mezcla días distintos.
  - Tocar el partido en juego muestra "El partido tiene el acta en curso. No se puede mover."
- [ ] **"Tabla":**
  - 8 filas, todas con PJ 3. El partido en juego todavía no cuenta.
  - Controles: la suma de GF es igual a la suma de GC, y Pts = 3 × PG + PE.
  - Pie: "Calculada automáticamente desde las actas cerradas. No se edita a mano." Debajo, "Goleadores".
- [ ] **"Sanciones":** la roja de la fecha 3 ("Roja directa · 1 partido(s)") y 2 sanciones con la causa "Resolución del tribunal". Al pie, un link al tribunal (`/panel/sanciones`).
- [ ] **Copa Relámpago:**
  - Abre en la pestaña "Llaves", con las columnas "Cuartos de final", "Semifinales", "Final" y "Campeón: A definir".
  - Un cuarto empató 1-1 y se definió por penales ("(4)" y "(3)").
  - La final es Deportivo Sur vs Juventud Unida (≈).
  - Cada cruce tiene su link "Acta".
- [ ] **Clausura 2026:** "Inscripción abierta", 3/12, con un link de inscripción en el encabezado.

### 1.4 Equipos y canchas
- [ ] **`/panel/equipos`:** 13 tarjetas con "N jugadores · capitán" o "sin capitán".
- [ ] **Deportivo Sur:**
  - Plantel con número y nombre.
  - "Contacto del capitán".
  - "Torneos": Apertura, Clausura, Copa, Apertura 2025 y Clausura 2025.
- [ ] **`/panel/canchas`:** la sede "Complejo El Potrero" con Av. San Martín 1450 y las dos canchas. Al pie, un link a "Árbitros y canchas".

### 1.5 Sanciones y tribunal (`/panel/sanciones`)
- [ ] **Encabezado:** "Tribunal de disciplina · Apertura 2026".
- [ ] **Cuadros:** Suspendidos hoy **2**, Automáticas **0**, Para resolver **3**, Descargos **0**.
- [ ] **"Abiertos 3":**
  - Roja directa de la fecha 3: sugiere 1 fecha, sin informe.
  - Incidente de la hinchada de la fecha 2: sin jugador, con informe.
  - "Jugador no habilitado en el acta" de la fecha 4: es el suspendido que hizo un gol en el partido en vivo.
- [ ] **"Resueltos":**
  - Agresión verbal al árbitro: "Reducida por el tribunal: 1 fecha · Multa $ 5.000", ya cobrada.
  - Insultos al árbitro: 1 fecha.
- [ ] **"Automáticas":** la roja directa, "Le falta 1 fecha".
- [ ] **"Suspendidos esta fecha":** los 2, sin botón para levantar.
- [ ] **"Reglamento aplicado":** 5 amarillas = 1 fecha · doble amarilla 1 · roja directa 1+ · "Levantar pagando Apagado".
- [ ] **"Historial":** tablas "Por jugador" y "Por equipo" con Amarillas, Rojas, Fechas, Levantadas y Multas.

### 1.6 Documentación (`/panel/documentacion`)
- [ ] **"Qué se exige en este torneo":** Apertura 2026 tiene tildados DNI, Apto físico y Autorización de menores.
- [ ] **Resumen:** Habilitados (≈ 72 de 81), DNI, Apto físico, Menores 4.
- [ ] **Alertas:** Posible duplicado 1 · Apto vencido 1 · Apto por vencer 1 · Menor sin autorización 1 · Documentos por revisar 2.
- [ ] **"Posibles duplicados":** el #9 de Los Pibes y el #9 de La Banda con el mismo DNI. Se ve "DNI ***… cargado dos veces".
- [ ] **Casos sembrados en los #9** (pestaña "Con observaciones"):

  | Equipo | Estado del #9 |
  |---|---|
  | Deportivo Sur | DNI rechazado ("Foto de DNI ilegible") |
  | Real Barrio | Apto vencido |
  | Atlético Norte | 15 años, sin autorización |
  | Villa Unión | 16 años, autorizado en línea por su madre |
  | Estrella Roja | Apto que vence en 12 días |
  | Juventud Unida | DNI y apto "Por revisar" |

- [ ] **Tarjeta "Verificación con selfie":** "No disponible todavía".

### 1.7 Acta con jugador no habilitado
- [ ] En Apertura → Fixture → Fecha 4, abrí el acta del partido de hoy más tarde o del de ayer: "Ver acta" en el panel que se abre al tocar el partido.
- [ ] En "Planilla · {equipo}" cada jugador lleva su píldora "Habilitado" o "No habilitado", con el motivo en rojo.
- [ ] **Motivos esperados en los #9:** "DNI rechazado", "Apto físico vencido", "Posible duplicado sin resolver", "Menor sin autorización del tutor" y "DNI pendiente de revisión, Apto físico pendiente de revisión".
- [ ] **El expulsado de la fecha 3:**
  - Buscalo en Sanciones → "Automáticas" y abrí el acta de su equipo en la fecha 4.
  - Tiene que aparecer "Suspendido (roja directa), le falta 1 partido".
- [ ] **Acta de ayer:**
  - Aviso rojo "Pasó la tolerancia de 15 minutos. Si un equipo no se presentó, marcalo como ausente: pierde el partido."
  - Botones "{equipo} no se presentó", habilitados. **No los toques todavía** (4.4).
- [ ] **Acta del sábado (Fecha 4, el partido que todavía no se jugó):** los botones "{equipo} no se presentó" están deshabilitados, con el aviso "Se habilita cuando pasen 15 minutos…".
- [ ] **Abrir no es tomar:** abrir un acta ya no la reserva para tu dispositivo; se toma recién al cargar algo (ver 4.3).

### 1.8 Sitio público (sin sesión, en incógnito)
- [ ] **`/t/liga-barrial-sur`:** las tarjetas de los 7 torneos.
- [ ] **`/t/liga-barrial-sur/apertura-2026`:**
  - "Tabla de posiciones" (8 filas).
  - Goleadores con link al perfil: uno se ve con nombre completo y otro con el apodo "Pipa".
  - "Suspendidos", "Próxima fecha" (la 4) y "Últimos resultados" (la 3).
  - Tres tarjetas "Publicidad": Kiosco Don Pepe arriba, Gimnasio Movimiento y Pizzería Roma.
- [ ] **Privacidad:** por defecto los nombres salen como "Nombre I.". Ningún DNI, teléfono, email ni fecha de nacimiento.
- [ ] **Partido:** tocá un resultado de "Últimos resultados". Se abre `/t/…/partido/<id>` con:
  - El estado y "Crónica" (texto armado con los eventos).
  - "Línea de tiempo".
  - "Goleador del partido" y "Planteles" con link a cada jugador.
  - "Compartir".
- [ ] **Imagen para redes:** en "Compartir", abrí "Descargar para Instagram". Probá también agregando `/tarjeta`, `/tarjeta?formato=cuadrado` y `/tarjeta?formato=historia` a la dirección del partido. Son tres imágenes con el resultado.
- [ ] **Partido por jugar:** tocá uno de "Próxima fecha". Muestra "Cuándo y dónde".
- [ ] **Perfil del goleador:**
  - "Goles", "Partidos", "Goles / partido" y "Tarjetas".
  - "Trayectoria" con Verano 2025 en Fénix FC y Apertura 2026.
  - "Logros" y "Últimos partidos".
- [ ] **Menores sin consentimiento de imagen:** aparecen solo con iniciales y sin link. Ejemplo: el #9 de Atlético Norte.
- [ ] **Copa:** `/t/liga-barrial-sur/copa-relampago` muestra "Cuadro del torneo".
- [ ] **Inscripción cerrada:** `/t/liga-barrial-sur/apertura-2026/inscripcion` muestra "La inscripción está cerrada" en lugar del formulario.
- [ ] **Clausura:** `/t/liga-barrial-sur/clausura-2026` muestra "Inscripción abierta", "3 de 12 equipos · $ 75.000 por equipo", "Inscribir mi equipo" y la publicidad de Seguros La Cancha.
- [ ] **Aislamiento entre ligas:**
  - `/t/complejo-norte` muestra solo la Copa Nocturna.
  - `/t/complejo-norte/apertura-2026` da "no encontrado".

### 1.9 Métricas (`/panel/metricas`)
- [ ] **Pestañas:** "30 días", "Temporada" (por defecto) e "Histórico", más el botón "Reporte".
- [ ] **Temporada:**
  - Retención ≈ **88%** (≈), con el detalle de quién vuelve de un torneo al siguiente.
  - Tasa de cobro, asistencia y equipos inscriptos por torneo.
  - "Cómo te pagan": efectivo, transferencia y online.
  - "Quién vuelve": repiten 5, se fueron 2 (Unión Vecinal, Los Halcones) y nuevos.
  - Mapa de "Horarios más pedidos" y "Uso de cada cancha".
- [ ] **Histórico:** retención ≈ 87% (≈). "Cobro por torneo" incluye Apertura 2025. El insight de horarios dice que los domingos se llenan primero (por el Torneo Primavera).
- [ ] **Pastilla "Clausura 2025":** muestra quién no volvió.

### 1.10 Caja (`/panel/caja`)
- [ ] **Conciliación automática:** al abrir la página, el pago de $ 30.000 sin conciliar se asienta solo (sin mensaje: falla conocida). Volvé a `/panel`: la alerta "1 pago sin conciliar" ya no está.
- [ ] **Cobro automático:** se ve la pastilla "Cobro automático activo" (el botón "Activar cobro automático" aparece solo si está apagado).
- [ ] **Cuadros:**
  - "Disponible para retirar · Mercado Pago", con el 100 % de lo cobrado (el cargo por servicio lo pagaron los equipos).
  - "Resultado de la liga" (ingresos y egresos).
  - "Por cobrar" ≈ $ 55.000 de 2 equipos.
- [ ] **Filtros:** pastillas por torneo y pestañas "Todos", "Ingresos" y "Egresos".
- [ ] **Egresos por rubro:** Canchas, Árbitros, Premios y trofeos, y Otros.
- [ ] **Cargos automáticos:** "Pago automático a árbitros" y "Alquiler de canchas", ambos encendidos.
- [ ] **"Exportar":** baja `movimientos-caja.csv`.

### 1.11 Árbitros, Reprogramaciones, Comunicación y Sponsors (solo mirar)
- [ ] **`/panel/arbitros`:**
  - "Designaciones · <hoy>" con "1 sin árbitro". El partido en juego dice "En juego". Elegí otro día: dice "N partidos ese día".
  - Los 5 árbitros con su tarifa, partidos dirigidos y cobrado.
  - "Canchas · ocupación del día".
- [ ] **`/panel/reprogramaciones`:** alerta de lluvia simulada ("Probabilidad 85%…") y las opciones "Mover al día siguiente", "Cancha techada" y "Suspender fecha", con su vista previa.
- [ ] **`/panel/comunicacion`:**
  - Pastilla "WhatsApp del mes: N/400".
  - Las 3 automatizaciones encendidas.
  - "Últimos envíos" con "Fixture publicado" (9 destinatarios). "Ver mensajes" despliega a cada uno.
- [ ] **`/panel/sponsors`:**
  - "Ingresos por sponsors", "Impresiones · últimos 30 días" y "Sugerencia".
  - 4 auspiciantes: Kiosco Don Pepe, Gimnasio Movimiento, Pizzería Roma ("Vence en 5 días") y Seguros La Cancha.
  - "Espacios disponibles" y "Rubros que no aceptás", con Apuestas rechazado.
- [ ] **Reporte de un sponsor:** impresiones, clics, CTR, "Impresiones por día", "Espacios" y "Cobros", con los botones "Descargar CSV" e "Imprimir o guardar PDF".

### 1.12 Configuración y usuarios (solo mirar)
- [ ] **`/panel/configuracion`:**
  - "Progreso 60%", "3 de 5 pasos completos".
  - Pasos: 1 "Tu organización" abierto, 2 "Cobros con Mercado Pago" "Conectado", 3 "Personalizá tu marca" abierto, 4 "Reglamento base" "Listo" y 5 "Importá tu Excel" "Listo".
- [ ] **`/panel/usuarios`:**
  - 5 miembros: Carla (vos) Dueño, Lucía Administrador de torneo, Jorge Tesorero, Raúl Tribunal de disciplina y Matías "Capitán · Villa Unión".
  - "Invitaciones pendientes": Marcos Costa, Árbitro / delegado.
  - "Historial (4)".

---

## Parte 2 · Cuenta, roles y capitán

### 2.1 Mi cuenta (con demo@)
- [ ] **Abrir:** menú del usuario (arriba a la derecha, con tus iniciales) → "Mi cuenta".
- [ ] **"Tus datos":** dice "Tu email todavía no está verificado."
- [ ] **Verificar el email:**
  - Tocá "Mandarme el link de verificación" y abrí "Abrir el link de verificación".
  - Aparece "Email verificado" y "Listo: demo@potrero.app quedó verificado.".
  - Reabrí el mismo link: "Este link ya se usó."
- [ ] **Cambiar el nombre** a "Carla Org" y "Guardar cambios" → "Guardado.". Volvé a "Carla Organizadora".
- [ ] **Errores al cambiar el email:**
  - Poné `admin@potrero.app` con tu contraseña → "Ya hay una cuenta con ese email."
  - Poné otro email sin la contraseña → "Para cambiar el email, ingresá tu contraseña actual."
- [ ] **Errores al cambiar la contraseña:**
  - Actual mal → "La contraseña actual no es correcta."
  - Nueva igual a la actual → "La contraseña nueva tiene que ser distinta de la actual."
- [ ] **"Tus organizaciones":** Liga Barrial Sur (Dueño, "Activa") y Veteranos del Oeste (Administrador, "Cambiar a esta"). El dueño de Veteranos es Héctor Sosa (veteranos@potrero.app).
- [ ] **Cambiar de liga:**
  - Cambiá a Veteranos del Oeste: el panel muestra su torneo Senior +40, no aparece el partido en vivo y la barra lateral dice "Mercado Pago sin conectar" con el link "Conectalo en Configuración".
  - Volvé a Liga Barrial Sur, desde el menú del usuario o desde Mi cuenta.
- [ ] **"Sesiones":** "Tenés la sesión abierta en N dispositivos". **No cierres todas todavía.**

### 2.2 Recuperar la contraseña (con tribunal@, en incógnito)
- [ ] **Pedir el link:** en `/ingresar`, "¿Te olvidaste la contraseña?" → `/recuperar` → Email `tribunal@potrero.app` → "Mandarme el link".
  - Aparece "Revisá tu email" y el recuadro "Email simulado (modo desarrollo)" con "Elegir contraseña nueva".
- [ ] **Restablecer:**
  - Con dos contraseñas distintas → "Las contraseñas no coinciden."
  - Con `potrero-demo-2026` en las dos → "Guardar e ingresar" te deja en el panel.
- [ ] **Reabrir el link:** "Este link ya se usó."
- [ ] **Email que no existe:** pedí el link para `nadie@ejemplo.com`. Aparece la misma pantalla pero sin el recuadro: no revela qué emails existen.

### 2.3 Qué ve cada rol

Entrá en incógnito con cada usuario. El menú lateral muestra solo las secciones de cada rol.

| Usuario | Menú esperado | Qué puede hacer |
|---|---|---|
| admin@ | Todo menos lo exclusivo del dueño | Opera torneos, equipos, documentación, comunicación y sanciones. Registra pagos (no retiros). Invita árbitro, tribunal o capitán |
| tesoreria@ | Panel, Torneos, Equipos, Caja, Comunicación, Métricas | Registra pagos y movimientos de caja (no retiros: solo el dueño) |
| tribunal@ | Panel, Torneos, Equipos, Sanciones | Resuelve expedientes y carga el informe del árbitro |
| árbitro (Marcos, después de 2.4) | Panel, Torneos, Equipos | Carga actas |

- [ ] **Botones de cobro:** con admin@, en un torneo → Inscripciones aparecen "Registrar pago", "Cobré … en efectivo" y "Anular" en "Ver pagos". Con tribunal@ no aparece ningún botón de cobro.

- [ ] Comprobá el menú de cada uno.
- [ ] **Sección sin permiso:** con tesoreria@ abrí `/panel/documentacion`, y con tribunal@ abrí `/panel/caja`. Aparece "Tu rol no tiene acceso a esta sección" con "Volver al panel".

### 2.4 Usuarios e invitaciones (con demo@)
- [ ] **Invitar a un tesorero:** "Invitar a alguien" → Email `prueba1@ejemplo.com`, Rol "Tesorero" → "Crear invitación".
  - Aparece el link, con "Copiar link" y "Mandar por WhatsApp".
- [ ] **Invitar a un capitán:** Rol "Capitán" muestra el campo "Equipo". Elegí Real Barrio con `capitan2@ejemplo.com` → link.
- [ ] **Errores:**
  - Con `tesoreria@potrero.app` → "Esa persona ya es parte de la organización."
  - Con un email inválido → "Ingresá un email válido."
- [ ] **Aceptar como capitán:** abrí en incógnito el link del capitán de Real Barrio.
  - Dice "Te invitaron como capitán de Real Barrio".
  - Completá el nombre y una contraseña de 10 o más caracteres → "Crear cuenta y aceptar" → `/capitan` con "Real Barrio".
- [ ] **Invitación sembrada de Marcos:**
  - En "Invitaciones pendientes" tocá "Reenviar". El link anterior deja de servir.
  - Abrí el link nuevo en incógnito y aceptá como árbitro: entra al panel y puede ver torneos y cargar actas.
- [ ] **Anular:** en la invitación del tesorero de prueba, "Anular" → confirmar. Su link ahora dice "Esta invitación fue anulada…".
- [ ] **"No, gracias":** creá otra invitación y abrí su link: muestra "Rechazaste la invitación de Liga Barrial Sur.".
- [ ] **Con admin@:** el selector de rol solo ofrece Árbitro / delegado, Tribunal de disciplina y Capitán.
- [ ] **Invitación a alguien que ya tiene cuenta:** invitá a `norte@potrero.app` como árbitro y abrí el link en incógnito.
  - Con una contraseña mala, muestra el error en la misma pantalla.
  - Con `potrero-demo-2026` ("Entrar y aceptar"), entra directo a Liga Barrial Sur como árbitro.

### 2.5 Panel del capitán (capitan@potrero.app, en incógnito)
- [ ] **Ingresar:** va solo a `/capitan`. Entrar a `/panel/caja` lo devuelve a `/capitan`.
- [ ] **Encabezado:**
  - "Liga Barrial Sur", pastilla "Capitán", "Sitio de la liga" y "Salir".
  - Título "Villa Unión" con "Apertura 2026 · N° puesto · N pts".
- [ ] **Selector de torneo:** cambia entre los torneos de Villa Unión.
- [ ] **"Próximo partido":**
  - "vs <rival>" con fecha, cancha y local o visitante.
  - **5/8 confirmaron** y "1 suspendido".
  - "Últimos": 3 resultados.
  - "Avisar a los pendientes" abre WhatsApp con el texto armado.
- [ ] **"Deuda del equipo":** "Al día".
- [ ] **"Convocatoria":**
  - Marcá un jugador con ✓ y otro con ✗; el contador cambia.
  - "Pendientes" filtra.
  - El suspendido dice "Suspendido · 1 fecha" y no tiene botones.
- [ ] **"Documentación":** barras de DNI, Apto y Autorización del tutor, y "N de 9 habilitados para jugar".
- [ ] **"Sanciones y descargos":**
  - El expulsado tiene "Roja directa", "Suspendido" y un expediente "Esperando tu descargo".
  - Escribí un descargo → "Enviar descargo" → "Descargo enviado". Se puede "Editar descargo".
- [ ] **"Tabla":** Villa Unión resaltado.
- [ ] **"Plantel":**
  - "Sumar jugador" con Nombre, Apellido y Número 20 → "Jugador sumado. Para jugar le falta la documentación que pide el torneo."
  - Número repetido → "El número 3 ya lo usa otro jugador del equipo."
  - DNI de 5 dígitos → "El DNI son 7 u 8 números."
  - Con el jugador nuevo aparece "Pedir faltantes por WhatsApp" en Documentación.
  - Dalo de baja con ✗.
  - Un jugador con goles o tarjetas muestra un candado: "pedile la baja al organizador".
  - Facundo Ledesma (#8) dice "En la app". En otro jugador, "Invitar a la app" → email → link con "Mandar por WhatsApp".

### 2.6 Panel del jugador (jugador@potrero.app, en incógnito)
- [ ] **Ingresar:** va solo a `/jugador`. Entrar a `/panel` o a `/capitan` lo devuelve a `/jugador`.
- [ ] **Próximo partido:** vs La Banda, con "Voy" y "No voy". Tocá "Voy".
- [ ] **"Mis avisos":** con los datos recién cargados aparece "¿Vas contra…?"; después de responder, ya no.
- [ ] **Lo suyo:** goles y partidos, sanciones, documentación (puede subir DNI y apto), trayectoria y deuda del equipo (solo lectura).
- [ ] **"Cómo aparezco":** elegí "Apodo" (pide escribirlo) o "Iniciales". En el sitio público su nombre cambia.
- [ ] **Del lado del capitán:** entrá con capitan@: en la convocatoria Facundo figura "Va".
- [ ] **Aceptar una invitación de jugador:** abrí el link que generó el capitán en 2.5. Dice "Te invitaron como jugador de Villa Unión" y pide aceptar los términos para crear la cuenta.

### 2.7 Panel de Gregal (staff@gregal.tech, en incógnito)
- [ ] **Entrar:** desde el pie de la landing, "Equipo Gregal" → `/gregal/ingresar` → staff@gregal.tech. Arriba dice "Uso interno · todo queda auditado".
- [ ] **Inicio:**
  - Ligas activas, torneos en curso con equipos y jugadores, cobrado total e ingresos de Gregal (suscripciones y cargos por servicio).
  - Partidos cerrados por semana (últimas 8), cobrado por medio, ligas nuevas por mes.
  - "Ligas para llamar": Liga Amigos de Quilmes en riesgo, y Veteranos del Oeste y Fútbol 5 Palermo en atención.
- [ ] **Organizaciones:** buscá "quilmes" → detalle con 3 alertas (pocas actas cargadas, solo pagos manuales, sin usar el panel hace 21 días), sus torneos, usuarios y cobros.
- [ ] **Dinero:** cobros y cargos por servicio por mes y por liga.
- [ ] **Auditoría:** cada consulta que hiciste figura con tu usuario, la liga que miraste y la hora.
- [ ] **Sesiones separadas:** con la sesión de demo@ abrí `/gregal` → pide el ingreso del staff. Con la del staff abrí `/panel` → pide el ingreso de organizador.
- [ ] **Rol soporte:** con soporte@gregal.tech, Dinero y Auditoría muestran que no tiene acceso.

---

## Parte 3 · Inscripciones, cobros y torneos nuevos

### 3.1 Inscripción pública (Clausura 2026, antes de generarle el fixture)
- [ ] **Abrir el formulario:** en incógnito, `/t/liga-barrial-sur/clausura-2026` → "Inscribir mi equipo" → "Inscribí tu equipo".
- [ ] **Nombre repetido:** "La Banda" → "Ya hay un equipo con ese nombre en la liga…".
- [ ] **Equipo nuevo:** "Los Tigres", con capitán, email y WhatsApp → "Continuar al pago".
  - Checkout con "Modo demo: este checkout simula Mercado Pago…", "Inscripción Clausura 2026" y $ 75.000.
- [ ] **Pagar:** "Pagar (aprobar)" → "¡Pago aprobado! Tu inscripción quedó confirmada." El sitio ahora dice 4 de 12.
- [ ] **En el panel:** Clausura → Inscripciones: Los Tigres "Confirmada", pagada por Mercado Pago, con el cargo por servicio a cargo del equipo.
- [ ] **Pago rechazado:** otro equipo, "Los Leones" → "Simular pago rechazado" → "El pago fue rechazado." con el botón "Intentar de nuevo", que abre un checkout nuevo. Dejalo sin pagar: en el panel queda "Pendiente".

### 3.2 Inscribir y cobrar desde el panel (Clausura 2026)
- [ ] **Vencimiento:** "Vence el pago de la inscripción" → elegí una fecha → "Guardar vencimiento" → "Guardado."
- [ ] **Inscribir:** "Inscribir un equipo de la liga" → Atlético Norte → "Inscribir". Aparece una fila "Pendiente $0 / $75.000".
- [ ] **Cobrar en efectivo:** "Cobré $75.000 en efectivo" → "Confirmada", "Efectivo", sin cargo por servicio.
- [ ] **Pago parcial por transferencia:**
  - En Los Leones, "Registrar pago" → Monto 30000, Medio "Transferencia", Comprobante "TRF 123". Aparece "Pago parcial: queda debiendo $ 45.000" → registrar.
  - La fila queda "Pendiente $ 30.000 / $ 75.000".
- [ ] **Completar el pago:** "Registrar pago" otra vez, con el saldo que trae por defecto → "Confirmada · Al día".
- [ ] **Ver y anular un pago:** "Ver pagos (2)" → "Anular" el de $ 30.000. Vuelve a deber y en Caja aparece la reversa del movimiento.
- [ ] **Link de pago:** en otro equipo pendiente, "Link de pago" → "Copiado: http://localhost:3000/pago/…". Abrilo: el checkout muestra el arancel, el cargo por servicio y el total. Aprobá: queda pagado y el organizador recibe el arancel completo.
- [ ] **Monto de más:** "Registrar pago" con más que el saldo → no lo deja.

### 3.3 Editar el torneo y cambiar su estado (Clausura 2026)
- [ ] **Editar:** "Editar" en el encabezado → cambiá el nombre a "Clausura 2026 B", el cupo y la inscripción a 80000 → guardar.
  - La pantalla explica que el monto nuevo solo cambia los cargos sin pagos, y después dice cuántos se actualizaron.
  - Un cupo menor que los inscriptos no se puede guardar.
  - Volvé el nombre a "Clausura 2026".
- [ ] **Cerrar y reabrir la inscripción:** "Cerrar inscripción" → confirmar → "En curso"; "Reabrir inscripción" → vuelve a "Inscripción abierta" (solo mientras no tenga fixture).
- [ ] **Finalizar:** en Apertura 2026, "Finalizar torneo" avisa "Quedan N partidos sin jugar". Tocá **Cancelar**.

### 3.4 Crear un torneo y probar los cobros por fecha
- [ ] **Vista previa:** `/panel/torneos/nuevo` ("Armá tu torneo") cambia sola al tocar formato, cupo y montos.
  - Liga con cupo 16 → "120 partidos estimados"; con "Ida y vuelta", 240.
  - Copa → 15; Grupos + playoffs → 31; Liga + playoffs → 127.
- [ ] **Crear "Prueba Cobros":**
  - Liga, Fútbol 5, cupo 8, inscripción 0.
  - "Cuota por fecha, por equipo ($)" 5000 y "Seguro por jugador, por fecha ($)" 500.
  - "Crear y abrir inscripción".
- [ ] **Inscribir:** Atlético Norte, Villa Unión, Estrella Roja y Juventud Unida. Con inscripción $ 0 quedan confirmados solos.
- [ ] **Generar el fixture:**
  - Pestaña "Fixture": "Primer día de juego" = hoy, "Horarios" = una hora más tarde que ahora, las dos canchas.
  - "Generar fixture con 4 equipos confirmados". El torneo pasa a "En curso".
- [ ] **Cargos generados** (en "Inscripciones y pagos"):
  - 4 "Cuota fecha 1" de $ 5.000 y 4 "Seguro fecha 1 · 9 jugadores" de $ 4.500.
  - Las tarjetas muestran "Cuota de hoy".
- [ ] **Deuda en el acta:**
  - En "Cuota por fecha y seguro", tildá "La deuda vencida no deja jugar" → "Guardar cobros por fecha".
  - Abrí un acta de la fecha 1: aviso ámbar "{Equipo} debe $ 5.000 (Cuota fecha 1)". Solo avisa; no bloquea la carga.
- [ ] **Activar con el torneo empezado:**
  - En Apertura 2026 → "Cuota por fecha y seguro", poné cuota 3000 → "Guardar cobros por fecha".
  - Aparece "Se activó con el torneo empezado: las fechas ya jugadas no se cobran. Cuota desde la fecha 5."
  - Volvé la cuota a 0 y guardá.

### 3.5 Cupo y otros formatos
- [ ] **Cupo lleno:** torneo "Prueba Cupo", cupo 2, inscripción 0. Inscribí 2 equipos; el 3.º da "El torneo completó su cupo de 2 equipos."
- [ ] **Copa:**
  - Torneo "Prueba Copa", Copa, inscripción 0, con 6 equipos inscriptos.
  - Pestaña "Llaves" → "Sortear y armar la llave" con una cabeza de serie. Las mejores semillas pasan libres.
- [ ] **Grupos + playoffs:**
  - Torneo "Prueba Grupos", con 6 equipos inscriptos.
  - Pestaña "Fase de grupos" → "Cantidad de grupos" 2 → armar.
- [ ] **Liga + playoffs:**
  - Torneo con 4 equipos y el fixture generado.
  - En "Llaves" dice "Todavía faltan jugar N partidos de la fase regular." Para cerrarlos rápido, cerrá las actas con un resultado (o marcá un equipo ausente en los partidos cuya hora ya pasó).

### 3.6 Armá el formato (simulador del armado flexible)
- [ ] **Abrir:** `/panel/torneos` → "Armá el formato" (también está en "Nuevo torneo", sección "2 · Formato").
  - Arriba explica que es la vista previa del torneo; abajo, la tarjeta "¿Te cierra?" con "Crear torneo con este formato".
- [ ] **Ejemplo inicial:** 20 equipos, 2 canchas × 5 horarios, plantilla "Grupos + playoffs + copa estímulo".
  - Totales ≈ 16 sábados, 140 partidos, 69 % de sábados con todos jugando y recaudación estimada ≈ $ 4.000.000 (inscripción + una cuota de ejemplo de $ 10.000 por fecha).
- [ ] **Diagrama de fases:** Fase 1 (2 grupos) → Playoffs (octavos a final, ida y vuelta salvo la final) y Copa estímulo (los eliminados) → final de la copa. Cada fase muestra de dónde vienen sus equipos y sus cruces ("1º A vs 8º B").
- [ ] **Cronograma:** una barra por sábado, con color por fase y los equipos libres rayados.
- [ ] **Editar en vivo:** cambiá la cantidad de equipos, agregá, quitá o reordená fases, cambiá ida y vuelta por ronda: todo se recalcula.
- [ ] **Error:** en Playoffs, poné "al 12" → aparece "no hay puesto 12".
- [ ] **Plantillas:** probá "Liga", "Copa", "Grupos + playoffs" y "Liga + playoffs".
- [ ] **Celular (~390 px):** sin scroll horizontal; el cronograma aparece antes del editor.

### 3.7 Torneos por fases de verdad
- [ ] **Torneo de ejemplo:** `/panel/torneos` → "Torneo Primavera 2026" → pestaña "Fases".
  - Fase 1: dos grupos de 6, con tabla por grupo y partidos por fecha (jugada hasta la fecha 3).
  - Playoffs: "todavía no se puede armar: Falta terminar Fase 1", con las rondas previstas (cuartos y semis ida y vuelta, final a partido único).
  - Copa estímulo: espera a los eliminados.
- [ ] **Sitio público:** `/t/liga-barrial-sur/torneo-primavera-2026`, con una pestaña por fase.
- [ ] **Crear uno desde el simulador:**
  - En "Armá el formato", elegí una plantilla chica (por ejemplo, "Grupos + playoffs" con 8 equipos) → "Crear torneo con este formato" → nombre "Prueba Fases", inscripción 0 → crear.
  - Inscribí 8 equipos (con inscripción $ 0 quedan confirmados) → pestaña "Fases" → "Generar Fase 1" con primer día, horarios y canchas.
  - Cerrá las actas de la fase de grupos (o marcá equipos ausentes en partidos cuya hora pasó). Cuando la fase termina, aparece "Generar" en la siguiente con los clasificados correctos.
- [ ] **Ida y vuelta:** en la vuelta de una serie, si el global queda empatado, el acta pide "El global de la serie está empatado: cargá los penales". En la ida no los pide.
- [ ] **Formatos fijos intactos:** Apertura, Clausura y Copa siguen funcionando como antes.

---

## Parte 4 · Fixture, acta, sanciones y documentación

### 4.1 Árbitros y aviso en un toque
- [ ] **Designar a mano:**
  - `/panel/arbitros`: en el partido de hoy sin árbitro, elegí uno en el selector.
  - Aparece "Pendiente · confirmar"; al tocarla pasa a "Confirmado". Julián Vera no aparece porque no está disponible ese día.
- [ ] **Panel:** desaparecen la alerta "Partido sin árbitro" y la sugerencia de árbitros.
- [ ] **Aviso del fixture en un toque:**
  - La sugerencia principal pasa a ser la del fixture, con el botón "Avisar a los capitanes". Tocalo.
  - En Comunicación aparece un envío nuevo de "Fixture publicado".
- [ ] **Designar automático:**
  - Dejá el partido en "Sin árbitro" → "Designar automático" → "Designamos 1 partido."
- [ ] **Alta de árbitro:**
  - "Nuevo árbitro" con disponibilidad "sáb 14:00-22:00" → "Agregar árbitro".
  - Con "lunes" → "No entendimos "lunes"…".
- [ ] **Bloquear una cancha:**
  - Cancha 2 → "Editar" → "Bloqueada" con el motivo "Mantenimiento del césped" → "Guardar cancha".
  - Aparece "Bloqueada · Mantenimiento del césped". Desbloqueala después.
- [ ] **Alta de cancha:** en `/panel/canchas`, agregá una cancha nueva. Aparece en el formulario de fixture como "Sede · Cancha".

### 4.2 Mover partidos (Apertura 2026, Fecha 5)
- [ ] **Abrir la fecha:** Fixture → "Fecha 5" muestra "4 partidos en la fecha 5. Elegí uno para moverlo o cambiarle el horario."
- [ ] **Intercambiar arrastrando:**
  - Arrastrá una tarjeta sobre otra. Aparece "Cómo queda" con "Sin conflictos" o los conflictos.
  - "Confirmar cambio" → "Listo: se intercambiaron los dos partidos."
- [ ] **Mover a una cancha ocupada:**
  - Tocá un partido → "Mover" → misma hora y cancha que otro.
  - Aparece "La cancha ya está ocupada a esa hora."; el botón se habilita al tildar "Los vi y quiero seguir igual".
- [ ] **Mover con aviso a los capitanes:**
  - Mové un partido a otro horario libre, tildá "Avisar a los capitanes" con el motivo "Cambio de horario" y confirmá.
  - Aparece "Listo: se movió el partido. Avisamos a 2 capitanes." y el aviso queda en Reprogramaciones.
- [ ] **Celular (~390 px):** tocá un partido y después otro para intercambiarlos.

### 4.3 Acta del partido en vivo (antes de que pasen 2 h desde la carga)
- [ ] **Abrir:** panel → "Abrir acta". Se ven el marcador 2-1, los eventos y la carga por jugador ("Gol", "Amarilla", "Roja", "En contra").
- [ ] **Dueño único:**
  - Desde demo@, cargá algo (por ejemplo, una amarilla): con esa primera carga, tu dispositivo pasa a ser el dueño del acta.
  - Abrí la misma acta con admin@ en incógnito: recuadro "Otro dispositivo tiene esta acta…" y la carga deshabilitada.
  - "Tomar el acta en este dispositivo" → ahora carga admin@. En unos 8 s la ventana de demo@ muestra el recuadro.
  - Volvé a tomarla desde demo@.
- [ ] **Sin conexión (con `pnpm demo` alcanza):**
  - DevTools (F12) → Network → "Offline".
  - La barra dice "Sin conexión. Podés seguir cargando el acta.".
  - Cargá un gol y anulalo: se ven al instante con "sin enviar".
  - Volvé a "Online" (desactivá "Offline"): "Sincronizando…" y después "En línea · todo sincronizado". Recargá: no se duplicó nada.
- [ ] **Cargar eventos:**
  - Un gol con minuto.
  - Un gol "En contra": suma al rival.
  - "Anular" en un evento.
- [ ] **Doble amarilla** (para probar 4.5): cargá **2 amarillas al mismo jugador del equipo visitante**.
- [ ] **Orden de la línea de tiempo:** cargá un evento en el minuto 5 después de los del 12' y el 30': se ordena por minuto, y los eventos sin minuto quedan al final.
- [ ] **Jugador no habilitado:**
  - Un suspendido muestra "Este jugador está suspendido. Quedó registrado y el tribunal lo va a revisar."
  - Uno sin la documentación al día muestra "Este jugador no está habilitado: {motivo}. Quedó registrado."
- [ ] **Cierre sin firmas:**
  - "Cerrar acta" → sin firmas ni justificación → "Confirmar cierre".
  - La pantalla avisa en el momento que faltan las firmas o la justificación del árbitro.
- [ ] **Cierre correcto:**
  - Tildá las dos firmas → "Confirmar cierre" → "Acta cerrada…".
  - La tabla del Apertura suma el partido.
  - En Caja aparecen "Alquiler de cancha · … · Cancha 1" y, si el partido tenía árbitro, "Pago a árbitro · …".

### 4.4 Equipo ausente (no se presentó)
- [ ] En el acta de ayer (alerta "Acta sin cargar" → "Cargar"), tocá "{Local} no se presentó".
  - El acta queda en "Equipo ausente", con el marcador 0-3 y "Ganó {Visitante}: {Local} no se presentó".
  - En la grilla del fixture dice "0-3 · ausente"; en el sitio público y en la imagen del partido, el mismo resultado y la misma leyenda.
- [ ] En la tabla, el visitante suma 3 puntos. La alerta del panel desaparece.

### 4.5 Tribunal y levantar sanción pagando
- [ ] **Informe y descargo:**
  - En la roja, "Cargar informe" → "Guardar".
  - Se ve el descargo que mandó el capitán en 2.5.
  - "Cargar descargo" desde el organizador también funciona → "Descargo recibido".
- [ ] **Resolver la roja:** "Resolver" → "Partidos de suspensión" 2 → "Confirmar resolución" → "Ampliada por el tribunal".
- [ ] **Multa a la hinchada:**
  - "Resolver" la hinchada con 0 partidos y "Multa al equipo ($)" 20000.
  - Aparece el cargo "Multa · Incidentes en la tribuna" en Inscripciones del Apertura.
  - Cobralo con "Cobré … en efectivo". Entra a la caja como Multas.
- [ ] **Expediente manual:** "Abrir expediente" → tipo, equipo, **jugador** y partido (opcional), motivo → "Abrir". Al resolverlo se puede suspender al jugador.
- [ ] **Informe desde el tribunal:** con tribunal@, "Cargar informe" en un expediente funciona (el tribunal no puede tocar el acta).
- [ ] **Doble amarilla automática:** en "Automáticas" aparece la doble amarilla del partido que cerraste en 4.3.
- [ ] **Activar levantar pagando:**
  - "Reglamento aplicado" → "Editar" → tildá "Permitir levantar una suspensión pagando", "Amarillas acumuladas" y "Doble amarilla".
  - "Monto por partido ($)" 3000 → "Guardar".
- [ ] **Pedir y anular:**
  - En "Suspendidos esta fecha", "Levantar pagando · $ 3.000" → "Confirmar" → "Pago pendiente · $ 3.000".
  - "Anular": vuelve el botón.
- [ ] **Pedir y pagar:**
  - Pedilo de nuevo → "Registrar pago en efectivo".
  - Sale de "Suspendidos esta fecha" y en "Historial" la columna "Levantadas" muestra 1.
  - En el acta de la fecha 5 de su equipo figura "Habilitado".

### 4.6 Documentación
- [ ] **Requisitos:** destildá "Apto físico" → "Guardar". El #9 de Real Barrio queda habilitado, también en el acta. Volvé a tildarlo.
- [ ] **Subir un documento:** ficha del #9 de Deportivo Sur ("Revisar") → "Subir documento" → DNI con una imagen JPG o PNG real → "Subir". Queda "Por revisar".
- [ ] **Aprobar:** "Aprobar" → el jugador se habilita.
- [ ] **Rechazar:** en el #9 de Juventud Unida, el DNI → "Rechazar" con motivo → "Confirmar rechazo".
- [ ] **Ver el archivo:** "Ver" abre el archivo y suma un acceso registrado.
- [ ] **DNI completo:** "Ver DNI completo (queda registrado)" muestra el número entero.
- [ ] **Duplicado:** en el bloque de duplicados, "Su DNI está mal cargado" en uno de los dos. El bloque desaparece.
- [ ] **Autorización del tutor:**
  - Ficha del #9 de Atlético Norte → "Pedir autorización al tutor" → link `/tutor/…`.
  - Abrilo en incógnito, completá nombre, DNI y vínculo (y opcionalmente "Uso de imagen") → "Autorizo" → "¡Gracias!".
  - Reabrí el link: "Este link no sirve".
  - El jugador queda habilitado. "Revocar" lo vuelve a "Menor sin autorización del tutor".
- [ ] **Pedir faltantes:** "Pedir faltantes" → "Les avisamos a N capitanes…". La segunda vez en el día dice "Ya les avisamos hoy…".

---

## Parte 5 · Plata, operación, sponsors, configuración

### 5.1 Caja
- [ ] **Egreso:** "Cargar un movimiento" → Egreso, Rubro Canchas, "Alquiler fecha 7", 5000, Efectivo, "Recibo 0021", Apertura 2026 → "Registrar egreso" → "Movimiento registrado.".
- [ ] **Ingreso:** Ingreso, "Otros ingresos", Mercado Pago, 10000 → "Registrar ingreso". El disponible en Mercado Pago sube $ 10.000.
- [ ] **Retiro:** "Retirar a mi cuenta" → 1000, "...9999" → "Registrar retiro" → "Retiro de $ 1.000 registrado.".
- [ ] **Anular:** "Anular" el egreso → "Sí". El original queda tachado "· anulado" y aparece "Anulación: …" con el signo contrario. Los cobros no se pueden anular.
- [ ] **Exportar por torneo:** elegí un torneo y tocá "Exportar". El CSV trae solo ese torneo.

### 5.2 Reprogramaciones
- [ ] **Confirmar:** en `/panel/reprogramaciones`, "Mover al día siguiente" → revisá la vista previa y el mensaje de ejemplo → "Confirmar y avisar".
  - Aparece "Listo: movimos 1 partido y avisamos a 2 capitanes.", con el link "Ver quién respondió".
- [ ] **Cancha techada:** con la Cancha 2 bloqueada (4.1), elegila sola: "Las canchas elegidas no existen o están bloqueadas."
- [ ] **Responder "Confirmo":**
  - En el detalle, "Ver el mensaje que recibió" → abrí el link `/c/…` en incógnito → "Confirmo".
  - Aparece "¡Gracias! Quedó confirmado…".
- [ ] **Responder "No puedo":**
  - Con el link del otro capitán, "No puedo".
  - En `/panel` aparece la alerta "1 equipo no puede jugar" con "Ver".
- [ ] **Link inválido:** cambiá letras del link → "Este link no es válido".

### 5.3 Comunicación
- [ ] **Vista previa del mensaje:** "Nuevo mensaje" a "Todos los capitanes" con "Mensaje libre":
  - Canales WhatsApp 6, Email 3, Push 0.
  - Costo estimado en dólares y pesos.
  - Avisos de quién no acepta WhatsApp y a quién no le llega.
- [ ] **Variables:**
  - Escribí "{rival}" → "Estas variables no existen en un mensaje libre: {rival}."
  - "Fixture publicado" a todos → pide completar {torneo}. Con "Un torneo" se habilita.
- [ ] **Envío manual:** "Un equipo" → La Banda → enviar → "Listo: enviamos 1 mensaje.". Aparece primero en "Últimos envíos".
- [ ] **Programado:** "Programar" para dentro de 2 minutos → "Quedó programado…". Pasada la hora, figura como enviado.
- [ ] **Recordatorio a morosos:** en `/panel`, "Recordar a los 2" → "Recordatorio enviado". En Comunicación, el mensaje dice el saldo que se debe ($ 30.000 para Sportivo Barrio), no el monto total del cargo.
- [ ] **Automatizaciones:** cambiá el canal de una a Email y volvelo a WhatsApp.

### 5.4 Sponsors
- [ ] **Nuevo sponsor:** "Nuevo sponsor" con rubro "Bebidas alcohólicas" → "Guardar sponsor".
- [ ] **Regla de menores:** "Ofrecer" el espacio "Entre secciones" del Apertura a ese sponsor → "El torneo tiene jugadores menores de edad: no se aceptan sponsors de bebidas alcohólicas."
- [ ] **Vender un espacio:** vendelo a Kiosco Don Pepe con desde, hasta y monto. Aparece en el sitio público con "Publicidad".
- [ ] **Cobro:** "Cobro" de un sponsor → "Registrar en la caja". En Caja aparece "… · sponsor".
- [ ] **Pausar:** "Pausar" un espacio. Deja de verse en el sitio público. "Reanudar".
- [ ] **Rubros:** tocá un rubro en "Rubros que no aceptás" para rechazarlo o aceptarlo.
- [ ] **Clics:** en el sitio público, "Visitar" un sponsor. En su reporte suma un clic.

### 5.5 Configuración e importación (Liga Barrial Sur)
- [ ] **Paso 1:** "Tu organización" → "Guardar y continuar" → progreso 80%.
- [ ] **Paso 3, errores de marca:**
  - Dirección `complejo-norte` → "Esa dirección ya la usa otra liga."
  - Un logo de más de 300 KB → "El logo pesa más de 300 KB…".
- [ ] **Paso 3, guardar:** cambiá el color y subí un logo PNG chico, **sin cambiar la dirección** → "Guardar y continuar".
  - Progreso **100%**: "Configuración completa…".
- [ ] **Importar con errores:** `/panel/configuracion?paso=importacion` → subí `apps/web/public/plantillas/potrero-ejemplo-con-errores.xlsx`:
  - "Hay 5 errores…":
    - fila 6, DNI repetido con la fila 3;
    - fila 14, "123" no es un DNI;
    - fila 22, el equipo "Los Alcones" no existe;
    - fila 35, "31/02/1999" no es una fecha;
    - fila 43, apellido vacío.
  - Aviso amarillo "Para tener en cuenta (1)": Los Halcones ya existe.
  - Pestañas Equipos (8), Jugadores (80) y Canchas (4), con las filas con error en rojo.
  - Botón deshabilitado "Corregí los errores para importar".
- [ ] **Otros archivos:**
  - Un .txt → "…no es un Excel (.xlsx) ni un CSV."
  - `potrero-plantilla.xlsx` vacía → "El archivo no tiene filas con datos." (≈)
- [ ] **Descargas:** "Plantilla Excel", "Ejemplo con 8 equipos" y los CSV.

### 5.6 Alta de una liga nueva (desde cero)
- [ ] **Registro:** en incógnito, `/registro` → "Creá tu liga" con un email nuevo y una contraseña de 10 o más caracteres → "Crear mi liga".
  - Va a `/panel/configuracion` en **0%**. La barra muestra el plan de la liga nueva con su precio por mes.
- [ ] **Email repetido:** registrar `demo@potrero.app` → "Ya hay una cuenta con ese email. Probá iniciar sesión."
- [ ] **Asistente:** completá los pasos 1 a 4. Mercado Pago solo ofrece "Conectar después".
- [ ] **Importar el ejemplo:** subí `potrero-ejemplo.xlsx` → "Importar 8 equipos, 80 jugadores y 4 canchas" → "Listo: importamos todo." → "Ver equipos". **Hacelo solo en la liga nueva:** en la de demo agrega equipos de verdad.
- [ ] **Primer torneo:** creá un torneo, inscribí los equipos importados y generá el fixture. Todo en menos de 30 minutos.

---

## Parte 6 · Al final (cambian mucho los datos)

- [ ] **Cobrar al moroso:** Apertura → Inscripciones → Sportivo Barrio → "Cobré $30.000 en efectivo" → "Confirmada". No aparece en la tabla de posiciones, porque no está en el fixture.
- [ ] **Final de la Copa:**
  - Copa Relámpago → "Acta" de la final → "Iniciar partido" → 1-1 → "Cerrar acta". Pide penales: "Es un cruce de llave y terminó empatado: cargá los penales".
  - Con penales distintos y las firmas, la llave muestra al "Campeón" y el torneo pasa a "Finalizado".
- [ ] **Quitar al capitán:**
  - Usuarios → "Quitar" a Matías Gómez → confirmar.
  - En su ventana, el capitán pierde el acceso al instante: "Tu usuario no es capitán de ningún equipo.".
- [ ] **Bloqueo por intentos:**
  - En incógnito, 5 intentos con contraseña mala para `tribunal@potrero.app`.
  - El 6.º, aun con la contraseña buena, da "Por seguridad bloqueamos el ingreso a esta cuenta por 15 minutos…".
- [ ] **Cerrar sesión en todos lados:** Mi cuenta → "Cerrar sesión en todos los dispositivos" → "Sí, cerrar todas" → `/ingresar`.

### 6.1 Acta sin señal real y app instalable (opcional, modo producción)
Con `pnpm demo` la página no se puede recargar sin conexión. Para probarlo de verdad:
1. Cortá `pnpm demo`.
2. En una terminal: `pnpm --filter @potrero/api start`.
3. En otra: `pnpm --filter @potrero/web build` y `pnpm --filter @potrero/web start`.

- [ ] **Recargar sin conexión:** abrí un acta con conexión, pasá a "Offline" y recargá (F5). Vuelve la misma acta con los cambios sin enviar. Al volver la conexión se sincronizan.
- [ ] **Instalar la app:** ícono de instalar en la barra de Chrome o menú → "Instalar Potrero". Abre el panel como app.
- [ ] **Celular:** en la misma red, `http://IP-de-tu-PC:3000`.

### 6.2 Demo pública (opcional)
1. Cortá `pnpm demo` y levantá `pnpm demo --publica`.
2. Usá una ventana de incógnito.

- [ ] **Banner:** fijo en todas las páginas: "Estás en la demo de Potrero: los pagos son de prueba y los datos se borran solos.", con "Reiniciar demo".
- [ ] **Entrar:** "Probá la demo" → "Entrar a la demo" → cae en el panel de una liga propia, con los mismos torneos de la plantilla.
- [ ] **Qué no trae:** partido en vivo, historia 2025, capitán ni segunda liga.
- [ ] **Reiniciar:** "Reiniciar demo" crea otra liga y borra la anterior.
- [ ] **Bloqueos:**
  - `/registro` → "En la demo no se crean cuentas…".
  - Aceptar una invitación → "En la demo no se crean cuentas por invitación."

---

## Parte 7 · Recorrido corto para mostrar (15 minutos)

Con los datos recién cargados (`pnpm db:reset` + `pnpm demo`), en este orden:

| Paso | Dónde | Qué mostrar | Qué decir |
|---|---|---|---|
| 1 | `/ingresar` | demo@potrero.app | — |
| 2 | Panel | Partido en vivo, alertas con su botón, sugerencia del próximo paso, cobrado y pendiente | "Lo urgente primero, cada mañana." |
| 3 | Apertura 2026 → Fixture → Fecha 5 | Arrastrar un partido sobre otro y confirmar | "Se arma solo, sin choques, y lo acomodás a mano." |
| 4 | Fecha 4 → acta del equipo sancionado | "No habilitado" con su motivo | "El árbitro lo ve antes de que entre a la cancha." |
| 5 | Acta en vivo (en el celular) | Cargar un gol y una tarjeta | "Funciona aunque se corte la señal." |
| 6 | Sitio público → un resultado | Crónica, línea de tiempo, imagen para WhatsApp | "Esto lo comparten los equipos. Sin datos personales." |
| 7 | Sitio público → goleador | Perfil con trayectoria | — |
| 8 | Métricas | Cómo te pagan, quién vuelve | "El efectivo es el medio principal: lo medimos." |
| 9 | Clausura 2026 → Inscripciones | "Registrar pago": $ 30.000 por transferencia, pago parcial | "El efectivo y la transferencia también se registran, con su comprobante." |
| 10 | Torneos → "Armá el formato", después "Torneo Primavera 2026" | Grupos + playoffs + copa estímulo: sábados cubiertos y recaudación; el torneo creado, con sus fases | "Armás el torneo a tu manera, ves cuántas fechas juegan todos y lo creás." |
| 11 | Configuración → Importación | El Excel con errores, explicado fila por fila | "Dejá el Excel: lo importás en minutos." |
| 12 | Capitán (otra ventana) | Convocatoria, documentación, descargo | "El capitán hace su parte y te saca trabajo." |
| 13 | Jugador (otra ventana) | "Voy" al próximo partido, sus goles y su documentación | "Cada jugador confirma solo; el capitán lo ve al instante." |
| 14 | `/gregal` (staff@gregal.tech) | Ligas activas, cobrado, ligas para llamar | "Así vemos nosotros toda la plataforma." |

---

## Fallas ya conocidas

Lo que todavía no está bien. No hace falta reportarlo. Las fallas corregidas el 26/10 (sanciones con "undefined", pagos manuales, editar y finalizar torneos, permisos, equipo ausente, cierre del acta y otras) ya no figuran.

**Torneos y cobros**
1. El alta de torneo no tiene seña, reglamento propio completo (desempates, tolerancia) ni documentación exigida. La documentación se configura en Documentación.
2. No hay vista previa antes de generar el fixture, ni forma de regenerarlo.
3. Torneos por fases: la fase 1 se genera a mano (no sola al cerrar la inscripción); no se puede editar el formato ni rehacer una fase; al programar, las fases no se cruzan entre sí (hay que elegir canchas y horarios distintos); no hay grilla para mover partidos a mano; el calendario no saltea feriados. La ida y vuelta solo existe en torneos por fases.

**Cuenta**

4. El capitán y el jugador no tienen "Mi cuenta": solo pueden cambiar su contraseña con "¿Te olvidaste la contraseña?".

**Panel y operación**

5. "Conciliar" no tiene botón: la conciliación pasa sola al abrir Caja, sin mensaje.
6. En Árbitros, el aviso de disponibilidad no se puede ver porque el selector ya filtra a los no disponibles.
7. Reprogramaciones no deja elegir otro día cuando hay alerta de clima.
8. Los avisos automáticos no tienen una bandeja para verlos (solo un contador).
9. El espacio de sponsor "Tarjeta de resultado" no aparece en la imagen del partido.

**Demo pública**

10. Muestra las credenciales de demo@, que no existen en esa base. "Crear mi liga de verdad" lleva a un registro bloqueado.
11. Si el visitante sale, pierde su liga y no puede volver a entrar.

## Si algo falla
- **"Docker no está corriendo":** abrí Docker Desktop y esperá a que diga que está activo.
- **Puerto ocupado** (3000, 4000 o 55432): cerrá la otra aplicación o la demo anterior.
- **"Cupo completo" en la inscripción pública:** el Clausura acepta 12 equipos. Hacé `pnpm db:reset`.
- **"Por seguridad bloqueamos el ingreso…" o "Hubo demasiados intentos…":** esperá el tiempo que indica (hasta 15 minutos) o hacé `pnpm db:reset`.
- **El partido ya no está "en vivo":** pasaron más de 2 horas desde la carga. Hacé `pnpm db:reset`.
