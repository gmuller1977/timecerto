import { lazy, Suspense, useEffect, useState } from 'react';
import { ProJogoPage } from '@/pages/ProJogoPage';
import { SoNaPelada } from '@/components/ui/SoNaPelada';
import { hasSavedSession, isCloudAvailable } from '@/lib/sessao';
import { useHydrated } from '@/store/useHydrated';
import { useJogoStore } from '@/store/useJogoStore';
import { HashRouter, Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { HomePage } from '@/pages/HomePage';
import { AberturaPage } from '@/pages/AberturaPage';
import { JogosPage } from '@/pages/JogosPage';
import { JogoPage } from '@/pages/JogoPage';
import { RosterPage } from '@/pages/RosterPage';
import { LineupPage } from '@/pages/LineupPage';
import { ProPlayersPage } from '@/pages/ProPlayersPage';
import { DrawPage } from '@/pages/DrawPage';
import { ResultPage } from '@/pages/ResultPage';
import { ScoreboardPage } from '@/pages/ScoreboardPage';
import { QuickMatchPage } from '@/pages/QuickMatchPage';
import { MatchSummaryPage } from '@/pages/MatchSummaryPage';
import { HistoryPage } from '@/pages/HistoryPage';
import { PlayerProfilePage } from '@/pages/PlayerProfilePage';
import { EmBrevePage } from '@/pages/EmBrevePage';
import { TabLayout } from '@/components/ui/TabLayout';

// Só estas telas falam com o banco. Carregadas sob demanda, o cliente do
// Supabase fica fora do pacote principal — o placar abre leve no ginásio.
const LoginPage = lazy(() => import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const InvitePage = lazy(() => import('@/pages/InvitePage').then((m) => ({ default: m.InvitePage })));
const GuestGroupPage = lazy(() =>
  import('@/pages/GuestGroupPage').then((m) => ({ default: m.GuestGroupPage })),
);
const GuestRegisterPage = lazy(() =>
  import('@/pages/GuestRegisterPage').then((m) => ({ default: m.GuestRegisterPage })),
);
const AdminInvitePage = lazy(() =>
  import('@/pages/AdminInvitePage').then((m) => ({ default: m.AdminInvitePage })),
);
const Administradores = lazy(() =>
  import('@/components/cloud/Administradores').then((m) => ({ default: m.Administradores })),
);
const FinanceiroPage = lazy(() =>
  import('@/pages/FinanceiroPage').then((m) => ({ default: m.FinanceiroPage })),
);
const FinanceiroAjustes = lazy(() =>
  import('@/components/cloud/FinanceiroAjustes').then((m) => ({ default: m.FinanceiroAjustes })),
);
const SairDaConta = lazy(() =>
  import('@/components/cloud/SairDaConta').then((m) => ({ default: m.SairDaConta })),
);
const PlanoDoGrupo = lazy(() =>
  import('@/components/cloud/PlanoDoGrupo').then((m) => ({ default: m.PlanoDoGrupo })),
);
const NomeDoGrupo = lazy(() =>
  import('@/components/cloud/NomeDoGrupo').then((m) => ({ default: m.NomeDoGrupo })),
);
const AvisosDoAdmin = lazy(() =>
  import('@/components/cloud/Avisos').then((m) => ({ default: m.AvisosDoAdmin })),
);
const GuestAthletePage = lazy(() =>
  import('@/pages/GuestAthletePage').then((m) => ({ default: m.GuestAthletePage })),
);

/**
 * Converte o antigo `Player.present` em confirmações do jogo aberto (lib/jogo.ts).
 * Espera TODOS os stores lerem o localStorage: decidir antes disso veria
 * "sem jogo e sem presentes" onde havia a lista da semana. A marca da
 * migração fica no store do jogo e impede a segunda vez.
 */
function MigracaoPresent() {
  const hydrated = useHydrated();
  useEffect(() => {
    if (hydrated) useJogoStore.getState().migrar();
  }, [hydrated]);
  return null;
}

// Base única: atletas, jogos, sorteios e respostas iguais em todos os aparelhos
const SincronizacaoNuvem = lazy(() =>
  import('@/components/cloud/SincronizacaoNuvem').then((m) => ({
    default: m.SincronizacaoNuvem,
  })),
);

/**
 * Só para quem tem sessão salva, e só depois de ler o localStorage: sincronizar
 * antes compararia a nuvem com um elenco vazio.
 */
function Nuvem() {
  const hydrated = useHydrated();
  const [comSessao] = useState(hasSavedSession);
  if (!hydrated || !comSessao) return null;
  return (
    <Suspense fallback={null}>
      <SincronizacaoNuvem />
    </Suspense>
  );
}

/**
 * O app abre no login, como o FairSet (pedido do Guilherme em 25/09/2026):
 * as telas do organizador exigem conta. Sem sessão salva, vai para o login e
 * volta para onde estava depois de entrar.
 *
 * Só olha se há sessão SALVA no aparelho (`hasSavedSession`), sem rede e sem
 * carregar o Supabase: no ginásio sem sinal, quem já entrou continua usando.
 *
 * Os links do WhatsApp ficam de fora — mensalista, convidado e atleta não têm
 * conta.
 */
function ExigeConta() {
  const { pathname, search } = useLocation();
  if (isCloudAvailable && !hasSavedSession()) {
    return <Navigate to={`/entrar?volta=${encodeURIComponent(pathname + search)}`} replace />;
  }
  return <Outlet />;
}

export default function App() {
  return (
    <HashRouter>
      <MigracaoPresent />
      <Nuvem />
      <Suspense fallback={null}>
        <Routes>
          <Route path="/entrar" element={<LoginPage />} />
          <Route element={<ExigeConta />}>
            {/* Etapa 7: abre direto no tipo do grupo; a escolha é só para
                a primeira entrada, ou para trocar, por Ajustes */}
            <Route path="/" element={<AberturaPage />} />
            <Route path="/modo" element={<HomePage />} />
            {/* Foco total, como o sorteio: sem barra de abas */}
            <Route path="/profissional/escalacao" element={<LineupPage />} />
            {/* Foco total: sem barra de abas */}
            <Route path="/sortear" element={<DrawPage />} />
            <Route path="/placar" element={<ScoreboardPage />} />
            {/* Modo amador, com a barra de abas (docs/telas-amador.md). A aba de
                cada rota está em components/ui/TabBar.tsx */}
            <Route element={<TabLayout />}>
              <Route path="/amador" element={<JogosPage />} />
              {/* Profissional, com as mesmas abas (30/09/2026) */}
              <Route path="/profissional/jogo" element={<ProJogoPage />} />
              <Route path="/profissional" element={<ProPlayersPage />} />
              {/* Só o profissional; no amador leva ao Jogo */}
              <Route path="/convites" element={<InvitePage />} />
              <Route path="/jogo/:id" element={<JogoPage />} />
              <Route path="/resultado" element={<ResultPage />} />
              <Route path="/partida" element={<QuickMatchPage />} />
              <Route path="/partida/:id" element={<MatchSummaryPage />} />
              <Route path="/historico" element={<HistoryPage />} />
              <Route path="/elenco" element={<RosterPage />} />
              <Route path="/jogador/:id" element={<PlayerProfilePage />} />
              <Route
                path="/financeiro"
                element={
                  <Suspense fallback={null}>
                    <FinanceiroPage />
                  </Suspense>
                }
              />
              <Route
                path="/ajustes"
                element={
                  <EmBrevePage
                    title="Ajustes"
                    text="Nome do grupo, plano, financeiro, administradores e avisos. Local, horário e vagas padrão, e os padrões do sorteio, chegam aqui depois."
                  >
                    {hasSavedSession() && (
                      <Suspense fallback={null}>
                        <NomeDoGrupo />
                        <PlanoDoGrupo />
                        <FinanceiroAjustes />
                        <Administradores />
                        <SoNaPelada>
                          <AvisosDoAdmin />
                        </SoNaPelada>
                      </Suspense>
                    )}
                    {/* Com o login obrigatório, a conta só tem uma ação: sair.
                        Trocar de modo é atalho — as raízes de aba não têm seta
                        para voltar ao menu */}
                    <Suspense fallback={null}>
                      <SairDaConta />
                    </Suspense>
                    <Link
                      to="/modo"
                      className="mt-3 flex items-center justify-between rounded-2xl border border-ink-800 bg-ink-900 px-4 py-3.5 text-[15px] font-medium text-ink-100"
                    >
                      Trocar de modo
                      <span className="text-xs text-ink-500">Amador · Profissional</span>
                    </Link>
                  </EmBrevePage>
                }
              />
            </Route>
          </Route>
          {/* Links do WhatsApp — abertos por quem não tem conta */}
          <Route path="/c/:code" element={<GuestGroupPage />} />
          <Route path="/v/:code" element={<GuestGroupPage />} />
          <Route path="/r/:code" element={<GuestRegisterPage />} />
          <Route path="/a/:token" element={<GuestAthletePage />} />
          {/* Convite de administrador — uso único, 48 h (migração 012) */}
          <Route path="/admin/:token" element={<AdminInvitePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </HashRouter>
  );
}
