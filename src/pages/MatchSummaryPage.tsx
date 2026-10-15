import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Flag, PlayCircle, Share2, Shuffle, Trophy } from 'lucide-react';
import { useMatchStore } from '@/store/useMatchStore';
import { useJogoStore } from '@/store/useJogoStore';
import { useAppStore } from '@/store/useAppStore';
import { planoDeAjuste } from '@/lib/diaDeJogo';
import { Button } from '@/components/ui/Button';
import { useHydrated } from '@/store/useHydrated';
import { useRoster } from '@/store/useRoster';
import { TEAM_COLOR_CLASSES } from '@/lib/draw';
import { matchWinner, setsWonBy } from '@/lib/volleyStats';
import { ScoutDaPartida } from '@/components/scout/ScoutDaPartida';
import { formatDate } from '@/lib/stats';
import { cn } from '@/lib/utils';

export function MatchSummaryPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const matches = useMatchStore((s) => s.matches);
  const hydrated = useHydrated();
  const players = useRoster();
  const jogos = useJogoStore((s) => s.jogos);
  const elenco = useAppStore((s) => s.players);
  const live = useMatchStore((s) => s.live);
  const startMatch = useMatchStore((s) => s.startMatch);

  const match = matches.find((m) => m.id === id) ?? matches[0];
  if (!hydrated) return null;
  if (!match) return <Navigate to="/" replace />;

  /*
   * Fim de um jogo do dia, no amador (pedido do Guilherme em 05/10/2026): o
   * resumo pergunta "Novo jogo?". Só no ÚLTIMO jogo de um dia aberto, sem
   * outro em andamento — abrir um resumo antigo não pode puxar jogo novo.
   */
  const dia = match.jogoId ? jogos.find((j) => j.id === match.jogoId) : undefined;
  const ultimoDoDia = dia
    ? matches.filter((m) => m.jogoId === dia.id).reduce((a, b) => (b.date > a.date ? b : a), match)
    : null;
  const perguntaNovoJogo = Boolean(
    dia &&
      dia.status === 'aberto' &&
      match.mode !== 'profissional' &&
      !live &&
      ultimoDoDia?.id === match.id &&
      (dia.sorteio?.teams.length ?? 0) >= 2,
  );
  const ajuste = perguntaNovoJogo && dia ? planoDeAjuste(dia, elenco.filter((p) => !p.pending)) : null;
  const voltar = dia ? `/jogo/${dia.id}?aba=partidas` : '/';

  function mesmosTimes() {
    const s = dia?.sorteio;
    if (!dia || !s || s.teams.length < 2) return;
    const [a, b] = s.teams;
    startMatch({
      sport: s.sport,
      jogoId: dia.id,
      teams: [
        { id: a.id, name: a.name, color: a.color, playerIds: a.players.map((p) => p.id) },
        { id: b.id, name: b.name, color: b.color, playerIds: b.players.map((p) => p.id) },
      ],
    });
    navigate('/placar');
  }

  const [teamA, teamB] = match.teams;
  const winner = matchWinner(match);

  // O scout vai em PDF, não em texto: um relatório do jogo ao atleta (08/10/2026)
  async function shareSummary() {
    const { compartilharScoutEmPdf } = await import('@/lib/scoutPdf');
    await compartilharScoutEmPdf(match!, (pid) => players.find((p) => p.id === pid));
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-10">
      <header className="safe-top flex items-center gap-3 pt-6 pb-4">
        <button onClick={() => navigate(voltar)} className="p-1 text-ink-400">
          <ArrowLeft size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">{match.mode === 'profissional' ? 'Resumo da partida' : 'Resumo do jogo'}</h1>
          <p className="text-xs text-ink-400">{formatDate(match.date)}</p>
        </div>
        <button onClick={shareSummary} aria-label="Compartilhar o scout em PDF" className="p-1.5 text-ink-400">
          <Share2 size={19} />
        </button>
      </header>

      {/* Placar */}
      <section className="rounded-2xl border border-ink-800 bg-ink-900 p-4">
        <div className="flex items-start justify-between">
          {[teamA, teamB].map((t) => {
            const c = TEAM_COLOR_CLASSES[t.color];
            const sets = setsWonBy(match, t.id);
            return (
              <div key={t.id} className="flex-1 text-center">
                <span className={cn('mx-auto mb-1 block size-2.5 rounded-full', c.bg)} />
                <p className="line-clamp-2 min-h-10 px-1 text-sm font-semibold text-ink-200">
                  {t.name}
                </p>
                <p className="mt-1 text-5xl font-bold tabular-nums text-ink-50">
                  {sets}
                </p>
                {winner === t.id && (
                  <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-300">
                    <Trophy size={11} />
                    Venceu
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-2 border-t border-ink-800 pt-3">
          {match.games.map((g, i) => (
            <span
              key={g.id}
              className="rounded-lg bg-ink-800 px-2.5 py-1 text-xs tabular-nums text-ink-300"
            >
              {i + 1}º {g.scoreA}–{g.scoreB}
            </span>
          ))}
        </div>
      </section>

      {perguntaNovoJogo && dia && (
        <section className="mt-4 rounded-2xl border border-brand-500/40 bg-brand-500/10 p-4">
          <p className="text-[15px] font-semibold text-ink-50">Novo jogo?</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button className="col-span-2" onClick={mesmosTimes}>
              <PlayCircle size={18} />
              Mesmos times
            </Button>
            {ajuste && (
              <Button variant="secondary" className="col-span-2" onClick={() => navigate(`/jogo/${dia.id}`)}>
                <Shuffle size={17} />
                Ajustar times
              </Button>
            )}
            <Button variant="secondary" onClick={() => navigate(`/jogo/${dia.id}?encerrar=1`)}>
              <Flag size={16} />
              Encerrar o dia
            </Button>
            <Button variant="secondary" onClick={() => navigate(`/jogo/${dia.id}?aba=partidas`)}>
              Agora não
            </Button>
          </div>
          {ajuste && (
            <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
              A lista mudou depois do sorteio: em "Ajustar times" você vê quem entra e quem sai.
            </p>
          )}
        </section>
      )}

      <ScoutDaPartida match={match} players={players} />

      <button
        onClick={() => navigate('/historico')}
        className="mt-6 self-center text-sm font-medium text-brand-400"
      >
        Ver todas as partidas
      </button>
    </div>
  );
}
