import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { useAuth } from '@/store/useAuth';
import { usePlano } from '@/store/usePlano';
import { findActiveGroup, salvarCoresPosicoes, type CloudGroup } from '@/lib/cloud';
import {
  CORES_PADRAO,
  PALETA_DE_POSICOES,
  POSICOES_COM_COR,
  type PosicaoComCor,
} from '@/lib/posicoes';
import { cn } from '@/lib/utils';
import { explain } from '@/components/cloud/partes';

/**
 * Ajustes › Cores das posições (pedido do Guilherme em 08/10/2026). Uma
 * configuração do TIME: todos os administradores veem as mesmas cores na
 * quadra, na escalação e nas listas (migração 039).
 */
export function CoresDasPosicoes() {
  const ready = useAuth((s) => s.ready);
  const session = useAuth((s) => s.session);
  const [group, setGroup] = useState<CloudGroup | null>(null);
  const [cores, setCores] = useState<Record<PosicaoComCor, string>>(CORES_PADRAO);
  const [abrindo, setAbrindo] = useState<PosicaoComCor | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !session) return;
    let vivo = true;
    findActiveGroup()
      .then((g) => {
        if (!vivo || !g) return;
        setGroup(g);
        setCores({ ...CORES_PADRAO, ...(g.coresPosicoes ?? {}) });
      })
      .catch(() => {
        /* sem rede: a seção não aparece */
      });
    return () => {
      vivo = false;
    };
  }, [ready, session]);

  if (!group) return null;

  // Grava e põe no estado do app: a quadra troca de cor na hora
  async function gravar(novas: Record<PosicaoComCor, string> | null) {
    if (!group) return;
    setErro(null);
    const antes = cores;
    const efetivas = novas ?? CORES_PADRAO;
    setCores(efetivas);
    try {
      await salvarCoresPosicoes(group.id, novas);
      const plano = usePlano.getState();
      if (plano.grupo?.id === group.id) usePlano.setState({ grupo: { ...plano.grupo, coresPosicoes: novas } });
    } catch (e) {
      setCores(antes);
      setErro(explain(e));
    }
  }

  const ehPadrao = POSICOES_COM_COR.every((p) => cores[p.id] === CORES_PADRAO[p.id]);

  return (
    <section className="mt-3 rounded-2xl border border-ink-800 bg-ink-900 p-4">
      <p className="text-xs leading-relaxed text-ink-400">
        Aparecem na quadra, na escalação e nas listas. Valem para o time todo: os outros administradores veem as
        mesmas.
      </p>
      <ul className="mt-2 flex flex-col">
        {POSICOES_COM_COR.map((p) => (
          <li key={p.id} className="border-t border-ink-800 py-2.5">
            <button
              onClick={() => setAbrindo(abrindo === p.id ? null : p.id)}
              aria-expanded={abrindo === p.id}
              className="flex w-full items-center gap-3 text-left"
            >
              <span aria-hidden className="size-5 shrink-0 rounded-full" style={{ background: cores[p.id] }} />
              <span className="min-w-0 flex-1 text-[15px] text-ink-100">
                {p.nome} <span className="text-xs text-ink-500">{p.sigla}</span>
              </span>
              <span className="text-xs font-medium text-brand-300">{abrindo === p.id ? 'fechar' : 'trocar'}</span>
            </button>
            {abrindo === p.id && (
              <div className="mt-2.5 flex flex-wrap gap-2" role="radiogroup" aria-label={`Cor do ${p.nome.toLowerCase()}`}>
                {PALETA_DE_POSICOES.map((c) => (
                  <button
                    key={c}
                    role="radio"
                    aria-checked={cores[p.id] === c}
                    aria-label={c}
                    onClick={() => {
                      void gravar({ ...cores, [p.id]: c });
                      setAbrindo(null);
                    }}
                    className={cn(
                      'flex size-9 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-ink-900',
                      cores[p.id] === c ? 'ring-brand-400' : 'ring-transparent',
                    )}
                    style={{ background: c }}
                  >
                    {cores[p.id] === c && <Check size={16} strokeWidth={3} className="text-ink-950" />}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      {!ehPadrao && (
        <button
          onClick={() => void gravar(null)}
          className="mt-2 w-full rounded-xl border border-ink-800 py-2.5 text-sm text-ink-300"
        >
          Voltar às cores padrão
        </button>
      )}
      {erro && <p className="mt-2 text-sm text-red-300">{erro}</p>}
    </section>
  );
}
