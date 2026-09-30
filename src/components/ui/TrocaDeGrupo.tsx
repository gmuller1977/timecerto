import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight, Check, ChevronUp, ClipboardList, Plus, Shuffle, X } from 'lucide-react';
import { ativarGrupo } from '@/store/trocarGrupo';
import { useGrupoAtivo, useGruposGuardados } from '@/store/useGrupoAtivo';
import { hasSavedSession } from '@/lib/sessao';
import type { AppMode } from '@/types';
import { cn } from '@/lib/utils';

const INICIO: Record<AppMode, string> = { amador: '/amador', profissional: '/profissional' };
const NOME_DO_TIPO: Record<AppMode, string> = { amador: 'Pelada', profissional: 'Time profissional' };

/**
 * A troca de grupo à mão em qualquer tela (pedido do Guilherme, 30/09/2026:
 * "precisa ser mais prático e aparecer em todas as telas"). Uma faixa com o
 * nome do grupo, em cima da barra de abas — ao alcance do polegar —, que abre
 * a lista ali mesmo. Um toque troca; nada de ir para outra tela.
 *
 * A lista vem guardada no aparelho (a última resposta da nuvem) e é
 * atualizada ao abrir: trocar funciona sem rede, porque o conteúdo de cada
 * grupo já está no aparelho.
 */
export function FaixaDoGrupo() {
  const ativo = useGrupoAtivo();
  const [aberta, setAberta] = useState(false);
  if (!ativo) return null;
  return (
    <>
      <button
        onClick={() => setAberta(true)}
        className="mx-auto flex h-9 w-full max-w-lg items-center gap-2 border-b border-ink-800/70 px-4 text-left active:bg-ink-900"
        aria-label={`Grupo: ${ativo.name ?? 'sem nome'}. Trocar de grupo`}
      >
        <ArrowLeftRight size={14} className="shrink-0 text-brand-400" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-100">{ativo.name ?? 'Grupo'}</span>
        <span className="shrink-0 text-[11px] text-ink-500">trocar</span>
        <ChevronUp size={14} className="shrink-0 text-ink-500" />
      </button>
      {/* No corpo da página: dentro da barra, o desfoque dela prenderia a folha
          (backdrop-filter vira a referência de quem é "fixed" lá dentro) */}
      {aberta && createPortal(<ListaDeGrupos onClose={() => setAberta(false)} />, document.body)}
    </>
  );
}

function ListaDeGrupos({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const ativo = useGrupoAtivo();
  const grupos = useGruposGuardados();
  const [trocando, setTrocando] = useState<string | null>(null);

  // Atualiza a lista guardada: um grupo novo, ou um de que saiu
  useEffect(() => {
    if (!hasSavedSession()) return;
    import('@/lib/cloud')
      .then(({ meusGrupos }) => meusGrupos())
      .catch(() => {
        /* sem rede: fica a lista guardada */
      });
  }, []);

  async function abrir(id: string) {
    const g = grupos.find((x) => x.id === id);
    if (!g || g.id === ativo?.id) return onClose();
    setTrocando(g.id);
    await ativarGrupo({ id: g.id, mode: g.mode, name: g.name });
    onClose();
    navigate(INICIO[g.mode], { replace: true });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="safe-bottom relative max-h-[80vh] overflow-y-auto rounded-t-3xl border-t border-ink-700 bg-ink-900 px-4 pt-4 pb-6">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink-700" />
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[17px] font-semibold text-ink-50">Seus grupos</p>
          <button onClick={onClose} className="p-1 text-ink-500" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {grupos.map((g) => {
            const Icon = g.mode === 'profissional' ? ClipboardList : Shuffle;
            const atual = g.id === ativo?.id;
            return (
              <button
                key={g.id}
                disabled={trocando !== null}
                onClick={() => abrir(g.id)}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border px-4 py-3 text-left active:scale-[0.99]',
                  atual ? 'border-brand-500/50 bg-brand-500/10' : 'border-ink-800 bg-ink-950',
                )}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300">
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-ink-50">{g.name}</span>
                  <span className="block text-xs text-ink-400">
                    {NOME_DO_TIPO[g.mode]} · {g.papel === 'dono' ? 'dono' : 'administrador'}
                  </span>
                </span>
                {atual ? (
                  <Check size={18} className="shrink-0 text-brand-400" />
                ) : trocando === g.id ? (
                  <span className="shrink-0 text-xs text-ink-400">abrindo…</span>
                ) : null}
              </button>
            );
          })}
          {grupos.length === 0 && (
            <p className="text-sm text-ink-400">Carregando a lista… é preciso internet na primeira vez.</p>
          )}
        </div>
        <button
          onClick={() => {
            onClose();
            navigate('/modo', { state: { criar: true } });
          }}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-ink-700 py-3 text-sm font-medium text-ink-300"
        >
          <Plus size={16} />
          Criar novo grupo
        </button>
      </div>
    </div>
  );
}
