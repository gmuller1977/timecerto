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
 *
 * INSCRIÇÃO EM DUAS FASES (docs/telas-amador.md, decidido em 01/10/2026). Só
 * quando o jogo tem `promoverEm`; sem ele, a regra acima roda intacta.
 *
 * - Antes da promoção: mensalista que confirma tem vaga; convidado espera,
 *   na ordem de inscrição. Ninguém de fora entra ainda.
 * - Na promoção: mensalista sem resposta não segura vaga; os convidados
 *   sobem pela ordem de inscrição até encher.
 * - Depois, com a preferência acabando (padrão): ordem de chegada para
 *   todos. Mensalista que confirma depois da promoção entra na fila como
 *   qualquer um, e NUNCA derruba convidado já promovido.
 * - Com a preferência permanente: é a regra de sempre — o mensalista entra
 *   na frente, e o último convidado volta para o topo da fila.
 *
 * Nada de "quem foi promovido" é guardado: sai da hora da promoção e da hora
 * de cada resposta, a cada leitura. A cópia no banco (convidados_com_vaga,
 * migração 028) faz a mesma conta.
 */

/** A promoção de um jogo (migração 028). Sem `promoverEm`, não existe */
export interface Promocao {
  promoverEm?: string | null;
  /** Quando aconteceu de fato (pelo agendador, pela abertura do link, ou à mão) */
  promovidoEm?: string | null;
  preferenciaPermanente?: boolean;
}

/**
 * A partir de quando os convidados entram. null = ainda não (ou o jogo não
 * usa a promoção). Passada a hora marcada, vale mesmo que ninguém tenha
 * marcado ainda — a marca é para os avisos, não para a regra.
 */
export function momentoDaPromocao(p: Promocao | undefined, agora: Date = new Date()): string | null {
  if (!p?.promoverEm) return null;
  if (p.promovidoEm) return p.promovidoEm;
  return agora.getTime() >= new Date(p.promoverEm).getTime() ? p.promoverEm : null;
}

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

export function distribuirVagas(
  slots: number | null,
  respostas: Resposta[],
  promocao?: Promocao,
  agora: Date = new Date(),
): Distribuicao {
  // Sem promoção, ou com a preferência permanente já promovida: a regra de sempre
  if (promocao?.promoverEm) {
    const momento = momentoDaPromocao(promocao, agora);
    if (momento === null) return distribuirAntesDaPromocao(respostas);
    if (!promocao.preferenciaPermanente) return distribuirPorChegada(slots, respostas, momento);
  }
  return distribuirClassico(slots, respostas);
}

// Empate desempata pelo id, para a ordem nunca oscilar entre telas
const porChegada = (a: Resposta, b: Resposta) =>
  (a.ordem != null && b.ordem != null
    ? a.ordem - b.ordem
    : (a.answeredAt ?? '').localeCompare(b.answeredAt ?? '')) || a.id.localeCompare(b.id);

/** Respostas que não são 'vou' — iguais nas três fases */
function completarResto(situacao: Map<string, Situacao>, respostas: Resposta[]) {
  for (const r of respostas) {
    if (situacao.has(r.id)) continue;
    situacao.set(
      r.id,
      r.status === 'nao_vou' ? { tipo: 'nao_vou' } : r.status === 'pulado' ? { tipo: 'pulado' } : { tipo: 'sem_resposta' },
    );
  }
}

/** Espera e chamados da lista FECHADA (migração 015) — iguais nas três fases */
function esperaEChamados(situacao: Map<string, Situacao>, respostas: Resposta[]) {
  const chamados = respostas.filter((r) => r.status === 'chamado');
  for (const r of chamados) situacao.set(r.id, { tipo: 'chamado', desde: r.chamadoEm ?? null });
  const espera = respostas
    .filter((r) => r.status === 'espera')
    .sort(
      (a, b) =>
        Number(a.kind === 'convidado') - Number(b.kind === 'convidado') ||
        (a.esperaDesde ?? a.answeredAt ?? '').localeCompare(b.esperaDesde ?? b.answeredAt ?? '') ||
        a.id.localeCompare(b.id),
    );
  espera.forEach((r, i) => situacao.set(r.id, { tipo: 'espera', posicao: i + 1 }));
  return { chamados: chamados.length, espera: espera.length };
}

