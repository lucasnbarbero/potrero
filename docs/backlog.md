# Backlog de Potrero · de cero al lanzamiento público

Este archivo tiene **todo** lo que hay que hacer para tener la aplicación cerrada, en orden de ejecución. No lleva sprints ni fechas.
Fuente: documentos 1 a 6 (`docs/src`). Si algo de este backlog contradice esos documentos, valen los documentos y se corrige el backlog.

## Cómo leerlo

- **Orden:** las épicas siguen el orden de construcción. Dentro de cada épica, las tareas también están en orden. Una tarea puede empezar cuando su épica tiene cumplidas las dependencias que indica.
- **ID:** `E07-05` = épica 07, tarea 05. Los IDs no cambian; las tareas nuevas se agregan al final de su épica.
- **Tipo:** `dev` desarrollo · `neg` negocio y ventas · `legal` legal y contable · `ops` operación e infraestructura · `doc` documentación.
- **Hecho cuando:** el criterio mínimo para cerrar la tarea. Toda tarea `dev` además requiere tests de sus reglas, tipos y lint sin errores, y revisión.
- **Hito:** se indica el hito interno del documento 1 (H0 a H7) en el que entra la épica.
- **Estado:** `[ ]` pendiente · `[~]` en curso · `[x]` hecha.

## Avance

Última actualización: 26/10/2026. Hecho: 132 tareas · parciales: 76. Resumen de lo que funciona: `docs/contexto/estado-actual.md`.

## Mapa de épicas

| # | Épica | Hito | Módulos (mocks) | Depende de |
|---|---|---|---|---|
| E00 | Preparación del negocio y decisiones | Previo | — | — |
| E01 | Repositorio y forma de trabajo | H0 | — | — |
| E02 | Base técnica de la plataforma | H0 | — | E01 |
| E03 | Sistema de diseño (`packages/ui`) | H0 | todos | E01 |
| E04 | Identidad, organizaciones y permisos | H0 | — | E02 |
| E05 | Reglamentos, torneos, equipos y jugadores | H1 | 02 | E04 |
| E06 | Inscripciones y cobros con Mercado Pago | H1 | 03 | E05, E00-03 |
| E07 | Caja del torneo | H1 | 14 | E06 |
| E08 | Canchas y árbitros | H2 | 15 | E05 |
| E09 | Motor de fixture | H2 | 04 | E05, E08 |
| E10 | Llaves y playoffs | H2 | 17 | E09 |
| E11 | Partidos y acta digital | H3 | 05 | E09 |
| E12 | Tabla de posiciones y estadísticas | H3 | 06 | E11 |
| E13 | Sitio público del torneo y PWA | H3 | 06 | E12, E10 |
| E14 | Sanciones y tribunal | H4 | 12 | E11, E12 |
| E15 | Documentación, identidad y consentimientos | H4 | 13 | E05, E00-05 |
| E16 | Mensajería y comunicación | H5 | 16 | E04, E00-04 |
| E17 | Contingencias, reprogramaciones y equipos ausentes | H5 | 11 | E09, E11, E16 |
| E18 | Panel del organizador | H5 | 01 | E06, E11, E14, E15 |
| E19 | Panel del capitán | H6 | 07 | E06, E15, E16 |
| E20 | Jugadores y perfil | H6 | 08 | E12, E15 |
| E21 | Página de partido | H6 | 09 | E11, E20 |
| E22 | Mercado de pases | H6 | 10 | E20 |
| E23 | Sponsors | H6 | 18 | E13, E07 |
| E24 | Métricas | H6 | 19 | E06, E09, E11 |
| E25 | Configuración inicial e importación | H6 | 20 | E06, E05 |
| E26 | Planes, suscripción y facturación | H6 | — | E06, E16 |
| E27 | Landing y sitio de marketing | H6 | landing | E03, E26 |
| E28 | Legal dentro del producto | H6 | — | E00-05 |
| E29 | Seguridad | H7 (y continuo) | — | todo |
| E30 | Calidad y pruebas | H7 (y continuo) | — | todo |
| E31 | Plataforma, despliegue y operación | H7 (y continuo) | — | E00-06 |
| E32 | Documentación de producto y soporte | H7 | — | funciones estables |
| E33 | Beta cerrada con ligas fundadoras | Beta | — | E13 en adelante |
| E34 | Lanzamiento público | Lanzamiento | — | todo |
| E36 | Backoffice de Gregal (`apps/admin`) | H0 a H7, junto a cada módulo | — | E04 |
| E37 | Demo pública con sandbox por visitante | H6 (cierra en H7) | landing | E27, E06-18, E02-11 |
| E35 | Fuera de alcance del lanzamiento | Después | — | — |

Notas sobre el orden:
- E29, E30 y E31 tienen tareas que se hacen desde el principio (marcadas *continuo*). En el mapa figuran en H7 porque ahí se cierran.
- E36 (backoffice) no es una etapa al final: cada parte se construye junto con el módulo que administra (por ejemplo, la parte de dinero con E06). Las herramientas internas que figuran en otras épicas se implementan dentro del backoffice.
- La beta (E33) arranca cuando existen acta, tabla y sitio público (E13), según el documento 5, y corre en paralelo con H4 a H7.
- Si hay que recortar, el orden está en el documento 1, sección 11. Lo que nunca se recorta: cobros, fixture, acta, tabla, sitio público, sanciones, comunicación y contingencias.

---

## E00 · Preparación del negocio y decisiones
Lo que no es código pero bloquea al código. Fase A del documento 5.

- [ ] **E00-01** `neg` Hacer 8–10 entrevistas de descubrimiento con organizadores. _Hecho cuando:_ hay notas con frases textuales y el dato de recaudación por equipo y por fecha de cada liga.
- [ ] **E00-02** `neg` Probar los competidores (Deporstar, Todo Torneos, FUVEV, Marcagol, Competize, Futzo, Copa Fácil). _Hecho cuando:_ la tabla de competencia de los documentos 2 y 4 queda verificada o corregida.
- [ ] **E00-03** `neg` Iniciar y cerrar el acuerdo de Mercado Pago Marketplace (split, aplicación aprobada, tarifas, responsabilidad por contracargos). _Hecho cuando:_ las condiciones están por escrito. Si a los 60 días no hay aprobación, se activa el plan B (E06-17).
- [ ] **E00-04** `neg` Elegir un proveedor de WhatsApp Business (BSP) y cotizarlo; verificar los costos por mensaje con Meta. _Hecho cuando:_ el ADR de BSP queda decidido.
- [ ] **E00-05** `legal` Primera consulta con el abogado: menores, DNI, aptos físicos, biometría, inscripción de bases de datos, UIF y split. _Hecho cuando:_ las preguntas del documento 6 (sección 8) tienen respuesta escrita.
- [ ] **E00-06** `ops` Decidir hosting y proveedor de nube. _Hecho cuando:_ el ADR de hosting queda decidido.
- [ ] **E00-07** `legal` Buscar la marca "Potrero" en INPI, verificar dominios y redes, y decidir el nombre definitivo. _Hecho cuando:_ el nombre está confirmado o reemplazado y el dominio está comprado.
- [ ] **E00-08** `legal` Definir forma societaria y régimen fiscal con el contador. _Hecho cuando:_ se sabe cómo se facturan la suscripción al organizador y el cargo por servicio a quien paga online (IVA, Ingresos Brutos).
- [ ] **E00-09** `ops` Crear las cuentas: grupo de GitLab, Mercado Pago Developers, Meta Business, nube, proveedor de email, monitoreo de errores. _Hecho cuando:_ las credenciales de prueba están en el gestor de secretos.
- [ ] **E00-10** `neg` Validar los precios de la suscripción con datos reales (Torneo $100.000/mes, Liga $200.000/mes, Pro $350.000/mes, 50 % de descuento para fundadoras) y el cargo por servicio (4 %, mínimo $500). _Hecho cuando:_ `docs/datos.json` y el documento 2 reflejan los valores validados.
- [ ] **E00-11** `neg` Conseguir 3 organizadores que comprometan su próximo torneo para la beta. _Hecho cuando:_ se cumple el criterio de salida de la fase A del documento 5.
- [ ] **E00-12** `neg` Relevar el calendario de torneos de las ligas (cuándo arrancan las temporadas) para fijar la ventana de la beta.

