import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, History, Plus, Radio, Search, Shuffle, Swords } from 'lucide-react';
import { useMatchStore } from '@/store/useMatchStore';
import { SportPicker } from '@/components/sports/SportPicker';
import { JogoBloco } from '@/components/jogo/JogoBloco';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store/useAppStore';
import { useJogoAberto, useJogoStore } from '@/store/useJogoStore';
import { nomeDeExibicao } from '@/lib/nome';
import { SPORTS } from '@/lib/sports';
import { vagasDoJogo, joga, type Situacao } from '@/lib/vagas';
import { hasSavedSession } from '@/lib/sessao';
import { cn, initials } from '@/lib/utils';
import type { Player } from '@/types';

// A busca sobrevive à troca de aba. Memória da sessão, como a rolagem da barra
let buscaGuardada = '';

/**
 * Aba Jogo: quem vem hoje e o que acontece agora. É a tela da beira da
 * quadra, com o celular numa mão — por isso a linha do jogador é só nome,
 * selo e um toque. Nível, posição e exclusão ficam em Atletas.
 *
 * Quem vem é lido do Jogo aberto (useJogoStore), não do jogador. A lista se
 * divide pela mesma regra de vagas dos links (`vagasDoJogo`).
 */
export function TodayPage() {
  const navigate = useNavigate();
  const sport = useAppStore((s) => s.sport);
  const allPlayers = useAppStore((s) => s.players);
  // Pedidos de cadastro pendentes não jogam até serem aprovados
  const players = useMemo(() => allPlayers.filter((p) => !p.pending), [allPlayers]);
  const addPlayer = useAppStore((s) => s.addPlayer);
  const jogo = useJogoAberto();
  // Antes da migração do antigo `present`, "sem jogo" não quer dizer nada
  const migrado = useJogoStore((s) => Boolean(s.migracoes.present));
  const alternar = useJogoStore((s) => s.alternar);
  const marcarTodos = useJogoStore((s) => s.marcarTodos);
  const responder = useJogoStore((s) => s.responder);
  const live = useMatchStore((s) => s.live);
  const matchCount = useMatchStore(
    (s) => s.matches.filter((m) => m.mode !== 'profissional').length,
  );

  const [query, setQueryState] = useState(buscaGuardada);
  const setQuery = (q: string) => {
    buscaGuardada = q;
    setQueryState(q);
  };
  const [avulsoOpen, setAvulsoOpen] = useState(false);
  const [avulso, setAvulso] = useState('');
  const [busy, setBusy] = useState(false);

  const dist = useMemo(() => (jogo ? vagasDoJogo(jogo, players) : null), [jogo, players]);
  const sit = (p: Player) => dist?.situacao.get(p.id);
  const jogam = players.filter((p) => joga(sit(p))).length;
  const confirmados = players.filter((p) => {
    const t = sit(p)?.tipo;
    return t === 'confirmado' || t === 'vaga' || t === 'fila';
  }).length;

  // Confirmados (com vaga), fila, ausentes. Mensalistas antes de convidados.
  const grupos = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (
      q
        ? players.filter(
            (p) =>
              p.name.toLowerCase().includes(q) || p.nickname?.toLowerCase().includes(q),
          )
        : players
    ).sort((a, b) => Number(a.kind === 'convidado') - Number(b.kind === 'convidado'));
    const tipo = (p: Player) => dist?.situacao.get(p.id)?.tipo;
    const posicao = (p: Player) => {
      const s = dist?.situacao.get(p.id);
      return s?.tipo === 'fila' ? s.posicao : 0;
    };
    return {
      vao: list.filter((p) => tipo(p) === 'confirmado' || tipo(p) === 'vaga'),
      fila: list.filter((p) => tipo(p) === 'fila').sort((a, b) => posicao(a) - posicao(b)),
      ausentes: list.filter((p) => !['confirmado', 'vaga', 'fila'].includes(tipo(p) ?? '')),
    };
  }, [players, query, dist]);

  // Chegou alguém de última hora: só o nome, já confirmado e como convidado.
  // Nível e posição se completam depois, em Atletas.
  function handleAvulso(e: React.FormEvent) {
    e.preventDefault();
    if (!avulso.trim()) return;
    const p = addPlayer({ name: avulso, skill: 3, kind: 'convidado' });
    responder(p.id, 'confirmado');
    setAvulso('');
    setAvulsoOpen(false);
  }

  /*
   * Com o jogo nos links, a lista FECHA antes de sortear: aberta, uma resposta
   * que chegasse depois mudaria quem tem vaga, e os times publicados deixariam
   * de bater com a lista do link. Sem sinal, avisa e deixa sortear — o
   * sorteio é local.
   */
  const fechaAntes = Boolean(jogo?.remoteId && !jogo.listaFechada && hasSavedSession());
  async function sortear() {
    if (!jogo) return;
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
    navigate('/sortear', { state: jogo.remoteId ? { eventId: jogo.remoteId } : null });
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-32">
      <header className="safe-top flex items-center justify-between gap-3 pt-6 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">Jogo</h1>
        <button
          onClick={() => navigate('/historico')}
          className="flex items-center gap-1.5 rounded-lg border border-ink-800 bg-ink-900 px-3 py-2 text-xs font-medium text-ink-300"
          aria-label="Partidas"
        >
          <History size={14} />
          Partidas
          {matchCount > 0 && <span className="text-ink-500">{matchCount}</span>}
        </button>
      </header>

      {live && (
        <button
          onClick={() => navigate('/placar')}
          className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-brand-500/40 bg-brand-500/10 px-4 py-3 text-left"
        >
          <Radio size={18} className="shrink-0 animate-pulse text-brand-400" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-brand-200">
              Partida em andamento
            </span>
            <span className="block truncate text-xs text-brand-300/70">
              {live.teams[0].name} {live.sets[live.sets.length - 1].scoreA} ×{' '}
              {live.sets[live.sets.length - 1].scoreB} {live.teams[1].name} ·{' '}
              {live.sets.length}º set
            </span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-brand-400" />
        </button>
      )}

      {migrado && <JogoBloco jogo={jogo} dist={dist} />}

      <SportPicker />

      {jogo && (
        <>
          <div className="mt-5 flex items-center justify-between">
            <p className="text-sm text-ink-400">
              <strong className="text-ink-100">{confirmados}</strong> de {players.length}{' '}
              confirmados
            </p>
            {players.length > 0 && (
              <button
                onClick={() =>
                  marcarTodos(
                    players.map((p) => p.id),
                    confirmados !== players.length,
                  )
                }
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

          <Grupo titulo="Confirmados" players={grupos.vao} sit={sit} onToggle={alternar} />
          <Grupo titulo="Fila" players={grupos.fila} sit={sit} onToggle={alternar} />
          <Grupo titulo="Ausentes" players={grupos.ausentes} sit={sit} onToggle={alternar} />
        </>
      )}

      {players.length === 0 ? (
        <div className="mt-10 text-center">
          <p className="text-5xl">{SPORTS[sport].emoji}</p>
          <p className="mt-3 text-sm text-ink-400">
            Cadastre os jogadores da sua pelada
            <br />
            em Atletas para sortear os times.
          </p>
          <Button variant="secondary" className="mt-4" onClick={() => navigate('/elenco')}>
            Ir para Atletas
          </Button>
        </div>
      ) : !jogo ? null : avulsoOpen ? (
        <form
          onSubmit={handleAvulso}
          className="mt-4 rounded-2xl border border-ink-800 bg-ink-900 p-3"
        >
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
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setAvulsoOpen(false);
                setAvulso('');
              }}
            >
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
      )}

      <div className="safe-bottom above-tabbar fixed inset-x-0 border-t border-ink-800 bg-ink-950/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg gap-2">
          <Button
            size="lg"
            className="flex-1"
            disabled={!jogo || jogam < 4 || busy}
            onClick={sortear}
          >
            <Shuffle size={19} strokeWidth={2.5} />
            {!jogo
              ? 'Crie o jogo para sortear'
              : jogam < 4
                ? 'Mínimo de 4 confirmados'
                : fechaAntes
                  ? `Fechar a lista e sortear (${jogam})`
                  : `Sortear (${jogam})`}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="shrink-0"
            onClick={() => navigate('/partida')}
          >
            <Swords size={18} />
            Partida direta
          </Button>
        </div>
      </div>
    </div>
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
function PresenceRow({
  player,
  situacao,
  onToggle,
}: {
  player: Player;
  situacao: Situacao | undefined;
  onToggle: () => void;
}) {
  const convidado = player.kind === 'convidado';
  const vai = situacao?.tipo === 'confirmado' || situacao?.tipo === 'vaga';
  const naFila = situacao?.tipo === 'fila';
  const confirmou = vai || naFila;
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
            : naFila
              ? 'border border-brand-500/50 text-brand-300'
              : 'bg-ink-800 text-ink-500',
        )}
      >
        {vai ? (
          <Check size={18} strokeWidth={3} />
        ) : naFila && situacao?.tipo === 'fila' ? (
          `${situacao.posicao}º`
        ) : (
          initials(player.name)
        )}
      </span>
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-[15px] font-medium',
          vai ? 'text-ink-50' : 'text-ink-400',
        )}
      >
        {nomeDeExibicao(player)}
        {situacao?.tipo === 'nao_vou' && (
          <span className="ml-2 text-xs font-normal text-ink-500">não vai</span>
        )}
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
