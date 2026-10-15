import { ACTION_LABEL } from '@/lib/volley';
import {
  SERIES,
  STATUS,
  hasDetail,
  hasPlayerDetail,
  playerScouts,
  readGiftedShare,
  teamScout,
} from '@/lib/volleyStats';
import { DivergingBars, RankedBars, StackedBar, type Slice } from '@/components/charts/Bars';
import type { Match, Player } from '@/types';

/**
 * De onde vieram os pontos, erros e saldo por jogador. No resumo da partida
 * encerrada e, desde o scout pelo link (041), na partida ao vivo que os
 * administradores acompanham.
 */
export function ScoutDaPartida({ match, players }: { match: Match; players: Player[] }) {
  const [teamA, teamB] = match.teams;
  const scoutA = teamScout(match, teamA.id);
  const scoutB = teamScout(match, teamB.id);
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

  return (
    <>
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
    </>
  );
}
