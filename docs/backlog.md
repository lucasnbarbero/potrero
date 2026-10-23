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

Última actualización: 22/10/2026. Hecho: 53 tareas · parciales: 31. Resumen de lo que funciona: `docs/contexto/estado-actual.md`.

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
| E17 | Contingencias, reprogramaciones y W.O. | H5 | 11 | E09, E11, E16 |
| E18 | Panel del organizador | H5 | 01 | E06, E11, E14, E15 |
| E19 | Panel del capitán | H6 | 07 | E06, E15, E16 |
| E20 | Jugadores y perfil | H6 | 08 | E12, E15 |
| E21 | Página de partido | H6 | 09 | E11, E20 |
| E22 | Mercado de pases | H6 | 10 | E20 |
| E23 | Sponsors | H6 | 18 | E13, E07 |
| E24 | Métricas | H6 | 19 | E06, E09, E11 |
| E25 | Configuración inicial e importación | H6 | 20 | E06, E05 |
| E26 | Planes, comisiones y facturación | H6 | — | E06, E16 |
| E27 | Landing y sitio de marketing | H6 | landing | E03, E26 |
| E28 | Legal dentro del producto | H6 | — | E00-05 |
| E29 | Seguridad | H7 (y continuo) | — | todo |
| E30 | Calidad y pruebas | H7 (y continuo) | — | todo |
| E31 | Plataforma, despliegue y operación | H7 (y continuo) | — | E00-06 |
| E32 | Documentación de producto y soporte | H7 | — | funciones estables |
| E33 | Beta cerrada con ligas fundadoras | Beta | — | E13 en adelante |
| E34 | Lanzamiento público | Lanzamiento | — | todo |
| E36 | Backoffice de Gregal (`apps/admin`) | H0 a H7, junto a cada módulo | — | E04 |
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
- [ ] **E00-08** `legal` Definir forma societaria y régimen fiscal con el contador. _Hecho cuando:_ se sabe cómo se factura la comisión (IVA, Ingresos Brutos).
- [ ] **E00-09** `ops` Crear las cuentas: grupo de GitLab, Mercado Pago Developers, Meta Business, nube, proveedor de email, monitoreo de errores. _Hecho cuando:_ las credenciales de prueba están en el gestor de secretos.
- [ ] **E00-10** `neg` Validar precios con datos reales (3,5 %, 2,5 % fundadoras, Pro $24.900 + 2 %). _Hecho cuando:_ `docs/datos.json` y el documento 2 reflejan los valores validados.
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
- [ ] **E02-14** `dev` Almacenamiento de archivos: buckets público (escudos, fotos) y privado (documentación), URLs firmadas de corta duración.
- [ ] **E02-15** `dev` Servicio de tiempo real (SSE, con WebSocket como alternativa) y degradación a consultas periódicas cada 15 s.

## E03 · Sistema de diseño (`packages/ui`)
- [x] **E03-01** `dev` Tokens de diseño de los mocks (ink, volt, paper, mute, line, radios, sombras, animaciones) como tema de Tailwind compartido.
- [x] **E03-02** `dev` Íconos (set de `mocks/assets/app.js`) como componente.
- [~] **E03-03** `dev` Componentes base: Button, IconButton, Pill, Badge, Tile/Card, Input, Select, Checkbox, Radio, Switch, Textarea, DatePicker, FileUpload.
- [~] **E03-04** `dev` Componentes de datos: Table responsive, Stat/KPI, Empty state, Skeleton, Pagination, Tabs, Stepper.
- [ ] **E03-05** `dev` Componentes de feedback: Modal, Drawer, Toast, Confirmación, Banner de alerta.
- [~] **E03-06** `dev` Estructuras de pantalla: panel del organizador (barra lateral por grupos), sitio público, móvil para acta y capitán.
- [~] **E03-07** `dev` Formularios: integración con validaciones compartidas de `packages/shared` y mensajes de error en español.
- [ ] **E03-08** `dev` Accesibilidad AA: contraste, foco visible, navegación por teclado, tamaños táctiles grandes.
- [ ] **E03-09** `dev` Catálogo visual de componentes (página interna) para revisar cada componente aislado.
- [ ] **E03-10** `dev` Marca por organización: colores y logo aplicables al sitio público y las tarjetas.

