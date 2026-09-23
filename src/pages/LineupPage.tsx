import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CircleDot,
  PlayCircle,
  RotateCw,
  Wand2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useProStore, matchesFilter } from '@/store/useProStore';
import { useMatchStore } from '@/store/useMatchStore';
import { AGE_GROUP_LABEL, NAIPE_LABEL, proToPlayer } from '@/lib/pro';
import { useHydrated } from '@/store/useHydrated';
import { TEAM_COLOR_CLASSES } from '@/lib/draw';
import { ROTATIONS, ROTATION_LIST } from '@/lib/rotation';
import { SPORTS, getPositionLabel } from '@/lib/sports';
import {
  BACK_ROW,
  FRONT_ROW,
  POSITION_LABEL,
  allRotations,
  autoFill,
  blocksStart,
  courtPlayerIds,
  validateLineup,
  type Court,
} from '@/lib/court';
import type { CourtPosition, Lineup, MatchTeam, RotationSystem, TeamColor } from '@/types';
import { cn, initials, uid } from '@/lib/utils';

const COLORS: TeamColor[] = [
  'verde', 'azul', 'vermelho', 'amarelo', 'preto', 'branco', 'laranja', 'roxo',
];

export function LineupPage() {
  // A escalação salva vem do localStorage: sem esperar, o estado inicial
  // nasceria vazio ao recarregar a página.
  const hydrated = useHydrated();
  return hydrated ? <LineupEditor /> : null;
}

