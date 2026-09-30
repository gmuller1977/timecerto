import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ClipboardList, Radio, Shuffle } from 'lucide-react';
import { useMatchStore } from '@/store/useMatchStore';
import { useAppStore } from '@/store/useAppStore';
import { SPORT_LIST } from '@/lib/sports';
import { hasSavedSession } from '@/lib/sessao';
import type { AppMode } from '@/types';
import { cn } from '@/lib/utils';

const MODES: {
  id: AppMode;
  title: string;
  tagline: string;
  detail: string;
  to: string;
  icon: typeof Shuffle;
  sports: string;
}[] = [
  {
    id: 'amador',
    title: 'Amador',
    tagline: 'Pelada, racha, time de amigos',
    detail:
      'Cadastre quem veio, sorteie times equilibrados por nível e posição, compartilhe no WhatsApp e acompanhe o placar.',
    to: '/amador',
    icon: Shuffle,
    sports: SPORT_LIST.map((s) => s.emoji).join(' '),
  },
  {
    id: 'profissional',
    title: 'Profissional',
    tagline: 'Treinador, time fixo, competição',
    detail:
      'Elenco com categoria, altura e peso. Escale o time na quadra, acompanhe rodízio e substituições, com placar e scout completo.',
    to: '/profissional',
    icon: ClipboardList,
    sports: '🏐',
  },
];


/**
 * A escolha do tipo (`/modo`). Desde a etapa 7 (docs/telas-amador.md) não é
 * mais a abertura: aparece na primeira entrada, quando a conta ainda não tem
 * grupo ou tem dos dois tipos, e por Ajustes › Trocar de modo. Cada cartão
 * mostra o grupo daquele tipo — escolher o tipo é escolher o grupo.
 */
export function HomePage() {
  const navigate = useNavigate();
  const live = useMatchStore((s) => s.live);
  const setMode = useAppStore((s) => s.setMode);
  const [grupos, setGrupos] = useState<Partial<Record<AppMode, string>>>({});

  useEffect(() => {
    if (!hasSavedSession()) return;
    let vivo = true;
    import('@/lib/cloud')
      .then(({ meusGrupos }) => meusGrupos())
      .then((lista) => {
        if (!vivo) return;
        const porTipo: Partial<Record<AppMode, string>> = {};
        for (const g of lista) porTipo[g.mode] ??= g.name;
        setGrupos(porTipo);
      })
      .catch(() => {
        /* sem rede: os cartões ficam sem o nome do grupo */
      });
    return () => {
      vivo = false;
    };
  }, []);

  function enter(mode: AppMode, to: string) {
    setMode(mode);
    navigate(to);
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-10">
      <header className="safe-top flex items-start justify-between gap-3 pt-10 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Time<span className="text-brand-400">Certo</span>
          </h1>
          <p className="mt-1 text-sm text-ink-400">Como você joga hoje?</p>
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
              {live.sets[live.sets.length - 1].scoreB} {live.teams[1].name}
            </span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-brand-400" />
        </button>
      )}

      <div className="flex flex-col gap-3">
        {MODES.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              onClick={() => enter(m.id, m.to)}
              className={cn(
                'rounded-3xl border border-ink-800 bg-ink-900 p-5 text-left transition-colors active:scale-[0.99]',
                'active:bg-ink-800',
              )}
            >
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-300">
                  <Icon size={22} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-bold text-ink-50">
                    {m.title}
                  </span>
                  <span className="block text-xs text-ink-400">{m.tagline}</span>
                  {grupos[m.id] && (
                    <span className="mt-0.5 block truncate text-xs font-medium text-brand-300">
                      Seu grupo: {grupos[m.id]}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-lg">{m.sports}</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-ink-400">
                {m.detail}
              </p>
            </button>
          );
        })}
      </div>

      <p className="mt-6 text-center text-xs leading-relaxed text-ink-600">
        Dá para trocar depois, em Ajustes.
        <br />
        Cada modo tem o seu próprio cadastro de jogadores.
      </p>
    </div>
  );
}