## E04 · Identidad, organizaciones y permisos
- [x] **E04-01** `dev` Modelo `User`, `Organization`, `Membership` con alcance (organización, torneo, equipo).
- [~] **E04-02** `dev` Registro e inicio de sesión con email y contraseña; verificación de email; recuperación de contraseña.
- [ ] **E04-03** `dev` Enlace mágico por email.
- [x] **E04-04** `dev` Sesiones con token de acceso corto y token de renovación rotativo; cierre de sesión en todos los dispositivos.
- [ ] **E04-05** `dev` Límites de intentos y bloqueo temporal ante fuerza bruta.
- [~] **E04-06** `dev` Roles del documento 1 (dueño, administrador de torneo, tesorero, árbitro/delegado, tribunal, capitán, jugador, tutor, público, staff interno) y permisos finos (`tournament.fixture.write`, `cash.payout.create`, etc.).
- [~] **E04-07** `dev` Guards de NestJS por permiso, con tests de la matriz completa rol × acción.
- [x] **E04-08** `dev` Crear organización, slug único y datos de facturación.
- [ ] **E04-09** `dev` Invitar usuarios a la organización con un rol; aceptar o rechazar la invitación.
- [ ] **E04-10** `dev` Cambio de organización activa para usuarios con varias membresías.
- [ ] **E04-11** `dev` 2FA opcional para dueños y tesoreros, obligatoria para retiros.
- [ ] **E04-12** `dev` Inicio de sesión de jugadores con código por WhatsApp o SMS. _Depende de:_ E16-03.
- [ ] **E04-13** `dev` Acceso de staff interno: temporal, con motivo registrado y auditado (se opera desde el backoffice, E36-04).
- [~] **E04-14** `dev` Pantallas: registro, login, recuperación, invitación, mi cuenta, usuarios y roles de la organización.

## E05 · Reglamentos, torneos, equipos y jugadores · módulo 02
- [x] **E05-01** `dev` `Ruleset` versionado: puntos, desempates ordenados, umbrales de tarjetas, reglas de W.O., límites de plantel, duración del partido. El torneo fija una versión.
- [ ] **E05-02** `dev` Plantillas de reglamento por modalidad (F5, F7, F8, F11) para empezar rápido.
- [x] **E05-03** `dev` `Tournament` con modalidad, formato (liga, copa, grupos + playoffs, liga + playoffs), temporada, estados (borrador, inscripción, en curso, finalizado) y reglas de aranceles.
- [ ] **E05-04** `dev` `Stage` y `Group` con reglas de avance a llaves.
- [x] **E05-05** `dev` Vista previa del formato: grupos, llaves y cantidad estimada de partidos según los equipos.
- [x] **E05-06** `dev` `Team` a nivel organización, reutilizable entre torneos (nombre, escudo, colores, capitán).
- [~] **E05-07** `dev` `Player` con identidad única entre equipos (`dni_hash`), fecha de nacimiento, foto, preferencias de privacidad.
- [~] **E05-08** `dev` Plantel (`TeamPlayer`): número, posición, estado de habilitación calculado.
- [x] **E05-09** `dev` Pantalla "Crear torneo": asistente por pasos con vista previa (mock 02).
- [~] **E05-10** `dev` Pantallas de torneos: lista, detalle, edición, cambio de estado, archivo.
- [x] **E05-11** `dev` Pantallas de equipos y planteles a nivel organización.

