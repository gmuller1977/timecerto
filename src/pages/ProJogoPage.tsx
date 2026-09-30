import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ClipboardList, History, Radio, Trophy, Handshake, X } from 'lucide-react';
import { NOME_DA_COMPETICAO, type TipoDeJogo } from '@/types';
import { Button } from '@/components/ui/Button';
import { useMatchStore } from '@/store/useMatchStore';
import { useProStore } from '@/store/useProStore';
import { setsWonBy } from '@/lib/volleyStats';
import { formatDate } from '@/lib/stats';

/**
 * Aba Jogo do profissional (fase 1 das abas do profissional, 30/09/2026).
 * Por enquanto é o que o time já fazia, reunido na aba: escalar e começar a
 * partida, voltar à que está em andamento, e as últimas. A agenda com
 * confirmação — a aba Jogo da pelada — chega na fase 2, quando o elenco
 * profissional e o cadastro da pelada virarem um só.
 */
export function ProJogoPage() {
  const navigate = useNavigate();
  const live = useMatchStore((s) => s.live);
  const todas = useMatchStore((s) => s.matches);
  // Filtrar FORA do seletor: dentro, cada leitura seria um array novo, e a tela entraria em laço
  const partidas = useMemo(() => todas.filter((m) => m.mode === 'profissional'), [todas]);
  const atletas = useProStore((s) => s.players.length);
  const ultimas = [...partidas].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  // "Novo jogo" pergunta primeiro o tipo (pedido do Guilherme, 30/09/2026)
  const [escolhendo, setEscolhendo] = useState(false);
  const comecar = (competicao: TipoDeJogo) => navigate('/profissional/escalacao', { state: { competicao } });

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-10">
      <header className="safe-top flex items-center justify-between gap-3 pt-6 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">Jogo</h1>
        <button
          onClick={() => navigate('/historico')}
          className="flex items-center gap-1.5 rounded-lg border border-ink-800 bg-ink-900 px-3 py-2 text-xs font-medium text-ink-300"
          aria-label="Partidas"
        >
          <History size={14} />
          Partidas
          {partidas.length > 0 && <span className="text-ink-500">{partidas.length}</span>}
        </button>
      </header>

      {live && (
        <button
          onClick={() => navigate('/placar')}
          className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-brand-500/40 bg-brand-500/10 px-4 py-3 text-left"
        >
          <Radio size={18} className="shrink-0 animate-pulse text-brand-400" />
          <span className="min-w-0 flex-1 text-[15px] font-semibold text-brand-200">Partida em andamento</span>
          <ChevronRight size={18} className="shrink-0 text-brand-400" />
        </button>
      )}

      {escolhendo ? (
        <div className="rounded-2xl border border-ink-800 bg-ink-900 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[15px] font-semibold text-ink-50">Que jogo é?</p>
            <button onClick={() => setEscolhendo(false)} className="p-1 text-ink-500" aria-label="Fechar">
              <X size={18} />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => comecar('amistoso')}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-ink-800 bg-ink-950 px-3 py-4 active:scale-[0.98]"
            >
              <Handshake size={22} className="text-brand-400" />
              <span className="text-sm font-semibold text-ink-50">Amistoso</span>
            </button>
            <button
              onClick={() => comecar('campeonato')}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-ink-800 bg-ink-950 px-3 py-4 active:scale-[0.98]"
            >
              <Trophy size={22} className="text-amber-300" />
              <span className="text-sm font-semibold text-ink-50">Campeonato</span>
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-ink-500">Depois vem a escalação.</p>
        </div>
      ) : (
        <Button size="lg" className="w-full" disabled={atletas < 6} onClick={() => setEscolhendo(true)}>
          <ClipboardList size={19} />
          {atletas < 6 ? `Faltam ${6 - atletas} atletas para escalar` : 'Novo jogo'}
        </Button>
      )}
      {atletas < 6 && (
        <p className="mt-2 text-center text-xs text-ink-500">Cadastre o elenco na aba Atletas.</p>
      )}

      <section className="mt-6">
        <p className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">Últimas partidas</p>
        {ultimas.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-ink-800 px-4 py-4 text-center text-sm text-ink-400">
            Nenhuma partida ainda.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {ultimas.map((m) => {
              const [a, b] = m.teams;
              return (
                <button
                  key={m.id}
                  onClick={() => navigate(`/partida/${m.id}`)}
                  className="flex items-center gap-3 rounded-2xl border border-ink-800 bg-ink-900 px-4 py-3 text-left"
                >
                  <span className="min-w-0 flex-1 truncate text-[15px] text-ink-50">
                    {a.name} <strong className="tabular-nums">{setsWonBy(m, a.id)} × {setsWonBy(m, b.id)}</strong> {b.name}
                  </span>
                  <span className="shrink-0 text-right text-xs text-ink-500">
                    {m.competicao && (
                      <span className={m.competicao === 'campeonato' ? 'block text-amber-300' : 'block text-brand-300'}>
                        {NOME_DA_COMPETICAO[m.competicao]}
                      </span>
                    )}
                    {formatDate(m.date)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
