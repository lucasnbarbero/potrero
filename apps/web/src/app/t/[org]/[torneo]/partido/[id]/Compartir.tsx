'use client';
import { Icono } from '@potrero/ui';
import { useState } from 'react';

/**
 * Compartir el resultado (E21-04). WhatsApp abre el chat con el link (la vista previa muestra la tarjeta por Open Graph);
 * en el celular, "Compartir imagen" manda la tarjeta como foto; "Descargar" baja la versión vertical para historias.
 */
export function Compartir({
  url,
  texto,
  imagen,
  archivo,
}: {
  url: string;
  texto: string;
  imagen: string;
  archivo: string;
}) {
  const [aviso, setAviso] = useState<string | null>(null);
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${texto} ${url}`)}`;

  async function compartirImagen() {
    try {
      const blob = await (await fetch(imagen)).blob();
      const file = new File([blob], archivo, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: `${texto} ${url}` });
        return;
      }
      await navigator.clipboard?.writeText(url);
      setAviso('Copiamos el link del partido.');
    } catch {
      // El usuario canceló el menú de compartir: no hay nada que avisar.
    }
  }

  return (
    <>
      <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn-volt mt-3 w-full">
        <Icono nombre="whatsapp" />
        Enviar por WhatsApp
      </a>
      <a href={imagen} download={archivo} className="btn-glass mt-2 w-full">
        <Icono nombre="download" />
        Descargar para Instagram
      </a>
      <button type="button" onClick={compartirImagen} className="btn-glass mt-2 w-full">
        <Icono nombre="share" />
        Compartir imagen
      </button>
      {aviso && (
        <p role="status" className="mt-2 text-center text-sm text-mute">
          {aviso}
        </p>
      )}
    </>
  );
}
