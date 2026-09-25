import type { ConfirmacaoStatus, Jogo, Player, SportId } from '@/types';
import { uid } from '@/lib/utils';

/**
 * Regras do Jogo, puras — o store (useJogoStore) só aplica. Ficam aqui para
 * poderem ser provadas num script, sem React nem localStorage.
 */

/** Hoje, AAAA-MM-DD no fuso do aparelho (toISOString daria o dia em UTC) */
export function hoje(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function novoJogo(input: {
  sport: SportId;
  date: string;
  time: string;
  place: string;
  vagas: number | null;
  remoteId?: string;
  migrado?: boolean;
}): Jogo {
  return {
    id: uid(),
    status: 'aberto',
    confirmations: [],
    createdAt: new Date().toISOString(),
    ...input,
  };
}

const proximoSeq = (jogo: Jogo) =>
  jogo.confirmations.reduce((max, c) => Math.max(max, c.seq), 0) + 1;

/**
 * Registra uma resposta. Repetir a mesma resposta não muda nada — nem a hora
 * nem o `seq`: apertar "vou" de novo não pode mandar ninguém para o fim da
 * fila. Mudar a resposta muda a hora; passar a confirmado ganha `seq` novo,
 * que é a ordem de chegada. É a mesma regra do `answered_at` na nuvem.
 */
export function responder(
  jogo: Jogo,
  playerId: string,
  status: ConfirmacaoStatus,
  origem: 'organizador' | 'link',
  at: string = new Date().toISOString(),
): Jogo {
  const atual = jogo.confirmations.find((c) => c.playerId === playerId);
  if (atual?.status === status) return jogo;
  const seq = status === 'confirmado' ? proximoSeq(jogo) : (atual?.seq ?? 0);
  // O que veio do link já está na nuvem; o toque do organizador ainda vai
  const nova = { playerId, status, at, seq, origem, ...(origem === 'link' ? { enviadoEm: at } : {}) };
  return {
    ...jogo,
    confirmations: atual
      ? jogo.confirmations.map((c) => (c.playerId === playerId ? nova : c))
      : [...jogo.confirmations, nova],
  };
}

/**
 * Traz respostas dos links. Vale a mais recente: se o organizador mexeu na
 * pessoa depois da resposta dela, o toque dele fica. Aplicadas em ordem de
 * hora, então o `seq` de quem veio pelo link segue a ordem das respostas.
 */
export function importarRespostas(
  jogo: Jogo,
  respostas: { playerId: string; status: ConfirmacaoStatus; at: string }[],
): Jogo {
  return [...respostas]
    .sort((a, b) => a.at.localeCompare(b.at))
    .reduce((j, r) => {
      const atual = j.confirmations.find((c) => c.playerId === r.playerId);
      if (atual && atual.at >= r.at) return j;
      return responder(j, r.playerId, r.status, 'link', r.at);
    }, jogo);
}

/**
 * Respostas do organizador que ainda não estão na nuvem. Só as dele: o que
 * veio do link já está lá.
 */
export function pendentesDeEnvio(jogo: Jogo) {
  return jogo.confirmations.filter((c) => c.origem === 'organizador' && c.enviadoEm !== c.at);
}

/**
 * Acrescenta um jogo. Vários ficam programados ao mesmo tempo (pedido do
 * Guilherme em 24/09/2026) — abrir um novo não encerra mais o anterior.
 */
export function abrirJogo(jogos: Jogo[], jogo: Jogo): Jogo[] {
  return [jogo, ...jogos].slice(0, 200);
}

/** Quando o jogo começa, em ms */
export const inicioDo = (j: Jogo) => new Date(`${j.date}T${j.time}`).getTime();

/** Janela em que o jogo de hoje continua sendo "o próximo": 12 h depois do início */
export const JANELA_PROXIMO_MS = 12 * 3600 * 1000;

/**
 * O próximo jogo: o mais cedo ainda programado, a partir de 12 h atrás. É a
 * MESMA regra que o link do WhatsApp usa (guest_group, migração 013) — a tela
 * e o link não podem discordar sobre qual jogo está recebendo respostas.
 */
export function proximoJogo(jogos: Jogo[], agora = Date.now()): Jogo | null {
  return (
    jogos
      .filter((j) => j.status === 'aberto' && inicioDo(j) >= agora - JANELA_PROXIMO_MS)
      .sort((a, b) => inicioDo(a) - inicioDo(b))[0] ?? null
  );
}

/** O que o cartão e o filtro dizem de um jogo. Derivado, nunca guardado */
export type StatusDoJogo =
  | 'recebendo'
  | 'lista_fechada'
  | 'em_jogo'
  | 'agendado'
  | 'sem_encerrar'
  | 'encerrado'
  | 'cancelado';

export const ROTULO_STATUS: Record<StatusDoJogo, string> = {
  recebendo: 'Recebendo inscrições',
  lista_fechada: 'Lista fechada',
  em_jogo: 'Em jogo',
  agendado: 'Agendado',
  sem_encerrar: 'Não encerrado',
  encerrado: 'Encerrado',
  cancelado: 'Cancelado',
};

/**
 * O status de um jogo, na ordem em que as perguntas importam:
 * - cancelado e encerrado são o que o organizador disse;
 * - com partida ao vivo, está em jogo;
 * - o PRÓXIMO recebe inscrições (links e toques) até a lista fechar;
 * - os outros programados esperam a vez: agendados;
 * - passou da janela de 12 h sem ninguém encerrar: não encerrado.
 */
export function statusDoJogo(
  jogo: Jogo,
  ctx: { proximoId: string | null; jogoAoVivo: string | null; agora?: number },
): StatusDoJogo {
  if (jogo.status === 'cancelado') return 'cancelado';
  if (jogo.status === 'encerrado') return 'encerrado';
  if (ctx.jogoAoVivo === jogo.id) return 'em_jogo';
  if (ctx.proximoId === jogo.id) return jogo.listaFechada ? 'lista_fechada' : 'recebendo';
  return inicioDo(jogo) >= (ctx.agora ?? Date.now()) - JANELA_PROXIMO_MS ? 'agendado' : 'sem_encerrar';
}

// ── Migração do antigo `present` ────────────────────────────

/** O jogador como estava gravado antes: ainda com o booleano */
type JogadorAntigo = Player & { present?: boolean };

export interface EstadoMigracao {
  jogos: Jogo[];
  migracoes: { present?: string };
}

/**
 * Quem tinha `present: true` continua confirmado: na primeira carga, sem jogo
 * aberto e com gente presente, nasce o Jogo de hoje com uma confirmação por
 * presente. Roda uma vez só — a marca em `migracoes.present` impede a segunda.
 *
 * Vagas vêm SEM limite de propósito: antes não havia limite, e um limite
 * inventado agora mandaria convidado que estava na lista para a fila.
 * O `seq` segue a ordem de cadastro, a única informação que existe; só pesa
 * na fila, que sem limite não existe.
 *
 * A hora das confirmações migradas é o início dos tempos, de propósito: vale
 * a resposta mais recente entre o organizador e o link, e o `present` antigo
 * não pode vencer — nem sobrescrever na nuvem — um "não vou" que a pessoa
 * deu de verdade pelo link.
 *
 * Pendente de aprovação não é convertido: nunca podia jogar.
 */
export function migrarPresent(
  estado: EstadoMigracao,
  players: JogadorAntigo[],
  sport: SportId,
  agora = new Date(),
): EstadoMigracao {
  if (estado.migracoes.present) return estado;
  const quando = agora.toISOString();
  const marcado = { ...estado.migracoes, present: quando };

  const presentes = players
    .filter((p) => p.present && !p.pending)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const temAberto = estado.jogos.some((j) => j.status === 'aberto');
  if (temAberto || presentes.length === 0) return { ...estado, migracoes: marcado };

  const jogo: Jogo = {
    ...novoJogo({ sport, date: hoje(agora), time: '20:00', place: '', vagas: null, migrado: true }),
    confirmations: presentes.map((p, i) => ({
      playerId: p.id,
      status: 'confirmado',
      at: new Date(0).toISOString(),
      seq: i + 1,
      origem: 'organizador',
    })),
  };
  return { jogos: abrirJogo(estado.jogos, jogo), migracoes: marcado };
}

/** Tira o booleano antigo dos jogadores, depois de migrado */
export function semPresent<T extends JogadorAntigo>(players: T[]): Player[] {
  return players.map((p) => {
    if (!('present' in p)) return p;
    const { present: _, ...resto } = p;
    return resto;
  });
}
