import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Check, ChevronRight, Flag, Minus, Plus, Settings2, Undo2, X } from 'lucide-react';
import { useMatchStore } from '@/store/useMatchStore';
import { useAppStore } from '@/store/useAppStore';
import { useHydrated } from '@/store/useHydrated';
import { PointSheet, type PointDraft } from '@/components/scout/PointSheet';
import { CourtPanel } from '@/components/scout/CourtPanel';
import { TEAM_COLOR_CLASSES } from '@/lib/draw';
import { ACTION_LABEL, POINTS_OPTIONS, currentRun } from '@/lib/volley';
import { courtPlayerIds, courtStateAt } from '@/lib/court';
import { ROTATIONS } from '@/lib/rotation';
import type { MatchTeam, ScoutMode } from '@/types';
import { cn } from '@/lib/utils';

const MODE_LABEL: Record<ScoutMode, { title: string; hint: string }> = {
  placar: { title: 'Só placar', hint: '1 toque por ponto' },
  time: { title: 'Scout do time', hint: '2 toques — como o ponto saiu' },
  atleta: { title: 'Scout do atleta', hint: '3 toques — quem fez a ação' },
};

export function ScoreboardPage() {
  const navigate = useNavigate();
  const live = useMatchStore((s) => s.live);
  const hydrated = useHydrated();
  const players = useAppStore((s) => s.players);
  const addRally = useMatchStore((s) => s.addRally);
  const undoRally = useMatchStore((s) => s.undoRally);
  const removePoint = useMatchStore((s) => s.removePoint);
  const startNextSet = useMatchStore((s) => s.startNextSet);
  const finishMatch = useMatchStore((s) => s.finishMatch);
  const discardMatch = useMatchStore((s) => s.discardMatch);
  const updateScout = useMatchStore((s) => s.updateScout);
  const setFirstServe = useMatchStore((s) => s.setFirstServe);
  const setStartCourt = useMatchStore((s) => s.setStartCourt);
  const substitute = useMatchStore((s) => s.substitute);

  const [pending, setPending] = useState<{ team: MatchTeam; opp: MatchTeam } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  // Encerrar zera a partida no store. Sem esta trava, o redirecionamento
  // de segurança abaixo dispara antes da navegação e engole o resumo.
  const [leaving, setLeaving] = useState(false);

  if (!hydrated || (leaving && !live)) return null;
  if (!live) return <Navigate to="/" replace />;

  const [teamA, teamB] = live.teams;
  const current = live.sets[live.sets.length - 1];
  const rallies = current.rallies ?? [];
  const run = currentRun(rallies);

  // Modo profissional: a quadra é derivada dos rallies a cada render
  const pro = live.pro;
  const rotates = pro ? ROTATIONS[pro.system].rotates : true;
  const courtState =
    pro && current.lineup
      ? courtStateAt(current.lineup, rallies, pro.homeTeamId, rotates)
      : null;

  // No scout do atleta, "quem fez?" lista só quem está em quadra
  const active = (team: MatchTeam): MatchTeam =>
    courtState && team.id === pro?.homeTeamId
      ? {
          ...team,
          playerIds: [
            ...courtPlayerIds(courtState.court),
            ...(pro.liberoId ? [pro.liberoId] : []),
          ],
        }
      : team;

  const setsWon = live.teams.map(
    (t) =>
      live.sets.filter(
        (g) =>
          g.finished &&
          ((g.teamAId === t.id && g.scoreA > g.scoreB) ||
            (g.teamBId === t.id && g.scoreB > g.scoreA)),
      ).length,
  );

  function handleTap(team: MatchTeam, opp: MatchTeam) {
    if (current.finished) return;
    if (live!.scout.mode === 'placar') {
      addRally({ teamId: team.id, kind: 'ponto', action: 'indefinido' });
      return;
    }
    setPending({ team: active(team), opp: active(opp) });
  }

  function confirm(draft: PointDraft) {
    if (!pending) return;
    addRally({ teamId: pending.team.id, ...draft });
    setPending(null);
  }

  function handleFinish() {
    const matchId = live!.id;
    const played = live!.sets.some((g) => (g.rallies?.length ?? 0) > 0);
    setLeaving(true);
    finishMatch();
    navigate(played ? `/partida/${matchId}` : '/', { replace: true });
  }

  return (
    <div className="flex h-dvh flex-col bg-ink-950">
      {/* Cabeçalho */}
      <header className="safe-top flex items-center justify-between px-4 pt-3 pb-2">
        <button
          onClick={() => {
            if (confirm2('Descartar esta partida? Os pontos serão perdidos.')) {
              discardMatch();
              navigate('/');
            }
          }}
          className="p-1.5 text-ink-500"
        >
          <X size={20} />
        </button>
        <div className="text-center">
          <p className="text-xs font-semibold tracking-wide text-ink-300 uppercase">
            {live.sets.length}º set
          </p>
          <p className="text-[11px] text-ink-500">
            {setsWon[0]} — {setsWon[1]} em sets · até {live.scout.pointsToWin}
          </p>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="p-1.5 text-ink-500"
        >
          <Settings2 size={20} />
        </button>
      </header>

      {/* Placar — cada metade é um botão gigante */}
      <div className="flex min-h-0 flex-1 gap-2 px-2">
        {[
          { team: teamA, opp: teamB, score: current.scoreA },
          { team: teamB, opp: teamA, score: current.scoreB },
        ].map(({ team, opp, score }) => {
          const c = TEAM_COLOR_CLASSES[team.color];
          return (
            <button
              key={team.id}
              onClick={() => handleTap(team, opp)}
              disabled={current.finished}
              className={cn(
                'flex flex-1 flex-col items-center justify-center rounded-3xl border transition-all active:scale-[0.98]',
                current.finished
                  ? 'border-ink-800 bg-ink-900/50'
                  : 'border-ink-800 bg-ink-900 active:bg-ink-800',
              )}
            >
              <span className={cn('mb-1 size-2.5 rounded-full', c.bg)} />
              <span className="px-2 text-center text-sm font-semibold text-ink-300">
                {team.name.replace('Time ', '')}
              </span>
              <span className="mt-1 text-7xl font-bold tabular-nums text-ink-50">
                {score}
              </span>
              {courtState?.servingTeamId === team.id && !current.finished && (
                <span className="mt-1 rounded-full bg-brand-500/15 px-2 py-0.5 text-[11px] font-semibold text-brand-300">
                  saque
                </span>
              )}
              {run?.teamId === team.id && run.count >= 3 && (
                <span className="mt-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                  {run.count} seguidos
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Correção do placar: − tira o último ponto do time, + marca sem scout */}
      <div className="mt-2 flex gap-2 px-2">
        {[
          { team: teamA, score: current.scoreA },
          { team: teamB, score: current.scoreB },
        ].map(({ team, score }) => (
          <div key={team.id} className="flex flex-1 gap-2">
            <button
              onClick={() => removePoint(team.id)}
              disabled={score === 0}
              aria-label={`Tirar um ponto de ${team.name}`}
              className="flex h-11 flex-1 items-center justify-center rounded-xl border border-ink-800 bg-ink-900 text-ink-300 active:scale-[0.98] disabled:opacity-30"
            >
              <Minus size={20} />
            </button>
            <button
              onClick={() =>
                addRally({ teamId: team.id, kind: 'ponto', action: 'indefinido' })
              }
              disabled={current.finished}
              aria-label={`Dar um ponto para ${team.name}`}
              className="flex h-11 flex-1 items-center justify-center rounded-xl border border-ink-800 bg-ink-900 text-ink-300 active:scale-[0.98] disabled:opacity-30"
            >
              <Plus size={20} />
            </button>
          </div>
        ))}
      </div>

      {pro && courtState && current.lineup && !current.finished && (
        <CourtPanel
          home={teamA.id === pro.homeTeamId ? teamA : teamB}
          away={teamA.id === pro.homeTeamId ? teamB : teamA}
          lineup={current.lineup}
          state={courtState}
          beforeFirstRally={rallies.length === 0}
          rotates={rotates}
          liberoId={pro.liberoId}
          players={players}
          onFirstServe={setFirstServe}
          onStartCourt={setStartCourt}
          onSubstitute={substitute}
        />
      )}

      {/* Últimos rallies */}
      <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto px-3 py-1">
        {[...rallies]
          .reverse()
          .slice(0, 12)
          .map((r) => {
            const team = live.teams.find((t) => t.id === r.teamId)!;
            const c = TEAM_COLOR_CLASSES[team.color];
            const who = r.playerId
              ? players.find((p) => p.id === r.playerId)?.name.split(' ')[0]
              : null;
            return (
              <div
                key={r.id}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-ink-800 bg-ink-900 px-2 py-1"
              >
                <span className={cn('size-1.5 rounded-full', c.bg)} />
                <span className="text-[11px] tabular-nums text-ink-400">
                  {r.scoreA}-{r.scoreB}
                </span>
                {r.action !== 'indefinido' && (
                  <span
                    className={cn(
                      'text-[11px]',
                      r.kind === 'ponto' ? 'text-brand-300' : 'text-ink-500',
                    )}
                  >
                    {r.kind === 'erro' ? 'erro ' : ''}
                    {ACTION_LABEL[r.action].toLowerCase()}
                  </span>
                )}
                {who && <span className="text-[11px] text-ink-300">{who}</span>}
              </div>
            );
          })}
        {rallies.length === 0 && (
          <span className="px-1 text-[11px] text-ink-600">
            Toque no lado do time que fez o ponto
          </span>
        )}
      </div>

      {/* Barra inferior */}
      <div className="safe-bottom border-t border-ink-800 px-4 py-3">
        {current.finished ? (
          <div className="flex gap-2">
            <button
              onClick={startNextSet}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-500 font-semibold text-ink-950 active:scale-[0.98]"
            >
              Próximo set
              <ChevronRight size={18} />
            </button>
            <button
              onClick={handleFinish}
              className="flex h-12 items-center justify-center gap-2 rounded-xl border border-ink-700 px-4 text-sm font-medium text-ink-200"
            >
              <Flag size={16} />
              Encerrar
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={undoRally}
              disabled={rallies.length === 0 && live.sets.length === 1}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-ink-800 bg-ink-900 text-sm font-medium text-ink-300 disabled:opacity-40"
            >
              <Undo2 size={17} />
              Desfazer
            </button>
            <button
              onClick={handleFinish}
              className="flex h-12 items-center justify-center gap-2 rounded-xl border border-ink-800 px-4 text-sm font-medium text-ink-400"
            >
              <Flag size={16} />
              Encerrar
            </button>
          </div>
        )}
      </div>

      {pending && (
        <PointSheet
          open
          scoringTeam={pending.team}
          opponentTeam={pending.opp}
          players={players}
          mode={live.scout.mode}
          onConfirm={confirm}
          onClose={() => setPending(null)}
        />
      )}

      {showSettings && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setShowSettings(false)}
          />
          <div className="safe-bottom relative rounded-t-3xl border-t border-ink-700 bg-ink-900 px-4 pt-4 pb-6">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink-700" />
            <p className="mb-2 text-xs font-semibold tracking-wide text-ink-400 uppercase">
              Detalhe do scout
            </p>
            <div className="flex flex-col gap-2">
              {(['placar', 'time', 'atleta'] as ScoutMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => updateScout({ mode: m })}
                  className={cn(
                    'flex items-center justify-between rounded-xl border px-4 py-3 text-left',
                    live.scout.mode === m
                      ? 'border-brand-500 bg-brand-500/10'
                      : 'border-ink-800 bg-ink-950',
                  )}
                >
                  <span>
                    <span className="block text-[15px] font-medium text-ink-50">
                      {MODE_LABEL[m].title}
                    </span>
                    <span className="block text-xs text-ink-500">
                      {MODE_LABEL[m].hint}
                    </span>
                  </span>
                  {live.scout.mode === m && (
                    <Check size={18} className="text-brand-400" />
                  )}
                </button>
              ))}
            </div>

            <p className="mt-5 mb-2 text-xs font-semibold tracking-wide text-ink-400 uppercase">
              Set até
            </p>
            <div className="flex gap-2">
              {POINTS_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => updateScout({ pointsToWin: n })}
                  className={cn(
                    'h-11 flex-1 rounded-xl border text-[15px] font-semibold',
                    live.scout.pointsToWin === n
                      ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                      : 'border-ink-800 bg-ink-950 text-ink-400',
                  )}
                >
                  {n}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowSettings(false)}
              className="mt-5 h-12 w-full rounded-xl bg-brand-500 font-semibold text-ink-950"
            >
              Pronto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function confirm2(message: string) {
  return window.confirm(message);
}
