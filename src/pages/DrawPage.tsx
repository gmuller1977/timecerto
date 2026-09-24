import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store/useAppStore';
import { SPORTS, KEEPER_POSITION } from '@/lib/sports';
import { ROTATIONS, ROTATION_LIST, rotationFits, settersNeeded } from '@/lib/rotation';
import { drawTeams, suggestTeamCount } from '@/lib/draw';
import { cn } from '@/lib/utils';

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-ink-800 bg-ink-900 px-4 py-3 text-left"
    >
      <span>
        <span className="block text-[15px] font-medium text-ink-50">{label}</span>
        {hint && <span className="block text-xs text-ink-500">{hint}</span>}
      </span>
      <span
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-brand-500' : 'bg-ink-700',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-5 rounded-full bg-white transition-all',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </span>
    </button>
  );
}

export function DrawPage() {
  const navigate = useNavigate();
  // Vindo dos Convites, o sorteio é de um jogo da nuvem e pode ir para o link
  const eventId = (useLocation().state as { eventId?: string } | null)?.eventId;
  const sport = useAppStore((s) => s.sport);
  const players = useAppStore((s) => s.players);
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const setResult = useAppStore((s) => s.setResult);
  const [drawing, setDrawing] = useState(false);

  const present = players.filter((p) => p.present);
  const cfg = SPORTS[sport];
  const maxTeams = Math.max(2, Math.floor(present.length / settings.teamSize));

  useEffect(() => {
    if (settings.numberOfTeams > maxTeams) {
      updateSettings({ numberOfTeams: maxTeams });
    }
  }, [maxTeams, settings.numberOfTeams, updateSettings]);

  const allocated = settings.teamSize * settings.numberOfTeams;
  const bench = Math.max(0, present.length - allocated);
  const needed = settersNeeded(settings.rotation);
  const setters = present.filter(
    (p) => p.positions.volei === 'levantador' || p.isKeeper,
  ).length;

  function handleDraw() {
    setDrawing(true);
    setTimeout(() => {
      const result = drawTeams(players, { ...settings, sport });
      setResult(eventId ? { ...result, eventId } : result);
      setDrawing(false);
      navigate('/resultado');
    }, 450);
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-32">
      <header className="safe-top flex items-center gap-3 pt-6 pb-4">
        <button onClick={() => navigate(-1)} className="p-1 text-ink-400">
          <ArrowLeft size={22} />
        </button>
        <div>
          <h1 className="text-xl font-bold">Configurar sorteio</h1>
          <p className="text-xs text-ink-400">
            {cfg.emoji} {cfg.name} · {present.length} presentes
          </p>
        </div>
      </header>

      <section className="mt-2">
        <p className="mb-2 text-sm font-medium text-ink-300">Jogadores por time</p>
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          {cfg.teamSizeOptions.map((n) => (
            <button
              key={n}
              onClick={() => {
                updateSettings({
                  teamSize: n,
                  numberOfTeams: suggestTeamCount(present.length, n),
                });
              }}
              className={cn(
                'size-12 shrink-0 rounded-xl border text-[15px] font-semibold transition-colors',
                settings.teamSize === n
                  ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                  : 'border-ink-800 bg-ink-900 text-ink-400',
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-5">
        <p className="mb-2 text-sm font-medium text-ink-300">Quantidade de times</p>
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          {Array.from({ length: Math.max(1, maxTeams - 1) }, (_, i) => i + 2).map((n) => (
            <button
              key={n}
              onClick={() => updateSettings({ numberOfTeams: n })}
              className={cn(
                'size-12 shrink-0 rounded-xl border text-[15px] font-semibold transition-colors',
                settings.numberOfTeams === n
                  ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                  : 'border-ink-800 bg-ink-900 text-ink-400',
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-500">
          {allocated} jogadores em quadra
          {bench > 0 && ` · ${bench} no banco`}
        </p>
      </section>

      <section className="mt-6 flex flex-col gap-2">
        <Toggle
          label="Equilibrar por nível"
          hint="Distribui as estrelas igualmente entre os times"
          checked={settings.balanceBySkill}
          onChange={(v) => updateSettings({ balanceBySkill: v })}
        />
        <Toggle
          label="Equilibrar por posição"
          hint="Evita time só de atacante ou só de defesa"
          checked={settings.balanceByPosition}
          onChange={(v) => updateSettings({ balanceByPosition: v })}
        />
        {sport === 'futebol' && KEEPER_POSITION[sport] && (
          <Toggle
            label="Um goleiro por time"
            checked={settings.distributeKeepers}
            onChange={(v) => updateSettings({ distributeKeepers: v })}
          />
        )}
      </section>

      {sport === 'volei' && (
        <section className="mt-6">
          <p className="mb-1 text-sm font-medium text-ink-300">Sistema de jogo</p>
          <p className="mb-2 text-xs text-ink-500">
            É ele que define quantos levantadores o sorteio coloca em cada time.
          </p>
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            {ROTATION_LIST.map((r) => {
              const fits = rotationFits(r.id, settings.teamSize);
              return (
                <button
                  key={r.id}
                  disabled={!fits}
                  onClick={() => updateSettings({ rotation: r.id })}
                  className={cn(
                    'shrink-0 rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition-colors',
                    !fits
                      ? 'border-ink-900 bg-ink-950 text-ink-700'
                      : settings.rotation === r.id
                        ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                        : 'border-ink-800 bg-ink-900 text-ink-400',
                  )}
                >
                  {r.name}
                </button>
              );
            })}
          </div>
          <div className="mt-2 rounded-xl border border-ink-800 bg-ink-900 px-3 py-2.5">
            <p className="text-[13px] font-medium text-ink-200">
              {ROTATIONS[settings.rotation].summary}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-500">
              {ROTATIONS[settings.rotation].description}
            </p>
            <p className="mt-2 text-[11px] font-medium text-brand-400">
              {needed === 0
                ? 'Sem levantador definido — o sorteio não reserva ninguém'
                : `${needed} levantador${needed > 1 ? 'es' : ''} por time · ${setters} cadastrado${setters === 1 ? '' : 's'} entre os presentes`}
            </p>
            {needed > 0 && setters < needed * settings.numberOfTeams && (
              <p className="mt-1 text-[11px] text-amber-400">
                Faltam {needed * settings.numberOfTeams - setters}. Marque mais
                jogadores como levantador na tela anterior.
              </p>
            )}
          </div>
        </section>
      )}

      <div className="safe-bottom fixed inset-x-0 bottom-0 border-t border-ink-800 bg-ink-950/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-lg">
          <Button size="lg" className="w-full" onClick={handleDraw} disabled={drawing}>
            <Shuffle
              size={19}
              strokeWidth={2.5}
              className={drawing ? 'animate-spin' : ''}
            />
            {drawing ? 'Sorteando…' : 'Sortear agora'}
          </Button>
        </div>
      </div>
    </div>
  );
}
