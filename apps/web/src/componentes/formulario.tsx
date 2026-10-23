'use client';
import { useState } from 'react';
import { ErrorCliente } from '@/lib/cliente';

/** Maneja el envío de un formulario: estado de carga, error general y errores por campo. */
export function useEnvio() {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});
  async function enviar<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setEnviando(true);
    setError(null);
    setCampos({});
    try {
      return await fn();
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ErrorCliente && e.campos) setCampos(e.campos);
    } finally {
      setEnviando(false);
    }
  }
  return { enviando, error, campos, enviar };
}

export function Campo({
  etiqueta,
  error,
  ayuda,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { etiqueta: string; error?: string; ayuda?: string }) {
  return (
    <label className="block">
      <span className="field-label">{etiqueta}</span>
      <input className={`input ${error ? '!border-red-500' : ''}`} aria-invalid={!!error} {...props} />
      {error ? (
        <span className="mt-1 block text-xs font-medium text-red-600">{error}</span>
      ) : ayuda ? (
        <span className="mt-1 block text-xs text-mute">{ayuda}</span>
      ) : null}
    </label>
  );
}

export function Selector({
  etiqueta,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { etiqueta: string }) {
  return (
    <label className="block">
      <span className="field-label">{etiqueta}</span>
      <select className="input" {...props}>
        {children}
      </select>
    </label>
  );
}

export function MensajeError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
      {error}
    </p>
  );
}
