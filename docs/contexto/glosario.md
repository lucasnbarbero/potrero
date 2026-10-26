# Glosario y equivalencias

El documento 1 nombra las entidades en inglés; el código usa español (ADR-008).

| Documento 1 | Código (Prisma) | Tabla | Significado |
|---|---|---|---|
| Organization | Organizacion | organizacion | Liga u organizador: el tenant |
| User / Membership | Usuario / Membresia | usuario / membresia | Persona y su rol en una organización |
| Ruleset | Reglamento | reglamento | Reglas versionadas de un torneo |
| Tournament | Torneo | torneo | Competencia (modalidad + formato) |
| Stage / Group | — (pendiente E10) | — | Fases y zonas |
| Team | Equipo | equipo | Equipo de la organización, reutilizable |
| Player | Jugador | jugador | Persona que juega |
| Roster (TeamPlayer) | PlantelJugador | plantel_jugador | Jugador en un equipo, con número |
| Registration | Inscripcion | inscripcion | Equipo anotado en un torneo |
| Charge / Payment | Cargo / Pago | cargo / pago | Lo que se debe / lo que se pagó |
| LedgerEntry / Payout | — (pendiente E07) | — | Caja de partida doble y retiros |
| Venue / Pitch | Sede / Cancha | sede / cancha | Complejo y cancha |
| Referee | — (pendiente E08) | — | Árbitro |
| Match / MatchEvent | Partido / EventoPartido | partido / evento_partido | Partido y eventos del acta |
| Sanction / Case | Sancion (expedientes: E14) | sancion | Suspensión |
| AuditLog | Auditoria | auditoria | Registro inmutable |
| client_uuid | clientUuid | client_uuid | Id del evento generado en el dispositivo |

Otros términos: **fecha** = jornada (no día calendario); **equipo ausente** = el que no se presentó a jugar y pierde el partido (antes "W.O." o walkover; en el código, estado `WO`); **libre** = equipo sin partido en una fecha; **split** = cobro dividido de Mercado Pago entre organizador y plataforma; **liga fundadora** = una de las primeras 15, comisión 2,5 % de por vida; **BSP** = proveedor autorizado de WhatsApp Business.