## E01 · Repositorio y forma de trabajo
- [x] **E01-01** `dev` Inicializar el repositorio git con `.gitignore`, `.editorconfig`, `.gitattributes` (finales de línea) y README.
- [x] **E01-02** `dev` Armar el monorepo con pnpm y Turborepo: `apps/web`, `apps/api`, `packages/ui`, `packages/shared`, `packages/config`; mover `docs/` y `mocks/` adentro. _Hecho cuando:_ `pnpm build` compila todo vacío.
- [x] **E01-03** `dev` Configuración compartida de TypeScript estricto, ESLint y Prettier en `packages/config`.
- [ ] **E01-04** `dev` Hooks de git: formateo y lint de lo modificado antes de cada commit, y validación del formato de los mensajes de commit.
- [x] **E01-05** `doc` `CLAUDE.md` raíz (contexto, decisiones, comandos, mapa) y `CLAUDE.md` por carpeta (`apps/api`, `apps/web`, `docs`).
- [x] **E01-06** `doc` Contexto compacto en `docs/contexto/`: reglas de negocio, modelo de datos y glosario en Markdown.
- [x] **E01-07** `dev` Archivo único de cifras oficiales `docs/datos.json` y script `check:alineacion` que compara docs, mocks y landing. _Hecho cuando:_ detecta un precio viejo en un archivo de prueba.
- [x] **E01-08** `dev` Skills del proyecto: `dominio-potrero`, `modulo-api`, `pantalla-web`, `adr`, `docs-publicar`.
- [~] **E01-09** `dev` Hooks de Claude Code: formateo y chequeo de tipos después de cada edición; lista de permisos del proyecto.
- [x] **E01-10** `doc` ADR en `docs/adr/` con el formato GT-D2: decisiones cerradas (lanzamiento único, stack, RLS, ledger de partida doble, acta con eventos inmutables, tabla derivada, reglamento en datos) y abiertas (hosting, BSP, costo de Mercado Pago, verificación de identidad, motor de fixture, app nativa, tamaño del equipo).
- [x] **E01-11** `doc` Convenciones: ramas, commits, definición de terminado, revisión de código, versionado de migraciones.
- [x] **E01-12** `ops` Carpeta del proyecto en Google Drive y publicación de los 6 PDF; skill `docs-publicar` probada.
- [ ] **E01-13** `ops` Pipeline de CI (lint, tipos, tests, build, generación de PDF, escaneo de dependencias y secretos), listo para cuando haya remoto.
- [ ] **E01-14** `ops` Importar este backlog a GitLab como milestones (hitos), épicas e issues, cuando exista el remoto.

## E02 · Base técnica de la plataforma
- [~] **E02-01** `dev` Docker Compose local: PostgreSQL, Redis y un almacenamiento compatible con S3 (MinIO). _Hecho cuando:_ `pnpm dev` levanta todo con un comando.
- [x] **E02-02** `dev` Variables de entorno validadas al arrancar (falla rápido si falta una) y `.env.example` documentado.
- [x] **E02-03** `dev` API NestJS base: estructura por módulos de dominio, validación de entrada, formato de errores uniforme, manejo de excepciones.
- [x] **E02-04** `dev` Prisma: esquema inicial, migraciones versionadas y revisadas, script de semillas.
- [x] **E02-05** `dev` Contexto de organización por pedido y Row Level Security en PostgreSQL, con tests que prueban que una organización no ve datos de otra.
- [ ] **E02-06** `dev` OpenAPI generado desde la API y cliente tipado generado en `packages/shared`.
- [ ] **E02-07** `dev` Colas con BullMQ: infraestructura de jobs, reintentos, cola de fallidos y panel interno de colas (vive en el backoffice, E36-10).
- [~] **E02-08** `dev` Patrón de idempotencia reutilizable (para webhooks y sincronización del acta).
- [x] **E02-09** `dev` Registro de auditoría inmutable (`AuditLog`): quién, qué, antes y después.
- [ ] **E02-10** `dev` Logs estructurados sin datos personales, con identificador por pedido.
- [ ] **E02-11** `dev` Feature flags por función y por organización.
- [x] **E02-12** `dev` Base de la app web: Next.js App Router, Tailwind 4, Geist, manejo de sesión y cliente de API.
- [~] **E02-13** `dev` Localización: textos externalizados, español rioplatense, ARS, zona horaria America/Argentina/Buenos_Aires; utilidades de fecha y moneda.
- [~] **E02-14** `dev` Almacenamiento de archivos: buckets público (escudos, fotos) y privado (documentación), URLs firmadas de corta duración. _Hecho: `AlmacenArchivos` con implementación local (`AlmacenLocal`, `apps/api/src/documentacion/almacen.ts`) y links firmados de corta duración. Falta: bucket real (público y privado)._
- [ ] **E02-15** `dev` Servicio de tiempo real (SSE, con WebSocket como alternativa) y degradación a consultas periódicas cada 15 s.

## E03 · Sistema de diseño (`packages/ui`)
- [x] **E03-01** `dev` Tokens de diseño de los mocks (ink, volt, paper, mute, line, radios, sombras, animaciones) como tema de Tailwind compartido.
- [x] **E03-02** `dev` Íconos (set de `mocks/assets/app.js`) como componente.
- [~] **E03-03** `dev` Componentes base: Button, IconButton, Pill, Badge, Tile/Card, Input, Select, Checkbox, Radio, Switch, Textarea, DatePicker, FileUpload.
- [~] **E03-04** `dev` Componentes de datos: Table responsive, Stat/KPI, Empty state, Skeleton, Pagination, Tabs, Stepper.
- [~] **E03-05** `dev` Componentes de feedback: Modal, Drawer, Toast, Confirmación, Banner de alerta. _Hecho: `Dialogo` (modal y confirmación, en `panel/torneos/[id]/Dialogo.tsx`) y `BannerDemo`, todavía fuera de `packages/ui`. Falta: Toast y Drawer, y moverlos a `packages/ui`._
- [~] **E03-06** `dev` Estructuras de pantalla: panel del organizador (barra lateral por grupos), sitio público, móvil para acta y capitán.
- [~] **E03-07** `dev` Formularios: integración con validaciones compartidas de `packages/shared` y mensajes de error en español.
- [ ] **E03-08** `dev` Accesibilidad AA: contraste, foco visible, navegación por teclado, tamaños táctiles grandes.
- [ ] **E03-09** `dev` Catálogo visual de componentes (página interna) para revisar cada componente aislado.
- [~] **E03-10** `dev` Marca por organización: colores y logo aplicables al sitio público y las tarjetas. _Hecho: color y logo se guardan en el asistente y la API pública devuelve `colorMarca`. Falta: que el sitio público y las tarjetas los apliquen._
- [ ] **E03-11** `dev` Mocks: la app es la referencia de diseño de las pantallas construidas; los mocks quedan como históricos y se mantienen solo para pantallas por construir (mercado de pases, fotos de partido, valoración).

