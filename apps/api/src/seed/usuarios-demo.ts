// Datos de demo de usuarios (E04-09) y del panel del capitán (E19): miembros con otros roles, una invitación pendiente y
// un capitán del Apertura (el equipo con la roja de la fecha 3, así tiene un suspendido y un expediente para el descargo).
// Usa los servicios reales: las cuentas nacen aceptando una invitación, como en la vida real.
import type { Contexto } from '../comun/http.js';
import { CapitanService } from '../capitan/capitan.js';
import type { Resolver } from '../demo/plantilla.js';
import { DbService } from '../db/db.service.js';
import { UsuariosService } from '../usuarios/usuarios.js';

export const CAPITAN_DEMO = {
  email: 'capitan@potrero.app',
  password: 'potrero-demo-2026',
  nombre: 'Matías Gómez',
};

export async function cargarUsuariosDemo(app: Resolver, c: Contexto) {
  const db = app.get(DbService);
  const usuarios = app.get(UsuariosService);
  const capitan = app.get(CapitanService);
  const token = (link: string) => link.split('/invitacion/')[1]!;

  const { torneo, equipoId } = await db.enOrg(c.organizacionId, async (tx) => {
    const torneo = await tx.torneo.findFirstOrThrow({ where: { nombre: 'Apertura 2026' } });
    const roja = await tx.expediente.findFirst({
      where: { torneoId: torneo.id, tipo: 'ROJA_DIRECTA' },
      orderBy: { creadoEn: 'asc' },
    });
    const equipoId =
      roja?.equipoId ?? (await tx.inscripcion.findFirstOrThrow({ where: { torneoId: torneo.id } })).equipoId;
    return { torneo, equipoId };
  });

  // Miembros con otros roles (misma contraseña de la demo).
  const miembros = [
    { email: 'admin@potrero.app', nombre: 'Lucía Fernández', rol: 'ADMINISTRADOR' as const },
    { email: 'tesoreria@potrero.app', nombre: 'Jorge Medina', rol: 'TESORERO' as const },
    { email: 'tribunal@potrero.app', nombre: 'Raúl Acosta', rol: 'TRIBUNAL' as const },
    { ...CAPITAN_DEMO, rol: 'CAPITAN' as const, equipoId },
  ];
  for (const m of miembros) {
    const inv = await usuarios.invitar(c, {
      email: m.email,
      nombre: m.nombre,
      rol: m.rol,
      ...('equipoId' in m ? { equipoId: m.equipoId } : {}),
    });
    await usuarios.aceptar(token(inv.link), { nombre: m.nombre, password: CAPITAN_DEMO.password });
  }
  // Una invitación pendiente: el link se ve recién al reenviarla (solo se guarda el hash del token).
  const pendiente = await usuarios.invitar(c, {
    email: 'marcos.costa@ejemplo.com.ar',
    nombre: 'Marcos Costa',
    rol: 'ARBITRO',
  });

  // Convocatoria del próximo partido: algunos confirmaron, uno no puede y el resto está pendiente.
  const ctxCapitan = {
    ...c,
    usuarioId: (await db.app.usuario.findUniqueOrThrow({ where: { email: CAPITAN_DEMO.email } })).id,
    rol: 'CAPITAN',
  };
  const panel = await capitan.resumen(ctxCapitan);
  if (panel.proximo) {
    const libres = panel.plantel.filter((j) => j.convocatoria === 'PENDIENTE');
    for (const [i, j] of libres.slice(0, 6).entries())
      await capitan.convocar(ctxCapitan, panel.proximo.id, {
        jugadorId: j.jugadorId,
        respuesta: i === 4 ? 'NO_VA' : 'VA',
      });
  }
  return { torneo: torneo.nombre, equipo: panel.equipo.nombre, invitacionPendiente: pendiente.link };
}
