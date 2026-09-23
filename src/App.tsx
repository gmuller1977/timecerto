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

export default function App() {
  return (
    <HashRouter>
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