## E06 · Inscripciones y cobros con Mercado Pago · módulo 03
- [~] **E06-01** `dev` Configuración de aranceles por torneo: inscripción, seña, cuotas, cuota por fecha, multas; vencimientos.
- [x] **E06-02** `dev` Link público de inscripción con cupos; el capitán inscribe su equipo.
- [x] **E06-03** `dev` `Registration` y generación automática de `Charge` según las reglas del torneo.
- [ ] **E06-04** `dev` Conexión de la cuenta de Mercado Pago del organizador por OAuth; tokens cifrados y renovación automática.
- [ ] **E06-05** `dev` Cobro con split 1:1: preferencia de pago con comisión de plataforma (`application_fee`) según el plan.
- [~] **E06-06** `dev` Webhooks de Mercado Pago: validación de firma, procesamiento en cola, idempotencia por `payment_id`.
- [ ] **E06-07** `dev` Conciliación nocturna contra la API de Mercado Pago y alerta de diferencias.
- [ ] **E06-08** `dev` Cargo por servicio configurable: lo absorbe el organizador o lo paga el equipo; valor por defecto según ADR.
- [x] **E06-09** `dev` Pagos manuales (efectivo, transferencia) con comprobante, sin comisión de plataforma.
- [ ] **E06-10** `dev` Pago individual por jugador cuando el capitán lo habilita.
- [x] **E06-11** `dev` Estado de pago por equipo y deuda en tiempo real.
- [ ] **E06-12** `dev` Reembolsos, contemplando el rechazo por falta de saldo del vendedor y el aviso al organizador.
- [ ] **E06-13** `dev` Contracargos: registro, estado y aviso.
- [ ] **E06-14** `dev` Recordatorios de pago (se conectan a E16 cuando exista; hasta entonces, por email).
- [x] **E06-15** `dev` Pantalla de inscripciones y pagos del organizador (mock 03).
- [x] **E06-16** `dev` Flujo público de pago del equipo: pantalla, resultado y comprobante.
- [ ] **E06-17** `dev` Plan B sin split: cobro con link de la cuenta del organizador y conciliación manual (detrás de un feature flag).
- [x] **E06-18** `dev` Modo simulado de Mercado Pago para desarrollo y demos, con la misma interfaz que el real.
- [ ] **E06-19** `dev` Contract tests contra el sandbox de Mercado Pago.

## E07 · Caja del torneo · módulo 14
- [ ] **E07-01** `dev` Ledger de partida doble (`LedgerEntry`): cuentas, débitos, créditos, categoría, referencia.
- [ ] **E07-02** `dev` Cada cobro, pago manual, reembolso y comisión genera asientos automáticamente.
- [ ] **E07-03** `dev` Egresos por rubro (cancha, árbitros, premios, otros) con comprobante.
- [ ] **E07-04** `dev` Cargos automáticos por partido (árbitro, cancha). _Depende de:_ E08.
- [ ] **E07-05** `dev` Resultado del torneo en vivo: ingresos, egresos, ganancia.
- [ ] **E07-06** `dev` Saldo y registro de retiros a cuenta bancaria (definir con legal si es solo registro: E00-05).
- [ ] **E07-07** `dev` Exportación de movimientos (CSV y PDF).
- [ ] **E07-08** `dev` Pantalla de caja (mock 14).

## E08 · Canchas y árbitros · módulo 15
- [~] **E08-01** `dev` `Venue` y `Pitch`: dirección, superficie, costo, disponibilidad por franja.
- [ ] **E08-02** `dev` `Referee`: datos, disponibilidad, tarifa, valoración.
- [ ] **E08-03** `dev` Designación manual de árbitros por partido.
- [ ] **E08-04** `dev` Designación automática respetando disponibilidad y una franja por árbitro.
- [ ] **E08-05** `dev` Pagos a árbitros (se conectan a la caja).
- [ ] **E08-06** `dev` Ocupación por cancha y franja.
- [ ] **E08-07** `dev` Pantalla de árbitros y canchas (mock 15).

