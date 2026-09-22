import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Copy, RotateCcw, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store/useAppStore';
import { SPORTS } from '@/lib/sports';
import { TEAM_COLOR_CLASSES, drawTeams, skillOf } from '@/lib/draw';
import { copyToClipboard, formatResultText, shareOnWhatsApp } from '@/lib/share';
import { cn } from '@/lib/utils';

export function ResultPage() {
  const navigate = useNavigate();
  const result = useAppStore((s) => s.lastResult);
  const players = useAppStore((s) => s.players);
  const settings = useAppStore((s) => s.settings);
  const setResult = useAppStore((s) => s.setResult);
  const [copied, setCopied] = useState(false);
  const [showStars, setShowStars] = useState(false);

  if (!result) return <Navigate to="/" replace />;

  const cfg = SPORTS[result.sport];
  const text = formatResultText(result, { showStars });

  async function handleCopy() {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  function handleRedraw() {
    setResult(drawTeams(players, settings));
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-36">
      <header className="safe-top flex items-center justify-between gap-3 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-1 text-ink-400">
            <ArrowLeft size={22} />
          </button>
          <div>
            <h1 className="text-xl font-bold">Times sorteados</h1>
            <p className="text-xs text-ink-400">
              {cfg.emoji} {cfg.name} · equilíbrio{' '}
              {result.balanceScore === 0
                ? 'perfeito'
                : `±${result.balanceScore} ⭐`}
            </p>
          </div>
        </div>
        <button
          onClick={handleRedraw}
          className="flex items-center gap-1.5 rounded-lg bg-ink-800 px-3 py-1.5 text-xs font-medium text-ink-200"
        >
          <RotateCcw size={14} />
          Refazer
        </button>
      </header>

      <div className="flex flex-col gap-3">
        {result.teams.map((team) => {
          const c = TEAM_COLOR_CLASSES[team.color];
          return (
            <div
              key={team.id}
              className="overflow-hidden rounded-2xl border border-ink-800 bg-ink-900"
            >
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span className={cn('size-3 rounded-full', c.bg)} />
                  <span className="font-semibold text-ink-50">{team.name}</span>
                </div>
                <span className="text-xs text-ink-500">
                  {team.players.length} jogadores · média{' '}
                  {team.avgSkill.toFixed(1)} ⭐
                </span>
              </div>
              <div className="border-t border-ink-800">
                {team.players.map((p, i) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 border-b border-ink-800/60 px-4 py-2.5 last:border-b-0"
                  >
                    <span className="w-4 text-xs text-ink-600">{i + 1}</span>
                    <span className="flex-1 text-[15px] text-ink-100">{p.name}</span>
                    <span className="text-xs text-amber-400/80">
                      {'★'.repeat(skillOf(p, result.sport))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {result.bench.length > 0 && (
          <div className="rounded-2xl border border-dashed border-ink-800 bg-ink-950 px-4 py-3">
            <p className="text-xs font-medium text-ink-400">
              Reservas ({result.bench.length})
            </p>
            <p className="mt-1 text-sm text-ink-300">
              {result.bench.map((p) => p.name).join(' · ')}
            </p>
          </div>
        )}
      </div>

      <button
        onClick={() => setShowStars((v) => !v)}
        className="mt-4 self-start text-xs font-medium text-ink-400"
      >
        {showStars ? 'Ocultar' : 'Incluir'} níveis no texto compartilhado
      </button>

      <div className="safe-bottom fixed inset-x-0 bottom-0 border-t border-ink-800 bg-ink-950/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg gap-2">
          <Button
            variant="secondary"
            size="lg"
            className="shrink-0"
            onClick={handleCopy}
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
          </Button>
          <Button size="lg" className="flex-1" onClick={() => shareOnWhatsApp(text)}>
            <Share2 size={18} strokeWidth={2.5} />
            Enviar no WhatsApp
          </Button>
        </div>
      </div>
    </div>
  );
}
