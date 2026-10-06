import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { AlertCircle, BellRing, Check, Hourglass, Lock, MapPin, UserPlus, X } from 'lucide-react';
import {
  guestAddPlayer,
  guestGroup,
  guestInformarPendencias,
  guestMensalidade,
  guestPendencias,
  guestSalvarWhatsapp,
  guestTemWhatsapp,
  type MensalidadeDoLink,
  guestPromover,
  guestJoin,
  guestSetAttendance,
  type GuestGroup,
  type CloudEvent,
  type PublishedTeams,
} from '@/lib/cloud';
import { distribuirVagas, type Situacao } from '@/lib/vagas';
import { nomesParecidos, normalizar } from '@/lib/juntar';
import { textoDaLista } from '@/lib/listaDoJogo';
import { faseDoJogo } from '@/lib/promocao';
import { mensagemDaMensalidade, pixCopiaECola } from '@/lib/financeiro';
import { formatBRL } from '@/lib/utils';
import { TEAM_COLOR_CLASSES } from '@/lib/draw';
import { SPORTS, getPositionLabel } from '@/lib/sports';
import type { SportId } from '@/types';
import { cn } from '@/lib/utils';
import { isValidPhone, maskPhoneInput, onlyDigits } from '@/lib/phone';
import { AvisoDoAtleta } from '@/components/cloud/Avisos';

/** Quem este aparelho é, por link. Conveniência — errar custa um toque. */
const meKey = (code: string) => `timecerto:guest:${code.toUpperCase()}`;
function readMe(code: string): string | null {
  try {
    return localStorage.getItem(meKey(code));
  } catch {
    return null;
  }
}
/**
 * Todos os nomes que este celular já usou neste link. É o que o "Já jogou
 * com a gente?" mostra — decidido pelo Guilherme em 29/09/2026: só os nomes
 * deste aparelho, não os do grupo inteiro. Celular novo não mostra nada; aí
 * vale o "Você é…?" ao digitar.
 */
const usadosKey = (code: string) => `timecerto:guest-usados:${code.toUpperCase()}`;
function readUsados(code: string): Set<string> {
  const ids = new Set<string>();
  try {
    const lista = JSON.parse(localStorage.getItem(usadosKey(code)) ?? '[]');
    if (Array.isArray(lista)) for (const id of lista) if (typeof id === 'string') ids.add(id);
  } catch {
    /* navegação privada ou valor estragado: começa vazio */
  }
  const atual = readMe(code);
  if (atual) ids.add(atual);
  return ids;
}
function lembrarUsado(code: string, id: string) {
  try {
    const ids = readUsados(code);
    ids.add(id);
    localStorage.setItem(usadosKey(code), JSON.stringify([...ids].slice(-20)));
  } catch {
    /* navegação privada: só não lembra */
  }
}

function writeMe(code: string, id: string | null) {
  if (id) lembrarUsado(code, id);
  try {
    if (id) localStorage.setItem(meKey(code), id);
    else localStorage.removeItem(meKey(code));
  } catch {
    /* navegação privada: só não lembra */
  }
}

/** Mensagem do banco (em português) ou uma genérica de rede */
function dbMessage(err: unknown, fallback: string): string {
  const msg = (err as { message?: string })?.message;
  return msg && !/fetch|network/i.test(msg) ? msg : fallback;
}

const fmtEvent = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Os dois links do WhatsApp, sem conta:
 *
 * - `/c/CÓDIGO` — o link do jogo (migração 030): o mensalista procura o nome
 *   e confirma, e pode levar alguém de fora; quem não é mensalista se inscreve
 *   como convidado ali mesmo. A maioria dos grupos tem um grupo de WhatsApp só;
 * - `/v/CÓDIGO` — só convidados: põe o nome e entra na fila. Continua vivo
 *   para quem tem dois grupos.
 *
 * Em cada jogo, o primeiro celular que responde por um nome fica com ele
 * (lib/aparelho.ts): outro celular não muda aquela resposta.
 *
 * Vaga e fila saem de `distribuirVagas`, a mesma função da tela do
 * organizador — as três telas não podem discordar sobre quem joga.
 *
 * Com a lista fechada (migração 015) o link continua vivo: quem tinha vaga
 * pode sair, quem chega entra na fila de espera, e quem foi chamado da espera
 * confirma aqui. `?eu=ID` no link — é o que o administrador manda pelo
 * WhatsApp ao chamar alguém — já abre como aquela pessoa.
 */
