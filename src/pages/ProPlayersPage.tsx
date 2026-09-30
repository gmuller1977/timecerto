import { useMemo, useState } from 'react';
import { useGrupoAtivo } from '@/store/useGrupoAtivo';
import { useAppStore } from '@/store/useAppStore';
import { camposDoPro, comoPro } from '@/lib/pro';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Radio, Send, UserPlus } from 'lucide-react';
import { avisoDeLimite } from '@/lib/plano';
import { usePremium } from '@/store/usePlano';
import { Button } from '@/components/ui/Button';
import { ProPlayerSheet } from '@/components/pro/ProPlayerSheet';
import { useProStore, matchesFilter } from '@/store/useProStore';
import { useMatchStore } from '@/store/useMatchStore';
import { AGE_GROUPS, AGE_GROUP_LABEL, NAIPES, NAIPE_LABEL, ageOn, bodyLine, linhaDePosicoes } from '@/lib/pro';
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
  // Fase 2: o elenco mora no cadastro único; a tela continua vendo ProPlayer
  const cadastro = useAppStore((s) => s.players);
  const players = useMemo(() => cadastro.filter((p) => !p.pending).map(comoPro), [cadastro]);
  const filter = useProStore((s) => s.filter);
  const time = useGrupoAtivo();
  const setFilter = useProStore((s) => s.setFilter);
  const addPlayerCompleto = useAppStore((s) => s.addPlayerCompleto);
  const updatePlayerUnico = useAppStore((s) => s.updatePlayer);
  const removePlayer = useAppStore((s) => s.removePlayer);
  const live = useMatchStore((s) => s.live);
  // Plano grátis: até 20 atletas no time (migração 022). O banco recusaria o
  // 21º e a sincronização do elenco travaria; a tela avisa antes
  const premium = usePremium();

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
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Atletas</h1>
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
            p.position && linhaDePosicoes(p.position, p.outrasPosicoes),
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

      {/* Acima da barra de abas; escalar e começar o jogo ficam na aba Jogo */}
      <div className="safe-bottom above-tabbar fixed inset-x-0 border-t border-ink-800 bg-ink-950/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg gap-2">
          <Button
            size="lg"
            className="flex-1"
            onClick={() => {
              const aviso = avisoDeLimite(premium, players.length);
              if (aviso) window.alert(aviso.replace('mensalistas', 'atletas').replace(' Convidados não contam.', ''));
              else setEditing('novo');
            }}
          >
            <UserPlus size={19} />
            Novo atleta
          </Button>
        </div>
      </div>

      {editing && (
        <ProPlayerSheet
          player={editing === 'novo' ? undefined : editing}
          doTime={time ? { ageGroup: time.ageGroup ?? null, naipe: time.naipe ?? null } : undefined}
          defaults={{
            // O filtro da tela manda; sem filtro, o padrão do time (migração 024)
            ageGroup: filter.ageGroup ?? time?.ageGroup ?? null,
            naipe: filter.naipe ?? time?.naipe ?? null,
          }}
          onClose={() => setEditing(null)}
          onSave={(draft) => {
            if (editing === 'novo') addPlayerCompleto({ name: draft.name, ...camposDoPro(draft) });
            else updatePlayerUnico(editing.id, camposDoPro(draft, cadastro.find((p) => p.id === editing.id)));
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
