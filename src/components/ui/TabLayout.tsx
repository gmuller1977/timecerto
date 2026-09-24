import { Suspense, useLayoutEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { useHydrated } from '@/store/useHydrated';
import { TabBar, rememberPath, savedScroll, tabOf } from '@/components/ui/TabBar';

/**
 * Casca das telas do modo amador: a tela da vez e a barra de abas embaixo.
 *
 * Algumas destas rotas (histórico, resumo de partida, convites) servem também
 * ao profissional, então a barra depende do modo — e o modo mora no
 * localStorage. Antes da hidratação a barra simplesmente não aparece: decidir
 * aba ou modo antes da leitura é o mesmo erro que já custou partida perdida.
 * Nada aqui redireciona.
 *
 * Placar e sorteio ficam FORA deste layout: são telas de foco total, usadas em
 * pé, e se sai delas por "Encerrar" ou pela seta, nunca por aba.
 */
export function TabLayout() {
  const hydrated = useHydrated();
  const mode = useAppStore((s) => s.mode) ?? 'amador';
  const { pathname, search, state } = useLocation();
  const active = tabOf(pathname);
  const show = hydrated && mode === 'amador';
  const current = pathname + search;

  useLayoutEffect(() => {
    if (active) rememberPath(active, current);
  }, [active, current]);

  // Só a navegação pela barra mexe na rolagem; as setas e botões das telas
  // continuam como sempre foram
  const viaTab = Boolean((state as { viaTab?: boolean } | null)?.viaTab);
  useLayoutEffect(() => {
    if (!viaTab) return;
    const y = savedScroll(current);
    // Um quadro depois: a tela precisa ter altura antes de rolar
    requestAnimationFrame(() => window.scrollTo(0, y));
  }, [viaTab, current]);

  // Os rodapés fixos das telas (Sortear, Enviar no WhatsApp) sobem acima da
  // barra por esta marca — ver .above-tabbar em index.css
  useLayoutEffect(() => {
    if (!show) return;
    document.documentElement.dataset.tabbar = '';
    return () => {
      delete document.documentElement.dataset.tabbar;
    };
  }, [show]);

  // A tela continua filha direta de #root — o min-h-full delas depende disso.
  // O espaçador depois dela é o que impede a barra de cobrir o fim da lista.
  // O Suspense daqui segura só a tela: há telas carregadas sob demanda, e o de
  // fora apagaria a barra junto enquanto isso
  return (
    <>
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
      {show && (
        <>
          <div aria-hidden className="h-[var(--tabbar-h)]" />
          <TabBar active={active} current={current} />
        </>
      )}
    </>
  );
}