## E09 · Motor de fixture · módulo 04
- [ ] **E09-01** `dev` Prueba técnica del motor: 24 equipos en menos de 10 s con restricciones reales. _Hecho cuando:_ el ADR "heurística propia o CP-SAT" queda decidido.
- [x] **E09-02** `dev` Cruces con el método de rotación (circle method) para liga y grupos; ida y vuelta opcional; fecha libre con cantidad impar.
- [ ] **E09-03** `dev` Sorteo con cabezas de serie para copa.
- [~] **E09-04** `dev` Asignación de fecha, cancha y horario: restricciones duras (sin partidos simultáneos ni descanso insuficiente, una cancha y un árbitro por franja).
- [ ] **E09-05** `dev` Optimización de restricciones blandas: balance local/visitante, preferencias, menos huecos.
- [ ] **E09-06** `dev` Restricciones por equipo (por ejemplo, "no juega los domingos").
- [ ] **E09-07** `dev` Mover un partido a mano: re-evaluación y explicación de cada conflicto, con advertencia y sin bloqueo.
- [ ] **E09-08** `dev` Publicar el fixture (aviso a capitanes cuando exista E16).
- [~] **E09-09** `dev` Pantalla de fixture: grilla por cancha y conflictos (mock 04).
- [~] **E09-10** `dev` Tests con casos límite reales y prueba de rendimiento en CI.

## E10 · Llaves y playoffs · módulo 17
- [ ] **E10-01** `dev` Clasificación de grupos o liga a llaves según las reglas de avance.
- [ ] **E10-02** `dev` Cuadro eliminatorio que se completa solo con los resultados.
- [ ] **E10-03** `dev` Definición por penales y partidos de ida y vuelta en llaves.
- [ ] **E10-04** `dev` Publicación en tiempo real.
- [ ] **E10-05** `dev` Pantalla de llaves (mock 17).

## E11 · Partidos y acta digital · módulo 05
- [x] **E11-01** `dev` `Match` con estados (programado, en juego, finalizado, suspendido, W.O.) y transiciones válidas.
- [x] **E11-02** `dev` `MatchEvent` solo de agregado (gol, tarjeta, cambio) con `client_uuid`; las correcciones son eventos de anulación.
- [x] **E11-03** `dev` Planilla del acta con la habilitación de cada jugador en tiempo real (suspendido o sin documentación, marcado).
- [x] **E11-04** `dev` Carga en vivo de goles, tarjetas y cambios, con botones grandes y alto contraste.
- [ ] **E11-05** `dev` Un solo dueño del acta por partido (el delegado asignado); aviso al segundo dispositivo.
- [ ] **E11-06** `dev` Acta offline: service worker, IndexedDB, cola de eventos ordenada y sincronización al recuperar señal.
- [x] **E11-07** `dev` Cierre con firma de ambos capitanes o justificación del árbitro.
- [~] **E11-08** `dev` Cadena al cerrar: tabla → goleadores → sanciones → sitio público → notificaciones.
- [ ] **E11-09** `dev` Informe del árbitro.
- [ ] **E11-10** `dev` Edición de actas cerradas solo por el administrador, con auditoría.
- [ ] **E11-11** `dev` Marcador en vivo en el panel y la página de partido.
- [~] **E11-12** `dev` Pantalla del acta en el celular, instalable como PWA (mock 05).
- [ ] **E11-13** `dev` Prueba en 3–4 celulares de gama media o baja con conexión mala.

## E12 · Tabla de posiciones y estadísticas
- [x] **E12-01** `dev` Tabla derivada: se recalcula desde los partidos cerrados con un job y nunca se edita a mano.
- [x] **E12-02** `dev` Desempates configurables: diferencia de gol, goles a favor, resultado entre sí, juego limpio, sorteo.
- [x] **E12-03** `dev` W.O. según reglamento (por defecto 3-0 y sanción económica), sin sumar estadísticas individuales.
- [x] **E12-04** `dev` Goleadores, tarjetas y tabla de juego limpio.
- [ ] **E12-05** `dev` Estadísticas por jugador y equipo, acumuladas entre torneos.