## E04 · Identidad, organizaciones y permisos
- [x] **E04-01** `dev` Modelo `User`, `Organization`, `Membership` con alcance (organización, torneo, equipo).
- [x] **E04-02** `dev` Registro e inicio de sesión con email y contraseña; verificación de email; recuperación de contraseña.
- [ ] **E04-03** `dev` Enlace mágico por email.
- [x] **E04-04** `dev` Sesiones con token de acceso corto y token de renovación rotativo; cierre de sesión en todos los dispositivos.
- [x] **E04-05** `dev` Límites de intentos y bloqueo temporal ante fuerza bruta.
- [~] **E04-06** `dev` Roles del documento 1 (dueño, administrador de torneo, tesorero, árbitro/delegado, tribunal, capitán, jugador, tutor, público, staff interno) y permisos finos (`tournament.fixture.write`, `cash.payout.create`, etc.). _Hecho: roles CAPITAN (con su equipo) y JUGADOR (con su perfil), staff interno de Gregal con roles propios (E36-02); el administrador también registra pagos. Un solo rol por organización, sin alcance por torneo; los permisos usan nombres en castellano. Falta: tutor con cuenta propia y roles con alcance por torneo._
- [~] **E04-07** `dev` Guards de NestJS por permiso, con tests de la matriz completa rol × acción. _Hecho: guards por permiso, menú y pantallas según el rol, tests de los casos clave de cada rol. Falta: la matriz completa rol × acción._
- [~] **E04-08** `dev` Crear organización, slug único y datos de facturación. _Hecho: crear organización con slug único. Falta: datos de facturación._
- [~] **E04-09** `dev` Invitar usuarios a la organización con un rol; aceptar o rechazar la invitación. _Hecho: invitación con rol (incluido capitán atado a un equipo), link de un solo uso que vence a los 7 días, aceptar o rechazar, reenviar y anular. Falta: enviarla por email real (hoy el link se copia o se manda por WhatsApp)._
- [x] **E04-10** `dev` Cambio de organización activa para usuarios con varias membresías.
- [ ] **E04-11** `dev` 2FA opcional para dueños y tesoreros, obligatoria para retiros.
- [ ] **E04-12** `dev` Inicio de sesión de jugadores con código por WhatsApp o SMS. _Depende de:_ E16-03.
- [ ] **E04-13** `dev` Acceso de staff interno: temporal, con motivo registrado y auditado (se opera desde el backoffice, E36-04).
- [x] **E04-14** `dev` Pantallas: registro, login, recuperación, invitación, mi cuenta, usuarios y roles de la organización.

## E05 · Reglamentos, torneos, equipos y jugadores · módulo 02
- [~] **E05-01** `dev` `Ruleset` versionado: puntos, desempates ordenados, umbrales de tarjetas, reglas de equipo ausente, límites de plantel, duración del partido. El torneo fija una versión. _Hecho: reglamento versionado con puntos, desempates, umbrales de tarjetas y equipo ausente; el torneo fija una versión. Falta: límites de plantel y duración del partido en el reglamento (el plantel mínimo está en `docs/datos.json`)._
- [ ] **E05-02** `dev` Plantillas de reglamento por modalidad (F5, F7, F8, F11) para empezar rápido.
- [x] **E05-03** `dev` `Tournament` con modalidad, formato (liga, copa, grupos + playoffs, liga + playoffs), temporada, estados (borrador, inscripción, en curso, finalizado) y reglas de aranceles.
- [~] **E05-04** `dev` `Stage` y `Group` con reglas de avance a llaves. _Hecho: grupos y avance a llaves, guardados en el torneo. Falta: etapas configurables y reglas de avance propias._
- [x] **E05-05** `dev` Vista previa del formato: grupos, llaves y cantidad estimada de partidos según los equipos.
- [~] **E05-06** `dev` `Team` a nivel organización, reutilizable entre torneos (nombre, escudo, colores, capitán). _Hecho: equipo a nivel organización, reutilizable entre torneos, con nombre, colores y capitán como texto. Falta: escudo y capitán como usuario._
- [~] **E05-07** `dev` `Player` con identidad única entre equipos (`dni_hash`), fecha de nacimiento, foto, preferencias de privacidad.
- [~] **E05-08** `dev` Plantel (`TeamPlayer`): número, posición, estado de habilitación calculado.
- [x] **E05-09** `dev` Pantalla "Crear torneo": asistente por pasos con vista previa (mock 02).
- [~] **E05-10** `dev` Pantallas de torneos: lista, detalle, edición, cambio de estado, archivo. _Hecho: lista, detalle, edición (nombre, cupo, inscripción, vencimiento, puntos y amarillas) y cambio de estado (cerrar o reabrir la inscripción, finalizar o reabrir el torneo). Falta: archivar._
- [x] **E05-11** `dev` Pantallas de equipos y planteles a nivel organización.

## E06 · Inscripciones y cobros con Mercado Pago · módulo 03
- [~] **E06-01** `dev` Configuración de aranceles por torneo: inscripción, seña, cuotas, cuota por fecha, multas; vencimientos.
- [x] **E06-02** `dev` Link público de inscripción con cupos; el capitán inscribe su equipo.
- [x] **E06-03** `dev` `Registration` y generación automática de `Charge` según las reglas del torneo.
- [ ] **E06-04** `dev` Conexión de la cuenta de Mercado Pago del organizador por OAuth; tokens cifrados y renovación automática.
- [ ] **E06-05** `dev` Cobro con split 1:1: preferencia de pago donde el arancel va completo al organizador y el cargo por servicio a Gregal (`application_fee`), más el costo de Mercado Pago.
- [~] **E06-06** `dev` Webhooks de Mercado Pago: validación de firma, procesamiento en cola, idempotencia por `payment_id`.
- [ ] **E06-07** `dev` Conciliación nocturna contra la API de Mercado Pago y alerta de diferencias.
- [ ] **E06-08** `dev` Cargo por servicio en pagos online: lo paga quien paga online (4 % con mínimo $500, más el costo de Mercado Pago) y el organizador recibe el 100 %; el organizador puede absorberlo (ADR-013, ADR-027). Efectivo y transferencia, sin cargo.
- [x] **E06-09** `dev` Pagos manuales (efectivo, transferencia) con comprobante, sin cargo por servicio.
- [ ] **E06-10** `dev` Pago individual por jugador cuando el capitán lo habilita.
- [x] **E06-11** `dev` Estado de pago por equipo y deuda en tiempo real.
- [ ] **E06-12** `dev` Reembolsos, contemplando el rechazo por falta de saldo del vendedor y el aviso al organizador.
- [ ] **E06-13** `dev` Contracargos: registro, estado y aviso.
- [~] **E06-14** `dev` Recordatorios de pago (se conectan a E16 cuando exista; hasta entonces, por email). _Hecho: recordatorios de cobro escalonados por la mensajería simulada. Falta: canales reales._
- [x] **E06-15** `dev` Pantalla de inscripciones y pagos del organizador (mock 03).
- [x] **E06-16** `dev` Flujo público de pago del equipo: pantalla, resultado y comprobante.
- [ ] **E06-17** `dev` Plan B sin split: cobro con link de la cuenta del organizador y conciliación manual (detrás de un feature flag).
- [x] **E06-18** `dev` Modo simulado de Mercado Pago para desarrollo y demos, con la misma interfaz que el real.
- [ ] **E06-19** `dev` Contract tests contra el sandbox de Mercado Pago.
- [x] **E06-20** `dev` Cuota por fecha: monto fijo por equipo y por fecha (con o sin inscripción) que genera un cargo por equipo en cada fecha, con vencimiento el día del partido. Por defecto no se cobra la fecha libre ni el partido suspendido, y sí el partido con equipo ausente; bloquear al deudor es opcional (`docs/datos.json`, `cobrosPorFechaPorDefecto`). Pedido del socio (reunión del 22/10/2026). _Hecho cuando:_ el torneo se configura con cuota por fecha, los cargos se generan solos y aparecen en inscripciones, caja y recordatorios. _Hecho: cargos por equipo y fecha, generados 7 días antes del partido, idempotentes; acompañan reprogramaciones y movimientos a mano; aviso de deuda en el acta; activada con el torneo empezado, se cobra desde la próxima fecha (decisión del 26/10/2026). Falta: que `deudaBloqueaJugar` impida cargar al equipo en el acta (hoy solo avisa)._
- [x] **E06-21** `dev` Seguro por jugador por fecha: monto por cada jugador del plantel en cada fecha que el equipo juega, como cargo aparte al equipo, en el rubro Seguros de la caja. Usa el mecanismo de E06-20. _Hecho cuando:_ el cargo de cada fecha refleja el plantel de ese momento y la caja muestra el total de seguros.

