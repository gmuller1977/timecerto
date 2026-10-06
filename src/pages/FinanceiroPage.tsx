import { iconeDoTipo } from '@/lib/listaDoJogo';
import { normalizar } from '@/lib/juntar';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, MessageCircle, Plus, RotateCcw, Wallet, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/store/useAuth';
import {
  cancelarCobranca,
  desfazerInformado,
  estornarDespesa,
  estornarPagamento,
  findActiveGroup,
  groupLink,
  lancarAvulsa,
  lancarDespesa,
  lerFinanceiro,
  registrarLembretes,
  registrarPagamento,
  type CloudGroup,
  type DadosFinanceiros,
  type JogadorDoFinanceiro,
} from '@/lib/cloud';
import {
  centavosParaCampo,
  emCaixa,
  fimDoMes,
  mensagemDaMensalidade,
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
import { situacaoDoPlano } from '@/lib/plano';

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

/** O dia, no fuso do aparelho, de um instante ISO ("2026-09-29T02:00Z" é dia 28 no Brasil) */
function diaLocal(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * A data que vai nas mensagens: o VENCIMENTO. A mensalidade vence no dia
 * escolhido em Ajustes; a diária, no dia do jogo; a avulsa, na data escolhida
 * ao lançar. Em 29/09/2026 a mensalidade mostrava o dia em que foi lançada (o
 * dia 1); trocado pelo Guilherme em 05/10/2026 — "dia 01" na lista de
 * pendências parecia atraso de quem ainda estava no prazo.
 */
function dataDaCobranca(c: Cobranca): string {
  return c.venceEm;
}

/** A linha de uma cobrança: o rótulo pelo tipo — diária é jogo, mensalidade não */
function rotuloDaCobranca(c: Cobranca): string {
  return c.tipo === 'diaria' ? 'Jogo do dia' : c.descricao;
}

/**
 * A cobrança de UMA pessoa, mensalista ou convidado, no texto do Guilherme
 * (05/10/2026): o que deve, linha por linha, o total, o Pix e o link para
 * confirmar o pagamento. Uma mensagem só — a segunda, com o Pix copia e cola,
 * saiu no mesmo dia.
 */
function mensagemDeCobranca(saldo: SaldoDoJogador, nome: string, grupo: CloudGroup, dados: DadosFinanceiros): string {
  const linhas = saldo.abertas.map(
    (a) => `• ${rotuloDaCobranca(a.cobranca)}: ${dm(dataDaCobranca(a.cobranca))} — Valor de ${formatBRL(a.faltaCents)}`,
  );
  const pix = dados.config.pixChave ? `\n\nPix: ${dados.config.pixChave}` : '';
  // O link abre direto na aba Pagamento (06/10/2026)
  const link = grupo.code
    ? `\n\nApós o pagamento, clique no link abaixo e confirme o valor.\n${groupLink(grupo.code)}?aba=pagamento`
    : '';
  return (
    `Oi, ${nome}!\n\nPassando para lembrar do pagamento dos jogos do ${grupo.name}:\n\n${linhas.join('\n')}\n\n` +
    `Total: ${formatBRL(saldo.saldoCents)}${pix}${link}`
  );
}

/**
 * A cobrança no grupo da pelada: uma mensagem só, com todos. O Pix vai SEM
 * valor — cada um deve um valor diferente. Com `valores` desligado, só os
 * nomes: quem cobra decide, a cada vez, se expõe quanto cada um deve.
 */
function mensagemDoGrupo(devedores: SaldoDoJogador[], nome: (id: string) => string, grupo: CloudGroup, dados: DadosFinanceiros, valores: boolean): string {
  // Uma linha por cobrança em aberto: nome — descrição — vencimento — o que falta
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

/**
 * A cobrança do grupo quando há mensalidade (pedido do Guilherme, 05/10/2026):
 * todos os mensalistas do mês, com ✅ em quem já pagou (baixa), informou
 * pelo link ou está isento (mensalidade do mês cancelada). A mesma lista que o mensalista manda de volta depois de pagar.
 */
function mensagemDoMes(grupo: CloudGroup, dados: DadosFinanceiros, saldos: Map<string, SaldoDoJogador>): string | null {
  const c = dados.config;
  if (!c.mensalidadeCents || !c.mensalidadeDia || !grupo.code) return null;
  const mes = hoje().slice(0, 7);
  const lista = [...dados.jogadores.values()]
    .filter((j) => j.kind === 'mensalista' && j.ativo)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .map((j) => {
      const doMes = dados.cobrancas.filter(
        (x) => x.playerId === j.id && x.tipo === 'mensalidade' && x.referencia === mes,
      );
      const cob = doMes.find((x) => !x.canceladaEm);
      // Mensalidade do mês cancelada e nenhuma valendo: isento, leva ✅ (05/10/2026)
      const isento = !cob && doMes.length > 0;
      const emAberto = cob ? saldos.get(j.id)?.abertas.some((a) => a.cobranca.id === cob.id) : true;
      return { nome: j.nome, ok: isento || Boolean(cob && (!emAberto || cob.informadoEm)) };
    });
  return mensagemDaMensalidade({
    grupo: grupo.name,
    mes,
    venceEm: `${mes}-${String(c.mensalidadeDia).padStart(2, '0')}`,
    valorCents: c.mensalidadeCents,
    pixChave: c.pixChave,
    lista,
    link: `${groupLink(grupo.code)}?aba=pagamento`,
  });
}

/**
 * A confirmação de baixa (pedido do Guilherme, 29/09/2026): o que o
 * pagamento quitou e o que ainda fica. O pagamento abate as cobranças mais
 * antigas primeiro — a mesma regra de `saldosPorJogador` —, então a conta
 * é feita sobre as abertas de ANTES do pagamento, na mesma ordem.
 */
function mensagemDeRecibo(
  saldo: SaldoDoJogador,
  nome: string,
  grupo: CloudGroup,
  pago: { valorCents: number; metodo: 'pix' | 'dinheiro'; pagoEm: string },
): string {
  let resto = pago.valorCents;
  const quitadas: string[] = [];
  let parcial: string | null = null;
  for (const a of saldo.abertas) {
    if (resto <= 0) break;
    const abate = Math.min(resto, a.faltaCents);
    // As linhas iguais às da cobrança individual (pedido do Guilherme, 05/10/2026)
    const linha = `• ${rotuloDaCobranca(a.cobranca)}: ${dm(dataDaCobranca(a.cobranca))}`;
    if (abate === a.faltaCents) quitadas.push(`${linha} — Valor de ${formatBRL(abate)}`);
    else parcial = `${linha} — Pago ${formatBRL(abate)} de ${formatBRL(a.faltaCents)}`;
    resto -= abate;
  }
  const falta = saldo.saldoCents - pago.valorCents;
  const partes = [
    `Oi, ${nome}! Recebemos seu pagamento de ${formatBRL(pago.valorCents)} (${pago.metodo === 'pix' ? 'Pix' : 'dinheiro'}, ${dm(pago.pagoEm)}). ✅`,
  ];
  if (quitadas.length) partes.push(`Quitado:\n${quitadas.join('\n')}`);
  if (parcial) partes.push(`Pago em parte:\n${parcial}`);
  partes.push(
    falta > 0
      ? `Ainda fica em aberto: ${formatBRL(falta)}.`
      : falta < 0
        ? `Ficaram ${formatBRL(-falta)} de crédito para a próxima. Está tudo em dia. Obrigado! 🙏`
        : 'Está tudo em dia. Obrigado! 🙏',
  );
  return `${partes.join('\n\n')}\n\n— ${grupo.name}`;
}

/** A confirmação de baixa esperando ser enviada, no cartão de quem pagou */
interface Recibo {
  playerId: string;
  /** Como estava antes do pagamento: quem quitou tudo continua na lista com isto */
  saldoAntes: SaldoDoJogador;
  /** Posição na lista, para o cartão de quem quitou não pular de lugar */
  indice: number;
  nome: string;
  phone: string | null;
  texto: string;
}

// ── Histórico de cobranças enviadas (migração 020) ──

/** Quem foi cobrado individualmente há menos disso sai do "um por um" */
const INTERVALO_DE_COBRANCA_DIAS = 3;

/** Dias de calendário entre a data (ISO) e hoje, no fuso do aparelho */
function diasDesde(iso: string): number {
  const d = new Date(iso);
  const inicio = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const agora = new Date();
  const hojeInicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
  return Math.round((hojeInicio - inicio) / 86_400_000);
}

function haQuanto(iso: string): string {
  const n = diasDesde(iso);
  return n <= 0 ? 'hoje' : n === 1 ? 'ontem' : `há ${n} dias`;
}

function lembretesDe(dados: DadosFinanceiros, playerId: string) {
  return dados.lembretes.filter((l) => l.playerId === playerId);
}

/** Cobrado no WhatsApp dele nos últimos dias — cobrar de novo fica chato */
function cobradoHaPouco(dados: DadosFinanceiros, playerId: string): boolean {
  return lembretesDe(dados, playerId).some(
    (l) => l.canal === 'individual' && diasDesde(l.enviadoEm) < INTERVALO_DE_COBRANCA_DIAS,
  );
}

/**
 * Anota a cobrança sem atrapalhar quem cobra: o WhatsApp já abriu, e perder
 * a anotação é menos grave que travar o envio.
 */
function anotar(
  grupo: CloudGroup,
  canal: 'individual' | 'grupo',
  saldos: SaldoDoJogador[],
  recarregar: () => void,
) {
  registrarLembretes(
    grupo.id,
    canal,
    saldos.map((s) => ({ playerId: s.playerId, valorCents: s.saldoCents })),
  )
    .then(recarregar)
    .catch((e) => console.warn('anotar a cobrança', e));
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
/**
 * Sem o plano pago (migração 021), o Financeiro fica só para consulta: nada
 * se perde, só não se lança. Os botões de lançar somem; o banco recusaria.
 */
const SoLeitura = createContext(false);

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
    findActiveGroup()
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
        <p className="mt-4 text-sm leading-relaxed text-ink-400">Crie o grupo na aba Agenda para usar o financeiro.</p>
      )}
      {grupo && !dados && !erro && <p className="mt-6 text-center text-sm text-ink-500">Carregando…</p>}
      {grupo && dados && !situacaoDoPlano(grupo.plano).premium && (
        <div className="mb-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <p className="text-sm font-semibold text-amber-100">Financeiro só para consulta</p>
          <p className="mt-0.5 text-xs leading-relaxed text-amber-100/80">
            O Financeiro é do plano pago. Tudo o que foi lançado continua aqui, mas para lançar de novo o grupo
            precisa do plano — veja Ajustes › Plano.
          </p>
        </div>
      )}
      {grupo && dados && (
        <SoLeitura.Provider value={!situacaoDoPlano(grupo.plano).premium}>
          <Conteudo grupo={grupo} dados={dados} mes={mes} setMes={setMes} recarregar={recarregar} />
        </SoLeitura.Provider>
      )}
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
  const [novaCobranca, setNovaCobranca] = useState(false);
  const soLeitura = useContext(SoLeitura);
  /*
   * Confirmação de baixa pendente (pedido do Guilherme, 29/09/2026): aparece
   * no próprio cartão, logo depois de "Registrar pagamento". Mora aqui, e não
   * no Devedor, porque quem quitou tudo sai de `devedores` ao recarregar — o
   * cartão dele fica na lista, no mesmo lugar, até enviar ou fechar.
   */
  const [recibo, setRecibo] = useState<Recibo | null>(null);
  const quitou = recibo !== null && !devedores.some((d) => d.playerId === recibo.playerId);
  const lista =
    recibo && quitou
      ? [...devedores.slice(0, recibo.indice), recibo.saldoAntes, ...devedores.slice(recibo.indice)]
      : devedores;

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

      {/*
        Cobranças (pedido do Guilherme, 29/09/2026): o título com "+ Nova
        cobrança" ao lado, no mesmo modelo das despesas. A lista continua com
        TUDO o que está em aberto, de qualquer mês — filtrar pelo mês faria uma
        dívida antiga sumir da tela sem ter sido paga.
      */}
      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">
            Cobranças do mês ({devedores.length})
          </p>
          {!novaCobranca && !soLeitura && (
            <button
              onClick={() => setNovaCobranca(true)}
              className="flex items-center gap-1 text-xs font-medium text-brand-300"
            >
              <Plus size={14} />
              Nova cobrança
            </button>
          )}
        </div>
        {novaCobranca && (
          <CobrancaAvulsa dados={dados} recarregar={recarregar} onFechar={() => setNovaCobranca(false)} />
        )}
        {devedores.length > 0 && (
          <CobrarVarios devedores={devedores} grupo={grupo} dados={dados} nome={nome} recarregar={recarregar} />
        )}
        <div className="flex flex-col gap-2">
          {/* Separados por tipo, com título (pedido do Guilherme em 06/10/2026) */}
          {(['mensalista', 'convidado'] as const).map((tipo) => {
            const doTipo = lista.filter(
              (s) => (dados.jogadores.get(s.playerId)?.kind === 'convidado') === (tipo === 'convidado'),
            );
            if (doTipo.length === 0) return null;
            return (
              <div key={tipo} className="flex flex-col gap-2">
                <p className="mt-2 text-xs font-semibold tracking-wide text-ink-400 uppercase">
                  <span aria-hidden className="mr-1.5">{iconeDoTipo(tipo)}</span>
                  {tipo === 'convidado' ? 'Convidados' : 'Mensalistas'} ({doTipo.length})
                </p>
                {doTipo.map((s) => (
                  <Devedor
                    key={s.playerId}
                    saldo={s}
                    jogador={dados.jogadores.get(s.playerId)}
                    grupo={grupo}
                    dados={dados}
                    recarregar={recarregar}
                    recibo={recibo?.playerId === s.playerId ? recibo : null}
                    quitado={quitou && recibo?.playerId === s.playerId}
                    onRecebido={(r) =>
                      setRecibo({ ...r, indice: Math.max(0, devedores.findIndex((d) => d.playerId === r.playerId)) })
                    }
                    onFecharRecibo={() => setRecibo(null)}
                  />
                ))}
              </div>
            );
          })}
          {lista.length === 0 && (
            <p className="rounded-2xl border border-dashed border-ink-800 px-4 py-4 text-center text-sm text-ink-400">
              Ninguém devendo. 🎉
            </p>
          )}
        </div>
      </section>

      <ComCredito saldos={saldos} dados={dados} nome={nome} recarregar={recarregar} />
      <Recebimentos mes={mes} dados={dados} nome={nome} recarregar={recarregar} />
      <Despesas mes={mes} grupo={grupo} dados={dados} recarregar={recarregar} />
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
/**
 * Cobrar no grupo, ou um por um. Também usado no fim do dia de jogo
 * (CobrarODia), com `devedores` restritos às diárias daquele dia e
 * `soPendencias` — lá a mensagem é das diárias, não da mensalidade do mês.
 */
export function CobrarVarios({
  devedores,
  grupo,
  dados,
  nome,
  recarregar,
  soPendencias = false,
}: {
  devedores: SaldoDoJogador[];
  grupo: CloudGroup;
  dados: DadosFinanceiros;
  nome: (id: string) => string;
  recarregar: () => void;
  soPendencias?: boolean;
}) {
  const [modo, setModo] = useState<'grupo' | 'fila' | null>(null);
  const [valores, setValores] = useState(true);
  // A fila congela quem devia ao começar: pagar no meio não bagunça a ordem
  const [fila, setFila] = useState<SaldoDoJogador[]>([]);
  const [i, setI] = useState(0);
  // Cobrados no WhatsApp deles há menos de 3 dias: ficam fora da fila, mas dá para incluir
  const [deFora, setDeFora] = useState<SaldoDoJogador[]>([]);

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
            setFila(devedores.filter((d) => !cobradoHaPouco(dados, d.playerId)));
            setDeFora(devedores.filter((d) => cobradoHaPouco(dados, d.playerId)));
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
    const doMes = soPendencias ? null : mensagemDoMes(grupo, dados, saldosPorJogador(dados.cobrancas, dados.pagamentos));
    const texto = doMes ?? mensagemDoGrupo(devedores, nome, grupo, dados, valores);
    return (
      <div className="mb-2 rounded-2xl border border-ink-800 bg-ink-900 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[15px] font-semibold text-ink-50">Cobrar no grupo</p>
          <button onClick={() => setModo(null)} className="p-1 text-ink-500" aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        {!doMes && (
          <label className="mt-3 flex items-center justify-between gap-3">
            <span className="text-sm text-ink-300">Mostrar os valores</span>
            <input
              type="checkbox"
              checked={valores}
              onChange={(e) => setValores(e.target.checked)}
              className="size-5 accent-brand-500"
            />
          </label>
        )}
        <p className="mt-3 whitespace-pre-wrap rounded-xl bg-ink-950 px-3 py-2.5 text-xs leading-relaxed text-ink-300">
          {texto}
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
          {doMes
            ? 'Quem pagar confirma no link e manda a lista de volta com o ✅. O pagamento fica a conferir aqui até você dar a baixa. No WhatsApp, escolha o grupo da pelada.'
            : 'O Pix vai sem valor: cada um deve um valor diferente. No WhatsApp, escolha o grupo da pelada.'}
        </p>
        <Button
          className="mt-3 w-full"
          onClick={() => {
            abrirWhatsApp(texto);
            anotar(grupo, 'grupo', devedores, recarregar);
          }}
        >
          <MessageCircle size={16} />
          Abrir o WhatsApp
        </Button>
      </div>
    );
  }

  const incluirDeFora = () => {
    setFila([...fila, ...deFora]);
    setDeFora([]);
  };
  const avisoDeFora = deFora.length > 0 && (
    <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
      {deFora.length === 1
        ? `${nome(deFora[0].playerId)} já recebeu cobrança nos últimos ${INTERVALO_DE_COBRANCA_DIAS} dias e ficou de fora.`
        : `${deFora.length} pessoas já receberam cobrança nos últimos ${INTERVALO_DE_COBRANCA_DIAS} dias e ficaram de fora.`}{' '}
      <button onClick={incluirDeFora} className="text-brand-300 underline">
        incluir
      </button>
    </p>
  );

  const atual = fila[i];
  if (!atual) {
    return (
      <div className="mb-2 rounded-2xl border border-brand-500/30 bg-brand-500/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 text-sm text-brand-100">
            {fila.length === 0
              ? `Todos já receberam cobrança nos últimos ${INTERVALO_DE_COBRANCA_DIAS} dias.`
              : 'Cobrança enviada para todos da lista.'}
          </span>
          <button onClick={() => setModo(null)} className="text-xs text-ink-400 underline">
            fechar
          </button>
        </div>
        {avisoDeFora}
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
      {avisoDeFora}
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setI(i + 1)}
        >
          Pular
        </Button>
        <Button
          size="sm"
          className="flex-1"
          onClick={() => {
            abrirWhatsApp(mensagemDeCobranca(atual, nome(atual.playerId), grupo, dados), jogador?.phone);
            anotar(grupo, 'individual', [atual], recarregar);
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
  recibo,
  quitado,
  onRecebido,
  onFecharRecibo,
}: {
  saldo: SaldoDoJogador;
  jogador: JogadorDoFinanceiro | undefined;
  grupo: CloudGroup;
  dados: DadosFinanceiros;
  recarregar: () => void;
  /** A confirmação de baixa deste cartão, esperando ser enviada */
  recibo: Recibo | null;
  /** Pagou tudo: o cartão só continua na lista por causa da confirmação */
  quitado: boolean;
  /** Depois de registrar: a confirmação de baixa, para mandar no WhatsApp */
  onRecebido: (r: Omit<Recibo, 'indice'>) => void;
  onFecharRecibo: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [recebendo, setRecebendo] = useState(false);
  const soLeitura = useContext(SoLeitura);
  const [valor, setValor] = useState('');
  const [metodo, setMetodo] = useState<'pix' | 'dinheiro'>('pix');
  const [data, setData] = useState(hoje());
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const nome = jogador?.nome ?? 'Jogador';
  const hojeStr = hoje();
  const atrasada = saldo.abertas.some((a) => a.cobranca.venceEm < hojeStr);
  // Informou pelo link e ainda não teve baixa (migração 031)
  const aConferir = saldo.abertas.some((a) => a.cobranca.informadoEm);

  const enviados = lembretesDe(dados, saldo.playerId);
  const ultimo = enviados[0];

  function cobrar() {
    abrirWhatsApp(mensagemDeCobranca(saldo, nome, grupo, dados), jogador?.phone);
    anotar(grupo, 'individual', [saldo], recarregar);
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
      onRecebido({
        playerId: saldo.playerId,
        saldoAntes: saldo,
        nome,
        phone: jogador?.phone ?? null,
        texto: mensagemDeRecibo(saldo, nome, grupo, { valorCents: cents, metodo, pagoEm: data }),
      });
      recarregar();
    } catch (err) {
      setErro(explain(err));
    }
    setBusy(false);
  }

  // Conferiu e o dinheiro não chegou: tira o ✅ da lista
  async function naoRecebi(id: string) {
    setErro(null);
    try {
      await desfazerInformado(id);
      recarregar();
    } catch (err) {
      setErro(explain(err));
    }
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
      {/* Fechado: só o nome e o valor (pedido do Guilherme em 06/10/2026) */}
      <button
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink-50">
          <span aria-hidden className="mr-1.5">{iconeDoTipo(jogador?.kind)}</span>
          {nome}
        </span>
        {quitado ? (
          <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-300">
            <CheckCircle2 size={16} />
            Quitado
          </span>
        ) : (
          <span className="shrink-0 text-base font-bold tabular-nums text-ink-50">{formatBRL(saldo.saldoCents)}</span>
        )}
        <ChevronDown size={16} className={cn('shrink-0 text-ink-500 transition-transform', aberto && 'rotate-180')} />
      </button>

      {aberto && (
        <div className="mt-2 border-t border-ink-800 pt-2 text-xs">
          <p className={atrasada ? 'text-amber-300' : 'text-ink-500'}>
            {saldo.abertas.length === 1 ? '1 cobrança em aberto' : `${saldo.abertas.length} cobranças em aberto`}
            {atrasada && ' · atrasada'}
          </p>
          {aConferir && <p className="mt-0.5 font-medium text-brand-300">Informou que pagou · a conferir</p>}
          {ultimo && (
            <p className="mt-0.5 text-[11px] text-ink-500">
              Cobrado {haQuanto(ultimo.enviadoEm)}
              {ultimo.canal === 'grupo' && ' no grupo'}
            </p>
          )}
        </div>
      )}
      {aberto && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {saldo.abertas.map((a) => (
            <li key={a.cobranca.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 text-ink-300">
                {a.cobranca.descricao}
                <span className="block text-[11px] text-ink-500">
                  vence {dm(a.cobranca.venceEm)}
                  {a.faltaCents < a.cobranca.valorCents && ` · faltam ${formatBRL(a.faltaCents)} de ${formatBRL(a.cobranca.valorCents)}`}
                </span>
                {a.cobranca.informadoEm && (
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-brand-300">
                    Informou que pagou em {dm(diaLocal(a.cobranca.informadoEm))}. Confira e registre o pagamento.
                    {!soLeitura && (
                      <button
                        onClick={() => naoRecebi(a.cobranca.id)}
                        className="ml-1.5 text-ink-400 underline"
                      >
                        Não recebi
                      </button>
                    )}
                  </span>
                )}
              </span>
              <span className="shrink-0 tabular-nums text-ink-200">{formatBRL(a.faltaCents)}</span>
              {!soLeitura && (
                <button
                  onClick={() => cancelar(a.cobranca.id, a.cobranca.descricao)}
                  className="shrink-0 p-1 text-ink-500"
                  aria-label={`Cancelar ${a.cobranca.descricao}`}
                >
                  <X size={15} />
                </button>
              )}
            </li>
          ))}
          {enviados.length > 0 && (
            <li className="mt-1 border-t border-ink-800 pt-2 text-[11px] leading-relaxed text-ink-500">
              <span className="font-semibold text-ink-400">Cobranças enviadas</span>
              {enviados.slice(0, 5).map((l) => (
                <span key={l.enviadoEm + l.canal} className="block">
                  {dm(diaLocal(l.enviadoEm))} · {l.canal === 'grupo' ? 'no grupo' : 'individual'} ·{' '}
                  {formatBRL(l.valorCents)}
                </span>
              ))}
              {enviados.length > 5 && <span className="block">e mais {enviados.length - 5}</span>}
            </li>
          )}
        </ul>
      )}

      {recibo ? (
        <div className="mt-3 border-t border-ink-800 pt-3">
          <div className="flex items-start gap-2">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-brand-300" />
            <p className="min-w-0 flex-1 text-sm text-brand-100">
              Pagamento registrado. Mande a confirmação para {nome} saber que foi baixado.
            </p>
          </div>
          <p className="mt-2 whitespace-pre-wrap rounded-xl bg-ink-950 px-3 py-2.5 text-xs leading-relaxed text-ink-300">
            {recibo.texto}
          </p>
          {!recibo.phone && (
            <p className="mt-2 text-[11px] leading-relaxed text-amber-300">
              {nome} está sem telefone no cadastro: o WhatsApp abre para você escolher o contato. Cadastre o telefone
              em Atletas para a confirmação ir direto para a conversa com {nome}.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="secondary" onClick={onFecharRecibo}>
              Não enviar
            </Button>
            <Button
              size="sm"
              className="flex-1"
              onClick={() => {
                abrirWhatsApp(recibo.texto, recibo.phone);
                onFecharRecibo();
              }}
            >
              <MessageCircle size={15} />
              Enviar para {nome}
            </Button>
          </div>
        </div>
      ) : recebendo ? (
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
      ) : !aberto ? null : (
        <div className={cn('mt-3 grid gap-2', soLeitura ? 'grid-cols-1' : 'grid-cols-2')}>
          <Button size="sm" variant="secondary" onClick={cobrar}>
            <MessageCircle size={15} />
            Cobrar
          </Button>
          {!soLeitura && (
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
          )}
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
  const soLeitura = useContext(SoLeitura);
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
            {!soLeitura && (
              <Button size="sm" variant="secondary" className="mt-2 w-full" onClick={() => devolver(s)}>
                <RotateCcw size={14} />
                Devolver (estornar)
              </Button>
            )}
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
  const soLeitura = useContext(SoLeitura);
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
            {p.valorCents > 0 && !estornados.has(p.id) && !soLeitura && (
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
  const soLeitura = useContext(SoLeitura);
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
        {!nova && !soLeitura && (
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
              {d.valorCents > 0 && !estornadas.has(d.id) && !soLeitura && (
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

function CobrancaAvulsa({
  dados,
  recarregar,
  onFechar,
}: {
  dados: DadosFinanceiros;
  recarregar: () => void;
  onFechar: () => void;
}) {
  const [quem, setQuem] = useState('');
  // A lista cresce com o tempo (pedido do Guilherme em 06/10/2026): busca e filtro
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState<'todos' | 'mensalista' | 'convidado'>('todos');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [vence, setVence] = useState(hoje());
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Só quem está no elenco hoje: excluídos e inativos continuam com nome nas dívidas antigas, mas não recebem cobrança nova
  const jogadores = [...dados.jogadores.values()].filter((j) => j.ativo).sort((a, b) => a.nome.localeCompare(b.nome));
  const termo = normalizar(busca);
  const visiveis = jogadores.filter(
    (j) =>
      (tipo === 'todos' || (tipo === 'convidado' ? j.kind === 'convidado' : j.kind !== 'convidado')) &&
      (!termo || normalizar(j.nome).includes(termo)),
  );
  const escolhido = jogadores.find((j) => j.id === quem);

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
      onFechar();
      recarregar();
    } catch (err) {
      setErro(explain(err));
    }
    setBusy(false);
  }

  return (
    <form onSubmit={salvar} className="mb-2 flex flex-col gap-2 rounded-2xl border border-ink-800 bg-ink-900 p-4">
      <p className="text-[15px] font-semibold text-ink-50">Cobrança avulsa</p>
      {escolhido ? (
        <div className="flex items-center gap-2 rounded-xl border border-brand-500/50 bg-brand-500/10 px-3 py-2.5">
          <span className="min-w-0 flex-1 truncate text-[15px] text-ink-50">
            <span aria-hidden className="mr-1.5">{iconeDoTipo(escolhido.kind)}</span>
            {escolhido.nome}
          </span>
          <button type="button" onClick={() => setQuem('')} className="shrink-0 text-xs text-ink-400 underline">
            trocar
          </button>
        </div>
      ) : (
        <div className="rounded-xl bg-ink-950 p-2">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Quem vai pagar? Buscar nome"
            aria-label="Buscar nome"
            className="w-full rounded-lg bg-ink-800 px-3 py-2.5 text-[15px] text-ink-50 placeholder:text-ink-500 outline-none"
          />
          <div className="mt-2 flex gap-1.5" role="group" aria-label="Filtrar por tipo">
            {(
              [
                ['todos', 'Todos'],
                ['mensalista', `${iconeDoTipo('mensalista')} Mensalistas`],
                ['convidado', `${iconeDoTipo('convidado')} Convidados`],
              ] as const
            ).map(([id, rotulo]) => (
              <button
                key={id}
                type="button"
                aria-pressed={tipo === id}
                onClick={() => setTipo(id)}
                className={cn(
                  'h-9 shrink-0 whitespace-nowrap rounded-lg border px-2.5 text-xs font-semibold',
                  tipo === id ? 'border-brand-500 bg-brand-500/15 text-brand-300' : 'border-ink-800 text-ink-400',
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>
          <ul className="mt-2 flex max-h-56 flex-col gap-1 overflow-y-auto">
            {visiveis.map((j) => (
              <li key={j.id}>
                <button
                  type="button"
                  onClick={() => setQuem(j.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-[15px] text-ink-100 active:bg-ink-800"
                >
                  <span aria-hidden>{iconeDoTipo(j.kind)}</span>
                  <span className="min-w-0 flex-1 truncate">{j.nome}</span>
                </button>
              </li>
            ))}
            {visiveis.length === 0 && <li className="px-2.5 py-2 text-sm text-ink-500">Nenhum nome encontrado.</li>}
          </ul>
        </div>
      )}
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
        <Button type="button" size="sm" variant="secondary" onClick={() => onFechar()}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" className="flex-1" disabled={busy}>
          {busy ? 'Salvando…' : 'Lançar cobrança'}
        </Button>
      </div>
    </form>
  );
}