## E13 · Sitio público del torneo y PWA · módulo 06
- [x] **E13-01** `dev` Páginas públicas de la organización y del torneo: tabla, fixture, goleadores, llaves.
- [~] **E13-02** `dev` Generación estática incremental, regenerada por evento (acta cerrada), para soportar los picos del fin de semana.
- [ ] **E13-03** `dev` SEO: metadatos, sitemap, datos estructurados e imágenes para compartir.
- [ ] **E13-04** `dev` Marca de la organización aplicada al sitio.
- [ ] **E13-05** `dev` Dominio propio para el plan Pro. _Depende de:_ E26.
- [x] **E13-06** `dev` Principio de mínimo dato: nunca se publica DNI, edad exacta de menores ni teléfono.
- [x] **E13-07** `dev` "Creado con Potrero" con llamado a organizadores.
- [ ] **E13-08** `dev` PWA: manifiesto, íconos, instalación, actualización.
- [x] **E13-09** `dev` Pantalla del sitio público (mock 06).

## E14 · Sanciones y tribunal · módulo 12
- [x] **E14-01** `dev` Sanciones automáticas desde el acta: roja directa (por defecto 1 partido), doble amarilla (1), acumulación (por defecto 5 = 1 partido).
- [x] **E14-02** `dev` Conteo en partidos oficiales del equipo; un partido suspendido o un W.O. no descuenta.
- [~] **E14-03** `dev` Bloqueo en el acta y expediente automático por "jugador no habilitado" si se lo carga igual.
- [ ] **E14-04** `dev` Expedientes: informe del árbitro, descargo del capitán, resolución del tribunal (puede ampliar o reducir).
- [ ] **E14-05** `dev` Multas que generan cargos al equipo.
- [ ] **E14-06** `dev` Historial disciplinario por jugador y por equipo.
- [~] **E14-07** `dev` Pantalla de sanciones y tribunal (mock 12).

## E15 · Documentación, identidad y consentimientos · módulo 13
- [ ] **E15-01** `dev` Tipos de documento (DNI, apto físico, autorización de menor) y cuáles son obligatorios por torneo.
- [ ] **E15-02** `dev` Carga a bucket privado y acceso por URL firmada con registro de quién lo pidió.
- [ ] **E15-03** `dev` Cifrado a nivel de campo del número de DNI y de los datos médicos; hash del DNI para duplicados.
- [ ] **E15-04** `dev` Revisión humana de documentos: aprobar o rechazar con motivo.
- [ ] **E15-05** `dev` Vencimientos y alertas (apto físico).
- [ ] **E15-06** `dev` Detección de duplicados entre equipos.
- [ ] **E15-07** `dev` Habilitación del jugador: documentación vigente + sin sanción activa + sin duplicado abierto.
- [ ] **E15-08** `dev` `Consent` versionado y flujo del tutor para menores (con la edad que defina E00-05).
- [ ] **E15-09** `dev` Consentimiento para publicar imagen, especialmente de menores.
- [ ] **E15-10** `dev` Retención y borrado automático por tipo de dato.
- [ ] **E15-11** `dev` Verificación por selfie con un proveedor externo, detrás de un feature flag y solo con aprobación legal.
- [ ] **E15-12** `dev` Pantalla de documentación (mock 13).

## E16 · Mensajería y comunicación · módulo 16
- [ ] **E16-01** `dev` Capa de mensajería con canales intercambiables: email, Web Push, WhatsApp.
- [ ] **E16-02** `dev` Email transaccional con el proveedor elegido y plantillas.
- [ ] **E16-03** `dev` WhatsApp Business por el BSP: plantillas versionadas y aprobadas (recordatorio, cobro, contingencia, resultado).
- [ ] **E16-04** `dev` Web Push (VAPID) y suscripción desde la PWA.
- [ ] **E16-05** `dev` Opt-in explícito y preferencias por usuario; separación de mensajes transaccionales y de marketing.
- [ ] **E16-06** `dev` Regla de costo: WhatsApp solo para capitanes, delegados y quienes dieron opt-in; push o email por defecto.
- [ ] **E16-07** `dev` Segmentación de destinatarios y variables en plantillas.
- [ ] **E16-08** `dev` Vista previa con costo estimado antes de cada envío masivo.
- [ ] **E16-09** `dev` Topes mensuales por plan y packs de mensajes adicionales.
- [ ] **E16-10** `dev` Automatizaciones: recordatorio 24 h antes del partido, cobro escalonado.
- [ ] **E16-11** `dev` Webhooks de entrega, historial y costo por mensaje.
- [ ] **E16-12** `dev` Pantalla de comunicación (mock 16).

