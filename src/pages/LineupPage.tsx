import { useMemo, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { camposDoPro } from '@/lib/pro';
import type { TipoDeJogo } from '@/types';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CircleDot,
  PlayCircle,
  RotateCw,
  Wand2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useProStore } from '@/store/useProStore';
import { useMatchStore } from '@/store/useMatchStore';
import { useHydrated } from '@/store/useHydrated';
import { TEAM_COLOR_CLASSES } from '@/lib/draw';
import { ROTATIONS, ROTATION_LIST } from '@/lib/rotation';
import { SPORTS } from '@/lib/sports';
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
import { nomeCurto, posicaoDaCor, siglaDa, useCoresDasPosicoes } from '@/lib/posicoes';

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
  // Fase 2: o elenco mora no cadastro único
  const cadastro = useAppStore((s) => s.players);
  const updatePlayerUnico = useAppStore((s) => s.updatePlayer);
  const saved = useProStore((s) => s.lastLineup);
  const saveLineup = useProStore((s) => s.saveLineup);
  const live = useMatchStore((s) => s.live);
  const startMatch = useMatchStore((s) => s.startMatch);
  const doJogo = useLocation().state as { competicao?: TipoDeJogo; jogoId?: string } | null;
  const competicao = doJogo?.competicao;

  // A quadra, a validação e o sugerir falam `Player` — o do cadastro único,
  // INTEIRO: a conversão antiga (proToPlayer) descartava as outras posições,
  // e o aviso de improviso nunca apareceria. Sem filtro: cada categoria é um
  // grupo (Guilherme, 30/09/2026), então disponível é todo o elenco
  const players = useMemo(() => cadastro.filter((p) => !p.pending), [cadastro]);
  const elenco = players;
  const scope = 'Todo o elenco';

  /*
   * Duas telas (pedido do Guilherme em 08/10/2026): no passo 1, quem joga e
   * com qual camisa; no passo 2, a posição em quadra. O número vem do
   * cadastro; trocar aqui vale só para este jogo (fica na partida).
   */
  const [passo, setPasso] = useState<1 | 2>(1);
  const [convocados, setConvocados] = useState<Set<string>>(() => {
    const salvos = saved?.convocados?.filter((id) => elenco.some((p) => p.id === id));
    return new Set(salvos?.length ? salvos : elenco.map((p) => p.id));
  });
  const [numeros, setNumeros] = useState<Record<string, string>>(() =>
    Object.fromEntries(elenco.map((p) => [p.id, p.numero != null ? String(p.numero) : ''])),
  );
  const [adversarioSaca, setAdversarioSaca] = useState(false);
  const volleyPlayers = elenco.filter((p) => convocados.has(p.id));
  const cores = useCoresDasPosicoes();

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
  // O levantador do jogo (pedido do Guilherme em 08/10/2026): o salvo, ou quem
  // é levantador no cadastro
  const [levantadorId, setLevantadorId] = useState<string | undefined>(() => {
    const salvo = saved?.levantadorId;
    if (salvo && volleyPlayers.some((p) => p.id === salvo)) return salvo;
    return volleyPlayers.find((p) => p.positions.volei === 'levantador')?.id;
  });
  /*
   * Para a quadra, o sugerir e as regras do sistema, o levantador escolhido
   * conta como levantador — mesmo que no cadastro seja de outra posição.
   */
  const comoJoga = useMemo(
    () =>
      players.map((p) =>
        p.id === levantadorId && p.positions.volei !== 'levantador'
          ? { ...p, positions: { ...p.positions, volei: 'levantador' } }
          : p,
      ),
    [players, levantadorId],
  );
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

  const problems = validateLineup(lineup, comoJoga, 'volei');
  const blocked = blocksStart(problems) || volleyPlayers.length < 6;

  const nameOf = (id?: string) =>
    id ? (players.find((p) => p.id === id)?.name ?? '?') : undefined;
  // Na quadra: o apelido, ou o primeiro nome (08/10/2026)
  const curtoOf = (id?: string) => (id ? nomeCurto(players.find((p) => p.id === id)) : undefined);

  const numeroDe = (id: string) => {
    const t = numeros[id]?.trim();
    return t ? Number(t) : undefined;
  };
  // Dois atletas com o mesmo número não deixam avançar
  const contagem = new Map<number, number>();
  for (const id of convocados) {
    const n = numeroDe(id);
    if (n !== undefined) contagem.set(n, (contagem.get(n) ?? 0) + 1);
  }
  const repetido = (id: string) => {
    const n = numeroDe(id);
    return n !== undefined && (contagem.get(n) ?? 0) > 1;
  };
  const numerosOk = [...convocados].every((id) => !repetido(id));

  // A cor, a sigla e o número de quem está numa posição
  const infoDe = (id?: string) => {
    const pl = id ? players.find((x) => x.id === id) : undefined;
    const pos = posicaoDaCor(pl, liberoId, levantadorId);
    return { numero: id ? numeroDe(id) : undefined, cor: pos ? cores[pos] : undefined, sigla: siglaDa(pos) };
  };

  // O levantador em P1…P6: gira o time inteiro até ele cair ali
  const setterId =
    levantadorId && onCourt.includes(levantadorId)
      ? levantadorId
      : onCourt.find((id) => comoJoga.find((x) => x.id === id)?.positions.volei === 'levantador');
  const posDoLevantador = setterId
    ? (Number(Object.entries(court).find(([, id]) => id === setterId)?.[0]) as CourtPosition)
    : undefined;
  function levantadorEm(pos: CourtPosition) {
    if (!setterId) return;
    const girado = allRotations(court).find((c) => c[pos] === setterId);
    if (girado) setCourt(girado);
  }

  function irParaPosicoes() {
    // Quem saiu da convocação sai da quadra e do líbero
    setCourt((c) => {
      const next: Court = {};
      for (const [pos, id] of Object.entries(c)) {
        if (id && convocados.has(id)) next[Number(pos) as CourtPosition] = id;
      }
      return next;
    });
    if (liberoId && !convocados.has(liberoId)) setLiberoId(undefined);
    if (levantadorId && !convocados.has(levantadorId)) setLevantadorId(undefined);
    setPasso(2);
    window.scrollTo(0, 0);
  }

  function alternar(id: string) {
    setConvocados((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

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
        comoJoga,
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
    const nums = Object.fromEntries(
      [...convocados].flatMap((id) => {
        const n = numeroDe(id);
        return n !== undefined ? [[id, n]] : [];
      }),
    );
    saveLineup({ ...lineup, id: uid(), convocados: [...convocados], numeros: nums, levantadorId });
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
      lineup: { system, court, liberoId, numeros: nums, adversarioSaca, levantadorId },
      // Amistoso ou campeonato: escolhido no "Novo jogo" da aba Jogo
      ...(competicao ? { competicao } : {}),
      // Veio de um jogo da agenda (fase 2): a partida fica nele
      ...(doJogo?.jogoId ? { jogoId: doJogo.jogoId } : {}),
    });
    navigate('/placar');
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-32">
      <header className="safe-top flex items-center gap-3 pt-6 pb-4">
        <button
          onClick={() => (passo === 2 ? setPasso(1) : navigate('/profissional/jogo'))}
          className="p-1 text-ink-400"
          aria-label={passo === 2 ? 'Voltar à escalação' : 'Voltar ao jogo'}
        >
          <ArrowLeft size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-ink-500">Passo {passo} de 2</p>
          <h1 className="text-xl font-bold">{passo === 1 ? 'Escalação' : 'Posição em quadra'}</h1>
          <p className="truncate text-xs text-ink-400">
            {passo === 1
              ? `Quem joga e com qual camisa · ${volleyPlayers.length} marcados`
              : `🏐 ${volleyPlayers.length} ${volleyPlayers.length === 1 ? 'atleta' : 'atletas'}`}
          </p>
        </div>
        {passo === 2 && (
        <button
          onClick={handleAuto}
          disabled={volleyPlayers.length < 6}
          className="flex items-center gap-1.5 rounded-lg border border-ink-800 bg-ink-900 px-3 py-2 text-xs font-medium text-ink-300 disabled:opacity-40"
        >
          <Wand2 size={14} />
          Sugerir
        </button>
        )}
      </header>

      {volleyPlayers.length < 6 && (
        <p className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-200">
          São necessários pelo menos 6 atletas em {scope}. Cadastre mais no
          elenco ou troque o filtro de categoria lá.
        </p>
      )}

      {passo === 1 && (
        <>
          <section>
            <p className="mb-2 text-sm font-medium text-ink-300">Atletas do jogo</p>
            <div className="flex flex-col">
              {elenco.map((pl) => {
                const marcado = convocados.has(pl.id);
                const pos = posicaoDaCor(pl, liberoId, levantadorId);
                const rep2 = marcado && repetido(pl.id);
                return (
                  <div
                    key={pl.id}
                    className={cn('flex items-center gap-3 border-t border-ink-800 py-2.5', !marcado && 'opacity-50')}
                  >
                    <button
                      onClick={() => alternar(pl.id)}
                      aria-pressed={marcado}
                      aria-label={`${marcado ? 'Tirar' : 'Marcar'} ${pl.name}`}
                      className={cn(
                        'flex size-6 shrink-0 items-center justify-center rounded-md border',
                        marcado ? 'border-brand-500 bg-brand-500 text-ink-950' : 'border-ink-600',
                      )}
                    >
                      {marcado && <Check size={15} strokeWidth={3} />}
                    </button>
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: pos ? cores[pos] : 'transparent' }}
                    />
                    <button onClick={() => alternar(pl.id)} className="min-w-0 flex-1 truncate text-left text-[15px] text-ink-100">
                      {pl.name}
                      {pos && <span className="ml-1.5 text-xs text-ink-500">{siglaDa(pos)}</span>}
                    </button>
                    <input
                      value={numeros[pl.id] ?? ''}
                      onChange={(e) =>
                        setNumeros((n) => ({ ...n, [pl.id]: e.target.value.replace(/\D/g, '').slice(0, 2) }))
                      }
                      inputMode="numeric"
                      placeholder="Nº"
                      aria-label={`Número da camisa de ${pl.name}`}
                      disabled={!marcado}
                      className={cn(
                        'h-10 w-14 shrink-0 rounded-lg bg-ink-800 text-center text-[15px] text-ink-50 placeholder:text-ink-600 outline-none',
                        rep2 && 'ring-2 ring-red-500',
                      )}
                    />
                  </div>
                );
              })}
            </div>
            {!numerosOk && (
              <p className="mt-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                Dois atletas com o mesmo número. Troque um deles para continuar.
              </p>
            )}
            <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
              O número vem do cadastro do atleta. Mudar aqui vale só para este jogo.
            </p>
          </section>

          <section className="mt-5">
            <p className="mb-2 text-sm font-medium text-ink-300">
              Levantador{' '}
              <span className="text-xs font-normal text-ink-500">— quem levanta neste jogo</span>
            </p>
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {volleyPlayers
                .filter((pl) => pl.id !== liberoId)
                .map((pl) => (
                  <button
                    key={pl.id}
                    onClick={() => setLevantadorId(pl.id === levantadorId ? undefined : pl.id)}
                    aria-pressed={levantadorId === pl.id}
                    className={cn(
                      'shrink-0 rounded-xl border px-3 py-2 text-sm font-medium',
                      levantadorId === pl.id
                        ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                        : 'border-ink-800 bg-ink-900 text-ink-400',
                    )}
                  >
                    {pl.name}
                  </button>
                ))}
            </div>
          </section>

          <section className="mt-5">
            <p className="mb-2 text-sm font-medium text-ink-300">
              Líbero{' '}
              <span className="text-xs font-normal text-ink-500">— entra no fundo, não ataca nem saca</span>
            </p>
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setLiberoId(undefined)}
                className={cn(
                  'shrink-0 rounded-xl border px-3 py-2 text-sm font-medium',
                  !liberoId ? 'border-brand-500 bg-brand-500/15 text-brand-300' : 'border-ink-800 bg-ink-900 text-ink-400',
                )}
              >
                Sem líbero
              </button>
              {volleyPlayers.map((pl) => (
                <button
                  key={pl.id}
                  onClick={() => {
                    setLiberoId(pl.id === liberoId ? undefined : pl.id);
                    if (pl.id === levantadorId) setLevantadorId(undefined);
                  }}
                  className={cn(
                    'shrink-0 rounded-xl border px-3 py-2 text-sm font-medium',
                    liberoId === pl.id
                      ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                      : 'border-ink-800 bg-ink-900 text-ink-400',
                  )}
                >
                  {pl.name}
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {passo === 2 && (
      <>
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

      {/* O levantador em P1…P6 (08/10/2026): gira o time inteiro */}
      <section className="mt-5">
        <p className="mb-2 text-sm font-medium text-ink-300">Começar com o levantador em</p>
        {setterId ? (
          <div className="flex flex-wrap gap-2">
            {([1, 6, 5, 4, 3, 2] as CourtPosition[]).map((pos) => (
              <button
                key={pos}
                onClick={() => levantadorEm(pos)}
                aria-pressed={posDoLevantador === pos}
                className={cn(
                  'h-10 min-w-12 rounded-xl border px-3 text-sm font-semibold',
                  posDoLevantador === pos
                    ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                    : 'border-ink-800 bg-ink-900 text-ink-400',
                )}
              >
                P{pos}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-ink-500">Escale um levantador na quadra para escolher onde ele começa.</p>
        )}
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
                name={curtoOf(court[pos])}
                {...infoDe(court[pos])}
                onClick={() => setPicking(pos)}
              />
            ))}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {BACK_ROW.map((pos) => (
              <CourtCell
                key={pos}
                pos={pos}
                name={curtoOf(court[pos])}
                {...infoDe(court[pos])}
                serves={pos === 1}
                onClick={() => setPicking(pos)}
              />
            ))}
          </div>

          <p className="mt-2.5 text-center text-[11px] text-ink-600">
            Quem está em P1 saca. O rodízio é horário.
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

      {/* Quem saca primeiro (08/10/2026): decidido antes de começar */}
      <section className="mt-5">
        <p className="mb-2 text-sm font-medium text-ink-300">Quem saca primeiro?</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: false, nome: teamName.trim() || 'Meu time' },
            { id: true, nome: awayName.trim() || 'Adversário' },
          ].map((t) => (
            <button
              key={String(t.id)}
              onClick={() => setAdversarioSaca(t.id)}
              aria-pressed={adversarioSaca === t.id}
              className={cn(
                'h-11 truncate rounded-xl border px-3 text-sm font-semibold',
                adversarioSaca === t.id
                  ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                  : 'border-ink-800 bg-ink-900 text-ink-400',
              )}
            >
              {t.nome}
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
              return (
                <span
                  key={id}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold',
                    infoDe(id).cor ? 'text-ink-950' : 'border border-ink-800 bg-ink-950 text-ink-300',
                  )}
                  style={infoDe(id).cor ? { background: infoDe(id).cor } : undefined}
                >
                  {infoDe(id).sigla && <span className="text-[10px] opacity-75">{infoDe(id).sigla}</span>}
                  {numeroDe(id) !== undefined ? `${numeroDe(id)} · ${curtoOf(id)}` : curtoOf(id)}
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

      </>
      )}

      <div className="safe-bottom fixed inset-x-0 bottom-0 border-t border-ink-800 bg-ink-950/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-lg">
          {passo === 1 ? (
            <Button
              size="lg"
              className="w-full"
              disabled={volleyPlayers.length < 6 || !numerosOk}
              onClick={irParaPosicoes}
            >
              {volleyPlayers.length < 6 ? 'Marque pelo menos 6 atletas' : 'Próximo: posição em quadra'}
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button size="lg" variant="secondary" className="shrink-0" onClick={() => setPasso(1)}>
                Voltar
              </Button>
              <Button size="lg" className="flex-1" disabled={blocked} onClick={handleStart}>
                <PlayCircle size={19} strokeWidth={2.5} />
                {blocked ? 'Complete a escalação' : 'Começar partida'}
              </Button>
            </div>
          )}
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
                const { cor, sigla, numero } = infoDe(p.id);
                return (
                  <div
                    key={p.id}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border px-3 py-2.5',
                      cor ? 'border-transparent' : already ? 'border-ink-800 bg-ink-950' : 'border-ink-700 bg-ink-800',
                      cor && already && 'opacity-60',
                    )}
                    style={cor ? { background: cor } : undefined}
                  >
                    {sigla && (
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink-950/20 text-[11px] font-bold text-ink-950">
                        {sigla}
                      </span>
                    )}
                    <button
                      onClick={() => place(picking, p.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className={cn('block truncate text-[15px] font-semibold', cor ? 'text-ink-950' : 'text-ink-50')}>
                        {numero !== undefined ? `${numero} · ${p.name}` : p.name}
                      </span>
                      {already && (
                        <span className={cn('block text-[11px]', cor ? 'text-ink-950/80' : 'text-ink-500')}>
                          em quadra
                        </span>
                      )}
                    </button>
                    <select
                      value={p.positions.volei ?? ''}
                      onChange={(e) =>
                        updatePlayerUnico(
                          p.id,
                          camposDoPro({ position: e.target.value || undefined }, cadastro.find((x) => x.id === p.id)),
                        )
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
  numero,
  cor,
  sigla,
  serves,
  onClick,
}: {
  pos: CourtPosition;
  name?: string;
  /** O número da camisa neste jogo (08/10/2026) */
  numero?: number;
  /** A cor da posição do atleta, e a sigla que vai junto */
  cor?: string;
  sigla?: string;
  serves?: boolean;
  onClick: () => void;
}) {
  // A caixa pintada com a cor da posição; o texto escuro, que lê bem em todas
  // as cores da paleta (pedido do Guilherme em 08/10/2026)
  const pintada = Boolean(name && cor);
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex h-20 flex-col items-center justify-center rounded-xl border px-1 transition-colors active:scale-[0.98]',
        pintada ? 'border-transparent' : name ? 'border-ink-700 bg-ink-800' : 'border-dashed border-ink-700 bg-ink-950',
      )}
      style={pintada ? { background: cor } : undefined}
    >
      <span className={cn('absolute top-1.5 left-2 text-[10px] font-bold', pintada ? 'text-ink-950/70' : 'text-ink-500')}>
        P{pos}
      </span>
      {serves && (
        <CircleDot
          size={11}
          className={cn('absolute top-1.5 right-2', pintada ? 'text-ink-950' : 'text-brand-400')}
        />
      )}
      {name ? (
        <>
          <span
            className={cn(
              'flex size-9 items-center justify-center rounded-full text-[11px] font-bold',
              pintada ? 'bg-ink-950/20 text-ink-950' : 'bg-ink-900 text-ink-50',
            )}
          >
            {sigla || initials(name)}
          </span>
          <span
            className={cn(
              'mt-1 w-full truncate px-1 text-center text-[12px] font-semibold',
              pintada ? 'text-ink-950' : 'text-ink-200',
            )}
          >
            {numero != null ? `${numero} · ${name}` : name}
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
