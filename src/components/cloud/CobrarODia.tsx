import { useCallback, useEffect, useMemo, useState } from 'react';
import { Wallet, X } from 'lucide-react';
import { findActiveGroup, lerFinanceiro, type CloudGroup, type DadosFinanceiros } from '@/lib/cloud';
import { saldosPorJogador, type SaldoDoJogador } from '@/lib/financeiro';
import { formatBRL } from '@/lib/utils';
import { explain } from '@/components/cloud/partes';
import { CobrarVarios } from '@/pages/FinanceiroPage';
import type { Jogo } from '@/types';

/**
 * Cobrar as diárias de UM dia de jogo, no fim dele (pedido do Guilherme em
 * 05/10/2026). É o mesmo "Cobrar no grupo / um por um" do Financeiro, com a
 * lista restrita às diárias deste dia — nada de mensagem nem Pix próprios.
 *
 * Serve à diária lançada no fim do dia e à antecipada: nas duas, quem deste
 * dia ainda deve é quem tem a diária dele em aberto.
 */
export function CobrarODia({ jogo, onFechar }: { jogo: Jogo; onFechar: () => void }) {
  const [grupo, setGrupo] = useState<CloudGroup | null>(null);
  const [dados, setDados] = useState<DadosFinanceiros | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const g = await findActiveGroup();
      if (!g) {
        setErro('Grupo não encontrado. Confira a conta em Ajustes.');
        return;
      }
      setGrupo(g);
      setDados(await lerFinanceiro(g.id));
    } catch (e) {
      setErro(explain(e));
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // A diária leva o id do jogo na nuvem como referência (migração 017)
  const devedores = useMemo<SaldoDoJogador[]>(() => {
    if (!dados || !jogo.remoteId) return [];
    const saldos = saldosPorJogador(dados.cobrancas, dados.pagamentos);
    return [...saldos.values()]
      .map((s) => {
        const abertas = s.abertas.filter(
          (a) => a.cobranca.tipo === 'diaria' && a.cobranca.referencia === jogo.remoteId,
        );
        return { ...s, abertas, saldoCents: abertas.reduce((t, a) => t + a.faltaCents, 0) };
      })
      .filter((s) => s.saldoCents > 0)
      .sort((a, b) => b.saldoCents - a.saldoCents);
  }, [dados, jogo.remoteId]);

  const nome = (id: string) => dados?.jogadores.get(id)?.nome ?? 'Jogador';

  return (
    <section className="mt-3 rounded-2xl border border-brand-500/40 bg-ink-900 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[15px] font-semibold text-ink-50">
          <Wallet size={17} className="text-brand-400" />
          Cobrar as diárias do dia
        </p>
        <button onClick={onFechar} className="p-1 text-ink-500" aria-label="Fechar">
          <X size={16} />
        </button>
      </div>
      {erro ? (
        <p className="mt-2 text-sm text-red-300">{erro}</p>
      ) : !dados || !grupo ? (
        <p className="mt-2 text-sm text-ink-500">Carregando…</p>
      ) : devedores.length === 0 ? (
        <p className="mt-2 text-sm text-ink-400">Ninguém deste dia está devendo a diária.</p>
      ) : (
        <>
          <ul className="mt-2 mb-3 flex flex-col gap-1 text-sm">
            {devedores.map((d) => (
              <li key={d.playerId} className="flex items-center justify-between gap-2">
                <span className="truncate text-ink-200">{nome(d.playerId)}</span>
                <span className="shrink-0 tabular-nums text-ink-300">{formatBRL(d.saldoCents)}</span>
              </li>
            ))}
          </ul>
          <CobrarVarios
            devedores={devedores}
            grupo={grupo}
            dados={dados}
            nome={nome}
            recarregar={() => void carregar()}
            soPendencias
          />
        </>
      )}
    </section>
  );
}