## E17 · Contingencias, reprogramaciones y W.O. · módulo 11
- [ ] **E17-01** `dev` Contingencia por partido, fecha, cancha o torneo: mover, suspender, cambiar de cancha.
- [ ] **E17-02** `dev` Propuesta calculada antes de aplicar, con conflictos resueltos y pendientes (usa el motor de E09).
- [ ] **E17-03** `dev` Aplicar la propuesta y registrar la `Contingency` (qué se movió y quién confirmó).
- [ ] **E17-04** `dev` Aviso masivo con botones "Confirmo" y "No puedo"; los "No puedo" vuelven como alerta.
- [~] **E17-05** `dev` W.O. con tolerancia configurable (por defecto 15 min), cuenta regresiva en el acta y resolución automática.
- [ ] **E17-06** `dev` Alerta de clima con opciones sugeridas (proveedor de pronóstico a elegir).
- [ ] **E17-07** `dev` Pantalla de reprogramaciones (mock 11).
- [ ] **E17-08** `dev` Prueba de aceptación: lluvia simulada con 9 partidos movidos, aviso y confirmaciones.

## E18 · Panel del organizador · módulo 01
- [~] **E18-01** `dev` Partido en vivo con goleadores y acceso directo al acta.
- [x] **E18-02** `dev` Cobrado, pendiente y deudores, con recordatorio en un toque.
- [~] **E18-03** `dev` Alertas accionables: suspendido que jugó, acta sin cargar, partido sin árbitro, documento vencido, pago sin conciliar.
- [ ] **E18-04** `dev` Sugerencias del próximo paso (por ejemplo, "publicá el fixture y avisá a 16 capitanes").
- [~] **E18-05** `dev` Pantalla del panel (mock 01).

## E19 · Panel del capitán · módulo 07
- [ ] **E19-01** `dev` Plantel del equipo: altas, bajas e invitación a jugadores.
- [ ] **E19-02** `dev` Convocatoria con confirmación de asistencia.
- [ ] **E19-03** `dev` Cuotas por jugador y pago individual.
- [ ] **E19-04** `dev` Documentación del equipo: qué falta y quién.
- [ ] **E19-05** `dev` Sanciones del equipo y presentación de descargos.
- [ ] **E19-06** `dev` "Organizá tu torneo": paso de capitán a organizador.
- [ ] **E19-07** `dev` Pantalla del capitán (mock 07).

## E20 · Jugadores y perfil · módulo 08
- [ ] **E20-01** `dev` Cuenta del jugador, aceptación de términos y reclamo del perfil creado por el capitán.
- [ ] **E20-02** `dev` Perfil con estadísticas y trayectoria entre torneos.
- [ ] **E20-03** `dev` Valoración de juego limpio.
- [ ] **E20-04** `dev` Privacidad: apodo o iniciales, perfiles de menores opcionales.
- [ ] **E20-05** `dev` Notificaciones personales (partido, convocatoria, sanción).
- [ ] **E20-06** `dev` Pantalla del perfil de jugador (mock 08).

## E21 · Página de partido · módulo 09
- [ ] **E21-01** `dev` Línea de tiempo del partido desde los eventos del acta.
- [ ] **E21-02** `dev` Crónica automática generada a partir de los eventos.
- [ ] **E21-03** `dev` Fotos del partido con consentimiento y moderación.
- [ ] **E21-04** `dev` Tarjeta de resultado compartible (imagen para WhatsApp e Instagram).
- [ ] **E21-05** `dev` Pantalla de la página de partido (mock 09).

