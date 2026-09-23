import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useMatchStore } from '@/store/useMatchStore';
import { useAppStore } from '@/store/useAppStore';
import { TEAM_COLOR_CLASSES } from '@/lib/draw';
import { SPORTS } from '@/lib/sports';
import { hasDetail, setsWonBy } from '@/lib/volleyStats';
import { formatDate } from '@/lib/stats';
import { cn } from '@/lib/utils';

export function HistoryPage() {
  const navigate = useNavigate();
  const all = useMatchStore((s) => s.matches);
  // Cada modo vê só as próprias partidas; sem modo gravado é amador
  const pro = useAppStore((s) => s.mode) === 'profissional';
  const matches = all.filter((m) => (m.mode === 'profissional') === pro);
  const removeMatch = useMatchStore((s) => s.removeMatch);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-10">
      <header className="safe-top flex items-center gap-3 pt-6 pb-4">
        <button
          onClick={() => navigate(pro ? '/profissional' : '/amador')}
          className="p-1 text-ink-400"
        >
          <ArrowLeft size={22} />
        </button>
        <div>
          <h1 className="text-xl font-bold">Partidas</h1>
          <p className="text-xs text-ink-400">
            {matches.length === 0
              ? 'Nenhuma ainda'
              : `${matches.length} ${matches.length === 1 ? 'registrada' : 'registradas'}`}
          </p>
        </div>
      </header>

      {matches.length === 0 && (
        <div className="mt-12 text-center">
          <p className="text-5xl">🏐</p>
          <p className="mt-3 text-sm leading-relaxed text-ink-400">
            As partidas com scout aparecem aqui,
            <br />
            com o resumo de cada uma.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {matches.map((m) => {
          const [a, b] = m.teams;
          const sa = setsWonBy(m, a.id);
          const sb = setsWonBy(m, b.id);
          return (
            <div
              key={m.id}
              className="flex items-center gap-2 rounded-2xl border border-ink-800 bg-ink-900 px-3 py-3"
            >
              <button
                onClick={() => navigate(`/partida/${m.id}`)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="shrink-0 text-xl">{SPORTS[m.sport].emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'size-2 shrink-0 rounded-full',
                        TEAM_COLOR_CLASSES[a.color].bg,
                      )}
                    />
                    <span className="truncate text-[15px] font-medium text-ink-50">
                      {a.name}
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-ink-100">
                      {sa} × {sb}
                    </span>
                    <span
                      className={cn(
                        'size-2 shrink-0 rounded-full',
                        TEAM_COLOR_CLASSES[b.color].bg,
                      )}
                    />
                    <span className="truncate text-[15px] font-medium text-ink-50">
                      {b.name}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-500">
                    {formatDate(m.date)} · {m.games.length}{' '}
                    {m.games.length === 1 ? 'set' : 'sets'}
                    {hasDetail(m) ? ' · com scout' : ' · só placar'}
                  </span>
                </span>
                <ChevronRight size={17} className="shrink-0 text-ink-600" />
              </button>
              <button
                onClick={() => {
                  if (window.confirm('Apagar esta partida?')) removeMatch(m.id);
                }}
                className="shrink-0 p-1.5 text-ink-700 hover:text-red-400"
                aria-label="Apagar partida"
              >
                <Trash2 size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
