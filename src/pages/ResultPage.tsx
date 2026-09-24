import { nomeDeExibicao } from '@/lib/nome';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Copy, Link2, PlayCircle, RotateCcw, Share2 } from 'lucide-react';
import { useMatchStore } from '@/store/useMatchStore';
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
  const startMatch = useMatchStore((s) => s.startMatch);
  const [copied, setCopied] = useState(false);
  const [showStars, setShowStars] = useState(false);
  // Id do sorteio que está no link agora; outro id = "Refazer" depois de publicar
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState<string | null>(null);

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
    const next = drawTeams(players, settings);
    setResult(result?.eventId ? { ...next, eventId: result.eventId } : next);
  }

  // Carregado sob demanda: o cliente do Supabase não entra no pacote do placar
  async function handlePublish() {
    if (!result?.eventId) return;
    setPublishing(true);
    setPublishMsg(null);
    try {
      const { publishTeams } = await import('@/lib/cloud');
      const fora = await publishTeams(result.eventId, result);
      setPublishedId(result.id);
      if (fora > 0) {
        setPublishMsg(
          `${fora === 1 ? '1 jogador não está' : `${fora} jogadores não estão`} no grupo da nuvem e ficou de fora do link. Abra Convites para sincronizar.`,
        );
      }
    } catch (e) {
      console.error('publicar times', e);
      setPublishMsg(
        navigator.onLine
          ? 'Não deu para publicar. Confira se você está conectado em Convites e tente de novo.'
          : 'Sem internet. Os times continuam aqui; publique quando tiver sinal.',
      );
    }
    setPublishing(false);
  }
  const published = publishedId === result.id;

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
                    <span className="flex-1 text-[15px] text-ink-100">{nomeDeExibicao(p)}</span>
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
              {result.bench.map((p) => nomeDeExibicao(p)).join(' · ')}
            </p>
          </div>
        )}
      </div>

      {result.eventId && (
        <div className="mt-4">
          <Button
            size="lg"
            className="w-full"
            variant={published ? 'secondary' : 'primary'}
            disabled={publishing || published}
            onClick={handlePublish}
          >
            {published ? <Check size={19} /> : <Link2 size={19} />}
            {publishing
              ? 'Publicando…'
              : published
                ? 'Times publicados no link'
                : publishedId
                  ? 'Publicar o novo sorteio no link'
                  : 'Publicar os times no link do grupo'}
          </Button>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-500">
            {publishMsg ??
              'Quem abrir o link de mensalistas ou de convidados vê os times, sem os níveis.'}
          </p>
        </div>
      )}

      <Button
        variant="secondary"
        size="lg"
        className="mt-4 w-full"
        onClick={() => {
          const [a, b] = result.teams;
          startMatch({
            sport: result.sport,
            teams: [
              { id: a.id, name: a.name, color: a.color, playerIds: a.players.map((p) => p.id) },
              { id: b.id, name: b.name, color: b.color, playerIds: b.players.map((p) => p.id) },
            ],
          });
          navigate('/placar');
        }}
      >
        <PlayCircle size={19} />
        Começar partida e fazer o scout
      </Button>

      <button
        onClick={() => setShowStars((v) => !v)}
        className="mt-4 self-start text-xs font-medium text-ink-400"
      >
        {showStars ? 'Ocultar' : 'Incluir'} níveis no texto compartilhado
      </button>

      <div className="safe-bottom above-tabbar fixed inset-x-0 border-t border-ink-800 bg-ink-950/95 px-4 py-3 backdrop-blur">
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
