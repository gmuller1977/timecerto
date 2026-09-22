import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { PlayersPage } from '@/pages/PlayersPage';
import { DrawPage } from '@/pages/DrawPage';
import { ResultPage } from '@/pages/ResultPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PlayersPage />} />
        <Route path="/sortear" element={<DrawPage />} />
        <Route path="/resultado" element={<ResultPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
