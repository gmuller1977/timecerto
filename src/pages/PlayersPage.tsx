import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, History, Plus, Radio, Search, Send, Shuffle, Swords, Users } from 'lucide-react';
import { useMatchStore } from '@/store/useMatchStore';
import { SportPicker } from '@/components/sports/SportPicker';
import { PlayerRow } from '@/components/players/PlayerRow';
import { StarRating } from '@/components/ui/StarRating';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store/useAppStore';
import type { SkillLevel } from '@/types';
import { SPORTS } from '@/lib/sports';

export function PlayersPage() {
  const navigate = useNavigate();
  const sport = useAppStore((s) => s.sport);
  const players = useAppStore((s) => s.players);
  const addPlayer = useAppStore((s) => s.addPlayer);
  const setAllPresence = useAppStore((s) => s.setAllPresence);
  const live = useMatchStore((s) => s.live);
  const matchCount = useMatchStore(
    (s) => s.matches.filter((m) => m.mode !== 'profissional').length,
  );

  const [name, setName] = useState('');
  const [skill, setSkill] = useState<SkillLevel>(3);
  const [position, setPosition] = useState('');
  const [query, setQuery] = useState('');

  const present = players.filter((p) => p.present).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? players.filter((p) => p.name.toLowerCase().includes(q)) : players;
    return [...list].sort((a, b) => Number(b.present) - Number(a.present));
  }, [players, query]);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    // Permite colar vários nomes separados por vírgula ou quebra de linha
    const names = name
      .split(/[,\n]/)
      .map((n) => n.trim())
      .filter(Boolean);
    names.forEach((n) => addPlayer({ name: n, skill, position: position || undefined }));
    setName('');
    setPosition('');
    setSkill(3);
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-32">
      <header className="safe-top flex items-start justify-between pt-6 pb-4">
        <div className="flex items-start gap-2">
          <button onClick={() => navigate('/')} className="p-1 pt-0.5 text-ink-400">
            <ArrowLeft size={22} />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Amador</h1>
            <p className="mt-0.5 text-sm text-ink-400">
              Times equilibrados em segundos.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button
            onClick={() => navigate('/convites')}
            className="flex items-center gap-1.5 rounded-lg border border-brand-500/40 bg-brand-500/10 px-3 py-2 text-xs font-medium text-brand-300"
          >
            <Send size={14} />
            Convidar
          </button>
          <button
            onClick={() => navigate('/historico')}
            className="flex items-center gap-1.5 rounded-lg border border-ink-800 bg-ink-900 px-3 py-2 text-xs font-medium text-ink-300"
            aria-label="Partidas"
          >
            <History size={14} />
            {matchCount > 0 && <span className="text-ink-500">{matchCount}</span>}
          </button>
        </div>
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

      <form
        onSubmit={handleAdd}
        className="mt-4 rounded-2xl border border-ink-800 bg-ink-900 p-3"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do jogador (ou cole vários, separados por vírgula)"
          className="w-full bg-transparent text-[15px] text-ink-50 placeholder:text-ink-500 outline-none"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <StarRating value={skill} onChange={setSkill} size={17} />
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="rounded-lg bg-ink-800 px-2 py-1 text-xs text-ink-300 outline-none"
            >
              <option value="">Posição</option>
              {SPORTS[sport].positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" size="sm" className="shrink-0" disabled={!name.trim()}>
            <Plus size={16} strokeWidth={2.5} />
            Adicionar
          </Button>
        </div>
      </form>

      <div className="mt-5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-ink-400">
          <Users size={15} />
          <span>
            <strong className="text-ink-100">{present}</strong> de {players.length}{' '}
            presentes
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

      <div className="mt-3 flex flex-col gap-2">
        {filtered.map((p) => (
          <PlayerRow key={p.id} player={p} />
        ))}
        {players.length === 0 && (
          <div className="mt-10 text-center">
            <p className="text-5xl">{SPORTS[sport].emoji}</p>
            <p className="mt-3 text-sm text-ink-400">
              Adicione os jogadores da sua pelada
              <br />
              para sortear os times.
            </p>
          </div>
        )}
      </div>

      <div className="safe-bottom fixed inset-x-0 bottom-0 border-t border-ink-800 bg-ink-950/95 px-4 py-3 backdrop-blur">
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
