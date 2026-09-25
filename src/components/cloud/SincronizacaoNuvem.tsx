import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useAuth } from '@/store/useAuth';
import { useJogoStore } from '@/store/useJogoStore';
import { useMatchStore } from '@/store/useMatchStore';
import { findMyGroup, sincronizarJogos, sincronizarPartidas, syncAmador } from '@/lib/cloud';
import { pendentesDeEnvio } from '@/lib/jogo';

const naoEnviado = (x: { remoteId?: string; enviadoEm?: string; updatedAt?: string }) =>
  !x.remoteId || x.enviadoEm !== x.updatedAt;

// O componente é montado uma vez só (App.tsx): o estado da rodada mora aqui.
// O id do grupo, depois de achado. Sem grupo, procura de novo na próxima:
// ele pode ter sido criado (ou o convite aceito) nesse meio-tempo
let grupo: string | null = null;
let rodando = false;
let deNovo = false;

async function rodar(): Promise<void> {
  if (!navigator.onLine) return;
  // Uma rodada por vez; o que mudar durante ela dispara outra no fim
  if (rodando) {
    deNovo = true;
    return;
  }
  rodando = true;
  try {
    if (!grupo) grupo = (await findMyGroup('amador'))?.id ?? null;
    if (grupo) {
      await syncAmador(grupo);
      await sincronizarJogos(grupo);
      await sincronizarPartidas(grupo);
    }
  } catch (e) {
    console.error('sincronizar com a nuvem', e);
  } finally {
    rodando = false;
    if (deNovo) {
      deNovo = false;
      void rodar();
    }
  }
}

/**
 * Mantém atletas, jogos, sorteios, respostas e partidas iguais em todos os aparelhos da
 * conta (base única, fases 1 e 2). Não desenha nada. Carregado sob demanda em
 * App.tsx, só para quem tem sessão salva — quem nunca entrou não baixa o
 * Supabase.
 *
 * Roda ao abrir, ao voltar para o app, quando a internet volta, a cada 30 s
 * com a tela à vista, e 1,5 s depois de qualquer edição. Sem sinal, não tenta:
 * a edição fica guardada no aparelho e vai na próxima. Atletas antes dos
 * jogos — respostas e sorteio falam de jogadores pelo id da nuvem.
 */
export function SincronizacaoNuvem() {
  const ready = useAuth((s) => s.ready);
  const session = useAuth((s) => s.session);

  const ativo = ready && Boolean(session);

  useEffect(() => {
    if (!ativo) {
      // Saiu da conta: a próxima entrada pode ser de outro grupo
      grupo = null;
      return;
    }
    rodar();
    const aoVoltar = () => {
      if (!document.hidden) rodar();
    };
    const timer = setInterval(aoVoltar, 30_000);
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('online', rodar);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('online', rodar);
    };
  }, [ativo]);

  // Edição local — atleta, jogo, sorteio ou resposta: envia logo depois, em lote
  useEffect(() => {
    if (!ativo) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const agendar = () => {
      clearTimeout(timer);
      timer = setTimeout(rodar, 1_500);
    };
    const offAtletas = useAppStore.subscribe((s, antes) => {
      if (s.players === antes.players && s.excluidos === antes.excluidos) return;
      if (s.excluidos.length > 0 || s.players.some(naoEnviado)) agendar();
    });
    const offJogos = useJogoStore.subscribe((s, antes) => {
      if (s.jogos === antes.jogos) return;
      if (s.jogos.some((j) => naoEnviado(j) || pendentesDeEnvio(j).length > 0)) agendar();
    });
    const offPartidas = useMatchStore.subscribe((s, antes) => {
      if (s.matches === antes.matches && s.excluidas === antes.excluidas) return;
      if (s.excluidas.length > 0 || s.matches.some((m) => m.mode !== 'profissional' && naoEnviado(m))) agendar();
    });
    return () => {
      offAtletas();
      offJogos();
      offPartidas();
      clearTimeout(timer);
    };
  }, [ativo]);

  return null;
}
