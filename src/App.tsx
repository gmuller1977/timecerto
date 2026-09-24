import { lazy, Suspense } from 'react';
import { HashRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { HomePage } from '@/pages/HomePage';
import { TodayPage } from '@/pages/TodayPage';
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
const GuestAthletePage = lazy(() =>
  import('@/pages/GuestAthletePage').then((m) => ({ default: m.GuestAthletePage })),
);

export default function App() {
  return (
    <HashRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/profissional" element={<ProPlayersPage />} />
          <Route path="/profissional/escalacao" element={<LineupPage />} />
          {/* Foco total: sem barra de abas */}
          <Route path="/sortear" element={<DrawPage />} />
          <Route path="/placar" element={<ScoreboardPage />} />
          <Route path="/entrar" element={<LoginPage />} />
          {/* Modo amador, com a barra de abas (docs/telas-amador.md). A aba de
              cada rota está em components/ui/TabBar.tsx */}
          <Route element={<TabLayout />}>
            <Route path="/amador" element={<TodayPage />} />
            <Route path="/resultado" element={<ResultPage />} />
            <Route path="/partida" element={<QuickMatchPage />} />
            <Route path="/partida/:id" element={<MatchSummaryPage />} />
            <Route path="/historico" element={<HistoryPage />} />
            <Route path="/elenco" element={<RosterPage />} />
            <Route path="/jogador/:id" element={<PlayerProfilePage />} />
            <Route path="/convites" element={<InvitePage />} />
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
                  {/* As raízes de aba não têm seta de voltar: este é o caminho
                      para o menu de modos até a seção Modo existir */}
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </HashRouter>
  );
}
