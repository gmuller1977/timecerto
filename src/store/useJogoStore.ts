import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ConfirmacaoStatus, Jogo, Player, SportId } from '@/types';
import { useAppStore } from '@/store/useAppStore';
import {
  abrirJogo,
  importarRespostas,
  migrarPresent,
  novoJogo,
  responder,
  semPresent,
} from '@/lib/jogo';
import { joga, vagasDoJogo } from '@/lib/vagas';

interface JogoState {
  /** Mais recente primeiro; no máximo um `aberto` */
  jogos: Jogo[];
  /** Migrações de dados já feitas neste aparelho, com a hora */
  migracoes: { present?: string };

  criarJogo: (input: {
    sport: SportId;
    date: string;
    time: string;
    place: string;
    vagas: number | null;
    remoteId?: string;
  }) => Jogo;
  atualizarJogo: (id: string, patch: Partial<Omit<Jogo, 'id' | 'confirmations'>>) => void;
  encerrarJogo: (id: string) => void;
  /** Um toque na lista: confirmado ↔ sem resposta */
  alternar: (playerId: string) => void;
  /** "Marcar todos" / "Desmarcar todos" */
  marcarTodos: (playerIds: string[], confirmado: boolean) => void;
  /** Resposta do organizador com status explícito (ex.: o avulso chega confirmado) */
  responder: (playerId: string, status: ConfirmacaoStatus) => void;
  /** Respostas que chegaram pelos links, por id LOCAL */
  importarDoLink: (
    jogoId: string,
    respostas: { playerId: string; status: ConfirmacaoStatus; at: string }[],
  ) => void;
  /** Estas respostas do organizador já estão na nuvem, com esta hora */
  marcarEnviados: (jogoId: string, enviados: { playerId: string; at: string }[]) => void;
  /** O jogo foi para um evento novo: nada do que foi enviado antes está lá */
  limparEnvios: (jogoId: string) => void;
  migrar: () => void;
}

/** Aplica uma regra pura ao jogo aberto; sem jogo aberto, não faz nada */
const noAberto = (jogos: Jogo[], f: (j: Jogo) => Jogo) =>
  jogos.map((j) => (j.status === 'aberto' ? f(j) : j));

/**
 * O jogo da semana e quem vem nele. Substitui o antigo `Player.present` —
 * ver `Jogo` em types/index.ts. As regras moram em lib/jogo.ts.
 */
export const useJogoStore = create<JogoState>()(
  persist(
    (set, get) => ({
      jogos: [],
      migracoes: {},

      criarJogo: (input) => {
        const jogo = novoJogo(input);
        set((s) => ({ jogos: abrirJogo(s.jogos, jogo) }));
        return jogo;
      },

      atualizarJogo: (id, patch) =>
        set((s) => ({ jogos: s.jogos.map((j) => (j.id === id ? { ...j, ...patch } : j)) })),

      encerrarJogo: (id) =>
        set((s) => ({
          jogos: s.jogos.map((j) => (j.id === id ? { ...j, status: 'encerrado' as const } : j)),
        })),

      alternar: (playerId) =>
        set((s) => ({
          jogos: noAberto(s.jogos, (j) => {
            const c = j.confirmations.find((x) => x.playerId === playerId);
            return responder(
              j,
              playerId,
              c?.status === 'confirmado' ? 'sem-resposta' : 'confirmado',
              'organizador',
            );
          }),
        })),

      marcarTodos: (playerIds, confirmado) =>
        set((s) => ({
          jogos: noAberto(s.jogos, (j) =>
            playerIds.reduce((acc, id) => {
              const c = acc.confirmations.find((x) => x.playerId === id);
              // Desmarcar não apaga quem disse "não vou": isso é uma resposta
              if (!confirmado && c?.status !== 'confirmado') return acc;
              return responder(acc, id, confirmado ? 'confirmado' : 'sem-resposta', 'organizador');
            }, j),
          ),
        })),

      responder: (playerId, status) =>
        set((s) => ({
          jogos: noAberto(s.jogos, (j) => responder(j, playerId, status, 'organizador')),
        })),

      importarDoLink: (jogoId, respostas) =>
        set((s) => ({
          jogos: s.jogos.map((j) => (j.id === jogoId ? importarRespostas(j, respostas) : j)),
        })),

      // Só marca se a resposta não mudou enquanto ia: senão a nova ainda precisa ir
      marcarEnviados: (jogoId, enviados) =>
        set((s) => ({
          jogos: s.jogos.map((j) => {
            if (j.id !== jogoId) return j;
            const at = new Map(enviados.map((e) => [e.playerId, e.at]));
            return {
              ...j,
              confirmations: j.confirmations.map((c) =>
                at.get(c.playerId) === c.at ? { ...c, enviadoEm: c.at } : c,
              ),
            };
          }),
        })),

      limparEnvios: (jogoId) =>
        set((s) => ({
          jogos: s.jogos.map((j) =>
            j.id === jogoId
              ? { ...j, confirmations: j.confirmations.map((c) => ({ ...c, enviadoEm: undefined })) }
              : j,
          ),
        })),

      /**
       * Converte o antigo `present`. A criação do jogo e a marca de migrado vão
       * numa gravação só; o booleano só sai dos jogadores depois. Se o app cair
       * no meio, ou a migração roda de novo inteira, ou não roda mais — nunca
       * fica gente sem confirmação e sem present ao mesmo tempo.
       */
      migrar: () => {
        const app = useAppStore.getState();
        const s = get();
        if (!s.migracoes.present) {
          set(migrarPresent({ jogos: s.jogos, migracoes: s.migracoes }, app.players, app.sport));
        }
        if (app.players.some((p) => 'present' in p)) {
          useAppStore.setState({ players: semPresent(app.players) });
        }
      },
    }),
    {
      name: 'timecerto:jogos:v1',
      partialize: (s) => ({ jogos: s.jogos, migracoes: s.migracoes }),
    },
  ),
);

/** O jogo aberto, se houver */
export function useJogoAberto(): Jogo | null {
  return useJogoStore((s) => s.jogos.find((j) => j.status === 'aberto') ?? null);
}

/**
 * Quem joga no jogo aberto: mensalista confirmado sempre; convidado confirmado
 * se tem vaga. É o que o sorteio e a partida direta usam. Sem jogo aberto,
 * ninguém.
 */
export function presentesDoJogo(jogo: Jogo | null, players: Player[]): Player[] {
  if (!jogo) return [];
  const dist = vagasDoJogo(jogo, players);
  return players.filter((p) => joga(dist.situacao.get(p.id)));
}

export function usePresentes(): Player[] {
  const jogo = useJogoAberto();
  const players = useAppStore((s) => s.players);
  return useMemo(() => presentesDoJogo(jogo, players), [jogo, players]);
}
