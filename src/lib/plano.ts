/**
 * Plano grátis e plano pago (migração 021, decidido pelo Guilherme em
 * 29/09/2026). O plano é do GRUPO; o pago libera o Financeiro, mais de um
 * administrador e mais de 20 mensalistas. Todo grupo começa com 30 dias do
 * pago. Quando acaba, nada se perde, só trava.
 *
 * Quem garante as travas é o banco; aqui mora só o que a tela precisa para
 * explicar e esconder o botão antes de o banco dizer não.
 */

export const LIMITE_MENSALISTAS_GRATIS = 20;
export const PRECO_DO_PLANO_CENTS = 1490;
/** VIP (migração 037): tudo do Pago + o modo profissional */
export const PRECO_DO_VIP_CENTS = 2490;

export interface PlanoDoGrupo {
  testeAte: string | null;
  pagoAte: string | null;
  cortesia: boolean;
  /** VIP pago até (migração 037) */
  vipAte?: string | null;
  /** Fim do teste VIP da conta do dono — só no time profissional */
  vipTesteAte?: string | null;
  /** O grupo é um time profissional: só o VIP libera */
  pro?: boolean;
}

export interface SituacaoDoPlano {
  tipo: 'cortesia' | 'vip' | 'teste_vip' | 'pago' | 'teste' | 'gratis';
  /** Tudo liberado */
  premium: boolean;
  /** Até quando vale (pago ou teste) */
  ate: string | null;
  /** Dias que faltam, arredondados para cima (pago ou teste) */
  dias: number | null;
}

export function situacaoDoPlano(p: PlanoDoGrupo, agora = new Date()): SituacaoDoPlano {
  const faltam = (iso: string) => Math.ceil((new Date(iso).getTime() - agora.getTime()) / 86_400_000);
  if (p.cortesia) return { tipo: 'cortesia', premium: true, ate: null, dias: null };
  if (p.vipAte && new Date(p.vipAte) > agora) return { tipo: 'vip', premium: true, ate: p.vipAte, dias: faltam(p.vipAte) };
  // Time profissional: só o VIP libera — o Pago e o teste do Pago não contam
  if (p.pro) {
    return p.vipTesteAte && new Date(p.vipTesteAte) > agora
      ? { tipo: 'teste_vip', premium: true, ate: p.vipTesteAte, dias: faltam(p.vipTesteAte) }
      : { tipo: 'gratis', premium: false, ate: null, dias: null };
  }
  if (p.pagoAte && new Date(p.pagoAte) > agora) return { tipo: 'pago', premium: true, ate: p.pagoAte, dias: faltam(p.pagoAte) };
  if (p.testeAte && new Date(p.testeAte) > agora) return { tipo: 'teste', premium: true, ate: p.testeAte, dias: faltam(p.testeAte) };
  return { tipo: 'gratis', premium: false, ate: null, dias: null };
}

/**
 * Cabe mais mensalista? Devolve o aviso quando não cabe, ou null. Conta como
 * o banco: mensalista aprovado (o pendente não conta, o convidado nunca).
 */
export function avisoDeLimite(premium: boolean, mensalistasAtuais: number, novos = 1): string | null {
  if (premium || novos <= 0 || mensalistasAtuais + novos <= LIMITE_MENSALISTAS_GRATIS) return null;
  return `O plano grátis vai até ${LIMITE_MENSALISTAS_GRATIS} mensalistas, e o grupo já tem ${mensalistasAtuais}. Convidados não contam. Para ter mais, veja Ajustes › Plano.`;
}
