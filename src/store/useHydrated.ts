import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useMatchStore } from '@/store/useMatchStore';

/**
 * Os dados moram no localStorage e a leitura não é instantânea.
 * Sem esperar por ela, qualquer tela que dependa de encontrar algo
 * — uma partida, um jogador, o jogo em andamento — decide "não existe"
 * antes de olhar e manda o usuário de volta para a home.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(
    () => useAppStore.persist.hasHydrated() && useMatchStore.persist.hasHydrated(),
  );

  useEffect(() => {
    const check = () =>
      setHydrated(
        useAppStore.persist.hasHydrated() && useMatchStore.persist.hasHydrated(),
      );
    const off1 = useAppStore.persist.onFinishHydration(check);
    const off2 = useMatchStore.persist.onFinishHydration(check);
    check();
    return () => {
      off1();
      off2();
    };
  }, []);

  return hydrated;
}
