import { useMemo } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useRoster } from '@/store/useRoster';
import { useMatchStore } from '@/store/useMatchStore';
import { useHydrated } from '@/store/useHydrated';
import { StarRating } from '@/components/ui/StarRating';
import { RankedBars } from '@/components/charts/Bars';
import { ACTION_LABEL } from '@/lib/volley';
import { SERIES, playerScouts } from '@/lib/volleyStats';
import { computeStats, formatDate, positionLabel, streakLabel } from '@/lib/stats';
import { cn } from '@/lib/utils';

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className="rounded-2xl border border-ink-800 bg-ink-900 px-3 py-3">
      <p className="text-[11px] tracking-wide text-ink-500 uppercase">{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-bold',
          tone === 'good'
            ? 'text-brand-300'
            : tone === 'bad'
              ? 'text-red-400'
              : 'text-ink-50',
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-ink-500">{hint}</p>}
    </div>
  );
}

export function PlayerProfilePage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const sport = useAppStore((s) => s.sport);
  const players = useRoster();
  const matches = useMatchStore((s) => s.matches);

  const hydrated = useHydrated();
  const player = players.find((p) => p.id === id);
  const scouts = useMemo(() => playerScouts(matches), [matches]);

  if (!hydrated) return null;
  if (!player) return <Navigate to="/" replace />;

  const stats = computeStats(player, matches, sport);
  const scout = scouts.get(player.id);
  const streak = streakLabel(stats.streak);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-10">
      <header className="safe-top flex items-center gap-3 pt-6 pb-4">
        <button onClick={() => navigate(-1)} className="p-1 text-ink-400">
          <ArrowLeft size={22} />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{player.name}</h1>
          <p className="text-xs text-ink-400">
            {positionLabel(sport, player.positions[sport])} ·{' '}
            {stats.appearances} {stats.appearances === 1 ? 'partida' : 'partidas'}
          </p>
        </div>
      </header>

      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-ink-800 bg-ink-900 px-4 py-3">
        <span className="text-xs text-ink-400">Nível</span>
        <StarRating value={stats.currentSkill} readOnly size={17} />
        {streak && (
          <span className="ml-auto text-[11px] font-medium text-amber-300">
            {streak}
          </span>
        )}
      </div>

      {stats.appearances === 0 ? (
        <p className="mt-8 text-center text-sm leading-relaxed text-ink-400">
          Ainda sem partidas registradas.
          <br />
          Faça o scout de um jogo para as estatísticas aparecerem.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Tile
              label="Aproveitamento"
              value={`${Math.round(stats.winRate * 100)}%`}
              hint={`${stats.wins}V ${stats.draws}E ${stats.losses}D em ${stats.games} sets`}
            />
            <Tile
              label="Presença"
              value={`${Math.round(stats.attendanceRate * 100)}%`}
              hint={`${stats.appearances} de ${matches.filter((m) => m.sport === sport).length}`}
            />
            {scout && (
              <>
                <Tile
                  label="Pontos"
                  value={String(scout.points)}
                  hint={`${scout.errors} ${scout.errors === 1 ? 'erro' : 'erros'}`}
                />
                <Tile
                  label="Saldo"
                  value={`${scout.balance >= 0 ? '+' : '−'}${Math.abs(scout.balance)}`}
                  tone={scout.balance >= 0 ? 'good' : 'bad'}
                  hint="pontos menos erros"
                />
              </>
            )}
          </div>

          {scout && scout.points > 0 && (
            <section className="mt-5">
              <h2 className="mb-2 text-sm font-semibold text-ink-200">
                Como ele pontua
              </h2>
              <div className="rounded-2xl border border-ink-800 bg-ink-900 p-4">
                <RankedBars
                  slices={Object.entries(scout.pointsByAction).map(([a, v]) => ({
                    key: a,
                    label: ACTION_LABEL[a as keyof typeof ACTION_LABEL],
                    value: v ?? 0,
                    color: SERIES[a as keyof typeof SERIES] ?? '#65758f',
                  }))}
                />
              </div>
            </section>
          )}

          {scout && scout.errors > 0 && (
            <section className="mt-4">
              <h2 className="mb-2 text-sm font-semibold text-ink-200">
                Onde ele erra
              </h2>
              <div className="rounded-2xl border border-ink-800 bg-ink-900 p-4">
                <RankedBars
                  slices={Object.entries(scout.errorsByAction).map(([a, v]) => ({
                    key: a,
                    label: ACTION_LABEL[a as keyof typeof ACTION_LABEL],
                    value: v ?? 0,
                    color: SERIES[a as keyof typeof SERIES] ?? '#65758f',
                  }))}
                />
              </div>
            </section>
          )}

          {stats.lastPlayed && (
            <p className="mt-5 text-center text-xs text-ink-500">
              Última partida em {formatDate(stats.lastPlayed)}
            </p>
          )}
        </>
      )}
    </div>
  );
}
