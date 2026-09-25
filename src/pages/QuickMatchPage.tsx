import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Bookmark, Check, PlayCircle, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store/useAppStore';
import { usePresentes } from '@/store/useJogoStore';
import { useMatchStore } from '@/store/useMatchStore';
import { TEAM_COLOR_CLASSES } from '@/lib/draw';
import { ROTATION_LIST, ROTATIONS, settersNeeded } from '@/lib/rotation';
import type { MatchTeam, RotationSystem, TeamColor } from '@/types';
import { cn, uid } from '@/lib/utils';

const COLORS: TeamColor[] = [
  'verde',
  'azul',
  'vermelho',
  'amarelo',
  'preto',
  'branco',
  'laranja',
  'roxo',
];

function ColorRow({
  value,
  onChange,
}: {
  value: TeamColor;
  onChange: (c: TeamColor) => void;
}) {
  return (
    <div className="flex gap-2">
      {COLORS.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          aria-label={c}
          className={cn(
            'size-7 rounded-full ring-2 ring-offset-2 ring-offset-ink-900 transition-all',
            TEAM_COLOR_CLASSES[c].bg,
            value === c ? 'ring-brand-400' : 'ring-transparent',
          )}
        />
      ))}
    </div>
  );
}

export function QuickMatchPage() {
  const navigate = useNavigate();
  const sport = useAppStore((s) => s.sport);
  const squads = useAppStore((s) => s.squads);
  const addSquad = useAppStore((s) => s.addSquad);
  const startMatch = useMatchStore((s) => s.startMatch);

  // Vinda da página de um jogo, a partida é dele e usa os confirmados dele
  const jogoId = useSearchParams()[0].get('jogo') ?? undefined;
  const present = usePresentes(jogoId);
  const mySquads = squads.filter((q) => q.sport === sport);

  const [homeSquadId, setHomeSquadId] = useState<string | null>(
    mySquads[0]?.id ?? null,
  );
  const [homeName, setHomeName] = useState(mySquads[0]?.name ?? 'Meu time');
  const [homeColor, setHomeColor] = useState<TeamColor>(
    mySquads[0]?.color ?? 'verde',
  );
  const [awayName, setAwayName] = useState('Convidado');
  const [awayColor, setAwayColor] = useState<TeamColor>('azul');
  const [system, setSystem] = useState<RotationSystem>(
    mySquads[0]?.system ?? '5x1',
  );
  const [saved, setSaved] = useState(false);

  const usingPresent = homeSquadId === null;
  const homePlayerIds = usingPresent
    ? present.map((p) => p.id)
    : (mySquads.find((q) => q.id === homeSquadId)?.playerIds ?? []);

  function selectSquad(id: string | null) {
    setHomeSquadId(id);
    setSaved(false);
    if (id === null) {
      setHomeName('Meu time');
      return;
    }
    const q = mySquads.find((s) => s.id === id);
    if (q) {
      setHomeName(q.name);
      setHomeColor(q.color);
      if (q.system) setSystem(q.system);
    }
  }

  function handleSaveSquad() {
    const squad = addSquad({
      name: homeName.trim() || 'Meu time',
      playerIds: homePlayerIds,
      color: homeColor,
      isMine: true,
      system,
    });
    setHomeSquadId(squad.id);
    setSaved(true);
  }

  function handleStart() {
    const home: MatchTeam = {
      id: uid(),
      name: homeName.trim() || 'Meu time',
      color: homeColor,
      playerIds: homePlayerIds,
    };
    const away: MatchTeam = {
      id: uid(),
      name: awayName.trim() || 'Convidado',
      color: awayColor,
      playerIds: [],
    };
    startMatch({ sport, jogoId, teams: [home, away] });
    navigate('/placar');
  }

  const setters = settersNeeded(system);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-32">
      <header className="safe-top flex items-center gap-3 pt-6 pb-4">
        <button onClick={() => navigate('/')} className="p-1 text-ink-400">
          <ArrowLeft size={22} />
        </button>
        <div>
          <h1 className="text-xl font-bold">Partida direta</h1>
          <p className="text-xs text-ink-400">Sem sorteio — times já definidos</p>
        </div>
      </header>

      {/* Time da casa */}
      <section className="rounded-2xl border border-ink-800 bg-ink-900 p-4">
        <p className="mb-3 text-xs font-semibold tracking-wide text-brand-400 uppercase">
          Time da casa
        </p>

        {(mySquads.length > 0 || present.length > 0) && (
          <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto pb-1">
            {mySquads.map((q) => (
              <button
                key={q.id}
                onClick={() => selectSquad(q.id)}
                className={cn(
                  'shrink-0 rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                  homeSquadId === q.id
                    ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                    : 'border-ink-800 bg-ink-950 text-ink-400',
                )}
              >
                {q.name}
                <span className="ml-1.5 text-[11px] opacity-60">
                  {q.playerIds.length}
                </span>
              </button>
            ))}
            <button
              onClick={() => selectSquad(null)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                usingPresent
                  ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                  : 'border-ink-800 bg-ink-950 text-ink-400',
              )}
            >
              <Users size={14} />
              Presentes
              <span className="text-[11px] opacity-60">{present.length}</span>
            </button>
          </div>
        )}

        <input
          value={homeName}
          onChange={(e) => {
            setHomeName(e.target.value);
            setSaved(false);
          }}
          placeholder="Nome do time"
          className="w-full rounded-xl bg-ink-800 px-3 py-2.5 text-[15px] text-ink-50 outline-none placeholder:text-ink-500"
        />
        <div className="mt-3">
          <ColorRow value={homeColor} onChange={setHomeColor} />
        </div>

        <p className="mt-3 text-xs text-ink-500">
          {homePlayerIds.length > 0
            ? `${homePlayerIds.length} jogadores — dá para fazer scout por atleta`
            : 'Sem jogadores — o scout vai registrar só o time'}
        </p>

        {usingPresent && homePlayerIds.length > 0 && (
          <button
            onClick={handleSaveSquad}
            disabled={saved}
            className="mt-3 flex items-center gap-2 text-xs font-medium text-brand-400 disabled:text-ink-500"
          >
            {saved ? <Check size={14} /> : <Bookmark size={14} />}
            {saved ? 'Elenco salvo' : 'Salvar como elenco fixo'}
          </button>
        )}
      </section>

      {/* Adversário */}
      <section className="mt-3 rounded-2xl border border-ink-800 bg-ink-900 p-4">
        <p className="mb-3 text-xs font-semibold tracking-wide text-ink-400 uppercase">
          Adversário
        </p>
        <input
          value={awayName}
          onChange={(e) => setAwayName(e.target.value)}
          placeholder="Nome do time convidado"
          className="w-full rounded-xl bg-ink-800 px-3 py-2.5 text-[15px] text-ink-50 outline-none placeholder:text-ink-500"
        />
        <div className="mt-3">
          <ColorRow value={awayColor} onChange={setAwayColor} />
        </div>
        <p className="mt-3 text-xs text-ink-500">
          Os erros do adversário entram no scout como contagem, sem nome.
        </p>
      </section>

      {/* Sistema de jogo */}
      {sport === 'volei' && (
        <section className="mt-3">
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
          <div className="mt-2 rounded-xl border border-ink-800 bg-ink-900 px-3 py-2.5">
            <p className="text-[13px] font-medium text-ink-200">
              {ROTATIONS[system].summary}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-500">
              {ROTATIONS[system].description}
            </p>
            <p className="mt-2 text-[11px] font-medium text-brand-400">
              {setters === 0
                ? 'Não exige levantador definido'
                : `Precisa de ${setters} levantador${setters > 1 ? 'es' : ''} no time`}
            </p>
          </div>
        </section>
      )}

      <div className="safe-bottom above-tabbar fixed inset-x-0 border-t border-ink-800 bg-ink-950/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-lg">
          <Button size="lg" className="w-full" onClick={handleStart}>
            <PlayCircle size={19} strokeWidth={2.5} />
            Começar partida
          </Button>
        </div>
      </div>
    </div>
  );
}
