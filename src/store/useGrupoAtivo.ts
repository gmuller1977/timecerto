import { useMemo, useSyncExternalStore } from 'react';
import { grupoAtivoCru, lerGruposGuardados, ouvirMudanca, type GrupoAtivo } from '@/lib/grupoAtivo';

/**
 * O grupo ativo como estado de tela: quem mostra o nome dele (a faixa da
 * barra de abas) redesenha sozinho quando a troca acontece — inclusive a
 * que a sincronização faz, sem ninguém tocar em nada.
 */
export function useGrupoAtivo(): GrupoAtivo | null {
  const cru = useSyncExternalStore(ouvirMudanca, grupoAtivoCru, () => null);
  return useMemo(() => {
    try {
      return cru ? (JSON.parse(cru) as GrupoAtivo) : null;
    } catch {
      return null;
    }
  }, [cru]);
}

/** A lista guardada dos grupos da conta (sem rede também) */
export function useGruposGuardados() {
  const cru = useSyncExternalStore(
    ouvirMudanca,
    () => {
      try {
        return localStorage.getItem('timecerto:meus-grupos');
      } catch {
        return null;
      }
    },
    () => null,
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => lerGruposGuardados(), [cru]);
}
