import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AgeGroup, Lineup, Naipe, ProPlayer } from '@/types';
import { uid } from '@/lib/utils';

/** Recorte do elenco: `null` = todas */
export interface ProFilter {
  ageGroup: AgeGroup | null;
  naipe: Naipe | null;
}

interface ProState {
  players: ProPlayer[];
  filter: ProFilter;
  /** Última escalação — o time costuma repetir */
  lastLineup: Lineup | null;

  addPlayer: (input: Omit<ProPlayer, 'id' | 'createdAt'>) => void;
  updatePlayer: (id: string, patch: Partial<ProPlayer>) => void;
  removePlayer: (id: string) => void;
  setFilter: (patch: Partial<ProFilter>) => void;
  saveLineup: (lineup: Lineup) => void;
}

/**
 * Elenco do modo profissional. Store e chave de localStorage próprios:
 * os dois modos são praticamente dois apps, e o cadastro de um não
 * aparece no outro.
 */
export const useProStore = create<ProState>()(
  persist(
    (set) => ({
      players: [],
      filter: { ageGroup: null, naipe: null },
      lastLineup: null,

      addPlayer: (input) =>
        set((s) => ({
          players: [
            ...s.players,
            { ...input, name: input.name.trim(), id: uid(), createdAt: new Date().toISOString() },
          ],
        })),

      updatePlayer: (id, patch) =>
        set((s) => ({
          players: s.players.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),

      removePlayer: (id) =>
        set((s) => ({ players: s.players.filter((p) => p.id !== id) })),

      setFilter: (patch) => set((s) => ({ filter: { ...s.filter, ...patch } })),

      saveLineup: (lineup) => set({ lastLineup: lineup }),
    }),
    { name: 'timecerto:pro:v1' },
  ),
);

export function matchesFilter(p: ProPlayer, f: ProFilter): boolean {
  return (!f.ageGroup || p.ageGroup === f.ageGroup) && (!f.naipe || p.naipe === f.naipe);
}
