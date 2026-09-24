import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useMatchStore } from '@/store/useMatchStore';
import { useProStore } from '@/store/useProStore';
import { useJogoStore } from '@/store/useJogoStore';

const STORES = [useAppStore, useMatchStore, useProStore, useJogoStore];
const allHydrated = () => STORES.every((s) => s.persist.hasHydrated());

/**
 * Os dados moram no localStorage e a leitura não é instantânea.
 * Sem esperar por ela, qualquer tela que dependa de encontrar algo
 * — uma partida, um jogador, o jogo em andamento — decide "não existe"
 * antes de olhar e manda o usuário de volta para a home.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(allHydrated);

  useEffect(() => {
    const check = () => setHydrated(allHydrated());
    const offs = STORES.map((s) => s.persist.onFinishHydration(check));
    check();
    return () => offs.forEach((off) => off());
  }, []);

  return hydrated;
}