## E07 · Caja del torneo · módulo 14
- [x] **E07-01** `dev` Ledger de partida doble (`LedgerEntry`): cuentas, débitos, créditos, categoría, referencia.
- [~] **E07-02** `dev` Cada cobro, pago manual, reembolso y costo de cobro online genera asientos automáticamente. _Hecho: cada pago aprobado y sus costos se asientan solos; los pagos manuales (efectivo o transferencia, completos o parciales) entran a su cuenta y se anulan con un asiento que revierte. Falta: reembolsos (E06-12)._
- [~] **E07-03** `dev` Egresos por rubro (cancha, árbitros, premios, otros) con comprobante. _Hecho: egresos por rubro con comprobante como texto, y anulación. Falta: comprobante como archivo (E02-14)._
- [x] **E07-04** `dev` Cargos automáticos por partido (árbitro, cancha). _Depende de:_ E08.
- [x] **E07-05** `dev` Resultado del torneo en vivo: ingresos, egresos, ganancia.
- [~] **E07-06** `dev` Saldo y registro de retiros a cuenta bancaria (definir con legal si es solo registro: E00-05). _Hecho: saldo y registro de retiros (solo el dueño). Falta: verificación en dos pasos (E04-11) y lo que defina legal (E00-05)._
- [~] **E07-07** `dev` Exportación de movimientos (CSV y PDF). _Hecho: exportación a CSV para Excel. Falta: PDF._
- [x] **E07-08** `dev` Pantalla de caja (mock 14).

## E08 · Canchas y árbitros · módulo 15
- [~] **E08-01** `dev` `Venue` y `Pitch`: dirección, superficie, costo, disponibilidad por franja. _Hecho: costo por partido, superficie y bloqueo de cancha. Falta: disponibilidad por franja horaria._
- [x] **E08-02** `dev` `Referee`: datos, disponibilidad, tarifa, valoración.
- [x] **E08-03** `dev` Designación manual de árbitros por partido.
- [x] **E08-04** `dev` Designación automática respetando disponibilidad y una franja por árbitro.
- [x] **E08-05** `dev` Pagos a árbitros (se conectan a la caja).
- [x] **E08-06** `dev` Ocupación por cancha y franja.
- [x] **E08-07** `dev` Pantalla de árbitros y canchas (mock 15).

## E09 · Motor de fixture · módulo 04
- [ ] **E09-01** `dev` Prueba técnica del motor: 24 equipos en menos de 10 s con restricciones reales. _Hecho cuando:_ el ADR "heurística propia o CP-SAT" queda decidido.
- [x] **E09-02** `dev` Cruces con el método de rotación (circle method) para liga y grupos; ida y vuelta opcional; fecha libre con cantidad impar.
- [x] **E09-03** `dev` Sorteo con cabezas de serie para copa.
- [~] **E09-04** `dev` Asignación de fecha, cancha y horario: restricciones duras (sin partidos simultáneos ni descanso insuficiente, una cancha y un árbitro por franja). _Hecho: sin choques de cancha ni de equipo; un árbitro por franja en la designación. Falta: descanso mínimo y restricciones blandas._
- [ ] **E09-05** `dev` Optimización de restricciones blandas: balance local/visitante, preferencias, menos huecos.
- [ ] **E09-06** `dev` Restricciones por equipo (por ejemplo, "no juega los domingos").
- [x] **E09-07** `dev` Mover un partido a mano (día, cancha u horario) y ordenar a mano los horarios de una fecha intercambiando partidos: re-evaluación y explicación de cada conflicto, con advertencia y sin bloqueo.
- [~] **E09-08** `dev` Publicar el fixture (aviso a capitanes cuando exista E16). _Hecho: plantilla Fixture publicado para avisar a los capitanes a mano. Falta: aviso automático al publicar._
- [x] **E09-09** `dev` Pantalla de fixture: grilla por cancha y conflictos (mock 04). _Hecho: grilla por cancha y horario con conflictos (`GrillaFixture.tsx`)._
- [~] **E09-10** `dev` Tests con casos límite reales y prueba de rendimiento en CI.

## E10 · Llaves y playoffs · módulo 17
- [x] **E10-01** `dev` Clasificación de grupos o liga a llaves según las reglas de avance.
- [x] **E10-02** `dev` Cuadro eliminatorio que se completa solo con los resultados.
- [~] **E10-03** `dev` Definición por penales y partidos de ida y vuelta en llaves. _Hecho: penales; ida y vuelta con global y penales en la vuelta en torneos por fases. Falta: ida y vuelta en las llaves de los formatos fijos._
- [~] **E10-04** `dev` Publicación en tiempo real. _Hecho: el sitio público muestra el cuadro y se actualiza solo cada pocos segundos. Falta: tiempo real (E02-15)._
- [x] **E10-05** `dev` Pantalla de llaves (mock 17).
- [x] **E10-06** `dev` Formato flexible por fases (ADR-026): el organizador encadena fases (todos contra todos, grupos, eliminación) y elige quién entra a cada una (puestos, mejores N, ganadores o perdedores, no clasificados), ida y vuelta por ronda y fases en paralelo, a partir de plantillas. _Modelo, validación, simulación y plantillas en `shared/dominio/formato.ts`; simulador "Armá el formato" con "Crear torneo con este formato"._
- [~] **E10-07** `dev` Persistir las fases del torneo y armar el fixture fase por fase (tabla `Fase`, `Partido` con fase, grupo, ronda y pierna), con el editor de fases en "Armá el formato", enlazado desde "Nuevo torneo". _Hecho: tabla `Fase` con RLS, `Partido` con fase, ronda y pierna, formato FLEXIBLE, creación desde el simulador y "Generar fase" cuando sus equipos están definidos (puestos, mejores N, ganadores o perdedores, no clasificados), con copa en paralelo. Falta: fase 1 automática al cerrar la inscripción, editar el formato, rehacer una fase, cruce de canchas entre fases, grilla a mano y feriados._
- [~] **E10-08** `dev` Tabla, llaves y sitio público por fase, incluida una copa paralela (por ejemplo, copa estímulo) y el cronograma de sábados. _Hecho: pestaña "Fases" en el panel con tablas por grupo y llaves, sitio público con pestañas por fase y torneo de ejemplo en la semilla. Falta: ida o vuelta en la página del partido y cronograma de sábados en el sitio público._

## E11 · Partidos y acta digital · módulo 05
- [~] **E11-01** `dev` `Match` con estados (programado, en juego, finalizado, suspendido, equipo ausente) y transiciones válidas. _Hecho: partido con estados y transiciones (programado, en juego, finalizado, equipo ausente). Falta: un flujo que ponga un partido en SUSPENDIDO._
- [x] **E11-02** `dev` `MatchEvent` solo de agregado (gol, tarjeta, cambio) con `client_uuid`; las correcciones son eventos de anulación.
- [x] **E11-03** `dev` Planilla del acta con la habilitación de cada jugador en tiempo real (suspendido o sin documentación, marcado).
- [x] **E11-04** `dev` Carga en vivo de goles, tarjetas y cambios, con botones grandes y alto contraste.
- [x] **E11-05** `dev` Un solo dueño del acta por partido (el primer dispositivo que carga algo); aviso al segundo dispositivo, que puede "tomar el acta".
- [x] **E11-06** `dev` Acta offline: service worker, IndexedDB, cola de eventos ordenada y sincronización al recuperar señal.
- [x] **E11-07** `dev` Cierre con firma de ambos capitanes o justificación del árbitro.
- [~] **E11-08** `dev` Cadena al cerrar: tabla → goleadores → sanciones → sitio público → notificaciones.
- [~] **E11-09** `dev` Informe del árbitro. _Hecho: informe del árbitro en el expediente del tribunal y justificación al cerrarlo. Falta: informe del partido en el acta._
- [ ] **E11-10** `dev` Edición de actas cerradas solo por el administrador, con auditoría.
- [~] **E11-11** `dev` Marcador en vivo en el panel y la página de partido. _Hecho: partido en vivo en el panel y página de partido con el marcador, que se refrescan solos. Falta: tiempo real (E02-15)._
- [~] **E11-12** `dev` Pantalla del acta en el celular, instalable como PWA (mock 05). _Hecho: acta instalable (manifiesto, íconos) que funciona sin señal. Falta probarla en celulares reales (E11-13)._
- [ ] **E11-13** `dev` Prueba en 3–4 celulares de gama media o baja con conexión mala.

