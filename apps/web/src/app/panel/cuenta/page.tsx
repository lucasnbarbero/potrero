// Mi cuenta (E04-14): datos personales, verificación del email, contraseña, organizaciones y sesiones.
import { Encabezado } from '@/componentes/ui';
import { apiServidor } from '@/lib/api';
import type { MiCuenta } from '@/lib/tipos-panel';
import { CambiarPassword, CerrarSesiones, Organizaciones, Perfil, VerificarEmail } from './Formularios';

export const metadata = { title: 'Mi cuenta' };

export default async function Cuenta() {
  const c = await apiServidor<MiCuenta>('/cuenta');
  return (
    <div className="mx-auto max-w-[1100px] space-y-6">
      <Encabezado eyebrow="Tu usuario" titulo="Mi cuenta" />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="tile rise space-y-4" style={{ '--d': 1 } as React.CSSProperties}>
          <h2 className="text-lg font-bold">Tus datos</h2>
          <VerificarEmail verificado={c.usuario.emailVerificado} email={c.usuario.email} />
          <Perfil nombre={c.usuario.nombre} email={c.usuario.email} />
        </section>
        <section className="tile rise space-y-4" style={{ '--d': 2 } as React.CSSProperties}>
          <h2 className="text-lg font-bold">Contraseña</h2>
          <CambiarPassword />
        </section>
        <section className="tile rise space-y-3" style={{ '--d': 3 } as React.CSSProperties}>
          <h2 className="text-lg font-bold">Tus organizaciones</h2>
          <p className="text-sm text-mute">
            Elegí con cuál trabajar. El panel muestra solo los datos de la activa.
          </p>
          <Organizaciones organizaciones={c.organizaciones} />
        </section>
        <section className="tile rise space-y-3" style={{ '--d': 4 } as React.CSSProperties}>
          <h2 className="text-lg font-bold">Sesiones</h2>
          <p className="text-sm text-mute">
            Tenés la sesión abierta en{' '}
            <b className="text-ink">
              {c.sesionesActivas} {c.sesionesActivas === 1 ? 'dispositivo' : 'dispositivos'}
            </b>
            . Si usaste una compu ajena o perdiste el celular, cerrala en todos.
          </p>
          <CerrarSesiones />
        </section>
      </div>
    </div>
  );
}