function LineupEditor() {
  const navigate = useNavigate();
  const proPlayers = useProStore((s) => s.players);
  const filter = useProStore((s) => s.filter);
  const updatePlayer = useProStore((s) => s.updatePlayer);
  const saved = useProStore((s) => s.lastLineup);
  const saveLineup = useProStore((s) => s.saveLineup);
  const live = useMatchStore((s) => s.live);
  const startMatch = useMatchStore((s) => s.startMatch);

  // A quadra, a validação e o sugerir falam `Player`
  const players = useMemo(() => proPlayers.map(proToPlayer), [proPlayers]);
  // Disponíveis = o recorte de categoria e naipe escolhido no elenco
  const volleyPlayers = useMemo(() => {
    const ids = new Set(
      proPlayers.filter((p) => matchesFilter(p, filter)).map((p) => p.id),
    );
    return players.filter((p) => ids.has(p.id));
  }, [proPlayers, players, filter]);
  const scope =
    [
      filter.ageGroup && AGE_GROUP_LABEL[filter.ageGroup],
      filter.naipe && NAIPE_LABEL[filter.naipe],
    ]
      .filter(Boolean)
      .join(' ') || 'Todo o elenco';

  // Da escalação salva, só volta quem ainda está disponível hoje
  const [initial] = useState(() => {
    const ok = (id?: string) =>
      id !== undefined && volleyPlayers.some((p) => p.id === id);
    const court: Court = {};
    for (const [pos, id] of Object.entries(saved?.court ?? {})) {
      if (ok(id)) court[Number(pos) as CourtPosition] = id;
    }
    return {
      court,
      liberoId: ok(saved?.liberoId) ? saved?.liberoId : undefined,
    };
  });

  const [system, setSystem] = useState<RotationSystem>(saved?.system ?? '5x1');
  const [teamName, setTeamName] = useState(saved?.teamName ?? 'Meu time');
  const [color, setColor] = useState<TeamColor>(saved?.color ?? 'verde');
  const [awayName, setAwayName] = useState('Adversário');
  const [awayColor, setAwayColor] = useState<TeamColor>(
    saved?.color === 'azul' ? 'vermelho' : 'azul',
  );
  const [court, setCourt] = useState<Court>(initial.court);
  const [liberoId, setLiberoId] = useState<string | undefined>(initial.liberoId);
  const [picking, setPicking] = useState<CourtPosition | null>(null);
  const [showRotations, setShowRotations] = useState(false);

  const onCourt = courtPlayerIds(court);
  const bench = volleyPlayers
    .filter((p) => !onCourt.includes(p.id) && p.id !== liberoId)
    .map((p) => p.id);

  const lineup: Lineup = {
    id: 'draft',
    sport: 'volei',
    system,
    teamName,
    color,
    court,
    liberoId,
    bench,
    createdAt: new Date().toISOString(),
  };

  const problems = validateLineup(lineup, players, 'volei');
  const blocked = blocksStart(problems) || volleyPlayers.length < 6;

  const nameOf = (id?: string) =>
    id ? (players.find((p) => p.id === id)?.name ?? '?') : undefined;

  function place(pos: CourtPosition, playerId: string) {
    setCourt((c) => {
      const next: Court = { ...c };
      // Se o jogador já está em outra posição, troca os dois de lugar
      const current = (Object.keys(next) as unknown as CourtPosition[]).find(
        (p) => next[Number(p) as CourtPosition] === playerId,
      );
      if (current !== undefined) {
        next[Number(current) as CourtPosition] = c[pos];
      }
      next[pos] = playerId;
      return next;
    });
    setPicking(null);
  }

  function clear(pos: CourtPosition) {
    setCourt((c) => {
      const next = { ...c };
      delete next[pos];
      return next;
    });
    setPicking(null);
  }

  function handleAuto() {
    setCourt(
      autoFill(
        volleyPlayers.filter((p) => p.id !== liberoId).map((p) => p.id),
        players,
        system,
        'volei',
      ),
    );
  }

  function handleStart() {
    if (
      live &&
      !window.confirm(
        'Há uma partida em andamento. Começar esta descarta a outra — continuar?',
      )
    ) {
      return;
    }
    saveLineup({ ...lineup, id: uid() });
    const home: MatchTeam = {
      id: uid(),
      name: teamName.trim() || 'Meu time',
      color,
      playerIds: [...onCourt, ...bench, ...(liberoId ? [liberoId] : [])],
    };
    const away: MatchTeam = {
      id: uid(),
      name: awayName.trim() || 'Adversário',
      color: awayColor,
      playerIds: [],
    };
    startMatch({
      sport: 'volei',
      teams: [home, away],
      scout: { mode: 'atleta' },
      lineup: { system, court, liberoId },
    });
    navigate('/placar');
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-32">
      <header className="safe-top flex items-center gap-3 pt-6 pb-4">
        <button onClick={() => navigate('/profissional')} className="p-1 text-ink-400">
          <ArrowLeft size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">Escalação</h1>
          <p className="truncate text-xs text-ink-400">
            🏐 {scope} · {volleyPlayers.length}{' '}
            {volleyPlayers.length === 1 ? 'atleta' : 'atletas'}
          </p>
        </div>
        <button
          onClick={handleAuto}
          disabled={volleyPlayers.length < 6}
          className="flex items-center gap-1.5 rounded-lg border border-ink-800 bg-ink-900 px-3 py-2 text-xs font-medium text-ink-300 disabled:opacity-40"
        >
          <Wand2 size={14} />
          Sugerir
        </button>
      </header>

      {volleyPlayers.length < 6 && (
        <p className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-200">
          São necessários pelo menos 6 atletas em {scope}. Cadastre mais no
          elenco ou troque o filtro de categoria lá.
        </p>
      )}

      {/* Sistema */}
      <section>
        <p className="mb-2 text-sm font-medium text-ink-300">Sistema de jogo</p>
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          {ROTATION_LIST.map((r) => (
            <button
              key={r.id}
              onClick={() => setSystem(r.id)}
              className={cn(
                'shrink-0 rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition-colors',
                system === r.id
                  ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                  : 'border-ink-800 bg-ink-900 text-ink-400',
              )}
            >
              {r.name}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-500">{ROTATIONS[system].summary}</p>
      </section>

      {/* Quadra */}
      <section className="mt-5">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium text-ink-300">Posicionamento inicial</p>
          <button
            onClick={() => setShowRotations(true)}
            disabled={onCourt.length < 6}
            className="flex items-center gap-1 text-xs font-medium text-brand-400 disabled:text-ink-600"
          >
            <RotateCw size={13} />
            Ver rodízio
          </button>
        </div>

        <div className="mt-2 rounded-2xl border border-ink-800 bg-ink-900 p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="h-px flex-1 bg-brand-500/40" />
            <span className="text-[10px] font-semibold tracking-widest text-brand-400/70 uppercase">
              rede
            </span>
            <span className="h-px flex-1 bg-brand-500/40" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {FRONT_ROW.map((pos) => (
              <CourtCell
                key={pos}
                pos={pos}
                name={nameOf(court[pos])}
                onClick={() => setPicking(pos)}
              />
            ))}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {BACK_ROW.map((pos) => (
              <CourtCell
                key={pos}
                pos={pos}
                name={nameOf(court[pos])}
                serves={pos === 1}
                onClick={() => setPicking(pos)}
              />
            ))}
          </div>

          <p className="mt-2.5 text-center text-[11px] text-ink-600">
            A posição 1 saca primeiro. O rodízio é horário.
          </p>
        </div>
      </section>

      {/* Problemas */}
      {problems.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {problems.map((p, i) => (
            <div
              key={i}
              className={cn(
                'flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs leading-relaxed',
                p.severity === 'erro'
                  ? 'border-red-500/30 bg-red-500/10 text-red-300'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-200',
              )}
            >
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{p.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Líbero e reservas */}
      <section className="mt-5">
        <p className="mb-2 text-sm font-medium text-ink-300">
          Líbero{' '}
          <span className="text-xs font-normal text-ink-500">
            — entra no fundo, não ataca nem saca
          </span>
        </p>
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setLiberoId(undefined)}
            className={cn(
              'shrink-0 rounded-xl border px-3 py-2 text-sm font-medium',
              !liberoId
                ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                : 'border-ink-800 bg-ink-900 text-ink-400',
            )}
          >
            Sem líbero
          </button>
          {volleyPlayers
            .filter((p) => !onCourt.includes(p.id) || p.id === liberoId)
            .map((p) => (
              <button
                key={p.id}
                onClick={() => setLiberoId(p.id === liberoId ? undefined : p.id)}
                className={cn(
                  'shrink-0 rounded-xl border px-3 py-2 text-sm font-medium',
                  liberoId === p.id
                    ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                    : 'border-ink-800 bg-ink-900 text-ink-400',
                )}
              >
                {p.name}
              </button>
            ))}
        </div>
      </section>

      <section className="mt-4">
        <p className="mb-2 text-sm font-medium text-ink-300">
          Reservas{' '}
          <span className="text-xs font-normal text-ink-500">({bench.length})</span>
        </p>
        {bench.length === 0 ? (
          <p className="text-xs text-ink-600">Todo mundo está em quadra.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {bench.map((id) => {
              const p = players.find((x) => x.id === id)!;
              return (
                <span
                  key={id}
                  className="rounded-lg border border-ink-800 bg-ink-950 px-2.5 py-1.5 text-xs text-ink-300"
                >
                  {p.name}
                  <span className="ml-1.5 text-ink-600">
                    {getPositionLabel('volei', p.positions.volei)}
                  </span>
                </span>
              );
            })}
          </div>
        )}
      </section>

      {/* Times */}
      <section className="mt-5 rounded-2xl border border-ink-800 bg-ink-900 p-4">
        <p className="mb-3 text-xs font-semibold tracking-wide text-brand-400 uppercase">
          Seu time
        </p>
        <input
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          className="w-full rounded-xl bg-ink-800 px-3 py-2.5 text-[15px] text-ink-50 outline-none"
        />
        <div className="mt-3 flex gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              aria-label={c}
              className={cn(
                'size-7 rounded-full ring-2 ring-offset-2 ring-offset-ink-900',
                TEAM_COLOR_CLASSES[c].bg,
                color === c ? 'ring-brand-400' : 'ring-transparent',
              )}
            />
          ))}
        </div>

        <p className="mt-5 mb-3 text-xs font-semibold tracking-wide text-ink-400 uppercase">
          Adversário
        </p>
        <input
          value={awayName}
          onChange={(e) => setAwayName(e.target.value)}
          className="w-full rounded-xl bg-ink-800 px-3 py-2.5 text-[15px] text-ink-50 outline-none"
        />
        <div className="mt-3 flex gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setAwayColor(c)}
              aria-label={c}
              className={cn(
                'size-7 rounded-full ring-2 ring-offset-2 ring-offset-ink-900',
                TEAM_COLOR_CLASSES[c].bg,
                awayColor === c ? 'ring-brand-400' : 'ring-transparent',
              )}
            />
          ))}
        </div>
      </section>

      <div className="safe-bottom fixed inset-x-0 bottom-0 border-t border-ink-800 bg-ink-950/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-lg">
          <Button
            size="lg"
            className="w-full"
            disabled={blocked}
            onClick={handleStart}
          >
            <PlayCircle size={19} strokeWidth={2.5} />
            {blocked ? 'Complete a escalação' : 'Começar partida'}
          </Button>
        </div>
      </div>

      {/* Escolha de jogador para a posição */}
      {picking !== null && (
        <Sheet onClose={() => setPicking(null)}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-[15px] font-semibold text-ink-50">
                Posição {picking}
              </p>
              <p className="text-xs text-ink-500">{POSITION_LABEL[picking]}</p>
            </div>
            <button onClick={() => setPicking(null)} className="p-1 text-ink-500">
              <X size={20} />
            </button>
          </div>

          <p className="mb-2 text-[11px] leading-relaxed text-ink-600">
            Toque no nome para escalar. A função ao lado define o papel do
            jogador — é ela que o sistema de jogo cobra.
          </p>

          <div className="flex flex-col gap-2">
            {volleyPlayers
              .filter((p) => p.id !== liberoId)
              .map((p) => {
                const already = onCourt.includes(p.id);
                return (
                  <div
                    key={p.id}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border px-3 py-2.5',
                      already
                        ? 'border-ink-800 bg-ink-950'
                        : 'border-ink-700 bg-ink-800',
                    )}
                  >
                    <button
                      onClick={() => place(picking, p.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-[15px] font-medium text-ink-50">
                        {p.name}
                      </span>
                      {already && (
                        <span className="block text-[11px] text-ink-500">
                          em quadra
                        </span>
                      )}
                    </button>
                    <select
                      value={p.positions.volei ?? ''}
                      onChange={(e) =>
                        updatePlayer(p.id, { position: e.target.value || undefined })
                      }
                      className="shrink-0 rounded-lg bg-ink-700 px-2 py-1.5 text-xs text-ink-200 outline-none"
                    >
                      <option value="">Função</option>
                      {SPORTS.volei.positions.map((pos) => (
                        <option key={pos.id} value={pos.id}>
                          {pos.label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
          </div>

          {court[picking] && (
            <button
              onClick={() => clear(picking)}
              className="mt-3 w-full rounded-xl border border-ink-800 py-3 text-sm font-medium text-ink-400"
            >
              Deixar a posição vazia
            </button>
          )}
        </Sheet>
      )}

      {/* Rodízio */}
      {showRotations && (
        <Sheet onClose={() => setShowRotations(false)}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-[15px] font-semibold text-ink-50">
                As seis rotações
              </p>
              <p className="text-xs text-ink-500">
                Como o time gira a cada saque conquistado
              </p>
            </div>
            <button
              onClick={() => setShowRotations(false)}
              className="p-1 text-ink-500"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {allRotations(court).map((c, i) => (
              <div
                key={i}
                className="rounded-xl border border-ink-800 bg-ink-950 p-3"
              >
                <p className="mb-2 text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
                  Rotação {i + 1} · saca {nameOf(c[1]) ?? '—'}
                </p>
                <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                  {FRONT_ROW.map((pos) => (
                    <span
                      key={pos}
                      className="truncate rounded-lg bg-brand-500/10 px-2 py-1.5 text-brand-200"
                    >
                      {nameOf(c[pos]) ?? '—'}
                    </span>
                  ))}
                  {BACK_ROW.map((pos) => (
                    <span
                      key={pos}
                      className="truncate rounded-lg bg-ink-800 px-2 py-1.5 text-ink-300"
                    >
                      {nameOf(c[pos]) ?? '—'}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-600">
            A linha de cima é a rede, a de baixo é o fundo. Quem está na rede
            ataca e bloqueia; quem está no fundo defende e saca.
          </p>
        </Sheet>
      )}
    </div>
  );
}

function CourtCell({
  pos,
  name,
  serves,
  onClick,
}: {
  pos: CourtPosition;
  name?: string;
  serves?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex h-20 flex-col items-center justify-center rounded-xl border px-1 transition-colors active:scale-[0.98]',
        name
          ? 'border-ink-700 bg-ink-800'
          : 'border-dashed border-ink-700 bg-ink-950',
      )}
    >
      <span className="absolute top-1.5 left-2 text-[10px] font-bold text-ink-600">
        {pos}
      </span>
      {serves && (
        <CircleDot
          size={11}
          className="absolute top-1.5 right-2 text-brand-400"
        />
      )}
      {name ? (
        <>
          <span className="flex size-7 items-center justify-center rounded-full bg-brand-500/20 text-[11px] font-bold text-brand-200">
            {initials(name)}
          </span>
          <span className="mt-1 w-full truncate px-1 text-center text-[11px] text-ink-200">
            {name}
          </span>
        </>
      ) : (
        <span className="text-[11px] text-ink-600">vazio</span>
      )}
    </button>
  );
}

function Sheet({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="safe-bottom relative max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-ink-700 bg-ink-900 px-4 pt-4 pb-6">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink-700" />
        {children}
      </div>
    </div>
  );
}
