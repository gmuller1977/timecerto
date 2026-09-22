import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DrawResult, DrawSettings, Player, SkillLevel, SportId } from '@/types';
import { SPORTS } from '@/lib/sports';
import { uid } from '@/lib/utils';

interface AppState {
  sport: SportId;
  players: Player[];
  settings: DrawSettings;
  lastResult: DrawResult | null;
  history: DrawResult[];

  setSport: (sport: SportId) => void;
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
  avoidRepeat: false,
});

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      sport: 'futebol',
      players: [],
      settings: defaultSettings('futebol'),
      lastResult: null,
      history: [],

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
        sport: s.sport,
        players: s.players,
        settings: s.settings,
        lastResult: s.lastResult,
        history: s.history,
      }),
    },
  ),
);

export const selectPresent = (s: AppState) => s.players.filter((p) => p.present);
