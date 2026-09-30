import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { useHydrated } from '@/store/useHydrated';
import { hasSavedSession } from '@/lib/sessao';
import type { AppMode } from '@/types';

const INICIO: Record<AppMode, string> = { amador: '/amador', profissional: '/profissional' };

/**
 * A abertura do app (docs/telas-amador.md, etapa 7): o tipo é do GRUPO, e o
 * app abre direto nele — sem o menu de modos no meio, que era um pedágio
 * pago em toda abertura para servir a quem alterna, um caso raro.
 *
 * `useAppStore.mode` é a lembrança do tipo do último grupo usado, e é ela que
 * responde sem rede, no ginásio. Só quando o aparelho ainda não sabe
 * (primeira entrada, aparelho novo) a abertura pergunta à nuvem: com grupos
 * de um tipo só, é esse; sem grupo nenhum, ou com os dois, ou sem conseguir
 * perguntar, mostra a escolha (`/modo`).
 *
 * Espera o localStorage: decidir antes de lê-lo mandaria para a escolha quem
 * já tinha tudo lembrado.
 */
export function AberturaPage() {
  const hydrated = useHydrated();
  const mode = useAppStore((s) => s.mode);
  const [semResposta, setSemResposta] = useState(false);
  // Sem conta não há a quem perguntar
  const [comSessao] = useState(hasSavedSession);

  useEffect(() => {
    if (!hydrated || mode || !comSessao) return;
    let vivo = true;
    import('@/lib/cloud')
      .then(({ meusGrupos }) => meusGrupos())
      .then((grupos) => {
        if (!vivo) return;
        const tipos = [...new Set(grupos.map((g) => g.mode))];
        if (tipos.length === 1) useAppStore.getState().setMode(tipos[0]);
        else setSemResposta(true);
      })
      .catch(() => vivo && setSemResposta(true));
    return () => {
      vivo = false;
    };
  }, [hydrated, mode, comSessao]);

  if (!hydrated) return null;
  if (mode) return <Navigate to={INICIO[mode]} replace />;
  if (!comSessao || semResposta) return <Navigate to="/modo" replace />;
  return null;
}
