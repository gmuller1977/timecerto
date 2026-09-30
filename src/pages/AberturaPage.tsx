import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { useHydrated } from '@/store/useHydrated';
import { ativarGrupo } from '@/store/trocarGrupo';
import { lerGrupoAtivo } from '@/lib/grupoAtivo';
import { hasSavedSession } from '@/lib/sessao';
import type { AppMode } from '@/types';

const INICIO: Record<AppMode, string> = { amador: '/amador', profissional: '/profissional/jogo' };

/**
 * A abertura do app (docs/telas-amador.md, etapas 7 e 8): abre direto no
 * último grupo usado, e o tipo dele (amador ou profissional) configura o app.
 * Sem o menu de modos no meio — um pedágio pago em toda abertura para servir
 * a quem alterna, um caso raro.
 *
 * O grupo ativo é lembrado no aparelho (`lib/grupoAtivo.ts`), e é ele que
 * responde sem rede, no ginásio. Sem grupo lembrado mas com o tipo lembrado —
 * quem usa sem grupo na nuvem, ou aparelho de antes da etapa 8 —, abre no
 * tipo. Sem nenhum dos dois, pergunta à nuvem: com um grupo só, é esse; com
 * vários, sem nenhum, ou sem conseguir perguntar, mostra a escolha (`/modo`).
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
  const ativo = lerGrupoAtivo();

  useEffect(() => {
    if (!hydrated || ativo || mode || !comSessao) return;
    let vivo = true;
    import('@/lib/cloud')
      .then(({ meusGrupos }) => meusGrupos())
      .then(async (grupos) => {
        if (!vivo) return;
        if (grupos.length === 1) {
          const g = grupos[0];
          // Troca o conteúdo do aparelho pelo do grupo e define o tipo: a tela
          // redesenha com o modo novo e segue para o início dele
          await ativarGrupo({ id: g.id, mode: g.mode, name: g.name });
        } else setSemResposta(true);
      })
      .catch(() => vivo && setSemResposta(true));
    return () => {
      vivo = false;
    };
  }, [hydrated, ativo, mode, comSessao]);

  if (!hydrated) return null;
  if (ativo) return <Navigate to={INICIO[ativo.mode]} replace />;
  if (mode) return <Navigate to={INICIO[mode]} replace />;
  if (!comSessao || semResposta) return <Navigate to="/modo" replace />;
  return null;
}
