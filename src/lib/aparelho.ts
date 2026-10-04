/**
 * O número deste celular nos links (migração 030). Aleatório, nasce na
 * primeira resposta e fica no aparelho: é o que trava um nome no celular que
 * respondeu por ele primeiro, naquele jogo. Não identifica ninguém — só diz
 * "foi o mesmo celular" ou "foi outro".
 *
 * Sem `localStorage` (navegação privada), vale um número por abertura: a
 * pessoa responde normalmente, só não consegue mudar depois de fechar.
 */
const CHAVE = 'timecerto:aparelho';
let daSessao: string | null = null;

export function meuAparelho(): string {
  try {
    const salvo = localStorage.getItem(CHAVE);
    if (salvo) return salvo;
    const novo = crypto.randomUUID();
    localStorage.setItem(CHAVE, novo);
    return novo;
  } catch {
    daSessao ??= crypto.randomUUID();
    return daSessao;
  }
}
