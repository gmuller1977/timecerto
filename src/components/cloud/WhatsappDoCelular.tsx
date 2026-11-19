import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { lembrarWhatsapp, whatsappPreferido, type QualWhatsApp } from '@/lib/whatsapp';
import { cn } from '@/lib/utils';

const OPCOES: { id: QualWhatsApp; titulo: string }[] = [
  { id: 'comum', titulo: 'WhatsApp' },
  { id: 'business', titulo: 'WhatsApp Business' },
];

/**
 * Qual WhatsApp o app abre neste celular (pedido do Guilherme em 19/11/2026).
 * Só no Android, onde dá para escolher o app; fica no aparelho, não na conta.
 */
export function WhatsappDoCelular() {
  const [qual, setQual] = useState(whatsappPreferido);
  return (
    <section className="mt-3 rounded-2xl border border-ink-800 bg-ink-900 p-4">
      <p className="flex items-center gap-2 text-[15px] font-semibold text-ink-50">
        <MessageCircle size={17} className="text-brand-400" />
        WhatsApp deste celular
      </p>
      <p className="mt-1 text-xs leading-relaxed text-ink-400">
        Para quem tem os dois instalados: o app abre este nas cobranças, convites e listas. Quem tem um só não precisa
        mexer.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {OPCOES.map((o) => (
          <button
            key={o.id}
            onClick={() => {
              lembrarWhatsapp(o.id);
              setQual(o.id);
            }}
            className={cn(
              'h-12 rounded-xl border text-sm font-semibold active:scale-[0.99]',
              qual === o.id
                ? 'border-brand-500 bg-brand-500/15 text-brand-100'
                : 'border-ink-700 bg-ink-800 text-ink-300',
            )}
          >
            {o.titulo}
          </button>
        ))}
      </div>
    </section>
  );
}
