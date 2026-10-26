'use client';
import { useEffect, useRef } from 'react';

/**
 * Suma una impresión a cada espacio mostrado (E23-02). Sin cookies ni datos del visitante: solo los ids de los espacios.
 * Lo hace el navegador y no el servidor porque la página pública se sirve desde caché.
 */
export function MedirSponsors({ org, ids }: { org: string; ids: string[] }) {
  const enviado = useRef(false);
  const clave = ids.join(',');
  useEffect(() => {
    if (enviado.current || !clave) return;
    enviado.current = true;
    fetch(`/api/sponsors-publico/${encodeURIComponent(org)}/impresiones`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: clave.split(',') }),
      credentials: 'omit',
      keepalive: true,
    }).catch(() => {});
  }, [org, clave]);
  return null;
}