## E12 · Tabla de posiciones y estadísticas
- [x] **E12-01** `dev` Tabla derivada: se calcula al leerla desde los partidos cerrados (sin job) y nunca se edita a mano.
- [x] **E12-02** `dev` Desempates configurables: diferencia de gol, goles a favor, resultado entre sí, juego limpio, sorteo.
- [~] **E12-03** `dev` Equipo ausente según reglamento (por defecto 3-0 y sanción económica), sin sumar estadísticas individuales. _Hecho: equipo ausente 3-0 según reglamento, sin estadísticas individuales. Falta: multa automática (hoy va por el tribunal)._
- [x] **E12-04** `dev` Goleadores, tarjetas y tabla de juego limpio.
- [~] **E12-05** `dev` Estadísticas por jugador y equipo, acumuladas entre torneos. _Hecho: estadísticas del jugador acumuladas entre torneos. Falta: estadísticas por equipo._

## E13 · Sitio público del torneo y PWA · módulo 06
- [x] **E13-01** `dev` Páginas públicas de la organización y del torneo: tabla, fixture, goleadores, llaves.
- [~] **E13-02** `dev` Generación estática incremental, regenerada por evento (acta cerrada), para soportar los picos del fin de semana.
- [~] **E13-03** `dev` SEO: metadatos, sitemap, datos estructurados e imágenes para compartir. _Hecho: metadatos OpenGraph y Twitter e imagen para compartir. Falta: sitemap y datos estructurados._
- [~] **E13-04** `dev` Marca de la organización aplicada al sitio. _Hecho: color y logo se guardan en el asistente y la API pública devuelve `colorMarca`. Falta: aplicarlos en el sitio público._
- [ ] **E13-05** `dev` Dominio propio para el plan Pro. _Depende de:_ E26.
- [x] **E13-06** `dev` Principio de mínimo dato: nunca se publica DNI, edad exacta de menores ni teléfono.
- [x] **E13-07** `dev` "Creado con Potrero" con llamado a organizadores.
- [~] **E13-08** `dev` PWA: manifiesto, íconos, instalación, actualización. _Hecho: manifiesto, íconos y service worker del acta. Falta el aviso de actualización y extender a todo el sitio._
- [x] **E13-09** `dev` Pantalla del sitio público (mock 06).

## E14 · Sanciones y tribunal · módulo 12
- [x] **E14-01** `dev` Sanciones automáticas desde el acta: roja directa (por defecto 1 partido), doble amarilla (1), acumulación (por defecto 5 = 1 partido).
- [x] **E14-02** `dev` Conteo en partidos oficiales del equipo; un partido suspendido o uno con equipo ausente no descuenta.
- [x] **E14-03** `dev` Bloqueo en el acta y expediente automático por "jugador no habilitado" si se lo carga igual.
- [x] **E14-04** `dev` Expedientes: informe del árbitro, descargo del capitán, resolución del tribunal (puede ampliar o reducir). El capitán carga su descargo desde su panel (E19-05).
- [x] **E14-05** `dev` Multas que generan cargos al equipo.
- [x] **E14-06** `dev` Historial disciplinario por jugador y por equipo.
- [~] **E14-07** `dev` Pantalla de sanciones y tribunal (mock 12). _Hecho: pantalla con contadores, expedientes, automáticas, historial y reglamento aplicado. Elegir jugador al abrir un expediente a mano ya existe. Falta: editar el reglamento de tarjetas desde la pantalla._
- [x] **E14-08** `dev` Levantar una suspensión pagando una multa (opcional por torneo, apagado por defecto): el reglamento define qué sanciones se pueden levantar (por defecto acumulación y doble amarilla; nunca roja directa ni lo resuelto por el tribunal) y el monto por partido. Cada pago acreditado levanta un partido y habilita al jugador en el acta. Pedido del socio (reunión del 22/10/2026). _Hecho cuando:_ un suspendido por acumulación paga y queda habilitado para la fecha siguiente; una roja directa no ofrece la opción.

## E15 · Documentación, identidad y consentimientos · módulo 13
- [x] **E15-01** `dev` Tipos de documento (DNI, apto físico, autorización de menor) y cuáles son obligatorios por torneo.
- [~] **E15-02** `dev` Carga a bucket privado y acceso por URL firmada con registro de quién lo pidió. _Hecho: almacenamiento privado detrás de una interfaz (disco local), link firmado de pocos minutos y registro de accesos. Falta: bucket real y antivirus._
- [x] **E15-03** `dev` Cifrado a nivel de campo del número de DNI y de los datos médicos; hash del DNI para duplicados.
- [x] **E15-04** `dev` Revisión humana de documentos: aprobar o rechazar con motivo.
- [~] **E15-05** `dev` Vencimientos y alertas (apto físico). _Hecho: vencimiento con aviso a 30 días, alerta en la pantalla y bloqueo si vence. Falta: aviso automático por mensaje antes del vencimiento._
- [x] **E15-06** `dev` Detección de duplicados entre equipos.
- [x] **E15-07** `dev` Habilitación del jugador: documentación vigente + sin sanción activa + sin duplicado abierto.
- [~] **E15-08** `dev` `Consent` versionado y flujo del tutor para menores (con la edad que defina E00-05). _Hecho: consentimientos versionados y autorización del tutor en línea con link de un solo uso. Falta: edad definida por legal (E00-05) y marcar al jugador cuando cumple la mayoría._
- [~] **E15-09** `dev` Consentimiento para publicar imagen, especialmente de menores. _Hecho: consentimiento de imagen registrado y calculado por jugador (menor = ambos). Falta: aplicarlo en el sitio público cuando haya fotos._
- [x] **E15-10** `dev` Retención y borrado automático por tipo de dato.
- [~] **E15-11** `dev` Verificación por selfie con un proveedor externo, detrás de un feature flag y solo con aprobación legal. _Hecho: bandera apagada y tarjeta en la pantalla. Falta: proveedor y aprobación legal._
- [x] **E15-12** `dev` Pantalla de documentación (mock 13).

## E16 · Mensajería y comunicación · módulo 16
- [~] **E16-01** `dev` Capa de mensajería con canales intercambiables: email, Web Push, WhatsApp. _Hecho: interfaz de canal con implementación simulada (ADR-022). Falta: canales reales._
- [~] **E16-02** `dev` Email transaccional con el proveedor elegido y plantillas. _Hecho: plantillas y variables. Falta: proveedor de email._
- [~] **E16-03** `dev` WhatsApp Business por el BSP: plantillas versionadas y aprobadas (recordatorio, cobro, contingencia, resultado). _Hecho: plantillas versionadas. Falta: BSP y aprobación de Meta._
- [ ] **E16-04** `dev` Web Push (VAPID) y suscripción desde la PWA.
- [~] **E16-05** `dev` Opt-in explícito y preferencias por usuario; separación de mensajes transaccionales y de marketing. _Hecho: consentimiento de WhatsApp y baja de novedades por capitán, transaccional separado de marketing. Falta: preferencias por usuario._
- [x] **E16-06** `dev` Regla de costo: WhatsApp solo para capitanes, delegados y quienes dieron opt-in; push o email por defecto.
- [x] **E16-07** `dev` Segmentación de destinatarios y variables en plantillas.
- [x] **E16-08** `dev` Vista previa con costo estimado antes de cada envío masivo.
- [~] **E16-09** `dev` Topes mensuales por plan y packs de mensajes adicionales. _Hecho: topes mensuales por plan. Falta: packs de mensajes adicionales._
- [x] **E16-10** `dev` Automatizaciones: recordatorio 24 h antes del partido, cobro escalonado.
- [x] **E16-11** `dev` Webhooks de entrega, historial y costo por mensaje.
- [x] **E16-12** `dev` Pantalla de comunicación (mock 16).

