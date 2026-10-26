import Link from 'next/link';
import { Vacio } from '@/componentes/ui';

/** La API interna respondió 403: el rol del staff no ve esta sección (por ejemplo, Soporte en Dinero). */
export default function SinPermisoGregal() {
  return (
    <Vacio
      titulo="Tu rol interno no tiene acceso a esta sección"
      texto="El intento quedó registrado en la auditoría."
    >
      <Link href="/gregal" className="btn btn-sm mt-2">
        Volver al inicio
      </Link>
    </Vacio>
  );
}
