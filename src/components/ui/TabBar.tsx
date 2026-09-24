import { useNavigate } from 'react-router-dom';
import { Settings, Users, Volleyball, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TabId = 'jogo' | 'elenco' | 'financeiro' | 'ajustes';

/**
 * As quatro abas do modo amador. Cada uma é uma raiz de navegação: `prefixes`
 * diz quais telas moram dentro dela, para a aba certa ficar acesa em qualquer
 * profundidade.
 *
 * Jogo (TodayPage) é presença e ação; Atletas (RosterPage) é o cadastro.
 * A aba se chamava Elenco; a rota continua /elenco.
 * Financeiro e Ajustes ainda são lugar reservado — docs/telas-amador.md.
 */
export const TABS: {
  id: TabId;
  label: string;
  icon: typeof Users;
  root: string;
  prefixes: string[];
}[] = [
  {
    id: 'jogo',
    label: 'Jogo',
    icon: Volleyball,
    root: '/amador',
    prefixes: ['/amador', '/resultado', '/partida', '/historico'],
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

export function tabOf(pathname: string): TabId | null {
  const tab = TABS.find((t) =>
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

/** Rolagem de uma tela, guardada ao sair dela pela barra */
export function savedScroll(path: string): number {
  return scrollOf.get(path) ?? 0;
}

export function TabBar({ active, current }: { active: TabId | null; current: string }) {
  const navigate = useNavigate();

  function go(tab: (typeof TABS)[number]) {
    scrollOf.set(current, window.scrollY);
    // Tocar na aba em que já se está volta para a raiz dela; nas outras,
    // retoma de onde a pessoa parou
    const to = tab.id === active ? tab.root : (lastPath[tab.id] ?? tab.root);
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
      <div className="mx-auto flex h-16 max-w-lg">
        {TABS.map((tab) => {
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
