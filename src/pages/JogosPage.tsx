import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarPlus, ChevronDown, ChevronRight, History, MapPin, Radio, Swords } from 'lucide-react';
import { useMatchStore } from '@/store/useMatchStore';
import { useAppStore } from '@/store/useAppStore';
import { useJogoStore } from '@/store/useJogoStore';
import { SportPicker } from '@/components/sports/SportPicker';
import { FormJogo } from '@/components/jogo/FormJogo';
import { Button } from '@/components/ui/Button';
import { inicioDo, JANELA_PROXIMO_MS, proximoJogo } from '@/lib/jogo';
import { vagasDoJogo } from '@/lib/vagas';
import { cn } from '@/lib/utils';
import type { Jogo, Player } from '@/types';

const fmtDia = (j: Jogo) =>
  new Date(`${j.date}T${j.time}`).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  });

/**
 * Aba Jogo: todos os jogos marcados (pedido do Guilherme em 24/09/2026). Os
 * próximos em ordem de data; os anteriores recolhidos. Tocar num jogo abre a
 * página dele — confirmados, times, partidas e estatística.
 *
 * O primeiro dos próximos é o que os links do WhatsApp mostram
 * (`proximoJogo`, a mesma regra do link).
 */
export function JogosPage() {
  const navigate = useNavigate();
  const jogos = useJogoStore((s) => s.jogos);
  // Antes da migração do antigo `present`, "sem jogo" não quer dizer nada
  const migrado = useJogoStore((s) => Boolean(s.migracoes.present));
  const players = useAppStore((s) => s.players);
  const live = useMatchStore((s) => s.live);
  const matchCount = useMatchStore((s) => s.matches.filter((m) => m.mode !== 'profissional').length);
  const [criando, setCriando] = useState(false);
  const [verAnteriores, setVerAnteriores] = useState(false);
  // O instante de abrir a tela: basta para separar próximos de anteriores
  const [agora] = useState(() => Date.now());

  const { proximos, anteriores, proximo } = useMemo(() => {
    const vivo = (j: Jogo) => j.status === 'aberto' && inicioDo(j) >= agora - JANELA_PROXIMO_MS;
    return {
      proximos: jogos.filter(vivo).sort((a, b) => inicioDo(a) - inicioDo(b)),
      anteriores: jogos.filter((j) => !vivo(j)).sort((a, b) => inicioDo(b) - inicioDo(a)),
      proximo: proximoJogo(jogos, agora),
    };
  }, [jogos, agora]);

  const ativos = useMemo(() => players.filter((p) => !p.pending), [players]);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-32">
      <header className="safe-top flex items-center justify-between gap-3 pt-6 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">Jogo</h1>
        <button
          onClick={() => navigate('/historico')}
          className="flex items-center gap-1.5 rounded-lg border border-ink-800 bg-ink-900 px-3 py-2 text-xs font-medium text-ink-300"
          aria-label="Partidas"
        >
          <History size={14} />
          Partidas
          {matchCount > 0 && <span className="text-ink-500">{matchCount}</span>}
        </button>
      </header>

      {live && (
        <button
          onClick={() => navigate('/placar')}
          className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-brand-500/40 bg-brand-500/10 px-4 py-3 text-left"
        >
          <Radio size={18} className="shrink-0 animate-pulse text-brand-400" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-brand-200">Partida em andamento</span>
            <span className="block truncate text-xs text-brand-300/70">
              {live.teams[0].name} {live.sets[live.sets.length - 1].scoreA} ×{' '}
              {live.sets[live.sets.length - 1].scoreB} {live.teams[1].name} · {live.sets.length}º set
            </span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-brand-400" />
        </button>
      )}

      <SportPicker />

      {migrado && (
        <>
          <section className="mt-5">
            <p className="mb-2 text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
              Próximos jogos ({proximos.length})
            </p>
            <div className="flex flex-col gap-2">
              {proximos.map((j) => (
                <CartaoJogo
                  key={j.id}
                  jogo={j}
                  players={ativos}
                  nosLinks={j.id === proximo?.id}
                  onOpen={() => navigate(`/jogo/${j.id}`)}
                />
              ))}
              {proximos.length === 0 && !criando && (
                <p className="rounded-2xl border border-dashed border-ink-800 px-4 py-5 text-center text-sm text-ink-400">
                  Nenhum jogo marcado. Crie o próximo para marcar quem vem e sortear.
                </p>
              )}
            </div>
          </section>

          {criando ? (
            <section className="mt-3 rounded-2xl border border-ink-800 bg-ink-900 p-4">
              <p className="mb-3 text-[15px] font-semibold text-ink-50">Novo jogo</p>
              <FormJogo
                onCancel={() => setCriando(false)}
                onDone={(j) => {
                  setCriando(false);
                  navigate(`/jogo/${j.id}`);
                }}
              />
            </section>
          ) : (
            <button
              onClick={() => setCriando(true)}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-ink-700 py-3 text-sm font-medium text-brand-300"
            >
              <CalendarPlus size={16} />
              Novo jogo
            </button>
          )}

          {anteriores.length > 0 && (
            <section className="mt-6">
              <button
                onClick={() => setVerAnteriores((v) => !v)}
                className="flex w-full items-center gap-1.5 text-[11px] font-semibold tracking-wide text-ink-500 uppercase"
                aria-expanded={verAnteriores}
              >
                <ChevronDown size={14} className={cn('transition-transform', verAnteriores && 'rotate-180')} />
                Anteriores ({anteriores.length})
              </button>
              {verAnteriores && (
                <div className="mt-2 flex flex-col gap-2">
                  {anteriores.map((j) => (
                    <CartaoJogo key={j.id} jogo={j} players={ativos} onOpen={() => navigate(`/jogo/${j.id}`)} />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}

      <div className="safe-bottom above-tabbar fixed inset-x-0 border-t border-ink-800 bg-ink-950/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg gap-2">
          <Button size="lg" className="flex-1" onClick={() => setCriando(true)} disabled={criando}>
            <CalendarPlus size={19} />
            Novo jogo
          </Button>
          <Button variant="secondary" size="lg" className="shrink-0" onClick={() => navigate('/partida')}>
            <Swords size={18} />
            Partida direta
          </Button>
        </div>
      </div>
    </div>
  );
}

function CartaoJogo({
  jogo,
  players,
  nosLinks = false,
  onOpen,
}: {
  jogo: Jogo;
  players: Player[];
  nosLinks?: boolean;
  onOpen: () => void;
}) {
  const dist = vagasDoJogo(jogo, players);
  const jogam = dist.mensalistasConfirmados + dist.convidadosComVaga;
  const selo =
    jogo.status === 'cancelado'
      ? { texto: 'Cancelado', cls: 'border border-ink-700 text-ink-500' }
      : jogo.status === 'encerrado'
        ? { texto: 'Encerrado', cls: 'border border-ink-700 text-ink-400' }
        : nosLinks
          ? { texto: 'Nos links', cls: 'bg-brand-500/15 text-brand-300' }
          : null;
  return (
    <button
      onClick={onOpen}
      className={cn(
        'flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left active:scale-[0.99]',
        nosLinks ? 'border-brand-500/40 bg-ink-900' : 'border-ink-800 bg-ink-900',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold capitalize text-ink-50">
            {fmtDia(jogo)} · {jogo.time}
          </span>
          {selo && (
            <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase', selo.cls)}>
              {selo.texto}
            </span>
          )}
        </span>
        {jogo.place && (
          <span className="mt-0.5 flex items-center gap-1 text-xs text-ink-400">
            <MapPin size={12} className="shrink-0 text-ink-500" />
            <span className="truncate">{jogo.place}</span>
          </span>
        )}
        <span className="mt-1 block text-xs text-ink-400">
          <strong className="text-ink-200">{jogam}</strong> {jogam === 1 ? 'confirmado' : 'confirmados'}
          {jogo.vagas != null && ` de ${jogo.vagas}`}
          {dist.naFila > 0 && ` · ${dist.naFila} na fila`}
          {jogo.sorteio && ' · times sorteados'}
        </span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-ink-600" />
    </button>
  );
}
