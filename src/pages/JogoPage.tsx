import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  BellRing,
  Check,
  ChevronRight,
  Flag,
  MapPin,
  MessageCircle,
  Pencil,
  PlayCircle,
  Plus,
  Radio,
  RotateCcw,
  Search,
  Shuffle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FormJogo } from '@/components/jogo/FormJogo';
import { SeloStatus } from '@/components/jogo/SeloStatus';
import { haQuantoChamado, statusDoJogo } from '@/lib/jogo';
import { useAppStore } from '@/store/useAppStore';
import { useJogo, useJogoStore, useProximoJogo } from '@/store/useJogoStore';
import { useMatchStore } from '@/store/useMatchStore';
import { useHydrated } from '@/store/useHydrated';
import { nomeDeExibicao } from '@/lib/nome';
import { vagasDoJogo, joga, type Situacao } from '@/lib/vagas';
import { hasSavedSession, isCloudAvailable } from '@/lib/sessao';
import { TEAM_COLOR_CLASSES, encaixarNoSorteio } from '@/lib/draw';
import { computeAllStats, formatDate } from '@/lib/stats';
import { SPORTS } from '@/lib/sports';
import { setsWonBy } from '@/lib/volleyStats';
import { cn, initials } from '@/lib/utils';
import type { Jogo, Player } from '@/types';

// A parte dos links traz o Supabase: só para quem tem sessão salva
const LinksDoJogo = lazy(() =>
  import('@/components/cloud/LinksDoJogo').then((m) => ({ default: m.LinksDoJogo })),
);

type Aba = 'confirmados' | 'times' | 'partidas' | 'estatistica';
const ABAS: { id: Aba; label: string }[] = [
  { id: 'confirmados', label: 'Confirmados' },
  { id: 'times', label: 'Times' },
  { id: 'partidas', label: 'Partidas' },
  { id: 'estatistica', label: 'Estatística' },
];

// A busca sobrevive à troca de aba. Memória da sessão, como a rolagem da barra
let buscaGuardada = '';

const fmtDia = (j: Jogo) =>
  new Date(`${j.date}T${j.time}`).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  });

/**
 * A página de um jogo (pedido do Guilherme em 24/09/2026): confirmados, times
 * sorteados, partidas e estatística daquele jogo. Tudo pertence ao jogo — o
 * sorteio (`Jogo.sorteio`) e as partidas (`Match.jogoId`) — e, com conta, é
 * igual em todos os aparelhos (migração 013).
 */
export function JogoPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const aba = (params.get('aba') as Aba) || 'confirmados';
  const navigate = useNavigate();
  const hydrated = useHydrated();
  const jogo = useJogo(id);
  const proximo = useProximoJogo();

  // Espera o armazenamento: decidir "não existe" antes da leitura expulsaria
  // o usuário de um jogo que existe (Armadilhas, CLAUDE.md)
  if (!hydrated) return null;
  if (!jogo) return <Navigate to="/amador" replace />;

  return <Pagina jogo={jogo} proximo={proximo} aba={aba} setAba={(a) => setParams({ aba: a }, { replace: true })} navigate={navigate} />;
}

