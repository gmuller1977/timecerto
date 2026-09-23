import type { PlayerKind } from '@/types';

/**
 * Quem joga, quem espera. Regra decidida pelo Guilherme em 23/09/2026:
 *
 * - mensalista que confirma SEMPRE joga, mesmo que passe das vagas;
 * - convidado entra numa fila por ordem de resposta e só ganha vaga se
 *   sobrar depois dos mensalistas;
 * - sem número de vagas, todo mundo que confirma joga.
 *
 * A fila não é guardada em lugar nenhum: sai daqui, a cada leitura. Um
 * mensalista desiste e o primeiro da fila entra sozinho, sem ninguém mexer.
 *
 * É a ÚNICA implementação da regra. A tela do organizador, o link dos
 * mensalistas e o link de convidados chamam esta função — três contas
 * separadas acabariam dizendo "você tem vaga" num lugar e "fila" no outro.
 */

export interface Resposta {
  id: string;
  kind: PlayerKind;
  status: 'vou' | 'nao_vou' | null;
  /** ISO. Só importa para a ordem da fila dos convidados */
  answeredAt: string | null;
}

export type Situacao =
  | { tipo: 'confirmado' } // mensalista que vai
  | { tipo: 'vaga' } // convidado que entrou
  | { tipo: 'fila'; posicao: number } // convidado esperando (1 = próximo)
  | { tipo: 'nao_vou' }
  | { tipo: 'sem_resposta' };

export interface Distribuicao {
  situacao: Map<string, Situacao>;
  mensalistasConfirmados: number;
  convidadosComVaga: number;
  naFila: number;
  /** Vagas ainda livres; null = sem limite */
  livres: number | null;
}

export function distribuirVagas(slots: number | null, respostas: Resposta[]): Distribuicao {
  const situacao = new Map<string, Situacao>();

  const mensalistas = respostas.filter((r) => r.kind === 'mensalista' && r.status === 'vou');
  for (const r of mensalistas) situacao.set(r.id, { tipo: 'confirmado' });

  // Empate de horário desempata pelo id, para a ordem nunca oscilar entre telas
  const convidados = respostas
    .filter((r) => r.kind === 'convidado' && r.status === 'vou')
    .sort(
      (a, b) =>
        (a.answeredAt ?? '').localeCompare(b.answeredAt ?? '') || a.id.localeCompare(b.id),
    );

  const cabem = slots == null ? Infinity : Math.max(0, slots - mensalistas.length);
  convidados.forEach((r, i) => {
    situacao.set(r.id, i < cabem ? { tipo: 'vaga' } : { tipo: 'fila', posicao: i - cabem + 1 });
  });

  for (const r of respostas) {
    if (situacao.has(r.id)) continue;
    situacao.set(r.id, r.status === 'nao_vou' ? { tipo: 'nao_vou' } : { tipo: 'sem_resposta' });
  }

  const comVaga = Math.min(convidados.length, cabem);
  return {
    situacao,
    mensalistasConfirmados: mensalistas.length,
    convidadosComVaga: comVaga,
    naFila: convidados.length - comVaga,
    livres: slots == null ? null : Math.max(0, slots - mensalistas.length - comVaga),
  };
}

/** Joga neste jogo? É o que decide a lista de presença do sorteio */
export function joga(s: Situacao | undefined): boolean {
  return s?.tipo === 'confirmado' || s?.tipo === 'vaga';
}
