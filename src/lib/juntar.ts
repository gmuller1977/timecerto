import type { Player, SportId } from '@/types';

/**
 * "É a mesma pessoa": um pedido do link de cadastro que o administrador junta
 * a um jogador que já está em Atletas, em vez de criar outro.
 *
 * A junção NUNCA é automática. Se o link juntasse sozinho pelo nome, qualquer
 * um com o link escreveria telefone e nascimento no cadastro de outra pessoa
 * só digitando o nome dela. Aqui o app só sugere; quem decide é o
 * administrador, na aprovação.
 */

/** Minúsculas, sem acento, espaços normalizados: "  Fábio  COSTA" → "fabio costa" */
export function normalizar(s: string | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export type Motivo = 'mesmo telefone' | 'mesmo nome' | 'mesmo apelido' | 'nome parecido';

export interface Candidato {
  player: Player;
  motivo: Motivo;
}

const FORCA: Record<Motivo, number> = {
  'mesmo telefone': 0,
  'mesmo nome': 1,
  'mesmo apelido': 2,
  'nome parecido': 3,
};

/** "ana" está inteiro em "ana lima"? Por palavras, não por pedaço de palavra */
function contidoPorPalavras(curto: string, longo: string): boolean {
  if (!curto || curto === longo) return false;
  return ` ${longo} `.includes(` ${curto} `);
}

/**
 * Quem em Atletas pode ser a mesma pessoa do pedido, do indício mais forte
 * para o mais fraco. No máximo três: mais que isso não ajuda a decidir.
 *
 * "Nome parecido" pede o nome INTEIRO de um dentro do outro ("Ana" em "Ana
 * Lima"), nunca só o primeiro nome dos dois — duas Anas diferentes no grupo
 * é o caso comum, e sugerir junção entre elas seria perigoso.
 */
export function candidatosParaJuntar(pedido: Player, players: Player[]): Candidato[] {
  const nome = normalizar(pedido.name);
  const apelido = normalizar(pedido.nickname);
  const fone = pedido.phone?.replace(/\D/g, '');

  const achados: Candidato[] = [];
  for (const p of players) {
    if (p.id === pedido.id || p.pending) continue;
    const pNome = normalizar(p.name);
    const pApelido = normalizar(p.nickname);
    const pFone = p.phone?.replace(/\D/g, '');

    let motivo: Motivo | null = null;
    if (fone && pFone && fone === pFone) motivo = 'mesmo telefone';
    else if (nome && nome === pNome) motivo = 'mesmo nome';
    else if (
      (apelido && (apelido === pApelido || apelido === pNome)) ||
      (pApelido && pApelido === nome)
    )
      motivo = 'mesmo apelido';
    else if (contidoPorPalavras(nome, pNome) || contidoPorPalavras(pNome, nome))
      motivo = 'nome parecido';

    if (motivo) achados.push({ player: p, motivo });
  }
  return achados.sort((a, b) => FORCA[a.motivo] - FORCA[b.motivo]).slice(0, 3);
}

/**
 * O que passa do pedido para o cadastro existente.
 *
 * - Nascimento, telefone e apelido: vale o do pedido quando ele trouxe — foi
 *   a própria pessoa quem preencheu.
 * - Nome: o do pedido só se for MAIS completo ("Ana" vira "Ana Lima"). Nome
 *   diferente fica o do administrador.
 * - Nível e posição: continuam os do administrador — é o que o sorteio usa, e
 *   o do pedido é sugestão. Só entram se ele não tinha nenhum.
 * - Tipo (mensalista/convidado) e id da nuvem: nunca mudam.
 */
export function dadosDaJuncao(alvo: Player, pedido: Player, sport: SportId): Partial<Player> {
  const patch: Partial<Player> = {};
  if (pedido.birthDate) patch.birthDate = pedido.birthDate;
  if (pedido.phone) patch.phone = pedido.phone;
  if (pedido.nickname?.trim()) patch.nickname = pedido.nickname.trim();
  if (contidoPorPalavras(normalizar(alvo.name), normalizar(pedido.name))) patch.name = pedido.name.trim();
  if (alvo.skills[sport] == null && pedido.skills[sport] != null) {
    patch.skills = { ...alvo.skills, [sport]: pedido.skills[sport] };
  }
  if (!alvo.positions[sport] && pedido.positions[sport]) {
    patch.positions = { ...alvo.positions, [sport]: pedido.positions[sport] };
  }
  return patch;
}