export function GuestGroupPage() {
  const { code = '' } = useParams();
  const [params] = useSearchParams();
  const [data, setData] = useState<GuestGroup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<string | null>(() => {
    const doLink = params.get('eu');
    if (doLink) writeMe(code, doLink);
    return doLink ?? readMe(code);
  });
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [newName, setNewName] = useState('');
  // O convidado informa a posição (pedido do Guilherme, 24/09/2026): sem ela o
  // sorteio não sabe se ele é levantador ou goleiro
  const [newPosition, setNewPosition] = useState('');
  // O WhatsApp de quem entra pelo link (migração 035): obrigatório para quem se
  // inscreve, opcional para quem o mensalista leva
  const [newPhone, setNewPhone] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  // No link do jogo o formulário serve a duas coisas: o convidado se inscrever
  // (eu) ou o mensalista levar alguém (levar)
  const [formModo, setFormModo] = useState<'eu' | 'levar'>('levar');
  const [busca, setBusca] = useState('');
  // Erro de resposta fica no cartão: "respondido de outro celular" não pode
  // apagar a página inteira
  const [respostaErro, setRespostaErro] = useState<string | null>(null);
  /*
   * Jogo e pagamento separados (pedido do Guilherme em 06/10/2026): dois
   * atletas confirmaram o pagamento querendo confirmar o jogo. Cada aba mostra
   * só o seu assunto; o link das mensagens de cobrança abre direto em
   * "Pagamento" (?aba=pagamento).
   */
  const [assunto, setAssunto] = useState<'jogo' | 'pagamento'>(() =>
    params.get('aba') === 'pagamento' ? 'pagamento' : 'jogo',
  );
  // A mensalidade do mês (migração 031): só no link do jogo, e só se o grupo cobra
  const [mensalidade, setMensalidade] = useState<MensalidadeDoLink | null>(null);

  const load = useCallback(async () => {
    try {
      // Promoção preguiçosa (migração 028): passou da hora e ninguém marcou?
      // Marca agora — é o que dispara a diária. A regra de vaga não depende disso
      await guestPromover(code).catch((e) => console.warn('promover pelo link', e));
      setData(await guestGroup(code));
      setError(null);
      // Falhar aqui não derruba o link: só some o cartão da mensalidade
      guestMensalidade(code)
        .then(setMensalidade)
        .catch((e) => console.warn('mensalidade pelo link', e));
    } catch (e) {
      console.error('convite do grupo', e);
      setError(
        navigator.onLine
          ? 'Este convite não existe mais ou o link está incompleto. Peça outro ao organizador.'
          : 'Sem internet. Conecte e tente de novo.',
      );
    }
  }, [code]);

  useEffect(() => {
    load();
  }, [load]);

  /*
   * Há pagamento em aberto, ainda não confirmado? É o alerta na aba
   * Pagamento (pedido do Guilherme em 06/10/2026), visível também de dentro da
   * aba Jogo. Relê junto com a página: depois de confirmar, o alerta some.
   */
  const [pendencia, setPendencia] = useState(false);
  useEffect(() => {
    if (!me) {
      setPendencia(false);
      return;
    }
    let vivo = true;
    guestPendencias(code, me)
      .then((e) => vivo && setPendencia(e.emAberto && !e.confirmado))
      .catch(() => vivo && setPendencia(false));
    return () => {
      vivo = false;
    };
  }, [code, me, data]);

  // Lista fechada: os times estão para sair, e a fila de espera anda — quem
  // está olhando o link vê as duas coisas chegarem sem recarregar
  const acompanhando = Boolean(data?.event?.listClosed);
  useEffect(() => {
    if (!acompanhando) return;
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, 20_000);
    return () => clearInterval(timer);
  }, [acompanhando, load]);

  if (error) return <Frame><p className="mt-10 text-center text-sm leading-relaxed text-ink-400">{error}</p></Frame>;
  if (!data) return <Frame><p className="mt-10 text-center text-sm text-ink-500">Carregando…</p></Frame>;

  const viaConvidados = data.via === 'convidados';
  const event = data.event;
  const fechada = Boolean(event?.listClosed);
  const promocaoDoJogo = {
    promoverEm: event?.promoverEm ?? null,
    promovidoEm: event?.promovidoEm ?? null,
    preferenciaPermanente: event?.preferenciaPermanente,
  };
  const dist = distribuirVagas(event?.slots ?? null, data.players, promocaoDoJogo);
  const fase = faseDoJogo(promocaoDoJogo);
  const sit = (id: string) => dist.situacao.get(id);

  const mensalistas = data.players.filter((p) => p.kind === 'mensalista');
  const convidados = data.players.filter((p) => p.kind === 'convidado');
  const fila = data.players
    .filter((p) => sit(p.id)?.tipo === 'fila')
    .sort((a, b) => posicao(sit(a.id)) - posicao(sit(b.id)));
  const comVaga = convidados.filter((p) => sit(p.id)?.tipo === 'vaga');
  const naoVao = convidados.filter((p) => sit(p.id)?.tipo === 'nao_vou');
  // Os convidados que ESTE celular já usou — só eles no "Já jogou com a gente?"
  const usados = readUsados(code);
  const usadosAqui = convidados.filter((p) => usados.has(p.id));
  // No link do jogo, o histórico do celular vale para todo mundo
  const usadosNoLink = data.players.filter((p) => usados.has(p.id));
  const termo = normalizar(busca);
  const mensalistasVisiveis = termo
    ? mensalistas.filter((p) => normalizar(p.name).includes(termo))
    : mensalistas;
  // Convidado só aparece quando a pessoa digita: a lista inteira de convidados
  // não fica exposta (decisão de 29/09/2026, a mesma do "Você é…?")
  const convidadosDaBusca =
    termo.length >= 3
      ? convidados
          .filter((p) => normalizar(p.name).includes(termo) || nomesParecidos(busca, [p]).length > 0)
          .slice(0, 3)
      : [];
  const souEu = viaConvidados || formModo === 'eu';

  /*
   * "Você é…?" enquanto digita: o nome bate com alguém do grupo? No link de
   * convidados, a pessoa confirma que é ela e não vira um cadastro novo. No
   * dos mensalistas, quem leva alguém vê que essa pessoa já existe.
   */
  const parecidos = nomesParecidos(newName, data.players);
  const mensalistaParecido = parecidos.find((p) => p.kind === 'mensalista');
  const convidadosParecidos = parecidos.filter((p) => p.kind === 'convidado');
  // Lista fechada: quem foi chamado e quem espera. No link dos mensalistas,
  // eles já estão na "Lista de espera" da lista de escolha — aqui ficam só
  // os convidados, para ninguém aparecer duas vezes
  const naSecaoDeEspera = (p: (typeof data.players)[number]) => viaConvidados || p.kind === 'convidado';
  const chamados = data.players.filter((p) => sit(p.id)?.tipo === 'chamado' && naSecaoDeEspera(p));
  const espera = data.players
    .filter(naSecaoDeEspera)
    .filter((p) => sit(p.id)?.tipo === 'espera')
    .sort((a, b) => posicao(sit(a.id)) - posicao(sit(b.id)));

  /*
   * A lista para o grupo do WhatsApp (lib/listaDoJogo.ts): mensalistas na
   * ordem em que confirmaram, depois os convidados com vaga; a fila, ou a
   * lista de espera; e o link deste convite.
   */
  const porChegada = (a: (typeof data.players)[number], b: (typeof data.players)[number]) =>
    (a.answeredAt ?? '').localeCompare(b.answeredAt ?? '');
  const tipoDe = (id: string) => sit(id)?.tipo;
  const listaParaOGrupo = event
    ? textoDaLista({
        grupo: data.group.name,
        inicio: new Date(event.startsAt),
        local: event.location,
        vagas: event.slots,
        confirmados: [
          ...mensalistas.filter((p) => tipoDe(p.id) === 'confirmado').sort(porChegada),
          ...comVaga.slice().sort(porChegada),
        ].map((p) => ({ nome: p.name, convidado: p.kind === 'convidado' })),
        fila: fila.map((p) => p.name),
        espera: [
          ...data.players.filter((p) => tipoDe(p.id) === 'chamado').map((p) => `${p.name} (chamado)`),
          ...data.players
            .filter((p) => tipoDe(p.id) === 'espera')
            .sort((a, b) => posicao(sit(a.id)) - posicao(sit(b.id)))
            .map((p) => p.name),
        ],
        livres: dist.livres,
        fechada,
        link: `${location.origin}${location.pathname}#/${viaConvidados ? 'v' : 'c'}/${code.toUpperCase()}`,
      })
    : '';

  // No link de convidados, "eu" só pode ser um convidado; no do jogo, qualquer um
  const mine = data.players.find((p) => p.id === me && (!viaConvidados || p.kind === 'convidado'));
  const naLista = Boolean(mine && ['confirmado', 'vaga', 'fila', 'espera', 'chamado'].includes(tipoDe(mine.id) ?? ''));
  // Quem desistiu também avisa o grupo: a vaga abriu (pedido do Guilherme, 29/09/2026)
  const saiuDaLista = Boolean(mine && tipoDe(mine.id) === 'nao_vou');

  const cartaoMensalidade = mine ? (
    <MeuPagamento
      key={mine.id}
      code={code}
      grupo={data.group.name}
      mensalidade={mine.kind === 'mensalista' ? mensalidade : null}
      meuId={mine.id}
      onInformado={load}
      sempre
    />
  ) : null;

  async function answer(status: 'vou' | 'nao_vou') {
    if (!event || !mine) return;
    setSaving(true);
    setRespostaErro(null);
    try {
      await guestSetAttendance(code, event.id, mine.id, status);
      await load();
    } catch (e) {
      console.error('resposta de presença', e);
      setRespostaErro(dbMessage(e, 'Não deu para salvar. Confira a internet e tente de novo.'));
    }
    setSaving(false);
  }

  async function submitName(e: React.FormEvent) {
    e.preventDefault();
    if (!event) return;
    setSaving(true);
    setFormError(null);
    try {
      if (souEu) {
        const id = await guestJoin(code, event.id, newName, newPosition, onlyDigits(newPhone));
        writeMe(code, id);
        setMe(id);
      } else {
        await guestAddPlayer(code, event.id, newName, mine?.id ?? null, newPosition, onlyDigits(newPhone));
      }
      setFormOpen(false);
      setNewName('');
      setNewPosition('');
      setNewPhone('');
      setBusca('');
      await load();
    } catch (err) {
      console.error('incluir pelo link', err);
      setFormError(dbMessage(err, 'Não deu para incluir. Confira a internet.'));
    }
    setSaving(false);
  }

  /*
   * O que acontece se a pessoa se inscrever AGORA — dito antes de ela
   * digitar, e não depois (pedido do Guilherme em 29/09/2026). É a placa na
   * porta: com as vagas cheias, quem chega decide se quer esperar.
   */
  // Texto do Guilherme, 29/09/2026: curto, sem explicar a regra
  const encerradas = {
    texto: 'As vagas estão encerradas. Coloque seu nome na lista de espera.',
    detalhe: null,
    cheio: true,
  };
  const seEntrarAgora: { texto: string; detalhe: string | null; cheio: boolean } | null = !event
    ? null
    : fase.tipo === 'mensalistas' && !fechada
      ? {
          texto: `Mensalistas têm prioridade até ${fase.quando}.`,
          detalhe: `Coloque seu nome agora: você entra na lista de espera e, ${fase.quando}, os convidados sobem para as vagas que sobrarem, por ordem de inscrição.`,
          cheio: true,
        }
      : fechada
      ? encerradas
      : event.slots == null
        ? { texto: 'Para este jogo não há limite de vagas.', detalhe: null, cheio: false }
        : (dist.livres ?? 0) > 0
          ? {
              texto:
                dist.livres === 1 ? 'Para este jogo temos 1 vaga.' : `Para este jogo temos ${dist.livres} vagas.`,
              detalhe: null,
              cheio: false,
            }
          : encerradas;

  const nameForm = (
    <form onSubmit={submitName} className="rounded-2xl border border-ink-800 bg-ink-900 p-4">
      <p className="text-[15px] font-semibold text-ink-50">
        {souEu ? 'Qual é o seu nome?' : 'Quem você vai levar?'}
      </p>
      {seEntrarAgora && (
        <div
          className={cn(
            'mt-2 rounded-xl px-3 py-2.5',
            seEntrarAgora.cheio ? 'bg-amber-500/10 text-amber-100' : 'bg-brand-500/10 text-brand-100',
          )}
        >
          <p className="text-sm font-medium leading-snug">{seEntrarAgora.texto}</p>
          {seEntrarAgora.detalhe && (
            <p className="mt-1 text-xs leading-relaxed opacity-80">{seEntrarAgora.detalhe}</p>
          )}
        </div>
      )}
      <input
        autoFocus
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        maxLength={40}
        placeholder="Nome e sobrenome"
        className="mt-3 w-full rounded-xl bg-ink-800 px-3 py-3 text-[16px] text-ink-50 placeholder:text-ink-500 outline-none"
      />
      <input
        value={newPhone}
        onChange={(e) => setNewPhone(maskPhoneInput(e.target.value))}
        inputMode="tel"
        aria-label={souEu ? 'Seu WhatsApp' : 'WhatsApp de quem você vai levar'}
        placeholder={souEu ? 'Seu WhatsApp, com DDD' : 'WhatsApp dele (opcional)'}
        className="mt-2 w-full rounded-xl bg-ink-800 px-3 py-3 text-[16px] text-ink-50 placeholder:text-ink-500 outline-none"
      />
      {convidadosParecidos.map((p) => (
        <div
          key={p.id}
          className="mt-2 flex items-center gap-2 rounded-xl border border-brand-500/30 bg-brand-500/10 px-3 py-2.5"
        >
          <span className="min-w-0 flex-1 text-sm text-brand-100">
            {souEu ? (
              <>
                Você é <strong>{p.name}</strong>?
              </>
            ) : (
              <>
                <strong>{p.name}</strong> já é convidado do grupo. É essa pessoa?
              </>
            )}
          </span>
          <button
            type="button"
            onClick={() => {
              if (souEu) {
                writeMe(code, p.id);
                setMe(p.id);
                setNewName('');
              } else {
                // Com o nome igual, o banco reconhece a pessoa e não cria outra
                setNewName(p.name);
              }
            }}
            className="shrink-0 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-ink-950"
          >
            {souEu ? 'Sou eu' : 'É ela'}
          </button>
        </div>
      ))}
      {mensalistaParecido && (
        <p className="mt-2 rounded-xl bg-ink-800 px-3 py-2.5 text-xs leading-relaxed text-ink-300">
          {souEu ? (
            <>
              <strong className="text-ink-100">{mensalistaParecido.name}</strong> está na lista de mensalistas. Se
              for você, {viaConvidados ? 'confirme pelo link dos mensalistas' : 'toque no seu nome na lista acima'}.
            </>
          ) : (
            <>
              <strong className="text-ink-100">{mensalistaParecido.name}</strong> já é mensalista — não precisa
              levar, é só ele confirmar na lista acima.
            </>
          )}
        </p>
      )}
      <p className="mt-4 text-xs font-medium text-ink-400">
        {souEu ? 'Sua posição' : 'Posição de quem você vai levar'}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-2" role="group" aria-label="Posição">
        {(SPORTS[data.group.sport as SportId]?.positions ?? []).map((pos) => (
          <button
            key={pos.id}
            type="button"
            onClick={() => setNewPosition(pos.id)}
            aria-pressed={newPosition === pos.id}
            className={cn(
              'min-h-10 rounded-xl border px-3 py-2 text-sm font-medium',
              newPosition === pos.id
                ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                : 'border-ink-800 bg-ink-950 text-ink-400',
            )}
          >
            {pos.label}
          </button>
        ))}
      </div>
      {formError && <p className="mt-2 text-sm text-red-300">{formError}</p>}
      <div className="mt-3 flex gap-2">
        {!viaConvidados && (
          <button
            type="button"
            onClick={() => {
              setFormOpen(false);
              setFormError(null);
            }}
            className="h-12 rounded-xl border border-ink-700 px-4 text-sm text-ink-300"
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={
            saving ||
            newName.trim().length < 2 ||
            !newPosition ||
            // Quem se inscreve informa o número; quem leva alguém, só se souber
            (souEu ? !isValidPhone(onlyDigits(newPhone)) : Boolean(newPhone) && !isValidPhone(onlyDigits(newPhone)))
          }
          className="h-12 flex-1 rounded-xl bg-brand-500 font-semibold text-ink-950 disabled:opacity-40"
        >
          {saving
            ? 'Enviando…'
            : fechada
              ? 'Entrar na fila de espera'
              : souEu
                ? 'Quero jogar'
                : 'Incluir convidado'}
        </button>
      </div>
    </form>
  );

  // As duas abas aparecem depois que a pessoa diz quem é
  const abas = mine ? (
    <div role="tablist" className="mt-4 grid grid-cols-2 gap-1.5 rounded-xl bg-ink-900 p-1">
      {(['jogo', 'pagamento'] as const).map((a) => (
        <button
          key={a}
          role="tab"
          aria-selected={assunto === a}
          onClick={() => setAssunto(a)}
          className={cn(
            'h-11 rounded-lg text-sm font-semibold',
            assunto === a ? 'bg-brand-500 text-ink-950' : 'text-ink-300',
          )}
        >
          {a === 'jogo' ? (
            'Jogo'
          ) : (
            <span className="inline-flex items-center gap-1.5">
              Pagamento
              {pendencia && (
                <AlertCircle
                  size={16}
                  aria-label="Há pagamento em aberto"
                  className={assunto === a ? 'text-ink-950' : 'text-amber-300'}
                />
              )}
            </span>
          )}
        </button>
      ))}
    </div>
  ) : null;

  // Aba Pagamento: só o pagamento — nada de lista nem de "Vou / Não vou"
  if (mine && assunto === 'pagamento') {
    return (
      <Frame>
        <p className="text-xs font-semibold tracking-wide text-brand-400 uppercase">
          {viaConvidados ? 'Lista de convidados' : 'Lista do jogo'}
        </p>
        <h1 className="text-2xl font-bold tracking-tight">{data.group.name}</h1>
        {abas}
        <p className="mt-4 text-sm text-ink-400">
          Você é <span className="font-semibold text-ink-50">{mine.name}</span>
          <button
            onClick={() => {
              writeMe(code, null);
              setMe(null);
              setAssunto('jogo');
            }}
            className="ml-2 text-xs text-ink-500 underline"
          >
            não sou eu
          </button>
        </p>
        {cartaoMensalidade}
      </Frame>
    );
  }

  return (
    <Frame>
      <p className="text-xs font-semibold tracking-wide text-brand-400 uppercase">
        {viaConvidados ? 'Lista de convidados' : 'Lista do jogo'}
      </p>
      <h1 className="text-2xl font-bold tracking-tight">{data.group.name}</h1>
      {abas}

      {!event ? (
        <>
          <p className="mt-6 rounded-2xl border border-ink-800 bg-ink-900 p-4 text-sm leading-relaxed text-ink-400">
            Nenhum jogo marcado agora. Quando o organizador marcar, é neste mesmo
            link que você {viaConvidados ? 'se inscreve' : 'confirma'}.
          </p>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm capitalize text-ink-300">
            {event.title ? `${event.title} · ` : ''}
            {fmtEvent(event.startsAt)}
          </p>
          {event.location && (
            <p className="flex items-center gap-1 text-sm text-ink-300">
              <MapPin size={14} className="shrink-0 text-ink-500" />
              {event.location}
            </p>
          )}
          <p className="mt-1 text-sm text-ink-400">
            {event.slots
              ? `${dist.mensalistasConfirmados + dist.convidadosComVaga} de ${event.slots} vagas preenchidas${dist.naFila ? ` · ${dist.naFila} na fila` : ''}${dist.naEspera ? ` · ${dist.naEspera} na fila de espera` : ''}`
              : `${dist.mensalistasConfirmados + dist.convidadosComVaga} confirmados`}
          </p>
          {/* Inscrição em duas fases (migração 028): a regra, e não só a fila */}
          {!fechada && fase.tipo === 'mensalistas' && (
            <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm leading-relaxed text-amber-100">
              <strong>Mensalistas confirmando até {fase.quando}.</strong> Convidados já podem colocar o nome: entram
              na lista de espera e, {fase.quando}, sobem para as vagas que sobrarem, por ordem de inscrição.
            </p>
          )}
          {!fechada && fase.tipo === 'aberto' && (
            <p className="mt-3 rounded-xl border border-brand-500/30 bg-brand-500/10 px-3 py-2.5 text-sm leading-relaxed text-brand-100">
              <strong>Aberto para todos.</strong>{' '}
              {fase.preferenciaPermanente
                ? 'Mensalista que confirmar ainda entra na frente; as outras vagas vão por ordem de chegada.'
                : 'As vagas que sobrarem vão por ordem de chegada, para mensalista ou convidado.'}
            </p>
          )}
          {fechada && (
            <p className="mt-3 flex items-center gap-2 rounded-xl border border-ink-800 bg-ink-900 px-3 py-2.5 text-sm text-ink-300">
              <Lock size={15} className="shrink-0 text-ink-500" />
              {event.teams
                ? 'Lista fechada. Os times estão abaixo.'
                : 'Lista fechada. Os times aparecem aqui assim que o organizador sortear.'}
            </p>
          )}

          {event.teams && (
            <Times published={event.teams} players={data.players} me={me} />
          )}

          {/* Eu */}
          <section className="mt-6">
            {mine ? (
              <>
                <MyCard
                  name={mine.name}
                  antesDaPromocao={fase.tipo === 'mensalistas' ? fase.quando : null}
                  situacao={sit(mine.id)}
                  convidado={mine.kind === 'convidado'}
                  fechada={fechada}
                  saving={saving}
                  onAnswer={answer}
                  onNotMe={() => {
                    writeMe(code, null);
                    setMe(null);
                    setRespostaErro(null);
                  }}
                />
                <MeuWhatsapp key={mine.id} code={code} playerId={mine.id} />
                {respostaErro && (
                  <p className="mt-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm leading-relaxed text-red-200">
                    {respostaErro}
                  </p>
                )}
                {/*
                  Pedido do Guilherme em 29/09/2026: junto da confirmação, o
                  convite para mandar a lista atualizada no grupo. O app não
                  posta sozinho no grupo; a mensagem sai pronta, a pessoa envia.
                */}
                {/*
                  Diária antecipada (migração 019): o convidado que ganhou a
                  vaga paga na hora. Só o preço e o Pix do grupo — nenhuma
                  dívida de ninguém passa por este link.
                */}
                {mine.kind === 'convidado' && tipoDe(mine.id) === 'vaga' && event?.cobrancaAntecipada && (
                  <PagarDiaria cobranca={event.cobrancaAntecipada} />
                )}
                {(naLista || saiuDaLista) && listaParaOGrupo && (
                  <div className="mt-3 rounded-2xl border border-brand-500/30 bg-brand-500/10 p-4">
                    <p className="text-sm font-semibold text-brand-100">
                      {saiuDaLista ? 'Você saiu da lista.' : 'Seu nome está na lista!'}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-brand-100/80">
                      {saiuDaLista
                        ? 'Mande a lista atualizada no grupo, para todo mundo saber que abriu vaga.'
                        : 'Agora mande a lista atualizada no grupo da pelada, para todo mundo ver quem vai.'}
                    </p>
                    <button
                      onClick={() =>
                        window.open(`https://wa.me/?text=${encodeURIComponent(listaParaOGrupo)}`, '_blank', 'noopener')
                      }
                      className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 text-sm font-semibold text-ink-950 active:scale-[0.99]"
                    >
                      Mandar a lista atualizada no grupo
                    </button>
                  </div>
                )}
                <AvisoDoAtleta code={code} playerId={mine.id} />
              </>
            ) : viaConvidados ? (
              <>
                {usadosAqui.length > 0 && (
                  <JaJogou
                    convidados={usadosAqui}
                    onEscolher={(id) => {
                      writeMe(code, id);
                      setMe(id);
                    }}
                  />
                )}
                {nameForm}
              </>
            ) : (
              <>
                <p className="text-[15px] font-semibold text-ink-50">Quem é você?</p>
                <p className="mt-1 text-xs text-ink-500">
                  Procure seu nome e toque nele. Este celular lembra da próxima vez.
                </p>
                {/* O histórico deste celular: quem já respondeu daqui */}
                {usadosNoLink.length > 0 && (
                  <div className="mt-3 flex flex-col gap-1.5">
                    {usadosNoLink.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          writeMe(code, p.id);
                          setMe(p.id);
                          setBusca('');
                        }}
                        className="flex items-center gap-3 rounded-xl border border-brand-500/40 bg-brand-500/10 px-3 py-3 text-left active:scale-[0.99]"
                      >
                        <span className="min-w-0 flex-1 truncate text-[15px] text-ink-50">{p.name}</span>
                        <span className="shrink-0 text-xs font-semibold text-brand-300">Sou eu</span>
                      </button>
                    ))}
                  </div>
                )}
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  maxLength={40}
                  placeholder="Procure seu nome"
                  aria-label="Procure seu nome"
                  className="mt-3 w-full rounded-xl bg-ink-800 px-3 py-3 text-[16px] text-ink-50 placeholder:text-ink-500 outline-none"
                />
              </>
            )}
          </section>
        </>
      )}

      {/* Mensalistas: no link deles é a lista de escolha; no de convidados, só o total */}
      {!viaConvidados ? (
        <section className="mt-4">
          {/*
            Separados pela resposta (pedido do Guilherme em 29/09/2026): quem
            ainda não respondeu fica no alto, que é onde a pessoa procura o
            próprio nome; quem já confirmou, embaixo. Sem jogo marcado não há
            resposta, e a lista fica inteira em "A confirmar".
          */}
          {gruposDeMensalistas(mine ? mensalistas : mensalistasVisiveis).map((g) => (
            <div key={g.titulo} className="mb-4">
              <p className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
                {g.titulo} ({g.jogadores.length})
              </p>
              <div className="flex flex-col gap-1.5">
                {g.jogadores.map((p) => (
                  <button
                    key={p.id}
                    disabled={Boolean(mine)}
                    onClick={() => {
                      writeMe(code, p.id);
                      setMe(p.id);
                      setBusca('');
                    }}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border px-3 py-3 text-left',
                      p.id === me ? 'border-brand-500/60 bg-brand-500/10' : 'border-ink-800 bg-ink-900',
                      !mine && 'active:scale-[0.99]',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-[15px] text-ink-50">{p.name}</span>
                    {p.position && (
                      <span className="shrink-0 text-xs text-ink-500">
                        {getPositionLabel(data.group.sport as SportId, p.position)}
                      </span>
                    )}
                    <span className="w-5 shrink-0">
                      {p.status === 'vou' && <Check size={17} className="text-brand-400" />}
                      {p.status === 'nao_vou' && <X size={17} className="text-ink-500" />}
                      {p.status === 'espera' && (
                        <span className="text-xs font-semibold text-ink-300">{posicao(sit(p.id))}º</span>
                      )}
                      {p.status === 'chamado' && <BellRing size={16} className="text-amber-300" />}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {mensalistas.length === 0 && (
            <p className="text-sm text-ink-500">O organizador ainda não cadastrou os mensalistas.</p>
          )}
          {!mine && termo && mensalistasVisiveis.length === 0 && mensalistas.length > 0 && (
            <p className="mb-2 text-sm text-ink-500">Nenhum mensalista com esse nome.</p>
          )}
          {/* Não é mensalista: convidado já conhecido, ou inscrição nova */}
          {!mine && event && (
            <div className="mt-2 flex flex-col gap-2">
              {convidadosDaBusca.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 rounded-xl border border-brand-500/30 bg-brand-500/10 px-3 py-2.5"
                >
                  <span className="min-w-0 flex-1 text-sm text-brand-100">
                    Você é <strong>{p.name}</strong>? <span className="text-brand-100/70">(convidado)</span>
                  </span>
                  <button
                    onClick={() => {
                      writeMe(code, p.id);
                      setMe(p.id);
                      setBusca('');
                    }}
                    className="shrink-0 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-ink-950"
                  >
                    Sou eu
                  </button>
                </div>
              ))}
              {formOpen && formModo === 'eu' ? (
                nameForm
              ) : (
                <button
                  onClick={() => {
                    setFormModo('eu');
                    setNewName(busca.trim());
                    setFormError(null);
                    setFormOpen(true);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-ink-700 py-3.5 text-sm font-medium text-brand-300"
                >
                  <UserPlus size={17} />
                  Não sou mensalista — quero jogar como convidado
                </button>
              )}
            </div>
          )}
        </section>
      ) : (
        event && (
          <section className="mt-6">
            <p className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
              Mensalistas confirmados ({dist.mensalistasConfirmados})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {mensalistas
                .filter((p) => sit(p.id)?.tipo === 'confirmado')
                .map((p) => (
                  <span
                    key={p.id}
                    className="flex items-center gap-1 rounded-lg bg-brand-500/15 px-2 py-1 text-xs text-brand-200"
                  >
                    <Check size={12} />
                    {p.name}
                  </span>
                ))}
              {dist.mensalistasConfirmados === 0 && (
                <span className="text-xs text-ink-500">Ninguém confirmou ainda.</span>
              )}
            </div>
          </section>
        )
      )}

      {/*
        Convidados separados como os mensalistas (pedido do Guilherme em
        29/09/2026): confirmados, na fila e não vão. "Confirmados" aqui é quem
        ganhou vaga — antes a linha dizia "com vaga", que não ficava claro. A
        lista de espera da lista fechada vem logo abaixo.
      */}
      {event &&
        [
          { titulo: 'Convidados confirmados', lista: comVaga, fila: false },
          { titulo: 'Convidados na fila', lista: fila, fila: true },
          { titulo: 'Convidados que não vão', lista: naoVao, fila: false },
        ]
          .filter((g) => g.lista.length > 0)
          .map((g) => (
            <section key={g.titulo} className="mt-6">
              <p className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
                {g.titulo} ({g.lista.length})
              </p>
              <div className="flex flex-col gap-1.5">
                {g.lista.map((p) => (
                  <GuestLine key={p.id} name={p.name} invitedBy={p.invitedBy} mine={p.id === me}>
                    {g.fila && <span className="text-xs text-ink-400">{posicao(sit(p.id))}º na fila</span>}
                  </GuestLine>
                ))}
              </div>
            </section>
          ))}

      {/* Lista fechada: a fila de espera, na ordem em que será chamada */}
      {event && fechada && (chamados.length > 0 || espera.length > 0) && (
        <section className="mt-6">
          <p className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">
            Convidados na lista de espera
          </p>
          <div className="flex flex-col gap-1.5">
            {chamados.map((p) => (
              <GuestLine key={p.id} name={p.name} invitedBy={p.invitedBy} mine={p.id === me}>
                <span className="text-xs font-medium text-amber-300">chamado, confirmando</span>
              </GuestLine>
            ))}
            {espera.map((p) => (
              <GuestLine key={p.id} name={p.name} invitedBy={p.invitedBy} mine={p.id === me}>
                <span className="text-xs text-ink-400">{posicao(sit(p.id))}º na espera</span>
              </GuestLine>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
            Se alguém com vaga sair, o primeiro da espera é chamado para confirmar. Mensalistas vêm antes
            dos convidados.
          </p>
        </section>
      )}

      {/* Mensalista leva alguém de fora */}
      {!viaConvidados && event && mine?.kind === 'mensalista' && (
        <section className="mt-4">
          {formOpen && formModo === 'levar' ? (
            nameForm
          ) : (
            <button
              onClick={() => {
                setFormModo('levar');
                setNewName('');
                setFormError(null);
                setFormOpen(true);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-ink-700 py-3.5 text-sm font-medium text-brand-300"
            >
              <UserPlus size={17} />
              {fechada ? 'Pôr alguém de fora na fila de espera' : 'Levar alguém de fora'}
            </button>
          )}
        </section>
      )}
    </Frame>
  );
}

type Mensalista = GuestGroup['players'][number];

/**
 * A lista de escolha do link dos mensalistas em quatro grupos (pedido do
 * Guilherme em 29/09/2026): a confirmar, confirmados, lista de espera e não
 * vão. Grupo vazio não aparece. Dentro de cada um, a ordem do link (alfabética).
 */
function gruposDeMensalistas(lista: Mensalista[]): { titulo: string; jogadores: Mensalista[] }[] {
  const de = (f: (p: Mensalista) => boolean) => lista.filter(f);
  return [
    { titulo: 'A confirmar', jogadores: de((p) => !p.status || p.status === 'pulado') },
    { titulo: 'Confirmados', jogadores: de((p) => p.status === 'vou') },
    { titulo: 'Lista de espera', jogadores: de((p) => p.status === 'espera' || p.status === 'chamado') },
    { titulo: 'Não vão', jogadores: de((p) => p.status === 'nao_vou') },
  ].filter((g) => g.jogadores.length > 0);
}

/**
 * O pagamento no link do jogo (migrações 031 e 033, pedidos do Guilherme em
 * 05/10/2026). Só confirma: nada de itens nem valores aqui — a lista com os
 * valores vai na mensagem do grupo e na cobrança individual. Assim, tocar no
 * nome de outra pessoa não revela o que ela deve.
 *
 * "Confirmar pagamento" marca tudo o que está em aberto como a conferir; não é
 * baixa. Para o mensalista, depois dele, a lista da mensalidade para mandar
 * de volta no grupo, com o ✅ no nome dele.
 */
function MeuPagamento({
  code,
  grupo,
  mensalidade,
  meuId,
  onInformado,
  sempre = false,
}: {
  code: string;
  grupo: string;
  /** Só para mensalista no link do jogo, e só se o grupo cobra mensalidade */
  mensalidade: MensalidadeDoLink | null;
  meuId: string;
  onInformado: () => Promise<void> | void;
  /** Na aba Pagamento: aparece mesmo sem nada em aberto, dizendo isso */
  sempre?: boolean;
}) {
  const [estado, setEstado] = useState<{ emAberto: boolean; confirmado: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    guestPendencias(code, meuId)
      .then((e) => vivo && setEstado(e))
      .catch((e) => console.warn('pendências pelo link', e));
    return () => {
      vivo = false;
    };
  }, [code, meuId]);

  const eu = mensalidade?.mensalistas.find((m) => m.id === meuId);
  const mesOk = Boolean(eu && (eu.pago || eu.informadoEm || eu.isento));
  const lista =
    mensalidade && mesOk
      ? mensagemDaMensalidade({
          grupo,
          mes: mensalidade.mes,
          venceEm: mensalidade.venceEm,
          valorCents: mensalidade.valorCents,
          pixChave: mensalidade.pix.chave,
          lista: mensalidade.mensalistas.map((m) => ({
            nome: m.name,
            ok: m.pago || Boolean(m.informadoEm) || Boolean(m.isento),
          })),
          link: `${location.origin}${location.pathname}#/c/${code.toUpperCase()}?aba=pagamento`,
        })
      : null;

  if (!estado) return sempre ? <p className="mt-4 text-sm text-ink-500">Carregando…</p> : null;
  // Nada em aberto e nada para mandar: fora da aba própria, o cartão não aparece
  if (!estado.emAberto && !lista && !sempre) return null;

  async function confirmar() {
    // Confirmar por engano marca "a conferir" — pergunta antes
    if (!window.confirm('Você já fez o pagamento? O organizador vai conferir no extrato.')) return;
    setBusy(true);
    setErro(null);
    try {
      await guestInformarPendencias(code, meuId);
      setEstado(await guestPendencias(code, meuId));
      await onInformado();
    } catch (e) {
      console.error('confirmar pagamento', e);
      setErro(dbMessage(e, 'Não deu para confirmar. Confira a internet e tente de novo.'));
    }
    setBusy(false);
  }

  return (
    <div className="mt-3 rounded-2xl border border-ink-800 bg-ink-900 p-4">
      <p className="text-[15px] font-semibold text-ink-50">Pagamento</p>
      {estado.confirmado ? (
        <p className="mt-2 flex items-start gap-2 text-sm leading-relaxed text-brand-200">
          <Check size={16} className="mt-0.5 shrink-0" />
          Você confirmou o pagamento. O organizador vai conferir.
        </p>
      ) : estado.emAberto ? (
        <>
          <p className="mt-1 text-sm leading-relaxed text-ink-400">
            Já fez o pagamento? Confirme aqui para o organizador conferir.
          </p>
          <button
            disabled={busy}
            onClick={confirmar}
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 text-sm font-semibold text-ink-950 active:scale-[0.99] disabled:opacity-50"
          >
            <Check size={17} />
            {busy ? 'Confirmando…' : 'Confirmar pagamento'}
          </button>
        </>
      ) : (
        <p className="mt-2 flex items-center gap-2 text-sm font-medium text-brand-200">
          <Check size={16} className="shrink-0" />
          Nenhum pagamento em aberto.
        </p>
      )}

      {lista && (
        <button
          onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(lista)}`, '_blank', 'noopener')}
          className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-brand-500/50 text-sm font-semibold text-brand-200 active:scale-[0.99]"
        >
          Mandar a lista da mensalidade no grupo
        </button>
      )}
      {erro && <p className="mt-2 text-sm text-red-300">{erro}</p>}
    </div>
  );
}

/**
 * "Cadastre seu WhatsApp" (migração 035): para quem se identificou e ainda
 * não tem número — a cobrança e os avisos do organizador vão direto para ele.
 * O link só sabe SE a pessoa tem número, nunca qual. Quem já tem não troca por
 * aqui: trocar é com o organizador.
 */
function MeuWhatsapp({ code, playerId }: { code: string; playerId: string }) {
  const [tem, setTem] = useState<boolean | null>(null);
  const [fone, setFone] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    let vivo = true;
    guestTemWhatsapp(code, playerId)
      .then((t) => vivo && setTem(t))
      .catch((e) => console.warn('whatsapp pelo link', e));
    return () => {
      vivo = false;
    };
  }, [code, playerId]);

  if (salvo) {
    return (
      <p className="mt-3 flex items-center gap-2 text-sm text-brand-200">
        <Check size={16} className="shrink-0" />
        WhatsApp cadastrado. Obrigado!
      </p>
    );
  }
  if (tem !== false) return null;

  const digitos = onlyDigits(fone);
  async function salvar() {
    setBusy(true);
    setErro(null);
    try {
      await guestSalvarWhatsapp(code, playerId, digitos);
      setSalvo(true);
    } catch (e) {
      console.error('salvar whatsapp', e);
      setErro(dbMessage(e, 'Não deu para salvar. Confira a internet e tente de novo.'));
    }
    setBusy(false);
  }

  return (
    <div className="mt-3 rounded-2xl border border-ink-800 bg-ink-900 p-4">
      <p className="text-[15px] font-semibold text-ink-50">Cadastre seu WhatsApp</p>
      <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
        Para o organizador falar com você direto: cobranças e avisos do jogo.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          value={fone}
          onChange={(e) => setFone(maskPhoneInput(e.target.value))}
          inputMode="tel"
          aria-label="Seu WhatsApp"
          placeholder="(11) 98765-4321"
          className="min-w-0 flex-1 rounded-xl bg-ink-800 px-3 py-3 text-[16px] text-ink-50 placeholder:text-ink-500 outline-none"
        />
        <button
          disabled={busy || !isValidPhone(digitos)}
          onClick={salvar}
          className="shrink-0 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-ink-950 disabled:opacity-40"
        >
          {busy ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
      {erro && <p className="mt-2 text-sm text-red-300">{erro}</p>}
    </div>
  );
}

function PagarDiaria({ cobranca }: { cobranca: NonNullable<CloudEvent['cobrancaAntecipada']> }) {
  const [copiado, setCopiado] = useState(false);
  const codigo =
    cobranca.pixChave && cobranca.pixNome && cobranca.pixCidade
      ? pixCopiaECola({
          chave: cobranca.pixChave,
          nome: cobranca.pixNome,
          cidade: cobranca.pixCidade,
          valorCents: cobranca.diariaCents,
        })
      : null;

  async function copiar() {
    if (!codigo) return;
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      /* sem permissão de área de transferência: o código está à vista para copiar à mão */
    }
  }

  return (
    <div className="mt-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
      <p className="text-sm font-semibold text-amber-100">Diária deste jogo: {formatBRL(cobranca.diariaCents)}</p>
      {codigo ? (
        <>
          <p className="mt-0.5 text-xs leading-relaxed text-amber-100/80">
            Copie o código e cole no app do seu banco, em Pix › Copia e cola. O valor já vai preenchido.
          </p>
          <p className="mt-2 break-all rounded-xl bg-ink-950 px-3 py-2 font-mono text-[11px] leading-relaxed text-ink-300 select-all">
            {codigo}
          </p>
          <button
            onClick={copiar}
            className="mt-2 flex h-11 w-full items-center justify-center rounded-xl bg-amber-400 text-sm font-semibold text-ink-950 active:scale-[0.99]"
          >
            {copiado ? 'Código copiado!' : 'Copiar o código Pix'}
          </button>
          <p className="mt-2 text-[11px] leading-relaxed text-amber-100/70">
            Se desistir antes do jogo, a cobrança é cancelada. Se já tiver pago, o organizador devolve ou deixa de
            crédito para o próximo.
          </p>
        </>
      ) : (
        <p className="mt-0.5 text-xs leading-relaxed text-amber-100/80">Combine o pagamento com o organizador.</p>
      )}
    </div>
  );
}

function posicao(s: Situacao | undefined): number {
  return s?.tipo === 'fila' || s?.tipo === 'espera' ? s.posicao : 0;
}

function MyCard({
  name,
  antesDaPromocao,
  situacao,
  convidado,
  fechada,
  saving,
  onAnswer,
  onNotMe,
}: {
  name: string;
  /** "quinta às 20h": a fila ainda espera a promoção (migração 028) */
  antesDaPromocao?: string | null;
  situacao: Situacao | undefined;
  convidado: boolean;
  /** Lista fechada: vale a fila de espera (migração 015) */
  fechada: boolean;
  saving: boolean;
  onAnswer: (s: 'vou' | 'nao_vou') => void;
  onNotMe: () => void;
}) {
  const cabecalho = (
    <p className="text-sm text-ink-400">
      Você é <span className="font-semibold text-ink-50">{name}</span>
      <button onClick={onNotMe} className="ml-2 text-xs text-ink-500 underline">
        não sou eu
      </button>
    </p>
  );
  const botao = (texto: React.ReactNode, onClick: () => void, forte = true) => (
    <button
      disabled={saving}
      onClick={onClick}
      className={cn(
        'flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl border text-base font-semibold active:scale-[0.98] disabled:opacity-50',
        forte ? 'border-brand-500 bg-brand-500 text-ink-950' : 'border-ink-700 bg-ink-800 text-ink-100',
      )}
    >
      {texto}
    </button>
  );

  if (fechada) {
    const tipo = situacao?.tipo;
    // Abriu vaga para ele: a pergunta que importa, em destaque
    if (tipo === 'chamado') {
      return (
        <div className="rounded-2xl border-2 border-amber-400/70 bg-amber-500/10 p-4">
          {cabecalho}
          <p className="mt-3 flex items-center gap-2 text-lg font-bold text-amber-200">
            <BellRing size={20} className="shrink-0" />
            Abriu uma vaga para você!
          </p>
          <p className="mt-1 text-sm leading-relaxed text-amber-100/85">
            Você era o próximo da fila de espera. Ainda quer jogar? Se não puder, a vaga vai
            para o próximo.
          </p>
          <div className="mt-3 flex gap-2">
            {botao(<><Check size={20} /> Sim, quero jogar</>, () => onAnswer('vou'))}
            {botao(<><X size={20} /> Não posso</>, () => onAnswer('nao_vou'), false)}
          </div>
        </div>
      );
    }
    const vai = tipo === 'confirmado' || tipo === 'vaga';
    const esperando = tipo === 'espera' || tipo === 'fila';
    return (
      <div className="rounded-2xl border border-ink-800 bg-ink-900 p-4">
        {cabecalho}
        {vai ? (
          <>
            <p className="mt-3 rounded-xl bg-brand-500/15 px-3 py-2.5 text-sm font-medium text-brand-200">
              {tipo === 'vaga' ? 'Você tem vaga neste jogo' : 'Presença confirmada'}
            </p>
            <button
              disabled={saving}
              onClick={() => {
                if (window.confirm('Sair do jogo? A sua vaga vai para o próximo da fila de espera.')) {
                  onAnswer('nao_vou');
                }
              }}
              className="mt-3 text-sm text-ink-400 underline"
            >
              Não vou mais
            </button>
          </>
        ) : esperando ? (
          <>
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-ink-800 px-3 py-2.5 text-sm text-ink-200">
              <Hourglass size={16} className="mt-0.5 shrink-0 text-ink-400" />
              <span>
                Você é o <strong>{situacao && 'posicao' in situacao ? situacao.posicao : 1}º</strong> da fila de
                espera. Se alguém sair, você é chamado aqui para confirmar — e o organizador te avisa.
              </span>
            </p>
            <button disabled={saving} onClick={() => onAnswer('nao_vou')} className="mt-3 text-sm text-ink-400 underline">
              Sair da fila
            </button>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm leading-relaxed text-ink-300">
              {tipo === 'pulado'
                ? 'Abriu uma vaga, mas a vez passou para o próximo antes da sua resposta.'
                : 'A lista deste jogo já fechou.'}{' '}
              Ainda dá para entrar na fila de espera: se alguém sair, você é chamado para confirmar.
            </p>
            <div className="mt-3 flex">
              {botao(tipo === 'pulado' ? 'Voltar para a fila de espera' : 'Entrar na fila de espera', () => onAnswer('vou'))}
            </div>
          </>
        )}
      </div>
    );
  }

  const vai = situacao?.tipo === 'confirmado' || situacao?.tipo === 'vaga' || situacao?.tipo === 'fila';
  const status =
    situacao?.tipo === 'vaga'
      ? { text: 'Você tem vaga neste jogo', tone: 'ok' as const }
      : situacao?.tipo === 'fila'
        ? {
            text: antesDaPromocao
              ? `Você é o ${situacao.posicao}º da lista de espera. ${antesDaPromocao[0].toUpperCase()}${antesDaPromocao.slice(1)}, os convidados sobem por ordem de inscrição para as vagas que sobrarem.`
              : `Você é o ${situacao.posicao}º da fila. Se abrir vaga, você entra sozinho.`,
            tone: 'wait' as const,
          }
        : situacao?.tipo === 'confirmado'
          ? { text: 'Presença confirmada', tone: 'ok' as const }
          : null;

  return (
    <div className="rounded-2xl border border-ink-800 bg-ink-900 p-4">
      {cabecalho}
      {status && (
        <p
          className={cn(
            'mt-3 rounded-xl px-3 py-2.5 text-sm font-medium',
            status.tone === 'ok' ? 'bg-brand-500/15 text-brand-200' : 'bg-ink-800 text-ink-200',
          )}
        >
          {status.text}
        </p>
      )}
      <p className="mt-3 text-[15px] font-semibold text-ink-50">
        {convidado ? (vai ? 'Mudou de ideia?' : 'Vai jogar?') : 'Você vai?'}
      </p>
      <div className="mt-2 flex gap-2">
        <button
          disabled={saving}
          onClick={() => onAnswer('vou')}
          className={cn(
            'flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl border text-base font-semibold active:scale-[0.98]',
            vai ? 'border-brand-500 bg-brand-500 text-ink-950' : 'border-ink-700 bg-ink-800 text-ink-100',
          )}
        >
          <Check size={20} /> Vou
        </button>
        <button
          disabled={saving}
          onClick={() => onAnswer('nao_vou')}
          className={cn(
            'flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl border text-base font-semibold active:scale-[0.98]',
            situacao?.tipo === 'nao_vou'
              ? 'border-ink-400 bg-ink-600 text-ink-50'
              : 'border-ink-700 bg-ink-800 text-ink-100',
          )}
        >
          <X size={20} /> Não vou
        </button>
      </div>
      {convidado && vai && (
        <p className="mt-2 text-xs leading-relaxed text-ink-500">
          Se desistir e depois voltar, você vai para o fim da fila.
        </p>
      )}
    </div>
  );
}

/**
 * Os times publicados pelo organizador. O banco manda só ids; o nome sai da
 * lista do próprio link, que já vem com apelido. Id que não está mais na lista
 * (a pessoa saiu do grupo depois do sorteio) simplesmente não aparece.
 */
function Times({
  published,
  players,
  me,
}: {
  published: PublishedTeams;
  players: GuestGroup['players'];
  me: string | null;
}) {
  const nomeDe = new Map(players.map((p) => [p.id, p.name]));
  const nomes = (ids: string[]) =>
    ids.flatMap((id) => (nomeDe.has(id) ? [{ id, name: nomeDe.get(id)! }] : []));
  const bench = nomes(published.bench);
  const meuTime = published.teams.find((t) => me && t.players.includes(me));

  return (
    <section className="mt-6">
      <p className="mb-2 text-xs font-semibold tracking-wide text-brand-400 uppercase">
        Times sorteados
      </p>
      {meuTime && (
        <p className="mb-2 text-sm text-ink-300">
          Você está no <span className="font-semibold text-ink-50">{meuTime.name}</span>.
        </p>
      )}
      {!meuTime && me && published.bench.includes(me) && (
        <p className="mb-2 text-sm text-ink-300">Você começa como reserva.</p>
      )}
      <div className="flex flex-col gap-2">
        {published.teams.map((t) => {
          const c = TEAM_COLOR_CLASSES[t.color] ?? TEAM_COLOR_CLASSES.verde;
          const lista = nomes(t.players);
          return (
            <div
              key={t.name}
              className={cn(
                'rounded-2xl border bg-ink-900 px-4 py-3',
                t === meuTime ? 'border-brand-500/60' : 'border-ink-800',
              )}
            >
              <p className="flex items-center gap-2">
                <span className={cn('size-3 shrink-0 rounded-full', c.bg)} />
                <span className="min-w-0 flex-1 truncate font-semibold text-ink-50">{t.name}</span>
                <span className="shrink-0 text-xs text-ink-500">{lista.length} jogadores</span>
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-300">
                {lista.map((p, i) => (
                  <span key={p.id}>
                    {i > 0 && ' · '}
                    <span className={p.id === me ? 'font-semibold text-brand-200' : undefined}>
                      {p.name}
                    </span>
                  </span>
                ))}
              </p>
            </div>
          );
        })}
        {bench.length > 0 && (
          <div className="rounded-2xl border border-dashed border-ink-800 px-4 py-3">
            <p className="text-xs font-medium text-ink-400">Reservas ({bench.length})</p>
            <p className="mt-1 text-sm text-ink-300">{bench.map((p) => p.name).join(' · ')}</p>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Quem já jogou como convidado toca no próprio nome em vez de digitar de novo
 * (pedido do Guilherme em 29/09/2026). Digitar criava "Bia" numa semana e
 * "Beatriz" na outra, e o celular novo não lembrava de ninguém. Só o nome —
 * o link já mostra os nomes; telefone e nível nunca saem daqui.
 */
function JaJogou({
  convidados,
  onEscolher,
}: {
  convidados: GuestGroup['players'];
  onEscolher: (id: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const q = busca.trim().toLowerCase();
  const lista = q ? convidados.filter((p) => p.name.toLowerCase().includes(q)) : convidados;

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="mb-3 flex w-full items-center justify-between rounded-2xl border border-ink-800 bg-ink-900 px-4 py-3.5 text-left"
      >
        <span>
          <span className="block text-[15px] font-semibold text-ink-50">Já jogou com a gente?</span>
          <span className="block text-xs text-ink-500">Encontre o seu nome em vez de digitar</span>
        </span>
        <span className="shrink-0 text-sm font-medium text-brand-300">Encontrar</span>
      </button>
    );
  }
  return (
    <div className="mb-3 rounded-2xl border border-ink-800 bg-ink-900 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[15px] font-semibold text-ink-50">Toque no seu nome</p>
        <button onClick={() => setAberto(false)} className="text-xs text-ink-500 underline">
          fechar
        </button>
      </div>
      {convidados.length > 8 && (
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar nome"
          aria-label="Buscar nome"
          className="mt-3 w-full rounded-xl bg-ink-800 px-3 py-2.5 text-[15px] text-ink-50 placeholder:text-ink-500 outline-none"
        />
      )}
      <div className="mt-3 flex max-h-72 flex-col gap-1.5 overflow-y-auto">
        {lista.map((p) => (
          <button
            key={p.id}
            onClick={() => onEscolher(p.id)}
            className="rounded-xl border border-ink-800 bg-ink-950 px-3 py-3 text-left text-[15px] text-ink-50 active:scale-[0.99]"
          >
            {p.name}
          </button>
        ))}
        {lista.length === 0 && <p className="py-2 text-sm text-ink-500">Nenhum nome encontrado.</p>}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-500">Não achou? Preencha abaixo, como na primeira vez.</p>
    </div>
  );
}

function GuestLine({
  name,
  invitedBy,
  mine,
  children,
}: {
  name: string;
  invitedBy: string | null;
  mine: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border px-3 py-2.5',
        mine ? 'border-brand-500/60 bg-brand-500/10' : 'border-ink-800 bg-ink-900',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] text-ink-50">{name}</span>
        {invitedBy && (
          <span className="block truncate text-[11px] text-ink-500">convidado de {invitedBy}</span>
        )}
      </span>
      <span className="shrink-0">{children}</span>
    </div>
  );
}

export function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-12">
      <p className="safe-top pt-6 pb-4 text-sm font-bold tracking-tight text-ink-400">
        Time<span className="text-brand-400">Certo</span>
      </p>
      {children}
    </div>
  );
}
