import { encaixarNoSorteio } from '@/lib/draw';
import { joga, vagasDoJogo } from '@/lib/vagas';
import type { Jogo, Match, Player } from '@/types';

/**
 * O dia de jogo no amador (pedido do Guilherme em 05/10/2026). Na tela,
 * `Jogo` é "o dia" e `Match` é "o jogo"; o código não muda de nome.
 */

/** Algum jogo (Match) deste dia já foi jogado? */
export function diaJaTeveJogo(dia: Jogo, matches: Match[]): boolean {
  return matches.some((m) => m.jogoId === dia.id);
}

/**
 * Sortear os times só vale ANTES do primeiro jogo do dia, com o dia aberto.
 * Depois, os times só mudam pelo cartão "A lista mudou" (`pelaLista`) — senão
 * um toque em "Sortear" no meio do dia desfazia os times de quem já jogou.
 * Dia encerrado ou cancelado não sorteia nunca.
 */
export function podeSortear(dia: Jogo, matches: Match[], pelaLista = false): boolean {
  if (dia.status !== 'aberto') return false;
  return pelaLista || !diaJaTeveJogo(dia, matches);
}

/**
 * O ajuste dos times quando a lista mudou depois do sorteio: quem entra, quem
 * sai, e o sorteio já com as trocas. Null quando nada mudou. É a mesma conta
 * do cartão "A lista mudou" e do "Ajustar times" no fim de um jogo.
 */
export function planoDeAjuste(dia: Jogo, players: Player[]) {
  if (!dia.sorteio) return null;
  const dist = vagasDoJogo(dia, players);
  const jogando = players.filter((p) => joga(dist.situacao.get(p.id)));
  const vagaDe = new Map(dia.confirmations.map((c) => [c.playerId, c.vagaDe]));
  return encaixarNoSorteio(dia.sorteio, jogando, (id) => vagaDe.get(id));
}
