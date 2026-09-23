import { useNavigate } from 'react-router-dom';
import { ChevronRight, ClipboardList, Radio, Shuffle, UserRound } from 'lucide-react';
import { useMatchStore } from '@/store/useMatchStore';
import { useAppStore } from '@/store/useAppStore';
import { SPORT_LIST } from '@/lib/sports';
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

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const isSupabaseConfigured = Boolean(supabaseUrl);

/**
 * A home abre em todo uso do app, inclusive no ginásio; importar o cliente do
 * Supabase aqui traria 200 kB para o pacote principal só para decidir um
 * rótulo. A chave abaixo é onde o cliente guarda a sessão — basta saber se
 * ela existe. Errar custa só o texto do botão; a tela de login confere de verdade.
 */
function hasSavedSession(): boolean {
  try {
    const ref = new URL(supabaseUrl!).hostname.split('.')[0];
    return localStorage.getItem(`sb-${ref}-auth-token`) !== null;
  } catch {
    return false;
  }
}

export function HomePage() {
  const navigate = useNavigate();
  const live = useMatchStore((s) => s.live);
  const setMode = useAppStore((s) => s.setMode);

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
        {isSupabaseConfigured && (
          <button
            onClick={() => navigate('/entrar')}
            className="mt-1 flex shrink-0 items-center gap-1.5 rounded-lg border border-ink-800 bg-ink-900 px-3 py-2 text-xs font-medium text-ink-300"
          >
            <UserRound size={15} />
            {hasSavedSession() ? 'Minha conta' : 'Entrar'}
          </button>
        )}
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
        Dá para trocar de modo a qualquer momento.
        <br />
        Cada modo tem o seu próprio cadastro de jogadores.
      </p>
    </div>
  );
}
