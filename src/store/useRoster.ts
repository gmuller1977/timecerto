import { useMemo } from 'react';
import type { Player } from '@/types';
import { useAppStore } from '@/store/useAppStore';
import { useProStore } from '@/store/useProStore';
import { proToPlayer } from '@/lib/pro';
import { nomeDeExibicao } from '@/lib/nome';

/**
 * Todos os jogadores que uma partida pode citar: o cadastro amador e o
 * elenco profissional. Os cadastros são separados, mas o placar, o scout e o
 * histórico só precisam achar um nome pelo id — e ids não colidem.
 */
export function useRoster(): Player[] {
  const amador = useAppStore((s) => s.players);
  const pro = useProStore((s) => s.players);
  // Placar, scout e resumo mostram o apelido: é como o grupo chama a pessoa
  return useMemo(
    () => [...amador.map((p) => ({ ...p, name: nomeDeExibicao(p) })), ...pro.map(proToPlayer)],
    [amador, pro],
  );
}
