import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, MessageCircle, Plus, RotateCcw, Wallet, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/store/useAuth';
import {
  cancelarCobranca,
  estornarDespesa,
  estornarPagamento,
  findMyGroup,
  lancarAvulsa,
  lancarDespesa,
  lerFinanceiro,
  registrarPagamento,
  type CloudGroup,
  type DadosFinanceiros,
  type JogadorDoFinanceiro,
} from '@/lib/cloud';
import {
  centavosParaCampo,
  emCaixa,
  fimDoMes,
  pixCopiaECola,
  quemDeve,
  reaisParaCentavos,
  resumoDoMes,
  saldosPorJogador,
  type Cobranca,
  type SaldoDoJogador,
} from '@/lib/financeiro';
import { hoje } from '@/lib/jogo';
import { whatsappTo } from '@/lib/phone';
import { cn, formatBRL } from '@/lib/utils';
import { explain } from '@/components/cloud/partes';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const nomeDoMes = (mes: string) => {
  const m = MESES[Number(mes.slice(5, 7)) - 1];
  return `${m[0].toUpperCase()}${m.slice(1)} de ${mes.slice(0, 4)}`;
};
const moverMes = (mes: string, delta: number) => {
  const d = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
/** AAAA-MM-DD → DD/MM */
const dm = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;

/**
 * A data DA COBRANÇA, não o vencimento (pedido do Guilherme, 29/09/2026): a
 * mensalidade, o dia em que foi lançada; a diária, o dia do jogo; a avulsa, a
 * data escolhida ao lançar.
 */
function dataDaCobranca(c: Cobranca): string {
  if (c.tipo !== 'mensalidade') return c.venceEm;
  const d = new Date(c.criadaEm);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A cobrança de UMA pessoa: o que deve, e o Pix já com o valor dela */
function mensagemDeCobranca(saldo: SaldoDoJogador, nome: string, grupo: CloudGroup, dados: DadosFinanceiros): string {
  const c = dados.config;
  const hojeStr = hoje();
  const linhas = saldo.abertas.map(
    (a) =>
      `• ${a.cobranca.descricao} — ${formatBRL(a.faltaCents)}${a.cobranca.venceEm < hojeStr ? ` (venceu ${dm(a.cobranca.venceEm)})` : ` (vence ${dm(a.cobranca.venceEm)})`}`,
  );
  const pix =
    c.pixChave && c.pixNome && c.pixCidade
      ? `\n\nPix copia e cola (já com o valor):\n${pixCopiaECola({ chave: c.pixChave, nome: c.pixNome, cidade: c.pixCidade, valorCents: saldo.saldoCents })}`
      : c.pixChave
        ? `\n\nPix: ${c.pixChave}`
        : '';
  return `Oi, ${nome}! Passando para lembrar do ${grupo.name}:\n${linhas.join('\n')}\nTotal: ${formatBRL(saldo.saldoCents)}${pix}`;
}

/**
 * A cobrança no grupo da pelada: uma mensagem só, com todos. O Pix vai SEM
 * valor — cada um deve um valor diferente. Com `valores` desligado, só os
 * nomes: quem cobra decide, a cada vez, se expõe quanto cada um deve.
 */
function mensagemDoGrupo(devedores: SaldoDoJogador[], nome: (id: string) => string, grupo: CloudGroup, dados: DadosFinanceiros, valores: boolean): string {
  // Uma linha por cobrança em aberto: nome — descrição — data da cobrança — o que falta (pedido do Guilherme, 29/09/2026)
  const lista = valores
    ? devedores
        .flatMap((d) =>
          d.abertas.map(
            (a) => `• ${nome(d.playerId)} — ${a.cobranca.descricao} — ${dm(dataDaCobranca(a.cobranca))} — ${formatBRL(a.faltaCents)}`,
          ),
        )
        .join('\n')
    : `Ainda falta acertar: ${devedores.map((d) => nome(d.playerId)).join(', ')}.`;
  const pix = dados.config.pixChave ? `\n\nPix: ${dados.config.pixChave}` : '';
  return `⚡ ${grupo.name} · pendências\n${lista}${pix}\n\nQuem já pagou, desconsidere. 🙏`;
}

function abrirWhatsApp(texto: string, phone?: string | null) {
  const destino = phone ? whatsappTo(phone) : 'https://wa.me/';
  window.open(`${destino}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
}

/**
 * Aba Financeiro (migração 017, desenho aprovado pelo Guilherme em
 * 29/09/2026): quem deve, quanto entrou, quanto saiu. Sempre na nuvem — é
 * usado em casa, e os administradores precisam ver o mesmo número.
 *
 * Nada se apaga: pagamento e despesa errados ganham estorno (linha negativa
 * visível); cobrança indevida é cancelada.
 */
export function FinanceiroPage() {
  const ready = useAuth((s) => s.ready);
  const session = useAuth((s) => s.session);
  const [grupo, setGrupo] = useState<CloudGroup | null | undefined>(undefined);
  const [dados, setDados] = useState<DadosFinanceiros | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mes, setMes] = useState(() => hoje().slice(0, 7));

  const carregar = useCallback(async (g: CloudGroup) => {
    try {
      setDados(await lerFinanceiro(g.id));
      setErro(null);
    } catch (e) {
      console.error('ler o financeiro', e);
      setErro(navigator.onLine ? explain(e) : 'Sem internet. O financeiro precisa de conexão.');
    }
  }, []);

  useEffect(() => {
    if (!ready || !session) return;
    let vivo = true;
    findMyGroup('amador')
      .then((g) => {
        if (!vivo) return;
        setGrupo(g);
        if (g) void carregar(g);
      })
      .catch((e) => vivo && setErro(explain(e)));
    return () => {
      vivo = false;
    };
  }, [ready, session, carregar]);

  const recarregar = () => grupo && carregar(grupo);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-10">
      <header className="safe-top flex items-center justify-between gap-3 pt-6 pb-2">
        <h1 className="text-2xl font-bold tracking-tight">Financeiro</h1>
      </header>

      {erro && (
        <p className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">{erro}</p>
      )}
      {grupo === null && (
        <p className="mt-4 text-sm leading-relaxed text-ink-400">Crie o grupo na aba Jogo para usar o financeiro.</p>
      )}
      {grupo && !dados && !erro && <p className="mt-6 text-center text-sm text-ink-500">Carregando…</p>}
      {grupo && dados && <Conteudo grupo={grupo} dados={dados} mes={mes} setMes={setMes} recarregar={recarregar} />}
    </div>
  );
}

function Conteudo({
  grupo,
  dados,
  mes,
  setMes,
  recarregar,
}: {
  grupo: CloudGroup;
  dados: DadosFinanceiros;
  mes: string;
  setMes: (m: string) => void;
  recarregar: () => void;
}) {
  const saldos = useMemo(() => saldosPorJogador(dados.cobrancas, dados.pagamentos), [dados]);
  const devedores = useMemo(() => quemDeve(saldos), [saldos]);
  const resumo = useMemo(() => resumoDoMes(mes, dados.pagamentos, dados.despesas, saldos), [mes, dados, saldos]);
  const semConfig = !dados.config.mensalidadeCents && !dados.config.diariaCents;
  const caixa = useMemo(
    () =>
      emCaixa(
        fimDoMes(mes),
        { cents: dados.config.caixaInicialCents, em: dados.config.caixaInicialEm },
        dados.pagamentos,
        dados.despesas,
      ),
    [mes, dados],
  );
  const mesAtual = mes === hoje().slice(0, 7);
  const nome = (id: string) => dados.jogadores.get(id)?.nome ?? 'Jogador';

  return (
    <>
      {semConfig && (
        <Link
          to="/ajustes"
          className="mt-2 flex items-center gap-3 rounded-2xl border border-brand-500/40 bg-brand-500/10 px-4 py-3"
        >
          <Wallet size={18} className="shrink-0 text-brand-300" />
          <span className="min-w-0 flex-1 text-sm text-brand-100">
            Configure a mensalidade, a diária e o Pix em <strong>Ajustes › Financeiro</strong>.
          </span>
          <ChevronRight size={17} className="shrink-0 text-brand-300" />
        </Link>
      )}

      {/* O mês */}
      <div className="mt-3 flex items-center justify-between">
        <button onClick={() => setMes(moverMes(mes, -1))} className="p-2 text-ink-400" aria-label="Mês anterior">
          <ChevronLeft size={20} />
        </button>
        <p className="text-sm font-semibold text-ink-200">{nomeDoMes(mes)}</p>
        <button onClick={() => setMes(moverMes(mes, 1))} className="p-2 text-ink-400" aria-label="Próximo mês">
          <ChevronRight size={20} />
        </button>
      </div>
      <section className="rounded-2xl border border-ink-800 bg-ink-900 p-4">
        <p className="text-xs text-ink-500">{mesAtual ? 'Em caixa' : 'Em caixa no fim do mês'}</p>
        <p className={cn('text-3xl font-bold tabular-nums', caixa < 0 ? 'text-red-300' : 'text-ink-50')}>
          {formatBRL(caixa)}
        </p>
        {dados.config.caixaInicialCents == null && (
          <Link to="/ajustes" className="text-[11px] text-ink-500 underline">
            Sem saldo inicial: informe em Ajustes › Financeiro
          </Link>
        )}
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <div>
            <p className="text-ink-500">Recebido no mês</p>
            <p className="text-sm font-semibold tabular-nums text-brand-300">{formatBRL(resumo.recebidoCents)}</p>
          </div>
          <div>
            <p className="text-ink-500">Despesas no mês</p>
            <p className="text-sm font-semibold tabular-nums text-ink-200">{formatBRL(resumo.despesasCents)}</p>
          </div>
          <div>
            <p className="text-ink-500">Saldo do mês</p>
            <p className={cn('text-sm font-semibold tabular-nums', resumo.saldoCents < 0 ? 'text-red-300' : 'text-ink-200')}>
              {formatBRL(resumo.saldoCents)}
            </p>
          </div>
          <div>
            <p className="text-ink-500">A receber</p>
            <p className="text-sm font-semibold tabular-nums text-amber-300">{formatBRL(resumo.aReceberCents)}</p>
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
          Em caixa = saldo inicial + tudo o que entrou − tudo o que saiu. "A receber" é o que está em aberto, de
          qualquer mês.
        </p>
      </section>

      {/* Quem deve */}
      <section className="mt-6">
        <p className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
          Quem deve ({devedores.length})
        </p>
        {devedores.length > 0 && <CobrarVarios devedores={devedores} grupo={grupo} dados={dados} nome={nome} />}
        <div className="flex flex-col gap-2">
          {devedores.map((s) => (
            <Devedor
              key={s.playerId}
              saldo={s}
              jogador={dados.jogadores.get(s.playerId)}
              grupo={grupo}
              dados={dados}
              recarregar={recarregar}
            />
          ))}
          {devedores.length === 0 && (
            <p className="rounded-2xl border border-dashed border-ink-800 px-4 py-4 text-center text-sm text-ink-400">
              Ninguém devendo. 🎉
            </p>
          )}
        </div>
      </section>

      <ComCredito saldos={saldos} dados={dados} nome={nome} recarregar={recarregar} />
      <Recebimentos mes={mes} dados={dados} nome={nome} recarregar={recarregar} />
      <Despesas mes={mes} grupo={grupo} dados={dados} recarregar={recarregar} />
      <CobrancaAvulsa dados={dados} recarregar={recarregar} />
    </>
  );
}

// ── Cobrar vários: no grupo, ou um por um ──

/**
 * Pedido do Guilherme em 29/09/2026, "os dois": uma mensagem no grupo da
 * pelada, ou a cobrança individual de cada um em sequência. O WhatsApp não
 * manda para várias conversas de uma vez, e o navegador só abre o WhatsApp
 * com um toque — por isso o "um por um" é um toque por pessoa.
 */
function CobrarVarios({
  devedores,
  grupo,
  dados,
  nome,
}: {
  devedores: SaldoDoJogador[];
  grupo: CloudGroup;
  dados: DadosFinanceiros;
  nome: (id: string) => string;
}) {
  const [modo, setModo] = useState<'grupo' | 'fila' | null>(null);
  const [valores, setValores] = useState(true);
  // A fila congela quem devia ao começar: pagar no meio não bagunça a ordem
  const [fila, setFila] = useState<SaldoDoJogador[]>([]);
  const [i, setI] = useState(0);

  if (modo === null) {
    return (
      <div className="mb-2 grid grid-cols-2 gap-2">
        <Button size="sm" variant="secondary" onClick={() => setModo('grupo')}>
          <MessageCircle size={15} />
          Cobrar no grupo
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={devedores.length < 2}
          onClick={() => {
            setFila(devedores);
            setI(0);
            setModo('fila');
          }}
        >
          Cobrar um por um
        </Button>
      </div>
    );
  }

  if (modo === 'grupo') {
    const texto = mensagemDoGrupo(devedores, nome, grupo, dados, valores);
    return (
      <div className="mb-2 rounded-2xl border border-ink-800 bg-ink-900 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[15px] font-semibold text-ink-50">Cobrar no grupo</p>
          <button onClick={() => setModo(null)} className="p-1 text-ink-500" aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        <label className="mt-3 flex items-center justify-between gap-3">
          <span className="text-sm text-ink-300">Mostrar os valores</span>
          <input
            type="checkbox"
            checked={valores}
            onChange={(e) => setValores(e.target.checked)}
            className="size-5 accent-brand-500"
          />
        </label>
        <p className="mt-3 whitespace-pre-wrap rounded-xl bg-ink-950 px-3 py-2.5 text-xs leading-relaxed text-ink-300">
          {texto}
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
          O Pix vai sem valor: cada um deve um valor diferente. No WhatsApp, escolha o grupo da pelada.
        </p>
        <Button className="mt-3 w-full" onClick={() => abrirWhatsApp(texto)}>
          <MessageCircle size={16} />
          Abrir o WhatsApp
        </Button>
      </div>
    );
  }

  const atual = fila[i];
  if (!atual) {
    return (
      <div className="mb-2 flex items-center gap-2 rounded-2xl border border-brand-500/30 bg-brand-500/10 px-4 py-3">
        <span className="min-w-0 flex-1 text-sm text-brand-100">Cobrança enviada para todos da lista.</span>
        <button onClick={() => setModo(null)} className="text-xs text-ink-400 underline">
          fechar
        </button>
      </div>
    );
  }
  const jogador = dados.jogadores.get(atual.playerId);
  return (
    <div className="mb-2 rounded-2xl border border-ink-800 bg-ink-900 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-ink-400">
          Cobrando {i + 1} de {fila.length}
        </p>
        <button onClick={() => setModo(null)} className="text-xs text-ink-500 underline">
          parar
        </button>
      </div>
      <p className="mt-1 text-[15px] font-semibold text-ink-50">
        {nome(atual.playerId)} · {formatBRL(atual.saldoCents)}
      </p>
      {!jogador?.phone && (
        <p className="mt-0.5 text-[11px] text-ink-500">Sem telefone no cadastro: o WhatsApp abre para escolher o contato.</p>
      )}
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => setI(i + 1)}>
          Pular
        </Button>
        <Button
          size="sm"
          className="flex-1"
          onClick={() => {
            abrirWhatsApp(mensagemDeCobranca(atual, nome(atual.playerId), grupo, dados), jogador?.phone);
            setI(i + 1);
          }}
        >
          <MessageCircle size={15} />
          Cobrar {nome(atual.playerId)}
        </Button>
      </div>
    </div>
  );
}

// ── Uma pessoa que deve ──

function Devedor({
  saldo,
  jogador,
  grupo,
  dados,
  recarregar,
}: {
  saldo: SaldoDoJogador;
  jogador: JogadorDoFinanceiro | undefined;
  grupo: CloudGroup;
  dados: DadosFinanceiros;
  recarregar: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [recebendo, setRecebendo] = useState(false);
  const [valor, setValor] = useState('');
  const [metodo, setMetodo] = useState<'pix' | 'dinheiro'>('pix');
  const [data, setData] = useState(hoje());
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const nome = jogador?.nome ?? 'Jogador';
  const hojeStr = hoje();
  const atrasada = saldo.abertas.some((a) => a.cobranca.venceEm < hojeStr);

  function cobrar() {
    abrirWhatsApp(mensagemDeCobranca(saldo, nome, grupo, dados), jogador?.phone);
  }

  async function receber(e: React.FormEvent) {
    e.preventDefault();
    const cents = reaisParaCentavos(valor);
    if (!cents || cents <= 0) {
      setErro('Valor inválido. Use, por exemplo, 80 ou 80,00.');
      return;
    }
    setBusy(true);
    setErro(null);
    try {
      await registrarPagamento(grupo.id, { playerId: saldo.playerId, valorCents: cents, metodo, pagoEm: data });
      setRecebendo(false);
      recarregar();
    } catch (err) {
      setErro(explain(err));
    }
    setBusy(false);
  }

  async function cancelar(id: string, descricao: string) {
    if (!window.confirm(`Cancelar "${descricao}" de ${nome}? A cobrança some da conta dele, mas fica no histórico como cancelada.`)) return;
    try {
      await cancelarCobranca(id);
      recarregar();
    } catch (err) {
      setErro(explain(err));
    }
  }

  return (
    <div className="rounded-2xl border border-ink-800 bg-ink-900 px-4 py-3">
      <button onClick={() => setAberto((v) => !v)} className="flex w-full items-center gap-2 text-left">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-ink-50">{nome}</span>
          <span className={cn('block truncate text-xs', atrasada ? 'text-amber-300' : 'text-ink-500')}>
            {saldo.abertas.length === 1
              ? saldo.abertas[0].cobranca.descricao
              : `${saldo.abertas.length} cobranças`}
            {atrasada && ' · atrasada'}
          </span>
        </span>
        <span className="shrink-0 text-base font-bold tabular-nums text-ink-50">{formatBRL(saldo.saldoCents)}</span>
        <ChevronDown size={16} className={cn('shrink-0 text-ink-500 transition-transform', aberto && 'rotate-180')} />
      </button>

      {aberto && (
        <ul className="mt-2 flex flex-col gap-1.5 border-t border-ink-800 pt-2">
          {saldo.abertas.map((a) => (
            <li key={a.cobranca.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 text-ink-300">
                {a.cobranca.descricao}
                <span className="block text-[11px] text-ink-500">
                  vence {dm(a.cobranca.venceEm)}
                  {a.faltaCents < a.cobranca.valorCents && ` · faltam ${formatBRL(a.faltaCents)} de ${formatBRL(a.cobranca.valorCents)}`}
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-ink-200">{formatBRL(a.faltaCents)}</span>
              <button
                onClick={() => cancelar(a.cobranca.id, a.cobranca.descricao)}
                className="shrink-0 p-1 text-ink-500"
                aria-label={`Cancelar ${a.cobranca.descricao}`}
              >
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {recebendo ? (
        <form onSubmit={receber} className="mt-3 flex flex-col gap-2 border-t border-ink-800 pt-3">
          <div className="flex gap-2">
            <label className="min-w-0 flex-1">
              <span className="text-xs text-ink-400">Valor recebido (R$)</span>
              <input
                autoFocus
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                inputMode="decimal"
                className="mt-1 w-full rounded-xl bg-ink-800 px-3 py-2.5 text-[15px] text-ink-50 outline-none"
              />
            </label>
            <label className="min-w-0 flex-1">
              <span className="text-xs text-ink-400">Data</span>
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="mt-1 w-full rounded-xl bg-ink-800 px-3 py-2.5 text-[15px] text-ink-50 outline-none [color-scheme:dark]"
              />
            </label>
          </div>
          <div className="flex gap-2" role="radiogroup" aria-label="Forma de pagamento">
            {(['pix', 'dinheiro'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={metodo === m}
                onClick={() => setMetodo(m)}
                className={cn(
                  'h-10 flex-1 rounded-xl border text-sm font-medium',
                  metodo === m ? 'border-brand-500 bg-brand-500/15 text-brand-300' : 'border-ink-800 text-ink-400',
                )}
              >
                {m === 'pix' ? 'Pix' : 'Dinheiro'}
              </button>
            ))}
          </div>
          {erro && <p className="text-sm text-red-300">{erro}</p>}
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => setRecebendo(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" className="flex-1" disabled={busy}>
              {busy ? 'Salvando…' : 'Registrar pagamento'}
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button size="sm" variant="secondary" onClick={cobrar}>
            <MessageCircle size={15} />
            Cobrar
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setValor(centavosParaCampo(saldo.saldoCents));
              setData(hoje());
              setErro(null);
              setRecebendo(true);
            }}
          >
            Recebi
          </Button>
        </div>
      )}
      {!recebendo && erro && <p className="mt-2 text-sm text-red-300">{erro}</p>}
    </div>
  );
}

// ── Com crédito ──

/**
 * Quem pagou mais do que deve — em geral, o convidado que pagou a diária
 * antecipada e desistiu antes do jogo (migração 019). Decidido pelo
 * Guilherme em 29/09/2026: o administrador escolhe entre deixar de crédito
 * (não faz nada: a próxima diária já aparece paga) ou devolver (estorno).
 */
function ComCredito({
  saldos,
  dados,
  nome,
  recarregar,
}: {
  saldos: Map<string, SaldoDoJogador>;
  dados: DadosFinanceiros;
  nome: (id: string) => string;
  recarregar: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const credores = [...saldos.values()].filter((s) => s.saldoCents < 0).sort((a, b) => a.saldoCents - b.saldoCents);
  if (credores.length === 0) return null;
  const estornados = new Set(dados.pagamentos.filter((p) => p.estornoDe).map((p) => p.estornoDe));

  async function devolver(s: SaldoDoJogador) {
    const credito = -s.saldoCents;
    // Devolver = estornar o pagamento que gerou o crédito: o do mesmo valor, o mais recente
    const pagamento = dados.pagamentos
      .filter((p) => p.playerId === s.playerId && p.valorCents === credito && !p.estornoDe && !estornados.has(p.id))
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))[0];
    if (!pagamento) {
      setErro(`Não achei um pagamento de ${formatBRL(credito)} de ${nome(s.playerId)} para estornar. Estorne o pagamento certo em "Recebido no mês".`);
      return;
    }
    if (!window.confirm(`Devolver ${formatBRL(credito)} para ${nome(s.playerId)}? O pagamento é estornado e fica no histórico. Faça o Pix de volta pelo seu banco.`)) return;
    try {
      await estornarPagamento(pagamento.id);
      recarregar();
    } catch (err) {
      setErro(explain(err));
    }
  }

  return (
    <section className="mt-6">
      <p className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">Com crédito ({credores.length})</p>
      <div className="flex flex-col gap-2">
        {credores.map((s) => (
          <div key={s.playerId} className="rounded-2xl border border-ink-800 bg-ink-900 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink-50">{nome(s.playerId)}</span>
              <span className="shrink-0 font-bold tabular-nums text-brand-300">{formatBRL(-s.saldoCents)}</span>
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
              Pagou a mais — em geral, uma diária de jogo em que desistiu. Deixando de crédito, a próxima cobrança
              dele já aparece paga.
            </p>
            <Button size="sm" variant="secondary" className="mt-2 w-full" onClick={() => devolver(s)}>
              <RotateCcw size={14} />
              Devolver (estornar)
            </Button>
          </div>
        ))}
      </div>
      {erro && <p className="mt-2 text-sm text-red-300">{erro}</p>}
    </section>
  );
}

// ── Recebimentos do mês ──

function Recebimentos({
  mes,
  dados,
  nome,
  recarregar,
}: {
  mes: string;
  dados: DadosFinanceiros;
  nome: (id: string) => string;
  recarregar: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const estornados = new Set(dados.pagamentos.filter((p) => p.estornoDe).map((p) => p.estornoDe));
  const doMes = dados.pagamentos
    .filter((p) => p.pagoEm.startsWith(mes))
    .sort((a, b) => b.pagoEm.localeCompare(a.pagoEm) || b.criadoEm.localeCompare(a.criadoEm));
  if (doMes.length === 0) return null;

  async function estornar(id: string, quem: string, valor: number) {
    if (!window.confirm(`Estornar o pagamento de ${formatBRL(valor)} de ${quem}? Ele volta a dever esse valor, e o estorno fica no histórico.`)) return;
    try {
      await estornarPagamento(id);
      recarregar();
    } catch (err) {
      setErro(explain(err));
    }
  }

  return (
    <section className="mt-6">
      <p className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">Recebido no mês</p>
      <ul className="overflow-hidden rounded-2xl border border-ink-800">
        {doMes.map((p) => (
          <li key={p.id} className="flex items-center gap-2 border-b border-ink-800 px-3 py-2.5 text-sm last:border-b-0">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-ink-100">{nome(p.playerId)}</span>
              <span className="block text-[11px] text-ink-500">
                {dm(p.pagoEm)} · {p.metodo === 'pix' ? 'Pix' : 'dinheiro'}
                {p.estornoDe && ' · estorno'}
                {estornados.has(p.id) && ' · estornado'}
              </span>
            </span>
            <span className={cn('shrink-0 tabular-nums', p.valorCents < 0 ? 'text-red-300' : 'text-brand-300')}>
              {formatBRL(p.valorCents)}
            </span>
            {p.valorCents > 0 && !estornados.has(p.id) && (
              <button
                onClick={() => estornar(p.id, nome(p.playerId), p.valorCents)}
                className="shrink-0 p-1 text-ink-500"
                aria-label="Estornar pagamento"
              >
                <RotateCcw size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {erro && <p className="mt-2 text-sm text-red-300">{erro}</p>}
    </section>
  );
}

// ── Despesas do mês ──

function Despesas({
  mes,
  grupo,
  dados,
  recarregar,
}: {
  mes: string;
  grupo: CloudGroup;
  dados: DadosFinanceiros;
  recarregar: () => void;
}) {
  const [nova, setNova] = useState(false);
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [data, setData] = useState(hoje());
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const estornadas = new Set(dados.despesas.filter((d) => d.estornoDe).map((d) => d.estornoDe));
  const doMes = dados.despesas
    .filter((d) => d.gastoEm.startsWith(mes))
    .sort((a, b) => b.gastoEm.localeCompare(a.gastoEm) || b.criadoEm.localeCompare(a.criadoEm));

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const cents = reaisParaCentavos(valor);
    if (!descricao.trim() || !cents) {
      setErro('Preencha o que foi e o valor (ex.: 900 ou 900,00).');
      return;
    }
    setBusy(true);
    setErro(null);
    try {
      await lancarDespesa(grupo.id, { descricao, valorCents: cents, gastoEm: data });
      setNova(false);
      setDescricao('');
      setValor('');
      recarregar();
    } catch (err) {
      setErro(explain(err));
    }
    setBusy(false);
  }

  async function estornar(id: string, desc: string) {
    if (!window.confirm(`Estornar a despesa "${desc}"? O valor volta para o caixa, e o estorno fica no histórico.`)) return;
    try {
      await estornarDespesa(id);
      recarregar();
    } catch (err) {
      setErro(explain(err));
    }
  }

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">Despesas do mês</p>
        {!nova && (
          <button onClick={() => setNova(true)} className="flex items-center gap-1 text-xs font-medium text-brand-300">
            <Plus size={14} />
            Nova despesa
          </button>
        )}
      </div>
      {nova && (
        <form onSubmit={salvar} className="mb-2 flex flex-col gap-2 rounded-2xl border border-ink-800 bg-ink-900 p-3">
          <input
            autoFocus
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            maxLength={80}
            placeholder="O que foi (ex.: Quadra de setembro)"
            className="w-full rounded-xl bg-ink-800 px-3 py-2.5 text-[15px] text-ink-50 placeholder:text-ink-500 outline-none"
          />
          <div className="flex gap-2">
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              inputMode="decimal"
              placeholder="Valor (R$)"
              className="min-w-0 flex-1 rounded-xl bg-ink-800 px-3 py-2.5 text-[15px] text-ink-50 placeholder:text-ink-500 outline-none"
            />
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              aria-label="Data"
              className="min-w-0 flex-1 rounded-xl bg-ink-800 px-3 py-2.5 text-[15px] text-ink-50 outline-none [color-scheme:dark]"
            />
          </div>
          {erro && <p className="text-sm text-red-300">{erro}</p>}
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => setNova(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" className="flex-1" disabled={busy}>
              {busy ? 'Salvando…' : 'Lançar despesa'}
            </Button>
          </div>
        </form>
      )}
      {doMes.length > 0 ? (
        <ul className="overflow-hidden rounded-2xl border border-ink-800">
          {doMes.map((d) => (
            <li key={d.id} className="flex items-center gap-2 border-b border-ink-800 px-3 py-2.5 text-sm last:border-b-0">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ink-100">{d.descricao}</span>
                <span className="block text-[11px] text-ink-500">
                  {dm(d.gastoEm)}
                  {estornadas.has(d.id) && ' · estornada'}
                </span>
              </span>
              <span className={cn('shrink-0 tabular-nums', d.valorCents < 0 ? 'text-brand-300' : 'text-ink-200')}>
                {formatBRL(d.valorCents)}
              </span>
              {d.valorCents > 0 && !estornadas.has(d.id) && (
                <button
                  onClick={() => estornar(d.id, d.descricao)}
                  className="shrink-0 p-1 text-ink-500"
                  aria-label="Estornar despesa"
                >
                  <RotateCcw size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        !nova && <p className="text-sm text-ink-500">Nenhuma despesa neste mês.</p>
      )}
      {!nova && erro && <p className="mt-2 text-sm text-red-300">{erro}</p>}
    </section>
  );
}

// ── Cobrança avulsa ──

function CobrancaAvulsa({ dados, recarregar }: { dados: DadosFinanceiros; recarregar: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [quem, setQuem] = useState('');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [vence, setVence] = useState(hoje());
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Só quem está no elenco hoje: excluídos e inativos continuam com nome nas dívidas antigas, mas não recebem cobrança nova
  const jogadores = [...dados.jogadores.values()].filter((j) => j.ativo).sort((a, b) => a.nome.localeCompare(b.nome));

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const cents = reaisParaCentavos(valor);
    if (!quem || !descricao.trim() || !cents) {
      setErro('Escolha a pessoa e preencha o que é e o valor.');
      return;
    }
    setBusy(true);
    setErro(null);
    try {
      await lancarAvulsa(quem, descricao, cents, vence);
      setAberto(false);
      setDescricao('');
      setValor('');
      setQuem('');
      recarregar();
    } catch (err) {
      setErro(explain(err));
    }
    setBusy(false);
  }

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-ink-700 py-3 text-sm font-medium text-ink-300"
      >
        <Plus size={16} />
        Cobrança avulsa (camisa, churrasco…)
      </button>
    );
  }
  return (
    <form onSubmit={salvar} className="mt-6 flex flex-col gap-2 rounded-2xl border border-ink-800 bg-ink-900 p-4">
      <p className="text-[15px] font-semibold text-ink-50">Cobrança avulsa</p>
      <select
        value={quem}
        onChange={(e) => setQuem(e.target.value)}
        aria-label="Quem"
        className="w-full rounded-xl bg-ink-800 px-3 py-2.5 text-[15px] text-ink-50 outline-none [color-scheme:dark]"
      >
        <option value="">Quem vai pagar?</option>
        {jogadores.map((j) => (
          <option key={j.id} value={j.id}>
            {j.nome}
          </option>
        ))}
      </select>
      <input
        value={descricao}
        onChange={(e) => setDescricao(e.target.value)}
        maxLength={80}
        placeholder="O que é (ex.: Camisa do time)"
        className="w-full rounded-xl bg-ink-800 px-3 py-2.5 text-[15px] text-ink-50 placeholder:text-ink-500 outline-none"
      />
      <div className="flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="text-[11px] text-ink-500">Valor (R$)</span>
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            inputMode="decimal"
            placeholder="Ex.: 50,00"
            className="mt-0.5 w-full rounded-xl bg-ink-800 px-3 py-2.5 text-[15px] text-ink-50 placeholder:text-ink-500 outline-none"
          />
        </label>
        <label className="min-w-0 flex-1">
          <span className="text-[11px] text-ink-500">Data da cobrança</span>
          <input
            type="date"
            value={vence}
            onChange={(e) => setVence(e.target.value)}
            className="mt-0.5 w-full rounded-xl bg-ink-800 px-3 py-2.5 text-[15px] text-ink-50 outline-none [color-scheme:dark]"
          />
        </label>
      </div>
      {erro && <p className="text-sm text-red-300">{erro}</p>}
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" className="flex-1" disabled={busy}>
          {busy ? 'Salvando…' : 'Lançar cobrança'}
        </Button>
      </div>
    </form>
  );
}
