import { lazy, Suspense, useEffect, useState } from 'react';
import { hasSavedSession } from '@/lib/sessao';
import { useHydrated } from '@/store/useHydrated';
import { useJogoStore } from '@/store/useJogoStore';
import { HashRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { HomePage } from '@/pages/HomePage';
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

export default function App() {
  return (
    <HashRouter>
      <MigracaoPresent />
      <Nuvem />
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/profissional" element={<ProPlayersPage />} />
          <Route path="/profissional/escalacao" element={<LineupPage />} />
          {/* Foco total: sem barra de abas */}
          <Route path="/sortear" element={<DrawPage />} />
          <Route path="/placar" element={<ScoreboardPage />} />
          <Route path="/entrar" element={<LoginPage />} />
          {/* Só o profissional; no amador leva ao Jogo */}
          <Route path="/convites" element={<InvitePage />} />
          {/* Modo amador, com a barra de abas (docs/telas-amador.md). A aba de
              cada rota está em components/ui/TabBar.tsx */}
          <Route element={<TabLayout />}>
            <Route path="/amador" element={<JogosPage />} />
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
                <EmBrevePage
                  title="Financeiro"
                  text="Mensalidade dos mensalistas, diária dos convidados, despesas do grupo e quem ainda deve."
                />
              }
            />
            <Route
              path="/ajustes"
              element={
                <EmBrevePage
                  title="Ajustes"
                  text="Esporte, local, horário, vagas, valores e os padrões do sorteio. Por enquanto, o esporte continua na aba Jogo."
                >
                  {hasSavedSession() && (
                    <Suspense fallback={null}>
                      <Administradores />
                    </Suspense>
                  )}
                  {/* Conta e Modo ainda não têm seção própria (etapa 4). Até lá,
                      são atalhos: a conta era o "Sair" da antiga tela Convites,
                      e as raízes de aba não têm seta para voltar ao menu */}
                  <Link
                    to="/entrar"
                    className="mt-3 flex items-center justify-between rounded-2xl border border-ink-800 bg-ink-900 px-4 py-3.5 text-[15px] font-medium text-ink-100"
                  >
                    Conta
                    <span className="text-xs text-ink-500">Entrar · Sair</span>
                  </Link>
                  <Link
                    to="/"
                    className="mt-3 flex items-center justify-between rounded-2xl border border-ink-800 bg-ink-900 px-4 py-3.5 text-[15px] font-medium text-ink-100"
                  >
                    Trocar de modo
                    <span className="text-xs text-ink-500">Amador · Profissional</span>
                  </Link>
                </EmBrevePage>
              }
            />
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
