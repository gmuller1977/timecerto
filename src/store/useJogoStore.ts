import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ConfirmacaoStatus, DrawResult, Jogo, Player, SportId } from '@/types';
import { useAppStore } from '@/store/useAppStore';
import {
  abrirJogo,
  importarRespostas,
  migrarPresent,
  novoJogo,
  proximoJogo,
  responder,
  semPresent,
} from '@/lib/jogo';
import { joga, vagasDoJogo } from '@/lib/vagas';

/** Campos do jogo que o organizador edita — e que vão para a nuvem */
type EdicaoDoJogo = Partial<Pick<Jogo, 'sport' | 'date' | 'time' | 'place' | 'vagas' | 'status'>>;

interface JogoState {
  /** Mais recente primeiro. Vários `aberto` (programados) ao mesmo tempo */
  jogos: Jogo[];
  /** Migrações de dados já feitas neste aparelho, com a hora */
  migracoes: { present?: string };
  /** Até onde este aparelho já leu os jogos da nuvem (synced_at do servidor) */
  leituraJogos?: string;

  criarJogo: (input: {
    sport: SportId;
    date: string;
    time: string;
    place: string;
    vagas: number | null;
  }) => Jogo;
  /** Edição do organizador: carimba a hora e vai para a nuvem */
  editarJogo: (id: string, patch: EdicaoDoJogo) => void;
  /** Espelhos e ligações que vêm da nuvem — NÃO carimba a hora */
  atualizarJogo: (id: string, patch: Partial<Omit<Jogo, 'id' | 'confirmations'>>) => void;
  /** O sorteio deste jogo: guarda e vai para a nuvem */
  guardarSorteio: (id: string, sorteio: DrawResult) => void;
  /** Um toque na lista: confirmado ↔ sem resposta */
  alternar: (jogoId: string, playerId: string) => void;
  /** "Marcar todos" / "Desmarcar todos" */
  marcarTodos: (jogoId: string, playerIds: string[], confirmado: boolean) => void;
  /** Resposta do organizador com status explícito (ex.: o avulso chega confirmado) */
  responder: (jogoId: string, playerId: string, status: ConfirmacaoStatus) => void;
  /** Respostas que chegaram pelos links, por id LOCAL */
  importarDoLink: (
    jogoId: string,
    respostas: { playerId: string; status: ConfirmacaoStatus; at: string }[],
  ) => void;
  /** Estas respostas do organizador já estão na nuvem, com esta hora */
  marcarEnviados: (jogoId: string, enviados: { playerId: string; at: string }[]) => void;
  migrar: () => void;
}

const agora = () => new Date().toISOString();

/** Aplica uma regra pura a um jogo */
const noJogo = (jogos: Jogo[], id: string, f: (j: Jogo) => Jogo) =>
  jogos.map((j) => (j.id === id ? f(j) : j));

/**
 * Os jogos marcados e quem vem em cada um. Substitui o antigo
 * `Player.present` — ver `Jogo` em types/index.ts. As regras moram em
 * lib/jogo.ts; a sincronização com a nuvem, em lib/cloud.ts.
 */
export const useJogoStore = create<JogoState>()(
  persist(
    (set, get) => ({
      jogos: [],
      migracoes: {},

      // O id da nuvem nasce aqui, como o dos atletas: um envio só resolve
      // novos e existentes
      criarJogo: (input) => {
        const jogo = { ...novoJogo(input), remoteId: crypto.randomUUID(), updatedAt: agora() };
        set((s) => ({ jogos: abrirJogo(s.jogos, jogo) }));
        return jogo;
      },

      editarJogo: (id, patch) =>
        set((s) => ({ jogos: noJogo(s.jogos, id, (j) => ({ ...j, ...patch, updatedAt: agora() })) })),

      atualizarJogo: (id, patch) =>
        set((s) => ({ jogos: noJogo(s.jogos, id, (j) => ({ ...j, ...patch })) })),

      guardarSorteio: (id, sorteio) =>
        set((s) => ({
          jogos: noJogo(s.jogos, id, (j) => ({ ...j, sorteio: { ...sorteio, jogoId: id }, updatedAt: agora() })),
        })),

      alternar: (jogoId, playerId) =>
        set((s) => ({
          jogos: noJogo(s.jogos, jogoId, (j) => {
            const c = j.confirmations.find((x) => x.playerId === playerId);
            return responder(
              j,
              playerId,
              c?.status === 'confirmado' ? 'sem-resposta' : 'confirmado',
              'organizador',
            );
          }),
        })),

      marcarTodos: (jogoId, playerIds, confirmado) =>
        set((s) => ({
          jogos: noJogo(s.jogos, jogoId, (j) =>
            playerIds.reduce((acc, id) => {
              const c = acc.confirmations.find((x) => x.playerId === id);
              // Desmarcar não apaga quem disse "não vou": isso é uma resposta
              if (!confirmado && c?.status !== 'confirmado') return acc;
              return responder(acc, id, confirmado ? 'confirmado' : 'sem-resposta', 'organizador');
            }, j),
          ),
        })),

      responder: (jogoId, playerId, status) =>
        set((s) => ({
          jogos: noJogo(s.jogos, jogoId, (j) => responder(j, playerId, status, 'organizador')),
        })),

      importarDoLink: (jogoId, respostas) =>
        set((s) => ({ jogos: noJogo(s.jogos, jogoId, (j) => importarRespostas(j, respostas)) })),

      // Só marca se a resposta não mudou enquanto ia: senão a nova ainda precisa ir
      marcarEnviados: (jogoId, enviados) =>
        set((s) => ({
          jogos: noJogo(s.jogos, jogoId, (j) => {
            const at = new Map(enviados.map((e) => [e.playerId, e.at]));
            return {
              ...j,
              confirmations: j.confirmations.map((c) =>
                at.get(c.playerId) === c.at ? { ...c, enviadoEm: c.at } : c,
              ),
            };
          }),
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
      partialize: (s) => ({ jogos: s.jogos, migracoes: s.migracoes, leituraJogos: s.leituraJogos }),
    },
  ),
);

/** Um jogo pelo id local */
export function useJogo(id: string | undefined): Jogo | null {
  return useJogoStore((s) => (id ? (s.jogos.find((j) => j.id === id) ?? null) : null));
}

/** O próximo jogo — o que os links do WhatsApp mostram (`proximoJogo`) */
export function useProximoJogo(): Jogo | null {
  const jogos = useJogoStore((s) => s.jogos);
  return useMemo(() => proximoJogo(jogos), [jogos]);
}

/**
 * Quem joga num jogo: mensalista confirmado sempre; convidado confirmado se
 * tem vaga. É o que o sorteio e a partida direta usam. Sem jogo, ninguém.
 */
export function presentesDoJogo(jogo: Jogo | null, players: Player[]): Player[] {
  if (!jogo) return [];
  const dist = vagasDoJogo(jogo, players);
  return players.filter((p) => joga(dist.situacao.get(p.id)));
}

/** Quem joga no jogo indicado — ou, sem indicação, no próximo */
export function usePresentes(jogoId?: string): Player[] {
  const escolhido = useJogo(jogoId);
  const proximo = useProximoJogo();
  const jogo = jogoId ? escolhido : proximo;
  const players = useAppStore((s) => s.players);
  return useMemo(() => presentesDoJogo(jogo, players), [jogo, players]);
}
