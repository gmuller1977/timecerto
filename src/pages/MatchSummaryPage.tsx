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
import { ACTION_LABEL } from '@/lib/volley';
import {
  SERIES,
  STATUS,
  hasDetail,
  hasPlayerDetail,
  matchWinner,
  playerScouts,
  readGiftedShare,
  setsWonBy,
  teamScout,
} from '@/lib/volleyStats';
import { DivergingBars, RankedBars, StackedBar, type Slice } from '@/components/charts/Bars';
import { shareOnWhatsApp } from '@/lib/share';
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
  const scoutA = teamScout(match, teamA.id);
  const scoutB = teamScout(match, teamB.id);
  const winner = matchWinner(match);
  const detailed = hasDetail(match);
  const byPlayer = playerScouts([match]);

  const nameOf = (pid: string) =>
    players.find((p) => p.id === pid)?.name ?? 'Jogador';

  const balanceRows = hasPlayerDetail(match)
    ? [...byPlayer.values()]
        .sort((a, b) => b.balance - a.balance)
        .map((s) => ({
          key: s.playerId,
          label: nameOf(s.playerId).split(' ')[0],
          value: s.balance,
        }))
    : [];

  function shareSummary() {
    const lines = [
      `🏐 *${teamA.name} ${setsWonBy(match!, teamA.id)} x ${setsWonBy(match!, teamB.id)} ${teamB.name}*`,
      '',
      ...match!.games.map(
        (g, i) => `${i + 1}º set: ${g.scoreA} x ${g.scoreB}`,
      ),
    ];
    if (detailed) {
      lines.push(
        '',
        `*${teamA.name}* — ${scoutA.earned} pontos conquistados, ${scoutA.errors} erros`,
        `*${teamB.name}* — ${scoutB.earned} pontos conquistados, ${scoutB.errors} erros`,
      );
    }
    lines.push('', '_Scout feito no TimeCerto_ ⚡');
    shareOnWhatsApp(lines.join('\n'));
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
        <button onClick={shareSummary} className="p-1.5 text-ink-400">
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

      {!detailed && (
        <p className="mt-4 rounded-2xl border border-ink-800 bg-ink-900 px-4 py-3 text-sm leading-relaxed text-ink-400">
          Esta partida foi registrada só no placar. Para ver de onde vieram os
          pontos, use o scout do time ou do atleta na próxima.
        </p>
      )}

      {detailed && (
        <>
          {/* De onde vieram os pontos */}
          <section className="mt-4">
            <h2 className="mb-1 text-sm font-semibold text-ink-200">
              De onde vieram os pontos
            </h2>
            <p className="mb-3 text-xs leading-relaxed text-ink-500">
              {readGiftedShare(
                (scoutA.gifted + scoutB.gifted) /
                  Math.max(1, scoutA.points + scoutB.points),
              )}
            </p>

            <div className="flex flex-col gap-4">
              {[
                { team: teamA, scout: scoutA },
                { team: teamB, scout: scoutB },
              ].map(({ team, scout }) => {
                const slices: Slice[] = [
                  {
                    key: 'ataque',
                    label: 'Ataque',
                    value: scout.earnedByAction.ataque ?? 0,
                    color: SERIES.ataque,
                  },
                  {
                    key: 'bloqueio',
                    label: 'Bloqueio',
                    value: scout.earnedByAction.bloqueio ?? 0,
                    color: SERIES.bloqueio,
                  },
                  {
                    key: 'saque',
                    label: 'Ace',
                    value: scout.earnedByAction.saque ?? 0,
                    color: SERIES.saque,
                  },
                  {
                    key: 'gifted',
                    label: 'Erro do adversário',
                    value: scout.gifted,
                    color: '#505d75',
                  },
                ];
                return (
                  <div
                    key={team.id}
                    className="rounded-2xl border border-ink-800 bg-ink-900 p-4"
                  >
                    <div className="mb-3 flex items-baseline justify-between">
                      <p className="text-[15px] font-semibold text-ink-50">
                        {team.name}
                      </p>
                      <p className="text-xs text-ink-500">
                        {scout.points} pontos ·{' '}
                        {Math.round(scout.efficiency * 100)}% de eficiência
                      </p>
                    </div>
                    <StackedBar slices={slices} />
                  </div>
                );
              })}
            </div>
          </section>

          {/* Erros cometidos */}
          <section className="mt-5">
            <h2 className="mb-1 text-sm font-semibold text-ink-200">
              Erros cometidos
            </h2>
            <p className="mb-3 text-xs leading-relaxed text-ink-500">
              É a parte do jogo que se treina com mais retorno — cada erro aqui
              é um ponto entregue sem o adversário precisar jogar.
            </p>
            <div className="flex flex-col gap-3">
              {[
                { team: teamA, scout: scoutA },
                { team: teamB, scout: scoutB },
              ].map(({ team, scout }) => (
                <div
                  key={team.id}
                  className="rounded-2xl border border-ink-800 bg-ink-900 p-4"
                >
                  <div className="mb-3 flex items-baseline justify-between">
                    <p className="text-[15px] font-semibold text-ink-50">
                      {team.name}
                    </p>
                    <p className="text-xs text-ink-500">
                      {scout.errors} {scout.errors === 1 ? 'erro' : 'erros'}
                    </p>
                  </div>
                  <RankedBars
                    slices={Object.entries(scout.errorsByAction).map(
                      ([action, value]) => ({
                        key: action,
                        label: ACTION_LABEL[action as keyof typeof ACTION_LABEL],
                        value: value ?? 0,
                        color:
                          SERIES[action as keyof typeof SERIES] ?? '#65758f',
                      }),
                    )}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Saldo por jogador */}
          {balanceRows.length > 0 && (
            <section className="mt-5">
              <h2 className="mb-1 text-sm font-semibold text-ink-200">
                Saldo por jogador
              </h2>
              <p className="mb-3 text-xs leading-relaxed text-ink-500">
                Pontos feitos menos erros cometidos. É a conta mais honesta do
                vôlei: quem ataca muito e erra muito pode terminar negativo.
              </p>
              <div className="rounded-2xl border border-ink-800 bg-ink-900 p-4">
                <DivergingBars
                  rows={balanceRows}
                  goodColor={STATUS.good}
                  badColor={STATUS.critical}
                />
              </div>
            </section>
          )}
        </>
      )}

      <button
        onClick={() => navigate('/historico')}
        className="mt-6 self-center text-sm font-medium text-brand-400"
      >
        Ver todas as partidas
      </button>
    </div>
  );
}
