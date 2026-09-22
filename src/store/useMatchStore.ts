import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Game,
  Match,
  MatchTeam,
  Rally,
  ScoutSettings,
  SportId,
  VolleyAction,
} from '@/types';
import { DEFAULT_SCOUT, isSetOver } from '@/lib/volley';
import { uid } from '@/lib/utils';

export interface LiveMatch {
  id: string;
  sport: SportId;
  date: string;
  teams: [MatchTeam, MatchTeam];
  sets: Game[];
  scout: ScoutSettings;
  finished: boolean;
}

interface MatchState {
  live: LiveMatch | null;
  matches: Match[];

  startMatch: (input: {
    sport: SportId;
    teams: [MatchTeam, MatchTeam];
    scout?: Partial<ScoutSettings>;
  }) => void;
  updateScout: (patch: Partial<ScoutSettings>) => void;
  addRally: (input: {
    teamId: string;
    kind: 'ponto' | 'erro';
    action: VolleyAction;
    playerId?: string;
  }) => void;
  undoRally: () => void;
  startNextSet: () => void;
  finishMatch: () => void;
  discardMatch: () => void;
  removeMatch: (id: string) => void;
}

function newSet(teams: [MatchTeam, MatchTeam]): Game {
  return {
    id: uid(),
    teamAId: teams[0].id,
    teamBId: teams[1].id,
    scoreA: 0,
    scoreB: 0,
    played: true,
    finished: false,
    rallies: [],
  };
}

export const useMatchStore = create<MatchState>()(
  persist(
    (set, get) => ({
      live: null,
      matches: [],

      startMatch: ({ sport, teams, scout }) =>
        set({
          live: {
            id: uid(),
            sport,
            date: new Date().toISOString(),
            teams,
            sets: [newSet(teams)],
            scout: { ...DEFAULT_SCOUT, ...scout },
            finished: false,
          },
        }),

      updateScout: (patch) =>
        set((s) =>
          s.live ? { live: { ...s.live, scout: { ...s.live.scout, ...patch } } } : s,
        ),

      addRally: ({ teamId, kind, action, playerId }) =>
        set((s) => {
          if (!s.live) return s;
          const sets = [...s.live.sets];
          const idx = sets.length - 1;
          const current = { ...sets[idx] };
          if (current.finished) return s;

          const isA = teamId === current.teamAId;
          const scoreA = current.scoreA + (isA ? 1 : 0);
          const scoreB = current.scoreB + (isA ? 0 : 1);

          const rally: Rally = {
            id: uid(),
            teamId,
            kind,
            action,
            playerId,
            scoreA,
            scoreB,
            at: new Date().toISOString(),
          };

          current.scoreA = scoreA;
          current.scoreB = scoreB;
          current.rallies = [...(current.rallies ?? []), rally];
          current.finished = isSetOver(scoreA, scoreB, s.live.scout);
          sets[idx] = current;

          return { live: { ...s.live, sets } };
        }),

      undoRally: () =>
        set((s) => {
          if (!s.live) return s;
          const sets = [...s.live.sets];
          let idx = sets.length - 1;

          // Se o set atual está vazio, volta para o anterior
          if ((sets[idx].rallies?.length ?? 0) === 0 && idx > 0) {
            sets.pop();
            idx--;
          }
          const current = { ...sets[idx] };
          const rallies = [...(current.rallies ?? [])];
          if (rallies.length === 0) return s;

          rallies.pop();
          const last = rallies[rallies.length - 1];
          current.rallies = rallies;
          current.scoreA = last?.scoreA ?? 0;
          current.scoreB = last?.scoreB ?? 0;
          current.finished = false;
          sets[idx] = current;

          return { live: { ...s.live, sets } };
        }),

      startNextSet: () =>
        set((s) =>
          s.live
            ? { live: { ...s.live, sets: [...s.live.sets, newSet(s.live.teams)] } }
            : s,
        ),

      finishMatch: () => {
        const live = get().live;
        if (!live) return;

        const playedSets = live.sets.filter(
          (g) => (g.rallies?.length ?? 0) > 0,
        );
        const scorers: Record<string, number> = {};
        for (const g of playedSets) {
          for (const r of g.rallies ?? []) {
            if (r.kind === 'ponto' && r.playerId) {
              scorers[r.playerId] = (scorers[r.playerId] ?? 0) + 1;
            }
          }
        }

        const match: Match = {
          id: live.id,
          date: live.date,
          sport: live.sport,
          teams: live.teams,
          games: playedSets,
          scorers,
          attendance: live.teams.flatMap((t) => t.playerIds),
        };

        set((s) => ({
          live: null,
          matches: playedSets.length > 0 ? [match, ...s.matches] : s.matches,
        }));
      },

      discardMatch: () => set({ live: null }),

      removeMatch: (id) =>
        set((s) => ({ matches: s.matches.filter((m) => m.id !== id) })),
    }),
    {
      name: 'timecerto:matches:v1',
      partialize: (s) => ({ live: s.live, matches: s.matches }),
    },
  ),
);