## E17 · Contingencias, reprogramaciones y equipos ausentes · módulo 11
- [~] **E17-01** `dev` Contingencia por partido, fecha, cancha o torneo: mover, suspender, cambiar de cancha. _Hecho: mover días y pasar a otras canchas, por día, fecha o partidos. Falta: suspender, alcance por torneo y por cancha, y que MOVER y CAMBIAR_CANCHA sean acciones reales._
- [x] **E17-02** `dev` Propuesta calculada antes de aplicar, con conflictos resueltos y pendientes (usa el motor de E09).
- [x] **E17-03** `dev` Aplicar la propuesta y registrar la `Contingency` (qué se movió y quién confirmó).
- [x] **E17-04** `dev` Aviso masivo con botones "Confirmo" y "No puedo"; los "No puedo" vuelven como alerta.
- [~] **E17-05** `dev` Equipo ausente con tolerancia configurable (por defecto 15 min), cuenta regresiva en el acta y resolución automática. _Hecho: tolerancia por torneo (reglamento), cuenta regresiva en el acta, el botón se habilita y la API lo acepta solo al vencer, y el resultado según el reglamento (3-0) se ve en el acta, la tabla y el sitio público. Falta: resolución automática._
- [~] **E17-06** `dev` Alerta de clima con opciones sugeridas (proveedor de pronóstico a elegir). _Hecho: alerta con proveedor simulado. Falta: proveedor real de pronóstico._
- [x] **E17-07** `dev` Pantalla de reprogramaciones (mock 11).
- [x] **E17-08** `dev` Prueba de aceptación: lluvia simulada con 9 partidos movidos, aviso y confirmaciones.

## E18 · Panel del organizador · módulo 01
- [x] **E18-01** `dev` Partido en vivo con goleadores y acceso directo al acta.
- [x] **E18-02** `dev` Cobrado, pendiente y deudores, con recordatorio en un toque.
- [x] **E18-03** `dev` Alertas accionables: suspendido que jugó, acta sin cargar, partido sin árbitro, documento vencido, pago sin conciliar.
- [x] **E18-04** `dev` Sugerencias del próximo paso (por ejemplo, "publicá el fixture y avisá a 16 capitanes").
- [x] **E18-05** `dev` Pantalla del panel (mock 01).

## E19 · Panel del capitán · módulo 07
- [x] **E19-01** `dev` Plantel del equipo: altas, bajas e invitación a jugadores. _Las altas y bajas respetan la documentación; el capitán invita a cada jugador a la app ("Invitar a la app")._
- [x] **E19-02** `dev` Convocatoria con confirmación de asistencia. _El capitán anota quién va o el jugador confirma desde su panel ("Voy" / "No voy"); los dos ven la misma convocatoria._
- [ ] **E19-03** `dev` Cuotas por jugador y pago individual.
- [x] **E19-04** `dev` Documentación del equipo: qué falta y quién.
- [x] **E19-05** `dev` Sanciones del equipo y presentación de descargos.
- [ ] **E19-06** `dev` "Organizá tu torneo": paso de capitán a organizador.
- [x] **E19-07** `dev` Pantalla del capitán (mock 07).

## E20 · Jugadores y perfil · módulo 08
- [x] **E20-01** `dev` Cuenta del jugador, aceptación de términos y reclamo del perfil creado por el capitán. _Invitación del capitán, cuenta con aceptación de términos versionada (consentimiento) y perfil vinculado; el jugador solo ve lo suyo._
- [x] **E20-02** `dev` Perfil con estadísticas y trayectoria entre torneos.
- [ ] **E20-03** `dev` Valoración de juego limpio.
- [x] **E20-04** `dev` Privacidad: apodo o iniciales, perfiles de menores opcionales.
- [~] **E20-05** `dev` Notificaciones personales (partido, convocatoria, sanción). _Hecho: "Mis avisos" en el panel del jugador (convocatoria, partido, sanción, documentación, deuda). Falta: enviarlos por push o mensaje._
- [x] **E20-06** `dev` Pantalla del perfil de jugador (mock 08).

## E21 · Página de partido · módulo 09
- [x] **E21-01** `dev` Línea de tiempo del partido desde los eventos del acta.
- [x] **E21-02** `dev` Crónica automática generada a partir de los eventos.
- [ ] **E21-03** `dev` Fotos del partido con consentimiento y moderación.
- [x] **E21-04** `dev` Tarjeta de resultado compartible (imagen para WhatsApp e Instagram).
- [x] **E21-05** `dev` Pantalla de la página de partido (mock 09).

## E22 · Mercado de pases · módulo 10
- [ ] **E22-01** `dev` Publicaciones de jugadores libres y de equipos que buscan.
- [ ] **E22-02** `dev` Filtros por zona, posición y nivel.
- [ ] **E22-03** `dev` Contacto sin exponer datos personales.
- [ ] **E22-04** `dev` Moderación y denuncias.
- [ ] **E22-05** `dev` Pantalla del mercado de pases (mock 10).

## E23 · Sponsors · módulo 18
- [~] **E23-01** `dev` Espacios publicitarios en el sitio y las tarjetas; `Placement` por período y monto. _Hecho: sponsors y espacios por torneo, período y monto, en el sitio público con la marca "Publicidad". Falta: espacio en la tarjeta de resultado compartible._
- [~] **E23-02** `dev` Medición de impresiones y clics, en forma agregada y sin datos personales. _Hecho: contadores de impresiones y clics por espacio y día, sin cookies ni datos del visitante. Falta: límite de pedidos y filtro de bots._
- [x] **E23-03** `dev` Reporte para cada sponsor.
- [x] **E23-04** `dev` Ingresos de sponsors en la caja.
- [x] **E23-05** `dev` Reglas: categorías prohibidas en torneos con menores (apuestas, alcohol, tabaco), rechazo de categorías por organización, señalización de publicidad.
- [x] **E23-06** `dev` Pantalla de sponsors (mock 18).

## E24 · Métricas · módulo 19
- [x] **E24-01** `dev` Retención de equipos entre torneos.
- [x] **E24-02** `dev` Tasa de cobro y cobro antes del inicio.
- [x] **E24-03** `dev` Ocupación de canchas y mapa de horarios más pedidos.
- [x] **E24-04** `dev` Pantalla de métricas (mock 19).
- [x] **E24-05** `dev` Métricas internas de la plataforma: ligas activas, GMV, ingresos de Gregal por suscripción y por cargos por servicio, partidos cerrados por semana (norte del producto). Se muestran en el backoffice (E36-12). _En el inicio del panel de Gregal (`/gregal`)._

## E25 · Configuración inicial e importación · módulo 20
- [~] **E25-01** `dev` Asistente de 5 pasos: organización, Mercado Pago, marca y dominio, reglamento, importación. _Hecho: asistente de 5 pasos que se puede retomar. Falta: conectar Mercado Pago de verdad (hoy es informativo) y un reglamento propio de la liga (hoy muestra el de por defecto)._
- [x] **E25-02** `dev` Importación desde Excel de equipos, jugadores y canchas, con plantilla descargable y validación fila por fila.
- [ ] **E25-03** `dev` Migración asistida por el equipo de Potrero (herramienta del backoffice, E36-04).
- [x] **E25-04** `dev` Pantalla de configuración (mock 20). _Hecho cuando:_ una liga nueva queda dada de alta en menos de 30 minutos.

## E26 · Planes, suscripción y facturación
- [~] **E26-01** `dev` Planes Torneo ($100.000/mes), Liga ($200.000/mes) y Pro ($350.000/mes) con suscripción mensual o anual (2 meses sin cargo), primer mes sin cargo y ajuste de precios cada 3 meses con aviso de 30 días, leídos de la configuración y no fijos en el código. _Hecho: planes y cifras leídos de `docs/datos.json`. Falta: suscripción, pago anual y pantalla de planes._
- [ ] **E26-02** `dev` Límites y funciones por plan: torneos activos, equipos, usuarios y WhatsApp por mes (Torneo 1/16/2/100, Liga 4/48/sin límite/300, Pro sin límites/2.000); Liga suma tribunal, documentación, cuota por fecha y seguro, árbitros, reprogramaciones y métricas; Pro suma marca y dominio propios, sponsors con reporte y soporte prioritario.
- [~] **E26-03** `dev` Cargo por servicio en cada cobro online (4 % con mínimo $500, más el costo de Mercado Pago), pagado por quien paga y opcionalmente absorbido por el organizador. _Hecho: cálculo por cobro en la pasarela, asentado en la caja. Falta: `application_fee` real en Mercado Pago (E06-05) y la opción de absorberlo (E06-08)._
- [ ] **E26-04** `dev` Cobro recurrente de la suscripción al organizador, mensual o anual (mecanismo a definir con Mercado Pago), con aviso y suspensión por falta de pago.
- [ ] **E26-05** `dev` Programa de ligas fundadoras: cupo de 15, 50 % de descuento de por vida sobre el plan (no es un plan aparte), alta y migración gratis, y logo de socio fundador.
- [ ] **E26-06** `dev` Programa de referidos entre ligas.
- [ ] **E26-07** `dev` Facturación electrónica (ARCA) de la suscripción al organizador y del cargo por servicio a quien paga online, según el régimen definido en E00-08.
- [ ] **E26-08** `dev` Exportación de todos los datos de la organización y baja sin costo.
- [ ] **E26-09** `dev` Pantalla de plan y facturación de la organización.

