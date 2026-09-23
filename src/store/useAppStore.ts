import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AppMode,
  DrawResult,
  DrawSettings,
  Player,
  RotationSystem,
  SkillLevel,
  SportId,
  Squad,
  TeamColor,
} from '@/types';
import { SPORTS } from '@/lib/sports';
import { DEFAULT_ROTATION } from '@/lib/rotation';
import { uid } from '@/lib/utils';

interface AppState {
  mode: AppMode | null;
  sport: SportId;
  players: Player[];
  settings: DrawSettings;
  lastResult: DrawResult | null;
  history: DrawResult[];
  squads: Squad[];

  setMode: (mode: AppMode) => void;
  setSport: (sport: SportId) => void;
  addSquad: (input: {
    name: string;
    playerIds: string[];
    color: TeamColor;
    isMine: boolean;
    system?: RotationSystem;
  }) => Squad;
  updateSquad: (id: string, patch: Partial<Squad>) => void;
  removeSquad: (id: string) => void;
  addPlayer: (input: { name: string; skill: SkillLevel; position?: string }) => void;
  updatePlayer: (id: string, patch: Partial<Player>) => void;
  removePlayer: (id: string) => void;
  togglePresence: (id: string) => void;
  setAllPresence: (present: boolean) => void;
  setSkill: (id: string, skill: SkillLevel) => void;
  setPosition: (id: string, position: string) => void;
  updateSettings: (patch: Partial<DrawSettings>) => void;
  setResult: (result: DrawResult) => void;
  clearPlayers: () => void;
}

const defaultSettings = (sport: SportId): DrawSettings => ({
  sport,
  teamSize: SPORTS[sport].defaultTeamSize,
  numberOfTeams: 2,
  balanceBySkill: true,
  balanceByPosition: true,
  distributeKeepers: true,
  rotation: DEFAULT_ROTATION,
  avoidRepeat: false,
});

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      mode: null,
      sport: 'futebol',
      players: [],
      settings: defaultSettings('futebol'),
      lastResult: null,
      history: [],
      squads: [],

      addSquad: ({ name, playerIds, color, isMine, system }) => {
        const squad: Squad = {
          id: uid(),
          name: name.trim(),
          sport: get().sport,
          color,
          playerIds,
          isMine,
          system,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ squads: [...s.squads, squad] }));
        return squad;
      },

      updateSquad: (id, patch) =>
        set((s) => ({
          squads: s.squads.map((q) => (q.id === id ? { ...q, ...patch } : q)),
        })),

      removeSquad: (id) =>
        set((s) => ({ squads: s.squads.filter((q) => q.id !== id) })),

      setMode: (mode) =>
        set((s) => ({
          mode,
          // O modo profissional hoje só existe para o vôlei
          sport: mode === 'profissional' ? 'volei' : s.sport,
          settings:
            mode === 'profissional'
              ? { ...s.settings, sport: 'volei' as SportId }
              : s.settings,
        })),

      setSport: (sport) =>
        set((s) => ({
          sport,
          settings: {
            ...s.settings,
            sport,
            teamSize: SPORTS[sport].defaultTeamSize,
          },
        })),

      addPlayer: ({ name, skill, position }) => {
        const sport = get().sport;
        const player: Player = {
          id: uid(),
          name: name.trim(),
          skills: { [sport]: skill },
          positions: position ? { [sport]: position } : {},
          present: true,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ players: [...s.players, player] }));
      },

      updatePlayer: (id, patch) =>
        set((s) => ({
          players: s.players.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),

      removePlayer: (id) =>
        set((s) => ({ players: s.players.filter((p) => p.id !== id) })),

      togglePresence: (id) =>
        set((s) => ({
          players: s.players.map((p) =>
            p.id === id ? { ...p, present: !p.present } : p,
          ),
        })),

      setAllPresence: (present) =>
        set((s) => ({ players: s.players.map((p) => ({ ...p, present })) })),

      setSkill: (id, skill) =>
        set((s) => ({
          players: s.players.map((p) =>
            p.id === id ? { ...p, skills: { ...p.skills, [s.sport]: skill } } : p,
          ),
        })),

      setPosition: (id, position) =>
        set((s) => ({
          players: s.players.map((p) =>
            p.id === id
              ? { ...p, positions: { ...p.positions, [s.sport]: position } }
              : p,
          ),
        })),

      updateSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),

      setResult: (result) =>
        set((s) => ({
          lastResult: result,
          history: [result, ...s.history].slice(0, 20),
        })),

      clearPlayers: () => set({ players: [] }),
    }),
    {
      name: 'timecerto:v1',
      partialize: (s) => ({
        mode: s.mode,
        sport: s.sport,
        players: s.players,
        settings: s.settings,
        lastResult: s.lastResult,
        history: s.history,
        squads: s.squads,
      }),
    },
  ),
);

export const selectPresent = (s: AppState) => s.players.filter((p) => p.present);
