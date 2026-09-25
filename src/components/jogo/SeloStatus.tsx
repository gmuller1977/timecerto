import { ROTULO_STATUS, type StatusDoJogo } from '@/lib/jogo';
import { cn } from '@/lib/utils';

/** Cor do selo de status: o que pede ação se destaca, o que acabou apaga */
const COR_STATUS: Record<StatusDoJogo, string> = {
  recebendo: 'bg-brand-500/15 text-brand-300',
  lista_fechada: 'border border-brand-500/40 text-brand-300',
  em_jogo: 'bg-brand-500 text-ink-950',
  agendado: 'border border-ink-600 text-ink-300',
  sem_encerrar: 'border border-amber-500/40 text-amber-300',
  encerrado: 'border border-ink-700 text-ink-400',
  cancelado: 'border border-ink-800 text-ink-500 line-through',
};

/** O status do jogo (`statusDoJogo`), igual no cartão da lista e na página */
export function SeloStatus({ status }: { status: StatusDoJogo }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
        COR_STATUS[status],
      )}
    >
      {ROTULO_STATUS[status]}
    </span>
  );
}
