import { createContext, useContext } from 'react';
import { useMatchStore, type StoreDePartida } from '@/store/useMatchStore';
import type { Player } from '@/types';

/**
 * De onde o placar lê a partida. No app, o store do aparelho e o elenco do
 * grupo. No scout pelo link (migração 041), um store só do link, o elenco que
 * veio com ele e o encerramento que grava na nuvem — quem marca pelo link
 * não descarta a partida nem muda a configuração do scout.
 */
export interface Placar {
  useStore: StoreDePartida;
  /** Elenco do link; sem ele, o do aparelho (`useRoster`) */
  players?: Player[];
  link?: {
    /** Encerrar a partida: quem chama cuida da confirmação e do que vem depois */
    aoEncerrar: () => void;
  };
}

const PlacarContexto = createContext<Placar>({ useStore: useMatchStore });

export const PlacarProvider = PlacarContexto.Provider;

export function usePlacar(): Placar {
  return useContext(PlacarContexto);
}
