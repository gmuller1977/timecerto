import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Game,
  Match,
  MatchTeam,
  Rally,
  RotationSystem,
  ScoutSettings,
  SetLineup,
  SportId,
  VolleyAction,
} from '@/types';
import { DEFAULT_SCOUT, isSetOver } from '@/lib/volley';
import type { Court } from '@/lib/court';
import { uid } from '@/lib/utils';

export interface LiveMatch {
  id: string;
  sport: SportId;
  date: string;
  teams: [MatchTeam, MatchTeam];
  sets: Game[];
  scout: ScoutSettings;
  finished: boolean;
  /** Modo profissional: o time da casa entrou com escalação */
  pro?: ProSetup;
}

/** O que vale para a partida inteira; o que muda por set fica em `Game.lineup` */
export interface ProSetup {
  homeTeamId: string;
  system: RotationSystem;
  liberoId?: string;
}

interface MatchState {
  live: LiveMatch | null;
  matches: Match[];

  startMatch: (input: {
    sport: SportId;
    teams: [MatchTeam, MatchTeam];
    scout?: Partial<ScoutSettings>;
    /** Escalação do time da casa — teams[0] */
    lineup?: { system: RotationSystem; court: Court; liberoId?: string };
  }) => void;
  updateScout: (patch: Partial<ScoutSettings>) => void;
  addRally: (input: {
    teamId: string;
    kind: 'ponto' | 'erro';
    action: VolleyAction;
    playerId?: string;
  }) => void;
  undoRally: () => void;
  /** Correção: tira o último ponto deste time no set, mesmo fora de ordem */
  removePoint: (teamId: string) => void;
  startNextSet: () => void;
  /** Só antes do primeiro rally do set */
  setFirstServe: (teamId: string) => void;
  /** Só antes do primeiro rally do set — não conta como substituição */
  setStartCourt: (court: Court) => void;
  substitute: (outId: string, inId: string) => void;
  finishMatch: () => void;
  discardMatch: () => void;
  removeMatch: (id: string) => void;
}

function newSet(teams: [MatchTeam, MatchTeam], lineup?: SetLineup): Game {
  return {
    id: uid(),
    teamAId: teams[0].id,
    teamBId: teams[1].id,
    scoreA: 0,
    scoreB: 0,
    played: true,
    finished: false,
    rallies: [],
    ...(lineup ? { lineup } : {}),
  };
}

/** Aplica uma mudança à escalação do set em andamento, se houver uma */
function patchLineup(
  live: LiveMatch,
  fn: (lineup: SetLineup, played: number) => SetLineup | null,
): LiveMatch | null {
  const sets = [...live.sets];
  const idx = sets.length - 1;
  const current = sets[idx];
  if (!current.lineup || current.finished) return null;
  const next = fn(current.lineup, current.rallies?.length ?? 0);
  if (!next) return null;
  sets[idx] = { ...current, lineup: next };
  return { ...live, sets };
}

export const useMatchStore = create<MatchState>()(
  persist(
    (set, get) => ({
      live: null,
      matches: [],

      startMatch: ({ sport, teams, scout, lineup }) =>
        set({
          live: {
            id: uid(),
            sport,
            date: new Date().toISOString(),
            teams,
            sets: [
              newSet(
                teams,
                lineup && {
                  court: lineup.court,
                  firstServeTeamId: teams[0].id,
                  subs: [],
                },
              ),
            ],
            scout: { ...DEFAULT_SCOUT, ...scout },
            finished: false,
            ...(lineup && {
              pro: {
                homeTeamId: teams[0].id,
                system: lineup.system,
                liberoId: lineup.liberoId,
              },
            }),
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

          // Substituição feita depois do último rally sai primeiro:
          // desfazer volta a última coisa que a pessoa fez, seja qual for.
          const lu = sets[idx].lineup;
          const played = sets[idx].rallies?.length ?? 0;
          if (lu && lu.subs.length > 0 && lu.subs[lu.subs.length - 1].atRally >= played) {
            sets[idx] = { ...sets[idx], lineup: { ...lu, subs: lu.subs.slice(0, -1) } };
            return { live: { ...s.live, sets } };
          }

          // Se o set atual está vazio, volta para o anterior
          if (played === 0 && idx > 0) {
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

      removePoint: (teamId) =>
        set((s) => {
          if (!s.live) return s;
          const sets = [...s.live.sets];
          const idx = sets.length - 1;
          const current = sets[idx];
          const old = current.rallies ?? [];
          let cut = -1;
          for (let i = old.length - 1; i >= 0; i--) {
            if (old[i].teamId === teamId) {
              cut = i;
              break;
            }
          }
          if (cut < 0) return s;

          // O placar gravado em cada rally é o de depois dele — tirar um do
          // meio exige recontar os seguintes
          let scoreA = 0;
          let scoreB = 0;
          const rallies = old
            .filter((_, i) => i !== cut)
            .map((r) => {
              if (r.teamId === current.teamAId) scoreA++;
              else scoreB++;
              return { ...r, scoreA, scoreB };
            });

          // Substituição feita depois do ponto removido anda uma casa para trás
          const lineup = current.lineup && {
            ...current.lineup,
            subs: current.lineup.subs.map((sub) =>
              sub.atRally > cut ? { ...sub, atRally: sub.atRally - 1 } : sub,
            ),
          };

          sets[idx] = {
            ...current,
            rallies,
            scoreA,
            scoreB,
            finished: isSetOver(scoreA, scoreB, s.live.scout),
            ...(lineup ? { lineup } : {}),
          };
          return { live: { ...s.live, sets } };
        }),

      startNextSet: () =>
        set((s) => {
          if (!s.live) return s;
          // O set seguinte começa com a escalação inicial do anterior e o
          // primeiro saque alternado. Dá para ajustar antes do primeiro ponto.
          const prev = s.live.sets[s.live.sets.length - 1].lineup;
          const [a, b] = s.live.teams;
          const lineup: SetLineup | undefined = prev && {
            court: prev.court,
            firstServeTeamId: prev.firstServeTeamId === a.id ? b.id : a.id,
            subs: [],
          };
          return {
            live: { ...s.live, sets: [...s.live.sets, newSet(s.live.teams, lineup)] },
          };
        }),

      setFirstServe: (teamId) =>
        set((s) => {
          const live =
            s.live &&
            patchLineup(s.live, (lu, played) =>
              played === 0 ? { ...lu, firstServeTeamId: teamId } : null,
            );
          return live ? { live } : s;
        }),

      setStartCourt: (court) =>
        set((s) => {
          const live =
            s.live &&
            patchLineup(s.live, (lu, played) =>
              played === 0 ? { ...lu, court, subs: [] } : null,
            );
          return live ? { live } : s;
        }),

      substitute: (outId, inId) =>
        set((s) => {
          const live =
            s.live &&
            patchLineup(s.live, (lu, played) => ({
              ...lu,
              subs: [...lu.subs, { atRally: played, outId, inId }],
            }));
          return live ? { live } : s;
        }),

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
          mode: live.pro ? 'profissional' : 'amador',
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