## E27 · Landing y sitio de marketing
- [x] **E27-01** `dev` Landing en la app real a partir de `mocks/landing.html`, con los precios de `docs/datos.json`.
- [ ] **E27-02** `dev` Lista de espera y formulario de ligas fundadoras (alimenta el CRM).
- La demo pública y el acceso a la liga real se resuelven en E37 (ADR-019).
- [ ] **E27-03** `dev` Ejemplo de cuentas por torneo calculado con los valores vigentes.
- [ ] **E27-04** `dev` Analítica con aviso de cookies.
- [ ] **E27-05** `dev` Casos de éxito y testimonios (cuando existan, con autorización escrita).
- [ ] **E27-06** `dev` Medición del embudo: visitas, contacto, demo agendada.

## E28 · Legal dentro del producto
- [ ] **E28-01** `legal` Redactar términos para organizadores, términos para capitanes y jugadores, política de privacidad, política de cookies y política de reembolsos.
- [ ] **E28-02** `legal` Redactar el contrato de tratamiento de datos con cada liga y el acuerdo de liga fundadora.
- [ ] **E28-03** `dev` Publicación de los textos legales y aceptación versionada (quién, cuándo, qué versión).
- [ ] **E28-04** `dev` Herramienta para pedidos de acceso, rectificación y supresión (en el backoffice, E36-11).
- [ ] **E28-05** `legal` Inscripción de bases de datos, si corresponde.
- [ ] **E28-06** `legal` Contratos con proveedores (Mercado Pago, BSP, nube, email) y con colaboradores (confidencialidad y propiedad intelectual).
- [ ] **E28-07** `dev` Botón de arrepentimiento y condiciones de defensa del consumidor, si aplican según E00-05.
- [ ] **E28-08** `legal` Seguros de responsabilidad civil y ciber.

## E29 · Seguridad
- [ ] **E29-01** `dev` *Continuo:* escaneo de dependencias y de secretos en CI desde el primer commit.
- [ ] **E29-02** `dev` Revisión de la matriz de permisos y de las políticas RLS en cada módulo nuevo.
- [ ] **E29-03** `dev` Cabeceras de seguridad, CSP, CORS y protección CSRF.
- [ ] **E29-04** `dev` Auditoría de acciones sensibles completa: retiros, edición de actas, acceso a documentos.
- [ ] **E29-05** `dev` Checklist de OWASP ASVS nivel 2.
- [ ] **E29-06** `ops` Backups diarios cifrados en otra región y restauración probada.
- [ ] **E29-07** `ops` Plan de respuesta a incidentes y plantilla de comunicación a organizadores.
- [ ] **E29-08** `ops` Pentest externo, sin hallazgos críticos abiertos.
- [ ] **E29-09** `legal` Auditoría de privacidad previa al lanzamiento.

## E30 · Calidad y pruebas
- [x] **E30-01** `dev` *Continuo:* tests unitarios de reglas (tabla, desempates, sanciones, habilitación, fixture).
- [x] **E30-02** `dev` *Continuo:* tests de integración de API + base de datos (todavía no hay colas).
- [~] **E30-03** `dev` Pruebas E2E con Playwright de los flujos críticos: crear torneo, inscribir y pagar, armar fixture, acta offline y sincronización, reprogramar.
- [ ] **E30-04** `dev` Pruebas de carga del pico de sábado (cientos de consultas al sitio público, decenas de actas abiertas).
- [ ] **E30-05** `dev` Pruebas de accesibilidad y rendimiento en móvil (contenido principal en < 2,5 s con 4G).
- [ ] **E30-06** `dev` Datos de prueba sintéticos para staging; nunca datos reales fuera de producción.

## E31 · Plataforma, despliegue y operación
- [ ] **E31-01** `ops` Entornos: local, preview por merge request, staging y producción. Más el entorno de demo pública (E37-08, ADR-019).
- [ ] **E31-02** `ops` Infraestructura en el proveedor elegido: base de datos y Redis gestionados, almacenamiento, región cercana.
- [ ] **E31-03** `ops` Despliegue continuo a staging y aprobado a producción; migraciones seguras.
- [ ] **E31-04** `ops` Monitoreo de errores, trazas, métricas y alertas (webhook de pago fallido, cola atrasada, error de sincronización del acta, errores del sitio público).
- [ ] **E31-05** `ops` Panel interno por organización: pagos sin conciliar, mensajes fallidos, actas con error (en el backoffice, E36-10).
- [ ] **E31-06** `ops` Objetivos de servicio del documento 1 medidos (99,9 % fin de semana, sincronización < 30 s, confirmación de pago < 10 s, RTO/RPO).
- [ ] **E31-07** `ops` Runbook del fin de semana y guardia con responsable y reemplazo.
- [ ] **E31-08** `ops` Mesa de ayuda y CRM (canales WhatsApp, email y chat).
- [ ] **E31-09** `ops` Procesos internos: conciliación, facturación mensual, contracargos, control de costos de mensajería, moderación.

## E32 · Documentación de producto y soporte
- [ ] **E32-01** `doc` Manual del organizador (plantilla GT-D6).
- [ ] **E32-02** `doc` Guía corta del árbitro y delegado para el acta.
- [ ] **E32-03** `doc` Guía del capitán y del jugador.
- [ ] **E32-04** `doc` Centro de ayuda con preguntas frecuentes, plantillas (reglamento, Excel de importación) y videos cortos.
- [ ] **E32-05** `doc` Documentación técnica interna: arquitectura (GT-D1), API (GT-D5), plan de despliegue (GT-D4), plan de pruebas (GT-D3).
- [ ] **E32-06** `doc` Material de ventas final: resumen de una página para decisores y planilla de simulación de cuentas por liga.
- [ ] **E32-07** `doc` Capacitación del equipo de soporte.

## E33 · Beta cerrada con ligas fundadoras
- [ ] **E33-01** `neg` Firmar las 15 ligas fundadoras con el acuerdo de E28-02.
- [ ] **E33-02** `ops` Alta y migración de cada liga desde su Excel.
- [ ] **E33-03** `ops` Capacitación de árbitros y delegados con un partido simulado.
- [ ] **E33-04** `ops` Acompañamiento presencial en las primeras jornadas.
- [ ] **E33-05** `neg` Reunión de feedback cada 2 semanas y registro de pedidos en el backlog.
- [ ] **E33-06** `neg` Relevar métricas y cobros reales; actualizar el documento 2 y `docs/datos.json`.
- [ ] **E33-07** `dev` Corrección de errores y ajustes detectados en la beta.
- [ ] **E33-08** `neg` Un torneo completo cobrado y cerrado en la plataforma, y 3 casos de éxito publicables.

## E34 · Lanzamiento público
- [ ] **E34-01** `ops` Checklist go/no-go del documento 5 (sección 12) cumplido en todas sus áreas.
- [ ] **E34-02** `ops` Runway de al menos 12 meses confirmado.
- [ ] **E34-03** `dev` Apertura del registro público y activación de los planes.
- [ ] **E34-04** `neg` Campaña de lanzamiento ("Dejá el Excel"), evento con ligas fundadoras y promoción para ligas nuevas (primer mes sin cargo, pago anual con 2 meses sin cargo).
- [ ] **E34-05** `ops` Monitoreo reforzado y guardia ampliada durante las primeras semanas.
- [ ] **E34-06** `neg` Reporte mensual de métricas y revisión de los supuestos del documento 2.

