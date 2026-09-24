import { useState } from 'react';
import { Check, Copy, MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

/**
 * Peças das telas que falam com o banco em nome do organizador. Vieram da
 * antiga tela Convites e são carregadas junto com o Supabase, sob demanda.
 */

/**
 * Mensagem legível para o organizador. O código técnico vai junto, entre
 * parênteses: é o que permite diagnosticar pelo print, sem abrir o console.
 */
export function explain(e: unknown): string {
  console.error('convites', e);
  if (!navigator.onLine) {
    return 'Sem internet. Os convites precisam de conexão — o resto do app funciona normal.';
  }
  const err = e as { code?: string; message?: string };
  const detail = err?.code || err?.message;
  return `Algo deu errado ao falar com o servidor. Tente de novo.${detail ? ` (${detail})` : ''}`;
}

/** Enviar no WhatsApp + copiar o link */
export function ShareRow({ label, link, onShare }: { label: string; link: string; onShare: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copie o link:', link);
    }
  }
  return (
    <div className="mt-3 flex gap-2">
      <Button className="flex-1" onClick={onShare}>
        <MessageCircle size={18} />
        {label}
      </Button>
      <Button variant="secondary" onClick={copy} aria-label="Copiar link">
        {copied ? <Check size={18} /> : <Copy size={18} />}
      </Button>
    </div>
  );
}

export function NameList({
  label,
  tone,
  names,
}: {
  label: string;
  tone: 'ok' | 'no' | 'none';
  names: string[];
}) {
  if (names.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {names.map((n) => (
          <span
            key={n}
            className={cn(
              'flex items-center gap-1 rounded-lg px-2 py-1 text-xs',
              tone === 'ok' && 'bg-brand-500/15 text-brand-200',
              tone === 'no' && 'bg-ink-800 text-ink-400 line-through',
              tone === 'none' && 'border border-ink-800 text-ink-400',
            )}
          >
            {tone === 'ok' && <Check size={12} />}
            {tone === 'no' && <X size={12} />}
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}
