import Link from 'next/link';
import { Vacio } from '@/componentes/ui';

/** Se muestra cuando la API responde 403: el rol del usuario no tiene acceso a la sección (F18). */
export default function SinPermiso() {
  return (
    <Vacio
      titulo="Tu rol no tiene acceso a esta sección"
      texto="Si necesitás entrar, pedíselo a quien administra la liga. Mientras tanto, seguí desde el panel."
    >
      <Link href="/panel" className="btn btn-sm mt-2">
        Volver al panel
      </Link>
    </Vacio>
  );
}
