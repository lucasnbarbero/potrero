// Jugador de demo (E20-01): un jugador de Villa Unión (el equipo del capitán de demo) con goles en el Apertura y sin
// suspensión, con cuenta propia y la convocatoria del próximo partido sin responder. Nace como en la vida real: el
// capitán lo invita desde su plantel y el jugador acepta los términos.
import { TERMINOS_JUGADOR } from '@potrero/shared';
import { CapitanService } from '../capitan/capitan.js';
import type { Contexto } from '../comun/http.js';
import type { Resolver } from '../demo/plantilla.js';
import { DbService } from '../db/db.service.js';
import { JugadorService } from '../jugador/jugador.js';
import { UsuariosService } from '../usuarios/usuarios.js';
import { CAPITAN_DEMO } from './usuarios-demo.js';

export const JUGADOR_DEMO = { email: 'jugador@potrero.app', password: 'potrero-demo-2026' };

export async function cargarJugadorDemo(app: Resolver, c: Contexto) {
  const db = app.get(DbService);
  const capitan = app.get(CapitanService);
  const ctxCapitan = {
    ...c,
    usuarioId: (await db.app.usuario.findUniqueOrThrow({ where: { email: CAPITAN_DEMO.email } })).id,
    rol: 'CAPITAN',
  };
  const panel = await capitan.resumen(ctxCapitan);
  const libre = (j: (typeof panel.plantel)[number]) => j.goles > 0 && j.habilitado && j.suspendidoPor === 0;
  const elegido =
    panel.plantel.filter(libre).find((j) => j.convocatoria === 'PENDIENTE') ??
    [...panel.plantel].sort((a, b) => b.goles - a.goles).find(libre) ??
    panel.plantel[0]!;
  const inv = await app
    .get(JugadorService)
    .invitarDesdeCapitan(ctxCapitan, elegido.jugadorId, { email: JUGADOR_DEMO.email });
  await app.get(UsuariosService).aceptar(inv.link.split('/invitacion/')[1]!, {
    nombre: elegido.nombre,
    password: JUGADOR_DEMO.password,
    terminosVersion: TERMINOS_JUGADOR.version,
  });
  // Su convocatoria queda sin responder: en la demo la confirma él desde su panel y el capitán lo ve al instante.
  if (panel.proximo)
    await capitan.convocar(ctxCapitan, panel.proximo.id, {
      jugadorId: elegido.jugadorId,
      respuesta: 'PENDIENTE',
    });
  console.log(
    `  Jugador (${elegido.nombre}, ${panel.equipo.nombre}): ${JUGADOR_DEMO.email} / ${JUGADOR_DEMO.password}`,
  );
}
