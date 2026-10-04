/**
 * Financeiro (migração 017) — as contas, puras: nada aqui fala com o banco.
 *
 * Dinheiro SEMPRE em centavos inteiros (number, mas nunca fracionário). Nenhuma
 * conta intermediária usa reais com vírgula.
 */

export interface Cobranca {
  id: string;
  playerId: string;
  tipo: 'mensalidade' | 'diaria' | 'avulsa';
  descricao: string;
  valorCents: number;
  /** AAAA-MM-DD */
  venceEm: string;
  canceladaEm: string | null;
  criadaEm: string;
}

export interface Pagamento {
  id: string;
  playerId: string;
  /** Negativo = estorno */
  valorCents: number;
  metodo: 'pix' | 'dinheiro';
  /** AAAA-MM-DD */
  pagoEm: string;
  estornoDe: string | null;
  criadoEm: string;
}

export interface Despesa {
  id: string;
  descricao: string;
  /** Negativo = estorno */
  valorCents: number;
  /** AAAA-MM-DD */
  gastoEm: string;
  estornoDe: string | null;
  criadoEm: string;
}

// ── Valores digitados ──

/**
 * "80" · "80,5" · "80,50" · "1.234,56" · "R$ 25" → centavos. Vazio ou
 * inválido → null. Aceita ponto como milhar só no formato brasileiro; "80.50"
 * (ponto decimal) também vale, porque é o que sai de teclado numérico.
 */
export function reaisParaCentavos(texto: string): number | null {
  let s = texto.replace(/R\$\s?/i, '').replace(/\s/g, '').trim();
  if (!s) return null;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d+(,\d{1,2})?$/.test(s)) s = s.replace(',', '.');
  else if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [inteiro, frac = ''] = s.split('.');
  const cents = Number(inteiro) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Como `reaisParaCentavos`, aceitando sinal: "-150,00" → -15000 */
export function reaisComSinalParaCentavos(texto: string): number | null {
  const t = texto.trim();
  const negativo = t.startsWith('-');
  const c = reaisParaCentavos(negativo ? t.slice(1) : t);
  return c == null ? null : negativo ? -c : c;
}

/** 8000 → "80,00" — para preencher um campo de valor */
export function centavosParaCampo(cents: number | null | undefined): string {
  if (cents == null) return '';
  return (cents / 100).toFixed(2).replace('.', ',');
}

// ── Quem deve ──

export interface SaldoDoJogador {
  playerId: string;
  /** Soma das cobranças não canceladas */
  cobradoCents: number;
  /** Soma dos pagamentos, com os estornos descontados */
  pagoCents: number;
  /** cobrado − pago. Positivo = deve; negativo = tem crédito */
  saldoCents: number;
  /**
   * As cobranças ainda em aberto, da mais antiga para a mais nova, com quanto
   * falta de cada uma. O pagamento abate a mais antiga primeiro — é o que a
   * tela mostra, sem precisar ligar pagamento a cobrança no banco.
   */
  abertas: { cobranca: Cobranca; faltaCents: number }[];
}

const ordemDeCobranca = (a: Cobranca, b: Cobranca) =>
  a.venceEm.localeCompare(b.venceEm) || a.criadaEm.localeCompare(b.criadaEm) || a.id.localeCompare(b.id);

export function saldosPorJogador(cobrancas: Cobranca[], pagamentos: Pagamento[]): Map<string, SaldoDoJogador> {
  const saldos = new Map<string, SaldoDoJogador>();
  const de = (id: string) => {
    let s = saldos.get(id);
    if (!s) {
      s = { playerId: id, cobradoCents: 0, pagoCents: 0, saldoCents: 0, abertas: [] };
      saldos.set(id, s);
    }
    return s;
  };
  const validas = cobrancas.filter((c) => !c.canceladaEm).sort(ordemDeCobranca);
  for (const c of validas) de(c.playerId).cobradoCents += c.valorCents;
  for (const p of pagamentos) de(p.playerId).pagoCents += p.valorCents;

  for (const s of saldos.values()) {
    s.saldoCents = s.cobradoCents - s.pagoCents;
    let credito = s.pagoCents;
    for (const c of validas) {
      if (c.playerId !== s.playerId) continue;
      const abate = Math.min(Math.max(credito, 0), c.valorCents);
      credito -= abate;
      if (c.valorCents - abate > 0) s.abertas.push({ cobranca: c, faltaCents: c.valorCents - abate });
    }
  }
  return saldos;
}

