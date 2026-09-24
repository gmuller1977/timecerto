import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, History, Plus, Radio, Search, Shuffle, Swords, Users } from 'lucide-react';
import { useMatchStore } from '@/store/useMatchStore';
import { SportPicker } from '@/components/sports/SportPicker';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store/useAppStore';
import { nomeDeExibicao } from '@/lib/nome';
import { SPORTS } from '@/lib/sports';
import { cn, initials } from '@/lib/utils';
import type { Player } from '@/types';

// A busca sobrevive à troca de aba. Memória da sessão, como a rolagem da barra
let buscaGuardada = '';

/**
 * Aba Jogo: quem vem hoje e o que acontece agora. É a tela da beira da
 * quadra, com o celular numa mão — por isso a linha do jogador é só nome,
 * selo e um toque. Nível, posição e exclusão ficam no Elenco.
 */
export function TodayPage() {
  const navigate = useNavigate();
  const sport = useAppStore((s) => s.sport);
  const allPlayers = useAppStore((s) => s.players);
  // Pedidos de cadastro pendentes não jogam até serem aprovados
  const players = useMemo(() => allPlayers.filter((p) => !p.pending), [allPlayers]);
  const addPlayer = useAppStore((s) => s.addPlayer);
  const setAllPresence = useAppStore((s) => s.setAllPresence);
  const togglePresence = useAppStore((s) => s.togglePresence);
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

  const present = players.filter((p) => p.present).length;
  const convidados = players.filter((p) => p.kind === 'convidado').length;

  // Mensalistas antes de convidados em cada bloco
  const { presentes, ausentes } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (
      q
        ? players.filter(
            (p) =>
              p.name.toLowerCase().includes(q) || p.nickname?.toLowerCase().includes(q),
          )
        : players
    ).sort((a, b) => Number(a.kind === 'convidado') - Number(b.kind === 'convidado'));
    return {
      presentes: list.filter((p) => p.present),
      ausentes: list.filter((p) => !p.present),
    };
  }, [players, query]);

  // Chegou alguém de última hora: só o nome, já presente e como convidado.
  // Nível e posição se completam depois, no Elenco.
  function handleAvulso(e: React.FormEvent) {
    e.preventDefault();
    if (!avulso.trim()) return;
    addPlayer({ name: avulso, skill: 3, kind: 'convidado' });
    setAvulso('');
    setAvulsoOpen(false);
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

      <SportPicker />

      <div className="mt-5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-ink-400">
          <Users size={15} />
          <span>
            <strong className="text-ink-100">{present}</strong> de {players.length}{' '}
            presentes
            {convidados > 0 && (
              <span className="text-ink-500">
                {' '}· {players.length - convidados} mensalistas, {convidados}{' '}
                {convidados === 1 ? 'convidado' : 'convidados'}
              </span>
            )}
          </span>
        </div>
        {players.length > 0 && (
          <button
            onClick={() => setAllPresence(present !== players.length)}
            className="text-xs font-medium text-brand-400"
          >
            {present === players.length ? 'Desmarcar todos' : 'Marcar todos'}
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

      <Grupo titulo="Presentes" players={presentes} onToggle={togglePresence} />
      <Grupo titulo="Ausentes" players={ausentes} onToggle={togglePresence} />

      {players.length === 0 ? (
        <div className="mt-10 text-center">
          <p className="text-5xl">{SPORTS[sport].emoji}</p>
          <p className="mt-3 text-sm text-ink-400">
            Cadastre os jogadores da sua pelada
            <br />
            no Elenco para sortear os times.
          </p>
          <Button variant="secondary" className="mt-4" onClick={() => navigate('/elenco')}>
            Ir para o Elenco
          </Button>
        </div>
      ) : avulsoOpen ? (
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
            Entra presente, como convidado. Nível e posição você completa no Elenco.
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
            disabled={present < 4}
            onClick={() => navigate('/sortear')}
          >
            <Shuffle size={19} strokeWidth={2.5} />
            {present < 4 ? 'Mínimo de 4 presentes' : `Sortear (${present})`}
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
  onToggle,
}: {
  titulo: string;
  players: Player[];
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
          <PresenceRow key={p.id} player={p} onToggle={() => onToggle(p.id)} />
        ))}
      </div>
    </section>
  );
}

/** A linha inteira é o alvo: um toque alterna presença */
function PresenceRow({ player, onToggle }: { player: Player; onToggle: () => void }) {
  const convidado = player.kind === 'convidado';
  return (
    <button
      onClick={onToggle}
      aria-pressed={player.present}
      aria-label={`${nomeDeExibicao(player)}: ${player.present ? 'presente' : 'ausente'}. Tocar para trocar`}
      className={cn(
        'flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors active:scale-[0.99]',
        player.present ? 'border-ink-800 bg-ink-900' : 'border-ink-900 bg-ink-950',
      )}
    >
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors',
          player.present ? 'bg-brand-500 text-ink-950' : 'bg-ink-800 text-ink-500',
        )}
      >
        {player.present ? <Check size={18} strokeWidth={3} /> : initials(player.name)}
      </span>
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-[15px] font-medium',
          player.present ? 'text-ink-50' : 'text-ink-400',
        )}
      >
        {nomeDeExibicao(player)}
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
