'use client';
// Verificación del email (E04-02): el link de un solo uso llega por email y se confirma al abrirlo.
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/cliente';

export default function Verificar() {
  const { token } = useParams<{ token: string }>();
  const [estado, setEstado] = useState<{ ok: boolean; texto: string } | null>(null);
  const hecho = useRef(false);

  useEffect(() => {
    // Una sola vez aunque React monte dos veces en desarrollo: el link es de un solo uso.
    if (hecho.current) return;
    hecho.current = true;
    api<{ email: string }>('POST', '/auth/verificar-email', { token })
      .then((r) => setEstado({ ok: true, texto: `Listo: ${r.email} quedó verificado.` }))
      .catch((e: Error) => setEstado({ ok: false, texto: e.message }));
  }, [token]);

  return (
    <div className="space-y-4" data-testid="verificar">
      <h1 className="text-3xl font-bold tracking-tighter">
        {!estado ? 'Verificando…' : estado.ok ? 'Email verificado' : 'No pudimos verificarlo'}
      </h1>
      {estado && <p className="text-sm text-mute">{estado.texto}</p>}
      {estado && (
        <Link href="/panel/cuenta" className="btn-volt btn-lg w-full">
          Ir a mi cuenta
        </Link>
      )}
    </div>
  );
}
