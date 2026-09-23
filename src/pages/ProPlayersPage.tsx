import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, ClipboardList, History, Radio, Send, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ProPlayerSheet } from '@/components/pro/ProPlayerSheet';
import { useProStore, matchesFilter } from '@/store/useProStore';
import { useMatchStore } from '@/store/useMatchStore';
import { AGE_GROUPS, AGE_GROUP_LABEL, NAIPES, NAIPE_LABEL, ageOn, bodyLine } from '@/lib/pro';
import { getPositionLabel } from '@/lib/sports';
import type { ProPlayer } from '@/types';
import { cn, initials } from '@/lib/utils';

const chip = (active: boolean) =>
  cn(
    'shrink-0 rounded-xl border px-3 py-2 text-sm font-medium',
    active
      ? 'border-brand-500 bg-brand-500/15 text-brand-300'
      : 'border-ink-800 bg-ink-900 text-ink-400',
  );

export function ProPlayersPage() {
  const navigate = useNavigate();
  const players = useProStore((s) => s.players);
  const filter = useProStore((s) => s.filter);
  const setFilter = useProStore((s) => s.setFilter);
  const addPlayer = useProStore((s) => s.addPlayer);
  const updatePlayer = useProStore((s) => s.updatePlayer);
  const removePlayer = useProStore((s) => s.removePlayer);
  const live = useMatchStore((s) => s.live);
  const proMatches = useMatchStore(
    (s) => s.matches.filter((m) => m.mode === 'profissional').length,
  );

  // null = fechado · 'novo' = cadastro · atleta = edição
  const [editing, setEditing] = useState<ProPlayer | 'novo' | null>(null);

  const shown = players
    .filter((p) => matchesFilter(p, filter))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  const scope = [
    filter.ageGroup && AGE_GROUP_LABEL[filter.ageGroup],
    filter.naipe && NAIPE_LABEL[filter.naipe],
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-32">
      <header className="safe-top flex items-start justify-between pt-6 pb-4">
        <div className="flex items-start gap-2">
          <button onClick={() => navigate('/')} className="p-1 pt-0.5 text-ink-400">
            <ArrowLeft size={22} />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Elenco</h1>
            <p className="mt-0.5 text-sm text-ink-400">
              🏐 {players.length} {players.length === 1 ? 'atleta' : 'atletas'}
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
            {proMatches > 0 && <span className="text-ink-500">{proMatches}</span>}
          </button>
        </div>
      </header>

      {live && (
        <button
          onClick={() => navigate('/placar')}
          className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-brand-500/40 bg-brand-500/10 px-4 py-3 text-left"
        >
          <Radio size={18} className="shrink-0 animate-pulse text-brand-400" />
          <span className="min-w-0 flex-1 text-[15px] font-semibold text-brand-200">
            Partida em andamento
          </span>
          <ChevronRight size={18} className="shrink-0 text-brand-400" />
        </button>
      )}

      {players.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            <button onClick={() => setFilter({ ageGroup: null })} className={chip(!filter.ageGroup)}>
              Todas
            </button>
            {AGE_GROUPS.map((g) => (
              <button
                key={g.id}
                onClick={() => setFilter({ ageGroup: g.id })}
                className={chip(filter.ageGroup === g.id)}
              >
                {g.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setFilter({ naipe: null })} className={chip(!filter.naipe)}>
              Todos
            </button>
            {NAIPES.map((n) => (
              <button
                key={n.id}
                onClick={() => setFilter({ naipe: n.id })}
                className={chip(filter.naipe === n.id)}
              >
                {n.label}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {shown.map((p) => {
          const age = p.birthDate ? ageOn(p.birthDate) : null;
          const details = [
            p.position && getPositionLabel('volei', p.position),
            age !== null && `${age} anos`,
            bodyLine(p),
          ].filter(Boolean);
          return (
            <button
              key={p.id}
              onClick={() => setEditing(p)}
              className="flex w-full items-center gap-3 rounded-2xl border border-ink-800 bg-ink-900 px-3 py-3 text-left active:scale-[0.99]"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-sm font-bold text-brand-200">
                {initials(p.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium text-ink-50">
                  {p.name}
                </span>
                <span className="block truncate text-xs text-ink-400">
                  {details.join(' · ') || 'Sem detalhes — toque para completar'}
                </span>
              </span>
              <span className="shrink-0 text-right text-[11px] leading-tight text-ink-500">
                {AGE_GROUP_LABEL[p.ageGroup]}
                <br />
                {NAIPE_LABEL[p.naipe]}
              </span>
            </button>
          );
        })}
      </div>

      {players.length === 0 && (
        <div className="mt-10 text-center">
          <p className="text-5xl">📋</p>
          <p className="mt-3 text-sm leading-relaxed text-ink-400">
            Cadastre os atletas do seu time.
            <br />
            Com seis ou mais, dá para montar a escalação.
          </p>
        </div>
      )}
      {players.length > 0 && shown.length === 0 && (
        <p className="mt-8 text-center text-sm leading-relaxed text-ink-400">
          Nenhum atleta em {scope}.
          <br />
          Troque o filtro ou cadastre um novo — ele já entra nessa categoria.
        </p>
      )}

      <div className="safe-bottom fixed inset-x-0 bottom-0 border-t border-ink-800 bg-ink-950/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg gap-2">
          <Button variant="secondary" size="lg" onClick={() => setEditing('novo')}>
            <UserPlus size={19} />
            Atleta
          </Button>
          <Button
            size="lg"
            className="flex-1"
            disabled={shown.length < 6}
            onClick={() => navigate('/profissional/escalacao')}
          >
            <ClipboardList size={19} />
            {shown.length < 6 ? `Faltam ${6 - shown.length} para escalar` : 'Escalar time'}
          </Button>
        </div>
      </div>

      {editing && (
        <ProPlayerSheet
          player={editing === 'novo' ? undefined : editing}
          defaults={filter}
          onClose={() => setEditing(null)}
          onSave={(draft) => {
            if (editing === 'novo') addPlayer(draft);
            else updatePlayer(editing.id, draft);
            setEditing(null);
          }}
          onDelete={
            editing === 'novo'
              ? undefined
              : () => {
                  removePlayer(editing.id);
                  setEditing(null);
                }
          }
        />
      )}
    </div>
  );
}