function Pagina({
  jogo,
  proximo,
  aba,
  setAba,
  navigate,
}: {
  jogo: Jogo;
  proximo: Jogo | null;
  aba: Aba;
  setAba: (a: Aba) => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const allPlayers = useAppStore((s) => s.players);
  const players = useMemo(() => allPlayers.filter((p) => !p.pending), [allPlayers]);
  const editarJogo = useJogoStore((s) => s.editarJogo);
  const live = useMatchStore((s) => s.live);
  const matches = useMatchStore((s) => s.matches);
  const startMatch = useMatchStore((s) => s.startMatch);
  const [editando, setEditando] = useState(false);
  const sportDoApp = useAppStore((s) => s.sport);
  const setSport = useAppStore((s) => s.setSport);

  /*
   * O esporte é do jogo (migração 014). Abrir um jogo põe o app nele: o
   * sorteio, a partida e os níveis do elenco leem o esporte do app, e assim
   * seguem o jogo sem cada tela precisar saber de qual jogo veio.
   */
  useEffect(() => {
    if (sportDoApp !== jogo.sport) setSport(jogo.sport);
  }, [jogo.sport, sportDoApp, setSport]);
  const [busy, setBusy] = useState(false);
  const [comSessao] = useState(hasSavedSession);

  const dist = useMemo(() => vagasDoJogo(jogo, players), [jogo, players]);
  const jogam = players.filter((p) => joga(dist.situacao.get(p.id))).length;
  const partidas = matches.filter((m) => m.jogoId === jogo.id);
  const liveDoJogo = live?.jogoId === jogo.id ? live : null;
  const ehProximo = proximo?.id === jogo.id;

  /*
   * Com o jogo nos links, a lista FECHA antes de sortear: aberta, uma resposta
   * que chegasse depois mudaria quem tem vaga, e os times publicados deixariam
   * de bater com a lista do link. Sem sinal, avisa e deixa sortear — o
   * sorteio é local.
   */
  const fechaAntes = Boolean(ehProximo && jogo.remoteId && !jogo.listaFechada && comSessao);
  async function sortear() {
    if (fechaAntes && jogo.remoteId) {
      setBusy(true);
      try {
        const { setListClosed } = await import('@/lib/cloud');
        await setListClosed(jogo.remoteId, true);
        useJogoStore.getState().atualizarJogo(jogo.id, { listaFechada: true });
      } catch (e) {
        console.error('fechar a lista', e);
        setBusy(false);
        if (!window.confirm('Não deu para fechar a lista dos links. Sortear assim mesmo?')) return;
      }
      setBusy(false);
    }
    navigate('/sortear', { state: { jogoId: jogo.id } });
  }

  function comecarPartida() {
    const s = jogo.sorteio;
    if (!s || s.teams.length < 2) return;
    const [a, b] = s.teams;
    startMatch({
      sport: s.sport,
      jogoId: jogo.id,
      teams: [
        { id: a.id, name: a.name, color: a.color, playerIds: a.players.map((p) => p.id) },
        { id: b.id, name: b.name, color: b.color, playerIds: b.players.map((p) => p.id) },
      ],
    });
    navigate('/placar');
  }

  function mudarStatus(status: Jogo['status']) {
    const pergunta =
      status === 'cancelado'
        ? 'Cancelar este jogo? Ele sai dos links e fica em Anteriores.'
        : status === 'encerrado'
          ? 'Encerrar este jogo? Ele sai dos links e fica em Anteriores, com times e partidas.'
          : 'Reabrir este jogo? Ele volta para os próximos jogos.';
    if (window.confirm(pergunta)) editarJogo(jogo.id, { status });
  }

  const rodape =
    aba === 'estatistica' || jogo.status !== 'aberto'
      ? null
      : aba === 'confirmados' || !jogo.sorteio
        ? {
            texto:
              jogam < 4
                ? 'Mínimo de 4 confirmados'
                : `${fechaAntes ? 'Fechar a lista e sortear' : jogo.sorteio ? 'Sortear de novo' : 'Sortear'} (${jogam})`,
            icone: <Shuffle size={19} strokeWidth={2.5} />,
            acao: sortear,
            desabilitado: jogam < 4 || busy,
          }
        : liveDoJogo
          ? { texto: 'Continuar a partida', icone: <Radio size={19} />, acao: () => navigate('/placar'), desabilitado: false }
          : { texto: 'Começar partida', icone: <PlayCircle size={19} />, acao: comecarPartida, desabilitado: Boolean(live) };

  return (
    <div className={cn('mx-auto flex min-h-full w-full max-w-lg flex-col px-4', rodape ? 'pb-32' : 'pb-10')}>
      <header className="safe-top flex items-start gap-2 pt-6 pb-3">
        <button onClick={() => navigate('/amador')} className="-ml-1 p-1 pt-0.5 text-ink-400" aria-label="Voltar aos jogos">
          <ArrowLeft size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold capitalize">{fmtDia(jogo)}</h1>
          <p className="flex items-center gap-1 truncate text-sm text-ink-400">
            <span aria-hidden>{SPORTS[jogo.sport].emoji}</span>
            <span className="text-ink-300">{SPORTS[jogo.sport].name}</span>
            <span className="text-ink-600">·</span>
            {jogo.time}
            {jogo.place && (
              <>
                <span className="text-ink-600">·</span>
                <MapPin size={13} className="shrink-0 text-ink-500" />
                <span className="truncate">{jogo.place}</span>
              </>
            )}
          </p>
        </div>
        {jogo.status === 'aberto' && (
          <button
            onClick={() => setEditando((v) => !v)}
            className="shrink-0 rounded-lg border border-ink-800 p-2 text-ink-400"
            aria-label="Editar jogo"
          >
            <Pencil size={15} />
          </button>
        )}
      </header>

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-300">
        <SeloStatus status={statusDoJogo(jogo, { proximoId: proximo?.id ?? null, jogoAoVivo: live?.jogoId ?? null })} />
        <span>
        <strong className="text-ink-50">{jogam}</strong> {jogam === 1 ? 'confirmado' : 'confirmados'}
        {jogo.vagas != null ? ` · ${dist.livres ?? 0} ${dist.livres === 1 ? 'vaga' : 'vagas'}` : ' · sem limite de vagas'}
        {dist.naFila > 0 && ` · ${dist.naFila} na fila`}
        </span>
      </p>

      {jogo.status === 'aberto' && jogo.sorteio && (
        <AjusteDosTimes jogo={jogo} players={players} dist={dist} comSessao={comSessao} navigate={navigate} />
      )}

      {editando && (
        <section className="mt-3 rounded-2xl border border-ink-800 bg-ink-900 p-4">
          <FormJogo jogo={jogo} onCancel={() => setEditando(false)} onDone={() => setEditando(false)} />
          <div className="mt-4 flex gap-2 border-t border-ink-800 pt-3">
            <button
              onClick={() => mudarStatus('encerrado')}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-ink-800 py-2 text-xs text-ink-300"
            >
              <Flag size={13} />
              Encerrar jogo
            </button>
            <button
              onClick={() => mudarStatus('cancelado')}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-ink-800 py-2 text-xs text-ink-300"
            >
              <Ban size={13} />
              Cancelar jogo
            </button>
          </div>
        </section>
      )}
      {jogo.status !== 'aberto' && (
        <button onClick={() => mudarStatus('aberto')} className="mt-2 self-start text-xs text-brand-400 underline">
          Reabrir este jogo
        </button>
      )}

      {/* Abas do jogo */}
      <div className="no-scrollbar mt-4 flex gap-1.5 overflow-x-auto" role="tablist">
        {ABAS.map((a) => (
          <button
            key={a.id}
            role="tab"
            aria-selected={aba === a.id}
            onClick={() => setAba(a.id)}
            className={cn(
              'h-9 shrink-0 rounded-lg border px-3 text-xs font-semibold',
              aba === a.id ? 'border-brand-500 bg-brand-500/15 text-brand-300' : 'border-ink-800 bg-ink-950 text-ink-400',
            )}
          >
            {a.label}
            {a.id === 'partidas' && partidas.length > 0 && <span className="ml-1 font-normal opacity-70">{partidas.length}</span>}
          </button>
        ))}
      </div>

      {aba === 'confirmados' && (
        <>
          {jogo.status === 'aberto' &&
            (comSessao ? (
              <Suspense fallback={null}>
                <LinksDoJogo jogo={jogo} proximo={proximo} />
              </Suspense>
            ) : (
              isCloudAvailable && (
                <button
                  onClick={() => navigate('/entrar?volta=/amador')}
                  className="mt-3 flex w-full items-center gap-3 rounded-xl border border-ink-800 px-3 py-2.5 text-left"
                >
                  <MessageCircle size={17} className="shrink-0 text-brand-400" />
                  <span className="min-w-0 flex-1 text-sm text-ink-300">
                    Confirmação pelo WhatsApp
                    <span className="block text-xs text-ink-500">Entre para convidar o grupo</span>
                  </span>
                  <ChevronRight size={17} className="shrink-0 text-ink-600" />
                </button>
              )
            ))}
          <Confirmados jogo={jogo} players={players} dist={dist} />
        </>
      )}

      {aba === 'times' && <Times jogo={jogo} onVer={() => navigate(`/resultado?jogo=${jogo.id}`)} />}

      {aba === 'partidas' && (
        <section className="mt-4 flex flex-col gap-2">
          {liveDoJogo && (
            <button
              onClick={() => navigate('/placar')}
              className="flex w-full items-center gap-3 rounded-2xl border border-brand-500/40 bg-brand-500/10 px-4 py-3 text-left"
            >
              <Radio size={18} className="shrink-0 animate-pulse text-brand-400" />
              <span className="min-w-0 flex-1 text-[15px] font-semibold text-brand-200">
                Em andamento: {liveDoJogo.teams[0].name} {liveDoJogo.sets[liveDoJogo.sets.length - 1].scoreA} ×{' '}
                {liveDoJogo.sets[liveDoJogo.sets.length - 1].scoreB} {liveDoJogo.teams[1].name}
              </span>
              <ChevronRight size={18} className="shrink-0 text-brand-400" />
            </button>
          )}
          {partidas.map((m) => {
            const [a, b] = m.teams;
            return (
              <button
                key={m.id}
                onClick={() => navigate(`/partida/${m.id}`)}
                className="flex items-center gap-3 rounded-2xl border border-ink-800 bg-ink-900 px-3 py-3 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className={cn('size-2 shrink-0 rounded-full', TEAM_COLOR_CLASSES[a.color].bg)} />
                    <span className="truncate text-[15px] font-medium text-ink-50">{a.name}</span>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-ink-100">
                      {setsWonBy(m, a.id)} × {setsWonBy(m, b.id)}
                    </span>
                    <span className={cn('size-2 shrink-0 rounded-full', TEAM_COLOR_CLASSES[b.color].bg)} />
                    <span className="truncate text-[15px] font-medium text-ink-50">{b.name}</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-500">
                    {formatDate(m.date)} · {m.games.length} {m.games.length === 1 ? 'set' : 'sets'}
                  </span>
                </span>
                <ChevronRight size={17} className="shrink-0 text-ink-600" />
              </button>
            );
          })}
          {partidas.length === 0 && !liveDoJogo && (
            <p className="mt-2 rounded-2xl border border-dashed border-ink-800 px-4 py-5 text-center text-sm leading-relaxed text-ink-400">
              {jogo.sorteio
                ? 'Nenhuma partida ainda. Comece pelos times sorteados.'
                : 'Nenhuma partida ainda. Sorteie os times e comece.'}
            </p>
          )}
          {jogo.status === 'aberto' && (
            <button
              onClick={() => navigate(`/partida?jogo=${jogo.id}`)}
              className="mt-1 self-start text-xs text-ink-500 underline"
            >
              Partida direta, sem sorteio
            </button>
          )}
        </section>
      )}

      {aba === 'estatistica' && <Estatistica jogo={jogo} partidas={partidas} players={allPlayers} />}

      {rodape && (
        <div className="safe-bottom above-tabbar fixed inset-x-0 border-t border-ink-800 bg-ink-950/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto max-w-lg">
            <Button size="lg" className="w-full" disabled={rodape.desabilitado} onClick={rodape.acao}>
              {rodape.icone}
              {rodape.texto}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Confirmados ─────────────────────────────────────────────

function Confirmados({
  jogo,
  players,
  dist,
}: {
  jogo: Jogo;
  players: Player[];
  dist: ReturnType<typeof vagasDoJogo>;
}) {
  const addPlayer = useAppStore((s) => s.addPlayer);
  const alternar = useJogoStore((s) => s.alternar);
  const marcarTodos = useJogoStore((s) => s.marcarTodos);
  const responder = useJogoStore((s) => s.responder);
  const [query, setQueryState] = useState(buscaGuardada);
  const setQuery = (q: string) => {
    buscaGuardada = q;
    setQueryState(q);
  };
  const [avulsoOpen, setAvulsoOpen] = useState(false);
  const [avulso, setAvulso] = useState('');
  const editavel = jogo.status === 'aberto';

  const sit = (p: Player) => dist.situacao.get(p.id);
  // Marcados = disseram que vão, com vaga ou na fila
  const confirmados = players.filter((p) => ['confirmado', 'vaga', 'fila'].includes(sit(p)?.tipo ?? '')).length;

  const grupos = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (
      q ? players.filter((p) => p.name.toLowerCase().includes(q) || p.nickname?.toLowerCase().includes(q)) : players
    ).sort((a, b) => Number(a.kind === 'convidado') - Number(b.kind === 'convidado'));
    const tipo = (p: Player) => dist.situacao.get(p.id)?.tipo;
    const posicao = (p: Player) => {
      const s = dist.situacao.get(p.id);
      return s?.tipo === 'fila' || s?.tipo === 'espera' ? s.posicao : 0;
    };
    return {
      vao: list.filter((p) => tipo(p) === 'confirmado' || tipo(p) === 'vaga'),
      fila: list.filter((p) => tipo(p) === 'fila').sort((a, b) => posicao(a) - posicao(b)),
      chamados: list.filter((p) => tipo(p) === 'chamado'),
      espera: list.filter((p) => tipo(p) === 'espera').sort((a, b) => posicao(a) - posicao(b)),
      ausentes: list.filter(
        (p) => !['confirmado', 'vaga', 'fila', 'chamado', 'espera'].includes(tipo(p) ?? ''),
      ),
    };
  }, [players, query, dist]);

  // Chegou alguém de última hora: só o nome, já confirmado e como convidado
  function handleAvulso(e: React.FormEvent) {
    e.preventDefault();
    if (!avulso.trim()) return;
    const p = addPlayer({ name: avulso, skill: 3, kind: 'convidado' });
    responder(jogo.id, p.id, 'confirmado');
    setAvulso('');
    setAvulsoOpen(false);
  }

  const onToggle = (id: string) => editavel && alternar(jogo.id, id);

  return (
    <>
      <div className="mt-5 flex items-center justify-between">
        <p className="text-sm text-ink-400">
          <strong className="text-ink-100">{confirmados}</strong> de {players.length} marcados
        </p>
        {/* Com a lista fechada, marcar todos furaria a fila de espera */}
        {editavel && !jogo.listaFechada && players.length > 0 && (
          <button
            onClick={() => marcarTodos(jogo.id, players.map((p) => p.id), confirmados !== players.length)}
            className="text-xs font-medium text-brand-400"
          >
            {confirmados === players.length ? 'Desmarcar todos' : 'Marcar todos'}
          </button>
        )}
      </div>

      {players.length > 6 && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-ink-800 bg-ink-900 px-3 py-2">
          <Search size={15} className="text-ink-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar jogador"
            className="w-full bg-transparent text-sm outline-none placeholder:text-ink-500"
          />
        </div>
      )}

      <Grupo titulo="Confirmados" players={grupos.vao} sit={sit} onToggle={onToggle} />
      <Grupo titulo="Fila" players={grupos.fila} sit={sit} onToggle={onToggle} />
      <Grupo titulo="Chamados da espera" players={grupos.chamados} sit={sit} onToggle={onToggle} />
      <Grupo titulo="Fila de espera" players={grupos.espera} sit={sit} onToggle={onToggle} />
      <Grupo titulo="Ausentes" players={grupos.ausentes} sit={sit} onToggle={onToggle} />

      {editavel &&
        (avulsoOpen ? (
          <form onSubmit={handleAvulso} className="mt-4 rounded-2xl border border-ink-800 bg-ink-900 p-3">
            <input
              autoFocus
              value={avulso}
              onChange={(e) => setAvulso(e.target.value)}
              maxLength={40}
              placeholder="Nome de quem chegou"
              className="w-full bg-transparent text-[15px] text-ink-50 placeholder:text-ink-500 outline-none"
            />
            <p className="mt-1 text-[11px] text-ink-500">
              Entra confirmado, como convidado. Nível e posição você completa em Atletas.
            </p>
            <div className="mt-3 flex gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => { setAvulsoOpen(false); setAvulso(''); }}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" className="flex-1" disabled={!avulso.trim()}>
                <Plus size={16} strokeWidth={2.5} />
                Adicionar
              </Button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setAvulsoOpen(true)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-ink-800 py-3 text-sm font-medium text-ink-400"
          >
            <Plus size={16} />
            Adicionar avulso
          </button>
        ))}
    </>
  );
}

function Grupo({
  titulo,
  players,
  sit,
  onToggle,
}: {
  titulo: string;
  players: Player[];
  sit: (p: Player) => Situacao | undefined;
  onToggle: (id: string) => void;
}) {
  if (players.length === 0) return null;
  return (
    <section className="mt-4">
      <p className="mb-2 text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
        {titulo} ({players.length})
      </p>
      <div className="flex flex-col gap-2">
        {players.map((p) => (
          <PresenceRow key={p.id} player={p} situacao={sit(p)} onToggle={() => onToggle(p.id)} />
        ))}
      </div>
    </section>
  );
}

/** A linha inteira é o alvo: um toque alterna confirmado ↔ sem resposta */
function PresenceRow({ player, situacao, onToggle }: { player: Player; situacao: Situacao | undefined; onToggle: () => void }) {
  const convidado = player.kind === 'convidado';
  const vai = situacao?.tipo === 'confirmado' || situacao?.tipo === 'vaga';
  const naFila = situacao?.tipo === 'fila' || situacao?.tipo === 'espera';
  const chamado = situacao?.tipo === 'chamado';
  const confirmou = vai || naFila || chamado;
  return (
    <button
      onClick={onToggle}
      aria-pressed={confirmou}
      aria-label={`${nomeDeExibicao(player)}: ${confirmou ? 'confirmado' : 'ausente'}. Tocar para trocar`}
      className={cn(
        'flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors active:scale-[0.99]',
        vai ? 'border-ink-800 bg-ink-900' : 'border-ink-900 bg-ink-950',
      )}
    >
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors',
          vai
            ? 'bg-brand-500 text-ink-950'
            : chamado
              ? 'border-2 border-amber-400 text-amber-300'
              : naFila
                ? 'border border-brand-500/50 text-brand-300'
                : 'bg-ink-800 text-ink-500',
        )}
      >
        {vai ? (
          <Check size={18} strokeWidth={3} />
        ) : chamado ? (
          <BellRing size={17} />
        ) : situacao?.tipo === 'fila' || situacao?.tipo === 'espera' ? (
          `${situacao.posicao}º`
        ) : (
          initials(player.name)
        )}
      </span>
      <span className={cn('min-w-0 flex-1 truncate text-[15px] font-medium', vai ? 'text-ink-50' : 'text-ink-400')}>
        {nomeDeExibicao(player)}
        {situacao?.tipo === 'nao_vou' && <span className="ml-2 text-xs font-normal text-ink-500">não vai</span>}
        {situacao?.tipo === 'pulado' && (
          <span className="ml-2 text-xs font-normal text-ink-500">a vez passou</span>
        )}
        {chamado && <span className="block text-xs font-normal text-amber-300">{haQuantoChamado(situacao.desde)}</span>}
      </span>
      <span
        className={cn(
          'shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
          convidado ? 'border border-ink-700 text-ink-400' : 'bg-brand-500/15 text-brand-300',
        )}
      >
        {convidado ? 'Convidado' : 'Mensalista'}
      </span>
    </button>
  );
}