/**
 * Quanto do que está em aberto já VENCEU (vence_em antes de `hoje`,
 * AAAA-MM-DD). A mensalidade do dia 10 não pesa contra ninguém no dia 5
 * (pedido do Guilherme em 05/10/2026).
 */
export function vencidoCents(s: SaldoDoJogador, hoje: string): number {
  return s.abertas.filter((a) => a.cobranca.venceEm < hoje).reduce((t, a) => t + a.faltaCents, 0);
}

/** Quem deve, do maior valor para o menor */
export function quemDeve(saldos: Map<string, SaldoDoJogador>): SaldoDoJogador[] {
  return [...saldos.values()].filter((s) => s.saldoCents > 0).sort((a, b) => b.saldoCents - a.saldoCents);
}

// ── O mês ──

export interface ResumoDoMes {
  recebidoCents: number;
  despesasCents: number;
  /** recebido − despesas */
  saldoCents: number;
  /** Tudo o que está em aberto, de qualquer mês */
  aReceberCents: number;
}

/** `mes` = 'AAAA-MM'. Estornos entram no mês em que foram feitos */
export function resumoDoMes(
  mes: string,
  pagamentos: Pagamento[],
  despesas: Despesa[],
  saldos: Map<string, SaldoDoJogador>,
): ResumoDoMes {
  const noMes = (data: string) => data.startsWith(mes);
  const recebidoCents = pagamentos.filter((p) => noMes(p.pagoEm)).reduce((s, p) => s + p.valorCents, 0);
  const despesasCents = despesas.filter((d) => noMes(d.gastoEm)).reduce((s, d) => s + d.valorCents, 0);
  const aReceberCents = [...saldos.values()].reduce((s, x) => s + Math.max(0, x.saldoCents), 0);
  return { recebidoCents, despesasCents, saldoCents: recebidoCents - despesasCents, aReceberCents };
}

// ── Em caixa ──

/**
 * Quanto há em caixa ao fim do dia `ate` (AAAA-MM-DD): o saldo inicial mais
 * o que entrou menos o que saiu, a partir da data do saldo inicial (migração
 * 018). O que aconteceu antes dessa data já está no saldo inicial e não entra.
 * Sem saldo inicial, conta desde o começo, a partir de zero.
 */
export function emCaixa(
  ate: string,
  inicial: { cents: number | null; em: string | null },
  pagamentos: Pagamento[],
  despesas: Despesa[],
): number {
  const desde = inicial.em ?? '';
  const dentro = (d: string) => d >= desde && d <= ate;
  const entrou = pagamentos.filter((p) => dentro(p.pagoEm)).reduce((s, p) => s + p.valorCents, 0);
  const saiu = despesas.filter((d) => dentro(d.gastoEm)).reduce((s, d) => s + d.valorCents, 0);
  return (inicial.cents ?? 0) + entrou - saiu;
}

/** Último dia do mês 'AAAA-MM', como AAAA-MM-DD */
export function fimDoMes(mes: string): string {
  const d = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0);
  return `${mes}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Pix copia e cola (BR Code estático, padrão do Banco Central) ──

/** Campo EMV: id de 2 dígitos + tamanho de 2 dígitos + valor */
const campo = (id: string, valor: string) => `${id}${String(valor.length).padStart(2, '0')}${valor}`;

/** Nome e cidade vão sem acento e sem símbolos: nem todo banco lê UTF-8 no BR Code */
function semAcento(s: string, max: number): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), como pede o BR Code */
export function crc16(texto: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(texto)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * O código que a pessoa cola no app do banco. Estático: não passa por banco
 * nenhum, é só o texto que diz "pague X para esta chave". Sem valor, o
 * pagador digita.
 */
export function pixCopiaECola(p: { chave: string; nome: string; cidade: string; valorCents?: number }): string {
  const conta = campo('00', 'br.gov.bcb.pix') + campo('01', p.chave.trim());
  let corpo =
    campo('00', '01') +
    campo('26', conta) +
    campo('52', '0000') +
    campo('53', '986') +
    (p.valorCents && p.valorCents > 0 ? campo('54', (p.valorCents / 100).toFixed(2)) : '') +
    campo('58', 'BR') +
    campo('59', semAcento(p.nome, 25) || 'RECEBEDOR') +
    campo('60', semAcento(p.cidade, 15) || 'BRASIL') +
    campo('62', campo('05', '***'));
  corpo += '6304';
  return corpo + crc16(corpo);
}