## E22 · Mercado de pases · módulo 10
- [ ] **E22-01** `dev` Publicaciones de jugadores libres y de equipos que buscan.
- [ ] **E22-02** `dev` Filtros por zona, posición y nivel.
- [ ] **E22-03** `dev` Contacto sin exponer datos personales.
- [ ] **E22-04** `dev` Moderación y denuncias.
- [ ] **E22-05** `dev` Pantalla del mercado de pases (mock 10).

## E23 · Sponsors · módulo 18
- [ ] **E23-01** `dev` Espacios publicitarios en el sitio y las tarjetas; `Placement` por período y monto.
- [ ] **E23-02** `dev` Medición de impresiones y clics, en forma agregada y sin datos personales.
- [ ] **E23-03** `dev` Reporte para cada sponsor.
- [ ] **E23-04** `dev` Ingresos de sponsors en la caja.
- [ ] **E23-05** `dev` Reglas: categorías prohibidas en torneos con menores (apuestas, alcohol, tabaco), rechazo de categorías por organización, señalización de publicidad.
- [ ] **E23-06** `dev` Pantalla de sponsors (mock 18).

## E24 · Métricas · módulo 19
- [ ] **E24-01** `dev` Retención de equipos entre torneos.
- [ ] **E24-02** `dev` Tasa de cobro y cobro antes del inicio.
- [ ] **E24-03** `dev` Ocupación de canchas y mapa de horarios más pedidos.
- [ ] **E24-04** `dev` Pantalla de métricas (mock 19).
- [ ] **E24-05** `dev` Métricas internas de la plataforma: ligas activas, GMV, take rate, partidos cerrados por semana (norte del producto). Se muestran en el backoffice (E36-12).

## E25 · Configuración inicial e importación · módulo 20
- [ ] **E25-01** `dev` Asistente de 5 pasos: organización, Mercado Pago, marca y dominio, reglamento, importación.
- [ ] **E25-02** `dev` Importación desde Excel de equipos, jugadores y canchas, con plantilla descargable y validación fila por fila.
- [ ] **E25-03** `dev` Migración asistida por el equipo de Potrero (herramienta del backoffice, E36-04).
- [ ] **E25-04** `dev` Pantalla de configuración (mock 20). _Hecho cuando:_ una liga nueva queda dada de alta en menos de 30 minutos.

## E26 · Planes, comisiones y facturación
- [ ] **E26-01** `dev` Planes Liga (3,5 %), Ligas fundadoras (2,5 % de por vida, primeras 15) y Pro ($24.900/mes + 2 %), leídos de la configuración y no fijos en el código.
- [ ] **E26-02** `dev` Habilitación de funciones por plan (marca y dominio propio, WhatsApp ampliado, sponsors y métricas avanzadas, soporte prioritario).
- [ ] **E26-03** `dev` Comisión de plataforma según el plan en cada cobro.
- [ ] **E26-04** `dev` Cobro de la suscripción Pro (mecanismo a definir con Mercado Pago).
- [ ] **E26-05** `dev` Programa de ligas fundadoras: cupo, asignación y logo de socio fundador.
- [ ] **E26-06** `dev` Programa de referidos entre ligas.
- [ ] **E26-07** `dev` Facturación electrónica de la comisión (ARCA) según el régimen definido en E00-08.
- [ ] **E26-08** `dev` Exportación de todos los datos de la organización y baja sin costo.
- [ ] **E26-09** `dev` Pantalla de plan y facturación de la organización.

## E27 · Landing y sitio de marketing
- [x] **E27-01** `dev` Landing en la app real a partir de `mocks/landing.html`, con los precios de `docs/datos.json`.
- [ ] **E27-02** `dev` Lista de espera y formulario de ligas fundadoras (alimenta el CRM).
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
- [x] **E30-02** `dev` *Continuo:* tests de integración de API + base de datos + colas.
- [~] **E30-03** `dev` Pruebas E2E con Playwright de los flujos críticos: crear torneo, inscribir y pagar, armar fixture, acta offline y sincronización, reprogramar.
- [ ] **E30-04** `dev` Pruebas de carga del pico de sábado (cientos de consultas al sitio público, decenas de actas abiertas).
- [ ] **E30-05** `dev` Pruebas de accesibilidad y rendimiento en móvil (contenido principal en < 2,5 s con 4G).
- [ ] **E30-06** `dev` Datos de prueba sintéticos para staging; nunca datos reales fuera de producción.