/**
 * A lista mudou depois do sorteio: alguém saiu, alguém foi chamado da espera
 * e aceitou. Decidido pelo Guilherme em 25/09/2026 que quem escolhe é o
 * administrador — encaixar sem mexer no resto, ou sortear de novo.
 */
function AjusteDosTimes({
  jogo,
  players,
  dist,
  comSessao,
  navigate,
}: {
  jogo: Jogo;
  players: Player[];
  dist: ReturnType<typeof vagasDoJogo>;
  comSessao: boolean;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const guardarSorteio = useJogoStore((s) => s.guardarSorteio);
  const [aviso, setAviso] = useState<string | null>(null);
  const plano = useMemo(() => {
    if (!jogo.sorteio) return null;
    const jogando = players.filter((p) => joga(dist.situacao.get(p.id)));
    const vagaDe = new Map(jogo.confirmations.map((c) => [c.playerId, c.vagaDe]));
    return encaixarNoSorteio(jogo.sorteio, jogando, (id) => vagaDe.get(id));
  }, [jogo.sorteio, jogo.confirmations, players, dist]);

  // Depois do ajuste o plano some; o que aconteceu com o link fica à vista
  if (!plano) {
    return aviso ? <p className="mt-3 rounded-xl bg-ink-900 px-3 py-2 text-xs text-ink-300">{aviso}</p> : null;
  }

  async function ajustar() {
    if (!plano) return;
    const novo = { ...plano.novo, jogoId: jogo.id, eventId: jogo.remoteId };
    guardarSorteio(jogo.id, novo);
    // Times no link têm de acompanhar: time velho no link é pior que nenhum
    if (jogo.timesPublicados && jogo.remoteId && comSessao) {
      try {
        const { publishTeams } = await import('@/lib/cloud');
        await publishTeams(jogo.remoteId, novo);
        setAviso('Times ajustados e atualizados no link.');
      } catch (e) {
        console.error('republicar times', e);
        setAviso('Times ajustados aqui, mas não deu para atualizar o link. Publique de novo no resultado.');
      }
    } else {
      setAviso(null);
    }
  }

  const frase = (m: (typeof plano.mudancas)[number]) =>
    m.entra && m.sai
      ? `${nomeDeExibicao(m.entra)} entra no lugar de ${nomeDeExibicao(m.sai)} (${m.onde})`
      : m.entra
        ? `${nomeDeExibicao(m.entra)} entra no ${m.onde}`
        : `${nomeDeExibicao(m.sai!)} sai do ${m.onde}`;

  return (
    <section className="mt-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
      <p className="text-sm font-semibold text-amber-200">A lista mudou depois do sorteio</p>
      <ul className="mt-1 list-disc pl-5 text-xs leading-relaxed text-amber-100/85">
        {plano.mudancas.map((m, i) => (
          <li key={i}>{frase(m)}</li>
        ))}
      </ul>
      {dist.chamados > 0 && (
        <p className="mt-1.5 text-xs leading-relaxed text-amber-100">
          {dist.chamados === 1 ? 'Há 1 pessoa chamada' : `Há ${dist.chamados} pessoas chamadas`} da fila de
          espera sem responder. Vale esperar a resposta antes de ajustar.
        </p>
      )}
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <Button size="sm" onClick={ajustar}>
          Ajustar os times
        </Button>
        <Button size="sm" variant="secondary" onClick={() => navigate('/sortear', { state: { jogoId: jogo.id } })}>
          Sortear de novo
        </Button>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-amber-100/70">
        Ajustar troca só quem mudou; o equilíbrio pode piorar um pouco. Sortear de novo refaz todos os times.
      </p>
    </section>
  );
}

// ── Times ───────────────────────────────────────────────────

function Times({ jogo, onVer }: { jogo: Jogo; onVer: () => void }) {
  const s = jogo.sorteio;
  if (!s) {
    return (
      <p className="mt-4 rounded-2xl border border-dashed border-ink-800 px-4 py-5 text-center text-sm leading-relaxed text-ink-400">
        Os times ainda não foram sorteados. Confirme quem vem e toque em Sortear.
      </p>
    );
  }
  return (
    <section className="mt-4 flex flex-col gap-2">
      <p className="text-xs text-ink-500">
        Sorteados às {new Date(s.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        {jogo.timesPublicados && ' · publicados no link'}
      </p>
      {s.teams.map((t) => (
        <div key={t.id} className="rounded-2xl border border-ink-800 bg-ink-900 px-4 py-3">
          <p className="flex items-center gap-2">
            <span className={cn('size-3 shrink-0 rounded-full', TEAM_COLOR_CLASSES[t.color].bg)} />
            <span className="min-w-0 flex-1 truncate font-semibold text-ink-50">{t.name}</span>
            <span className="shrink-0 text-xs text-ink-500">{t.players.length} jogadores</span>
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-300">{t.players.map((p) => nomeDeExibicao(p)).join(' · ')}</p>
        </div>
      ))}
      {s.bench.length > 0 && (
        <div className="rounded-2xl border border-dashed border-ink-800 px-4 py-3">
          <p className="text-xs font-medium text-ink-400">Reservas ({s.bench.length})</p>
          <p className="mt-1 text-sm text-ink-300">{s.bench.map((p) => nomeDeExibicao(p)).join(' · ')}</p>
        </div>
      )}
      <Button variant="secondary" className="mt-1" onClick={onVer}>
        <RotateCcw size={16} />
        Ver com níveis, refazer ou publicar no link
      </Button>
    </section>
  );
}

// ── Estatística ─────────────────────────────────────────────

function Estatistica({ jogo, partidas, players }: { jogo: Jogo; partidas: ReturnType<typeof useMatchStore.getState>['matches']; players: Player[] }) {
  // O esporte das partidas, não o do jogo: jogo que veio de outro aparelho
  // sem sorteio fica com o esporte padrão deste
  const sport = partidas[0]?.sport ?? jogo.sport;
  const linhas = useMemo(() => {
    const envolvidos = new Set(partidas.flatMap((m) => m.attendance));
    return computeAllStats(players.filter((p) => envolvidos.has(p.id)), partidas, sport)
      .filter((s) => s.games > 0)
      .sort((a, b) => b.wins - a.wins || b.goals - a.goals);
  }, [partidas, players, sport]);

  if (partidas.length === 0) {
    return (
      <p className="mt-4 rounded-2xl border border-dashed border-ink-800 px-4 py-5 text-center text-sm leading-relaxed text-ink-400">
        A estatística aparece depois da primeira partida deste jogo.
      </p>
    );
  }
  const pontos = sport === 'futebol' ? 'Gols' : 'Pontos';
  return (
    <section className="mt-4">
      <p className="text-sm leading-relaxed text-ink-400">
        {partidas.length} {partidas.length === 1 ? 'partida' : 'partidas'} neste jogo. Quem venceu mais aparece
        primeiro; {pontos.toLowerCase()} são os marcados pelo próprio jogador no scout.
      </p>
      <div className="mt-3 overflow-hidden rounded-2xl border border-ink-800">
        <div className="grid grid-cols-[1fr_repeat(4,2.5rem)] gap-1 bg-ink-900 px-3 py-2 text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
          <span>Jogador</span>
          <span className="text-center">J</span>
          <span className="text-center">V</span>
          <span className="text-center">D</span>
          <span className="text-center">{sport === 'futebol' ? 'Gols' : 'Pts'}</span>
        </div>
        {linhas.map((s) => (
          <div key={s.playerId} className="grid grid-cols-[1fr_repeat(4,2.5rem)] gap-1 border-t border-ink-800 px-3 py-2 text-sm">
            <span className="truncate text-ink-100">{s.name}</span>
            <span className="text-center tabular-nums text-ink-400">{s.games}</span>
            <span className="text-center tabular-nums font-semibold text-brand-300">{s.wins}</span>
            <span className="text-center tabular-nums text-ink-400">{s.losses}</span>
            <span className="text-center tabular-nums text-ink-200">{s.goals}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
        J = confrontos jogados · V = vitórias · D = derrotas. O detalhe de cada partida fica na aba Partidas.
      </p>
    </section>
  );
}
