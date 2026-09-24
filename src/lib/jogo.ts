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
  const nova = { playerId, status, at, seq, origem };
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

/** Abre um jogo: o aberto anterior, se houver, é encerrado */
export function abrirJogo(jogos: Jogo[], jogo: Jogo): Jogo[] {
  return [
    jogo,
    ...jogos.map((j) => (j.status === 'aberto' ? { ...j, status: 'encerrado' as const } : j)),
  ].slice(0, 30);
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
      at: quando,
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
