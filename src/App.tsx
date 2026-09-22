import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { PlayersPage } from '@/pages/PlayersPage';
import { DrawPage } from '@/pages/DrawPage';
import { ResultPage } from '@/pages/ResultPage';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<PlayersPage />} />
        <Route path="/sortear" element={<DrawPage />} />
        <Route path="/resultado" element={<ResultPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
