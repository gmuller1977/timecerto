import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { HomePage } from '@/pages/HomePage';
import { PlayersPage } from '@/pages/PlayersPage';
import { LineupPage } from '@/pages/LineupPage';
import { ProPlayersPage } from '@/pages/ProPlayersPage';
import { DrawPage } from '@/pages/DrawPage';
import { ResultPage } from '@/pages/ResultPage';
import { ScoreboardPage } from '@/pages/ScoreboardPage';
import { QuickMatchPage } from '@/pages/QuickMatchPage';
import { MatchSummaryPage } from '@/pages/MatchSummaryPage';
import { HistoryPage } from '@/pages/HistoryPage';
import { PlayerProfilePage } from '@/pages/PlayerProfilePage';

// Só estas telas falam com o banco. Carregadas sob demanda, o cliente do
// Supabase fica fora do pacote principal — o placar abre leve no ginásio.
const LoginPage = lazy(() => import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const InvitePage = lazy(() => import('@/pages/InvitePage').then((m) => ({ default: m.InvitePage })));
const GuestGroupPage = lazy(() =>
  import('@/pages/GuestGroupPage').then((m) => ({ default: m.GuestGroupPage })),
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
          <Route path="/amador" element={<PlayersPage />} />
          <Route path="/profissional" element={<ProPlayersPage />} />
          <Route path="/profissional/escalacao" element={<LineupPage />} />
          <Route path="/sortear" element={<DrawPage />} />
          <Route path="/resultado" element={<ResultPage />} />
          <Route path="/partida" element={<QuickMatchPage />} />
          <Route path="/placar" element={<ScoreboardPage />} />
          <Route path="/partida/:id" element={<MatchSummaryPage />} />
          <Route path="/historico" element={<HistoryPage />} />
          <Route path="/jogador/:id" element={<PlayerProfilePage />} />
          <Route path="/entrar" element={<LoginPage />} />
          <Route path="/convites" element={<InvitePage />} />
          {/* Links do WhatsApp — abertos por quem não tem conta */}
          <Route path="/c/:code" element={<GuestGroupPage />} />
          <Route path="/a/:token" element={<GuestAthletePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </HashRouter>
  );
}
