import type { ConfirmacaoStatus, Jogo, Player, PlayerKind } from '@/types';

/**
 * Quem joga, quem espera. Regra decidida pelo Guilherme em 23/09/2026:
 *
 * - mensalista que confirma SEMPRE joga, mesmo que passe das vagas;
 * - convidado entra numa fila por ordem de resposta e só ganha vaga se
 *   sobrar depois dos mensalistas;
 * - sem número de vagas, todo mundo que confirma joga.
 *
 * Com a lista ABERTA, a fila não é guardada em lugar nenhum: sai daqui, a
 * cada leitura. Um mensalista desiste e o primeiro da fila entra sozinho.
 *
 * Com a lista FECHADA (migração 015), a fila vira ESPERA e é guardada: quem
 * está nela precisa confirmar quando for chamado. Quem chama é o banco; aqui
 * só se lê o estado — `espera`, `chamado` (vaga reservada, esperando a
 * resposta) e `pulado` (o administrador passou a vez).
 *
 * É a ÚNICA implementação da regra. A tela do organizador, o link dos
 * mensalistas e o link de convidados chamam esta função — três contas
 * separadas acabariam dizendo "você tem vaga" num lugar e "fila" no outro.
 */

export interface Resposta {
  id: string;
  kind: PlayerKind;
  status: 'vou' | 'nao_vou' | 'espera' | 'chamado' | 'pulado' | null;
  /** ISO. Só importa para a ordem da fila dos convidados */
  answeredAt: string | null;
  /** ISO. Ordem da espera (lista fechada) */
  esperaDesde?: string | null;
  /** ISO. Quando foi chamado da espera */
  chamadoEm?: string | null;
  /**
   * Ordem de chegada (`Confirmacao.seq`). Quando existe, é ela que ordena a
   * fila; os links, que só conhecem `answeredAt`, não passam este campo.
   */
  ordem?: number;
}

export type Situacao =
  | { tipo: 'confirmado' } // mensalista que vai
  | { tipo: 'vaga' } // convidado que entrou
  | { tipo: 'fila'; posicao: number } // convidado esperando (1 = próximo)
  | { tipo: 'espera'; posicao: number } // lista fechada, esperando ser chamado
  | { tipo: 'chamado'; desde: string | null } // abriu vaga; falta ele confirmar
  | { tipo: 'pulado' } // o administrador passou a vez
  | { tipo: 'nao_vou' }
  | { tipo: 'sem_resposta' };

export interface Distribuicao {
  situacao: Map<string, Situacao>;
  mensalistasConfirmados: number;
  convidadosComVaga: number;
  naFila: number;
  /** Lista fechada: quantos esperam, e quantos foram chamados */
  naEspera: number;
  chamados: number;
  /** Vagas ainda livres; null = sem limite. A vaga do chamado não está livre */
  livres: number | null;
}

export function distribuirVagas(slots: number | null, respostas: Resposta[]): Distribuicao {
  const situacao = new Map<string, Situacao>();

  const mensalistas = respostas.filter((r) => r.kind === 'mensalista' && r.status === 'vou');
  for (const r of mensalistas) situacao.set(r.id, { tipo: 'confirmado' });

  // Empate desempata pelo id, para a ordem nunca oscilar entre telas
  const convidados = respostas
    .filter((r) => r.kind === 'convidado' && r.status === 'vou')
    .sort(
      (a, b) =>
        (a.ordem != null && b.ordem != null
          ? a.ordem - b.ordem
          : (a.answeredAt ?? '').localeCompare(b.answeredAt ?? '')) || a.id.localeCompare(b.id),
    );

  // A vaga do chamado está reservada para ele
  const chamados = respostas.filter((r) => r.status === 'chamado');
  for (const r of chamados) situacao.set(r.id, { tipo: 'chamado', desde: r.chamadoEm ?? null });

  // Mensalista antes de convidado, depois por ordem de entrada — a mesma do banco
  const espera = respostas
    .filter((r) => r.status === 'espera')
    .sort(
      (a, b) =>
        Number(a.kind === 'convidado') - Number(b.kind === 'convidado') ||
        (a.esperaDesde ?? a.answeredAt ?? '').localeCompare(b.esperaDesde ?? b.answeredAt ?? '') ||
        a.id.localeCompare(b.id),
    );
  espera.forEach((r, i) => situacao.set(r.id, { tipo: 'espera', posicao: i + 1 }));

  const cabem = slots == null ? Infinity : Math.max(0, slots - mensalistas.length - chamados.length);
  convidados.forEach((r, i) => {
    situacao.set(r.id, i < cabem ? { tipo: 'vaga' } : { tipo: 'fila', posicao: i - cabem + 1 });
  });

  for (const r of respostas) {
    if (situacao.has(r.id)) continue;
    situacao.set(
      r.id,
      r.status === 'nao_vou'
        ? { tipo: 'nao_vou' }
        : r.status === 'pulado'
          ? { tipo: 'pulado' }
          : { tipo: 'sem_resposta' },
    );
  }

  const comVaga = Math.min(convidados.length, cabem);
  return {
    situacao,
    mensalistasConfirmados: mensalistas.length,
    convidadosComVaga: comVaga,
    naFila: convidados.length - comVaga,
    naEspera: espera.length,
    chamados: chamados.length,
    livres: slots == null ? null : Math.max(0, slots - mensalistas.length - comVaga - chamados.length),
  };
}

/** A resposta do aparelho no vocabulário da regra (e da nuvem) */
const STATUS_DA_NUVEM: Record<ConfirmacaoStatus, Resposta['status']> = {
  confirmado: 'vou',
  recusado: 'nao_vou',
  'sem-resposta': null,
  espera: 'espera',
  chamado: 'chamado',
  pulado: 'pulado',
};

/** Joga neste jogo? É o que decide a lista de presença do sorteio */
export function joga(s: Situacao | undefined): boolean {
  return s?.tipo === 'confirmado' || s?.tipo === 'vaga';
}

/**
 * A mesma regra, lida do Jogo do aparelho: vagas do jogo, confirmações e a
 * ordem de chegada (`seq`). Situação por id LOCAL do jogador. Pendente de
 * aprovação não joga e não entra.
 */
export function vagasDoJogo(jogo: Jogo, players: Player[]): Distribuicao {
  const porJogador = new Map(jogo.confirmations.map((c) => [c.playerId, c]));
  return distribuirVagas(
    jogo.vagas,
    players
      .filter((p) => !p.pending)
      .map((p) => {
        const c = porJogador.get(p.id);
        return {
          id: p.id,
          kind: p.kind ?? 'mensalista',
          status: STATUS_DA_NUVEM[c?.status ?? 'sem-resposta'],
          answeredAt: c?.at ?? null,
          esperaDesde: c?.esperaDesde ?? null,
          chamadoEm: c?.chamadoEm ?? null,
          ordem: c?.seq,
        };
      }),
  );
}
