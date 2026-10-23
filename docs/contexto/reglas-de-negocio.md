# Reglas de negocio (resumen operativo)

Fuente: documento 1 (secciones 5–8) y documento 2. Cifras: `docs/datos.json`. Implementación: `packages/shared/src/dominio`.

## Producto
- Cliente que paga: organizador de liga (12–24 equipos, canchas alquiladas). Capitanes, jugadores y público entran solos.
- 20 módulos (mocks 01–20) + backoffice de Gregal (E36). Lanzamiento único, beta con 15 ligas fundadoras.
- Modalidades F5/F7/F8/F11. Formatos: liga, copa, grupos + playoffs, liga + playoffs.

## Planes y cobros
- Liga 3,5 % · Ligas fundadoras 2,5 % de por vida (primeras 15) · Pro $24.900/mes + 2 %. Sin permanencia.
- La comisión se cobra solo sobre pagos con Mercado Pago (split 1:1, `application_fee`). Efectivo y transferencia: sin comisión.
- Mercado Pago cobra aparte su costo; el organizador elige absorberlo o mostrarlo como "cargo por servicio" (default: ADR-013 abierto).
- Una inscripción genera cargos; el cargo queda PAGADO cuando los pagos aprobados cubren el monto; sin cargos pendientes, la inscripción pasa a CONFIRMADA.
- Notificaciones de pago: firma validada, idempotentes por id de pago, conciliación nocturna (pendiente).

## Tabla
- Puntos por defecto 3/1/0. Desempates en orden: diferencia de gol, goles a favor, resultado entre sí, juego limpio (amarilla 1, roja 3; menos es mejor), sorteo.
- W.O.: gana el presente por 3-0 (configurable); no suma estadísticas individuales.
- La tabla es derivada de los partidos cerrados; nunca se edita.

## Fixture
- Todos contra todos por rotación; impares: un libre por fecha; ida y vuelta invierte localía. Localía equilibrada.
- Restricciones duras: una cancha por franja, un equipo una vez por fecha, árbitro una vez por franja (pendiente). Blandas y por equipo: pendientes (E09).
- Mover un partido advierte conflictos, no bloquea. Objetivo: 24 equipos < 10 s.

## Acta
- Eventos solo de agregado con `clientUuid`; correcciones = anulación. Un dueño del acta por partido.
- Cierre: firma de ambos capitanes o justificación del árbitro. Al cerrar: resultado, sanciones; tabla/goleadores se derivan.
- Planilla con habilitación visible antes de empezar. Cargar a un suspendido: se registra con advertencia y (E14) abre expediente.

## Sanciones
- Roja directa 1 partido · doble amarilla 1 (sus amarillas no acumulan) · acumulación: cada 5 amarillas, 1 partido.
- Se cumplen con partidos oficiales del equipo jugados después; W.O. y suspendidos no descuentan. El tribunal puede modificar (E14).

## Habilitación del jugador
Documentación vigente (DNI validado, apto físico, autorización si es menor) + sin sanción activa + sin duplicado abierto. Hoy solo se evalúan sanciones (documentación: E15).

## Datos personales
Nunca públicos: DNI, fecha de nacimiento exacta, teléfono, email, domicilio. Menores: consentimiento del tutor, sin foto pública sin autorización. Datos sensibles cifrados (E15).

## Roles
Dueño (todo) · Administrador de torneo (sin dinero ni plan) · Tesorero (cobros) · Árbitro/delegado (acta) · Tribunal (sanciones) · Capitán · Jugador · Tutor · Público · Staff interno (backoffice, acceso auditado).