/**
 * Fase 1: só mensalista tem vaga. O convidado se inscreve e espera, com a
 * posição que vai ter na promoção.
 */
function distribuirAntesDaPromocao(respostas: Resposta[]): Distribuicao {
  const situacao = new Map<string, Situacao>();
  const mensalistas = respostas.filter((r) => r.kind === 'mensalista' && r.status === 'vou');
  for (const r of mensalistas) situacao.set(r.id, { tipo: 'confirmado' });
  const { chamados, espera } = esperaEChamados(situacao, respostas);
  const convidados = respostas.filter((r) => r.kind === 'convidado' && r.status === 'vou').sort(porChegada);
  convidados.forEach((r, i) => situacao.set(r.id, { tipo: 'fila', posicao: i + 1 }));
  completarResto(situacao, respostas);
  return {
    situacao,
    mensalistasConfirmados: mensalistas.length,
    convidadosComVaga: 0,
    naFila: convidados.length,
    naEspera: espera,
    chamados,
    // Antes da promoção não há vaga livre para quem é de fora
    livres: 0,
  };
}

/**
 * Fase 2 com a preferência acabando: quem confirmou ANTES da promoção segue na
 * frente (os mensalistas); depois, uma fila só por ordem de chegada — os
 * convidados inscritos antes (que sobem na promoção) e quem chegou depois,
 * de qualquer tipo. Como a fila só anda para a frente, convidado promovido
 * nunca é derrubado.
 */
function distribuirPorChegada(slots: number | null, respostas: Resposta[], momento: string): Distribuicao {
  const situacao = new Map<string, Situacao>();
  const t = new Date(momento).getTime();
  const antes = (r: Resposta) => r.answeredAt == null || new Date(r.answeredAt).getTime() <= t;

  const fixos = respostas.filter((r) => r.kind === 'mensalista' && r.status === 'vou' && antes(r));
  for (const r of fixos) situacao.set(r.id, { tipo: 'confirmado' });
  const { chamados, espera } = esperaEChamados(situacao, respostas);

  const fila = respostas
    .filter((r) => r.status === 'vou' && !(r.kind === 'mensalista' && antes(r)))
    .sort(porChegada);
  const cabem = slots == null ? Infinity : Math.max(0, slots - fixos.length - chamados);
  let mensalistas = fixos.length;
  let convidados = 0;
  fila.forEach((r, i) => {
    if (i < cabem) {
      situacao.set(r.id, r.kind === 'mensalista' ? { tipo: 'confirmado' } : { tipo: 'vaga' });
      if (r.kind === 'mensalista') mensalistas++;
      else convidados++;
    } else situacao.set(r.id, { tipo: 'fila', posicao: i - cabem + 1 });
  });
  completarResto(situacao, respostas);
  const entraram = Math.min(fila.length, cabem);
  return {
    situacao,
    mensalistasConfirmados: mensalistas,
    convidadosComVaga: convidados,
    naFila: fila.length - entraram,
    naEspera: espera,
    chamados,
    livres: slots == null ? null : Math.max(0, slots - fixos.length - entraram - chamados),
  };
}

/** A regra de sempre (e a da preferência permanente depois da promoção) */
function distribuirClassico(slots: number | null, respostas: Resposta[]): Distribuicao {
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
export function vagasDoJogo(jogo: Jogo, players: Player[], agora: Date = new Date()): Distribuicao {
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
    { promoverEm: jogo.promoverEm ?? null, promovidoEm: jogo.promovidoEm ?? null, preferenciaPermanente: jogo.preferenciaPermanente },
    agora,
  );
}