## E36 · Backoffice de Gregal
Aplicación interna separada del producto (`apps/admin`), solo para el equipo de Gregal. Reúne las herramientas internas que antes estaban dispersas. Cada tarea se hace cuando existe el módulo que administra.

- [~] **E36-01** `dev` App `apps/admin` con su propio login, 2FA obligatoria, sesión corta y acceso restringible por red. _Depende de:_ E04. _Hecho: panel interno en `/gregal` dentro de la web, con login y sesión propios (cookie aparte, 8 h). Falta: app aparte, 2FA obligatoria y acceso por red._
- [~] **E36-02** `dev` Usuarios internos y roles propios (soporte, finanzas, dirección, superadmin) separados de los roles de las organizaciones. _Hecho: staff con roles SUPERADMIN, SOPORTE, FINANZAS y DIRECCION, separado de las organizaciones. Falta: alta y edición desde la pantalla._
- [x] **E36-03** `dev` Auditoría de toda acción interna, consultable desde el backoffice. _Cada ingreso y consulta del staff queda en una auditoría inmutable, con pantalla propia._
- [~] **E36-04** `dev` Organizaciones: listado, búsqueda, detalle, plan, estado, ligas fundadoras, migración asistida y acceso de soporte temporal con motivo (E04-13, E25-03). _Hecho: listado con búsqueda, plan, estado, torneos, equipos, cobrado y último uso; detalle con torneos, usuarios y cobros. Falta: marcar fundadoras, migración asistida y acceso de soporte temporal._
- [x] **E36-05** `dev` Salud de cada liga: alertas de riesgo de abandono del documento 5 (sin equipos a los 7 días, menos del 50 % de actas cargadas, solo pagos manuales, panel sin uso). _Alertas de riesgo con umbrales en `datos.json` (`saludDeLiga`) y lista "Ligas para llamar"._
- [~] **E36-06** `dev` Dinero: cobros, suscripciones y cargos por servicio de todas las ligas, conciliación con Mercado Pago, diferencias, reembolsos y contracargos. _Depende de:_ E06. _Hecho: cobros y cargos por mes y por liga (lectura). Falta: conciliación con Mercado Pago, reembolsos y contracargos._
- [ ] **E36-07** `dev` Facturación de suscripciones y cargos por servicio: comprobantes emitidos, pendientes y errores ante ARCA. _Depende de:_ E26-07.
- [ ] **E36-08** `dev` Suscripciones y planes: altas, bajas y cambios de plan, cobro de la suscripción, cupo y descuento de fundadoras, referidos, packs de mensajes y descuentos aprobados. _Depende de:_ E26.
- [ ] **E36-09** `dev` Configuración global: precios de los planes y cargo por servicio vigentes, feature flags por organización, plantillas de WhatsApp y textos legales versionados.
- [ ] **E36-10** `dev` Operación: colas y jobs, webhooks fallidos, actas con error de sincronización, mensajes fallidos y costo de mensajería por liga; panel de estado del fin de semana (E02-07, E31-05).
- [ ] **E36-11** `dev` Moderación y datos personales: fotos, crónicas, mercado de pases, sponsors, denuncias, pedidos de acceso, rectificación y supresión, y auditoría de accesos a documentos (E28-04).
- [~] **E36-12** `dev` Métricas del negocio: ligas activas, GMV, ingresos de Gregal por suscripción y por cargos por servicio, retención, embudo de ventas y partidos cerrados por semana (E24-05). _Hecho: ligas activas, GMV por medio, cargos cobrados, partidos cerrados por semana y ligas nuevas por mes. Falta: retención y embudo de ventas._
- [ ] **E36-13** `dev` Exportaciones para dirección y contabilidad (CSV) y reporte mensual.

## E37 · Demo pública con sandbox por visitante
La landing ofrece "Probá la demo" y, en la misma landing, el acceso a la liga real. Mismo monorepo y mismo código, desplegado como un entorno aparte con su propia base (ADR-019). Los datos de la demo nunca conviven con los de producción.

- [~] **E37-01** `dev` Modo demo por configuración (`DEMO_MODE`): pasarela simulada forzada, mensajería apagada o capturada, subida de archivos limitada, `noindex`, banner fijo "Demo". La lógica de negocio no conoce la demo. _Depende de:_ E02-11. _Hecho cuando:_ con el modo encendido no sale ningún email, WhatsApp ni pago real, y con el modo apagado el módulo ni se carga. _Hecho: pasarela simulada obligatoria, banner y `noindex`, módulo de sandboxes solo con el modo encendido. Mensajería forzada a simulada con `DEMO_MODE`. Falta: limitar la subida de archivos._
- [x] **E37-02** `dev` Plantilla de datos sintéticos reutilizable (torneo, equipos, fixture, partidos jugados y pendientes), compartida con las semillas de `pnpm demo`. _Hecho cuando:_ `pnpm demo` y la sandbox salen de la misma plantilla.
- [x] **E37-03** `dev` Módulo `apps/api/src/demo`: crear una sandbox (organización propia y usuario temporal) desde la plantilla, aislada por RLS. _Hecho cuando:_ dos visitantes en simultáneo no ven ni pisan los datos del otro (test de integración).
- [x] **E37-04** `dev` Expiración: la sandbox vence a las 24 h y un job la elimina; botón "Reiniciar demo". _Hecho cuando:_ una sandbox vencida desaparece con todos sus datos y archivos.
- [~] **E37-05** `dev` Protecciones de abuso: límite de sandboxes por IP, captcha al crearla, tope de tamaño por sandbox. _Hecho cuando:_ superar el límite devuelve un error claro y queda registrado. _Hecho: tope por IP, tope de sandboxes activas, captcha Turnstile opcional y log de rechazos. El captcha está en la web pero falta probarlo con una clave real de Turnstile. Falta: tope de tamaño por sandbox._
- [x] **E37-06** `dev` Landing con dos puertas: "Probá la demo" (lleva al entorno de demo) e "Ingresar" (lleva a la app real). Llamado a "Crear mi liga" al final de la demo, con consentimiento si se pide el email (alimenta el CRM, E27-02). _Hecho cuando:_ ambos caminos funcionan desde la misma landing.
- [x] **E37-07** `dev` Separación de sesiones entre entornos: cookies por subdominio, sin que una sesión de demo sirva en producción ni al revés; indicador visual de en cuál entorno se está. _Hecho cuando:_ un test comprueba que la cookie de un entorno es rechazada en el otro.
- [ ] **E37-08** `ops` Despliegue del entorno de demo: base, Redis y almacenamiento propios, dominio propio, misma imagen que producción con otra configuración. _Depende de:_ E00-06, E31-01. _Hecho cuando:_ el entorno responde y no comparte ningún recurso con producción.
- [~] **E37-09** `dev` Pruebas E2E del recorrido: entrar a la demo desde la landing, jugar un partido en el acta, ver la tabla y el sitio público, y vencer la sandbox. _Hecho cuando:_ el recorrido pasa en Playwright. _Hecho: recorridos landing → sandbox, copa con penales, acta sin conexión y dueño único (pnpm --filter @potrero/web test:e2e:publica). Falta: vencimiento de la sandbox en el navegador (hoy lo cubre el test de integración de la API)._

## E35 · Fuera de alcance del lanzamiento
No se construye para el lanzamiento. Queda registrado para no perderlo.

- [ ] **E35-01** App nativa iOS y Android con notificaciones push (ADR abierto).
- [ ] **E35-02** Reserva de canchas por el público.
- [ ] **E35-03** Seguros deportivos y merchandising.
- [ ] **E35-04** Ligas privadas con pago por jugador.
- [ ] **E35-05** Sponsors de plataforma vendidos por Potrero (cuando haya ~30–50 torneos activos o ~5.000 jugadores).
- [ ] **E35-06** Expansión regional (Uruguay, Chile, Paraguay).
- [ ] **E35-07** Segunda pasarela de pago.
