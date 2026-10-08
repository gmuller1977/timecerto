import { useNavigate } from 'react-router-dom';
import type { AppMode } from '@/types';
import { FaixaDoGrupo } from '@/components/ui/TrocaDeGrupo';
import { Settings, Users, Volleyball, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TabId = 'jogo' | 'elenco' | 'financeiro' | 'ajustes';

/**
 * As quatro abas do modo amador. Cada uma é uma raiz de navegação: `prefixes`
 * diz quais telas moram dentro dela, para a aba certa ficar acesa em qualquer
 * profundidade.
 *
 * Jogo (JogosPage, JogoPage) é presença e ação; Atletas (RosterPage) é o cadastro.
 * A aba se chamava Elenco; a rota continua /elenco.
 * Financeiro e Ajustes ainda são lugar reservado — docs/telas-amador.md.
 */
type Aba = {
  id: TabId;
  label: string;
  icon: typeof Users;
  root: string;
  prefixes: string[];
};

export const TABS: Aba[] = [
  {
    id: 'jogo',
    label: 'Agenda',
    icon: Volleyball,
    root: '/amador',
    prefixes: ['/amador', '/jogo', '/resultado', '/partida', '/historico'],
  },
  {
    id: 'elenco',
    label: 'Atletas',
    icon: Users,
    root: '/elenco',
    prefixes: ['/elenco', '/jogador'],
  },
  { id: 'financeiro', label: 'Financeiro', icon: Wallet, root: '/financeiro', prefixes: ['/financeiro'] },
  { id: 'ajustes', label: 'Ajustes', icon: Settings, root: '/ajustes', prefixes: ['/ajustes'] },
];

/**
 * As mesmas quatro abas no profissional (pedido do Guilherme, 30/09/2026).
 * Jogo e Atletas têm as telas do time; Financeiro e Ajustes são as mesmas da
 * pelada, e olham o grupo ativo. Jogo vem antes de Atletas: /profissional/jogo
 * também começa com /profissional.
 */
const TABS_PRO: Aba[] = [
  {
    id: 'jogo',
    label: 'Jogo',
    icon: Volleyball,
    root: '/profissional/jogo',
    prefixes: ['/profissional/jogo', '/jogo', '/historico', '/partida'],
  },
  {
    id: 'elenco',
    label: 'Atletas',
    icon: Users,
    root: '/profissional',
    prefixes: ['/profissional', '/convites'],
  },
  TABS[2],
  TABS[3],
];

export const abasDo = (mode: AppMode) => (mode === 'profissional' ? TABS_PRO : TABS);

export function tabOf(pathname: string, mode: AppMode = 'amador'): TabId | null {
  const tab = abasDo(mode).find((t) =>
    t.prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`)),
  );
  return tab?.id ?? null;
}

/**
 * Onde cada aba estava. Fica em memória, não no localStorage: é posição de
 * navegação desta sessão, e reabrir o app começando da raiz é o esperado.
 */
const lastPath: Partial<Record<TabId, string>> = {};
const scrollOf = new Map<string, number>();

export function rememberPath(tab: TabId, path: string) {
  lastPath[tab] = path;
}

/** Trocou de grupo: as telas lembradas eram do outro grupo */
export function esquecerCaminhos() {
  for (const k of Object.keys(lastPath) as TabId[]) delete lastPath[k];
  scrollOf.clear();
}

/** Rolagem de uma tela, guardada ao sair dela pela barra */
export function savedScroll(path: string): number {
  return scrollOf.get(path) ?? 0;
}

export function TabBar({ active, current, mode }: { active: TabId | null; current: string; mode: AppMode }) {
  const navigate = useNavigate();

  function go(tab: Aba) {
    scrollOf.set(current, window.scrollY);
    // Tocar na aba em que já se está volta para a raiz dela; nas outras,
    // retoma de onde a pessoa parou
    // A tela lembrada só vale se for desta aba NESTE modo: a aba Atletas é
    // /elenco na pelada e /profissional no time, e retomar a do outro modo
    // abria a tela errada (relatado em 08/10/2026, trocando Audax e Maverick)
    const lembrada = lastPath[tab.id];
    const daAba = lembrada && tab.prefixes.some((p) => lembrada === p || lembrada.startsWith(p + '/') || lembrada.startsWith(p + '?'));
    const to = tab.id === active ? tab.root : daAba ? lembrada : tab.root;
    if (to === current) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (tab.id === active) scrollOf.delete(to);
    navigate(to, { state: { viaTab: true } });
  }

  return (
    <nav
      aria-label="Seções"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-ink-800 bg-ink-950/95 backdrop-blur"
    >
      {/* O grupo, à mão em todas as abas (etapa 8) */}
      <FaixaDoGrupo />
      <div className="mx-auto flex h-16 max-w-lg">
        {abasDo(mode).map((tab) => {
          const Icon = tab.icon;
          const on = tab.id === active;
          return (
            <button
              key={tab.id}
              onClick={() => go(tab)}
              aria-current={on ? 'page' : undefined}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                on ? 'text-brand-400' : 'text-ink-500 active:text-ink-300',
              )}
            >
              <Icon size={22} strokeWidth={on ? 2.4 : 2} />
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