## E31 · Plataforma, despliegue y operación
- [ ] **E31-01** `ops` Entornos: local, preview por merge request, staging y producción.
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
- [ ] **E34-04** `neg` Campaña de lanzamiento ("Dejá el Excel"), evento con ligas fundadoras y promoción para ligas nuevas.
- [ ] **E34-05** `ops` Monitoreo reforzado y guardia ampliada durante las primeras semanas.
- [ ] **E34-06** `neg` Reporte mensual de métricas y revisión de los supuestos del documento 2.

## E36 · Backoffice de Gregal
Aplicación interna separada del producto (`apps/admin`), solo para el equipo de Gregal. Reúne las herramientas internas que antes estaban dispersas. Cada tarea se hace cuando existe el módulo que administra.

- [ ] **E36-01** `dev` App `apps/admin` con su propio login, 2FA obligatoria, sesión corta y acceso restringible por red. _Depende de:_ E04.
- [ ] **E36-02** `dev` Usuarios internos y roles propios (soporte, finanzas, dirección, superadmin) separados de los roles de las organizaciones.
- [ ] **E36-03** `dev` Auditoría de toda acción interna, consultable desde el backoffice.
- [ ] **E36-04** `dev` Organizaciones: listado, búsqueda, detalle, plan, estado, ligas fundadoras, migración asistida y acceso de soporte temporal con motivo (E04-13, E25-03).
- [ ] **E36-05** `dev` Salud de cada liga: alertas de riesgo de abandono del documento 5 (sin equipos a los 7 días, menos del 50 % de actas cargadas, solo pagos manuales, panel sin uso).
- [ ] **E36-06** `dev` Dinero: cobros y comisiones de todas las ligas, conciliación con Mercado Pago, diferencias, reembolsos y contracargos. _Depende de:_ E06.
- [ ] **E36-07** `dev` Facturación de comisiones: comprobantes emitidos, pendientes y errores ante ARCA. _Depende de:_ E26-07.
- [ ] **E36-08** `dev` Suscripciones y planes: altas, bajas y cambios de Pro, cupo de fundadoras, referidos, packs de mensajes y descuentos aprobados. _Depende de:_ E26.
- [ ] **E36-09** `dev` Configuración global: precios y comisiones vigentes, feature flags por organización, plantillas de WhatsApp y textos legales versionados.
- [ ] **E36-10** `dev` Operación: colas y jobs, webhooks fallidos, actas con error de sincronización, mensajes fallidos y costo de mensajería por liga; panel de estado del fin de semana (E02-07, E31-05).
- [ ] **E36-11** `dev` Moderación y datos personales: fotos, crónicas, mercado de pases, sponsors, denuncias, pedidos de acceso, rectificación y supresión, y auditoría de accesos a documentos (E28-04).
- [ ] **E36-12** `dev` Métricas del negocio: ligas activas, GMV, take rate, retención, embudo de ventas y partidos cerrados por semana (E24-05).
- [ ] **E36-13** `dev` Exportaciones para dirección y contabilidad (CSV) y reporte mensual.

## E35 · Fuera de alcance del lanzamiento
No se construye para el lanzamiento. Queda registrado para no perderlo.

- [ ] **E35-01** App nativa iOS y Android con notificaciones push (ADR abierto).
- [ ] **E35-02** Reserva de canchas por el público.
- [ ] **E35-03** Seguros deportivos y merchandising.
- [ ] **E35-04** Ligas privadas con pago por jugador.
- [ ] **E35-05** Sponsors de plataforma vendidos por Potrero (cuando haya ~30–50 torneos activos o ~5.000 jugadores).
- [ ] **E35-06** Expansión regional (Uruguay, Chile, Paraguay).
- [ ] **E35-07** Segunda pasarela de pago.
