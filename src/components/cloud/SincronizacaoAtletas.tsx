import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useAuth } from '@/store/useAuth';
import { findMyGroup, syncAmador } from '@/lib/cloud';

const naoEnviado = (p: { remoteId?: string; enviadoEm?: string; updatedAt?: string }) =>
  !p.remoteId || p.enviadoEm !== p.updatedAt;

/**
 * Mantém os atletas iguais em todos os aparelhos da conta (base única, fase 1).
 * Não desenha nada. Carregado sob demanda em App.tsx, só para quem tem sessão
 * salva — quem nunca entrou não baixa o Supabase.
 *
 * Roda ao abrir, ao voltar para o app, quando a internet volta, a cada 30 s
 * com a tela à vista, e 1,5 s depois de qualquer edição de atleta. Sem sinal,
 * não tenta: a edição fica guardada no aparelho (`enviadoEm !== updatedAt`,
 * `excluidos`) e vai na próxima.
 */
export function SincronizacaoAtletas() {
  const ready = useAuth((s) => s.ready);
  const session = useAuth((s) => s.session);
  // O id do grupo, depois de achado. Sem grupo, procura de novo na próxima:
  // ele pode ter sido criado nesse meio-tempo
  const grupo = useRef<string | null>(null);

  const rodar = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      if (!grupo.current) grupo.current = (await findMyGroup('amador'))?.id ?? null;
      if (grupo.current) await syncAmador(grupo.current);
    } catch (e) {
      console.error('sincronizar atletas', e);
    }
  }, []);

  const ativo = ready && Boolean(session);

  useEffect(() => {
    if (!ativo) return;
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
  }, [ativo, rodar]);

  // Edição local: envia logo depois, em lote
  useEffect(() => {
    if (!ativo) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useAppStore.subscribe((s, antes) => {
      if (s.players === antes.players && s.excluidos === antes.excluidos) return;
      if (s.excluidos.length === 0 && !s.players.some(naoEnviado)) return;
      clearTimeout(timer);
      timer = setTimeout(rodar, 1_500);
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, [ativo, rodar]);

  return null;
}
