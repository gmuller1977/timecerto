import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Minus, Plus, Shuffle } from 'lucide-react';
import { nomeDeExibicao } from '@/lib/nome';
import type { Player } from '@/types';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store/useAppStore';
import { useJogoAberto, usePresentes } from '@/store/useJogoStore';
import { SPORTS, KEEPER_POSITION } from '@/lib/sports';
import { ROTATIONS, ROTATION_LIST, rotationFits, settersNeeded } from '@/lib/rotation';
import { drawTeams } from '@/lib/draw';
import { cn } from '@/lib/utils';

/** Jogadores por time: de 1 a 10, pedido do Guilherme em 24/09/2026 */
const MAX_POR_TIME = 10;

/** 14 vagas em 2 times = 7 por time. Sempre entre 1 e 10 */
function sugerir(base: number, times: number): number {
  return Math.min(MAX_POR_TIME, Math.max(1, Math.floor(base / times)));
}

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

/**
 * Quem levanta, marcado aqui mesmo. O sistema de jogo pede levantadores na
 * hora do sorteio, e mandar para outra tela quebrava o fluxo — e o convidado
 * que chegou pelo link nem posição tinha. Um toque marca ou desmarca; grava a
 * posição no cadastro, então vale para os próximos sorteios também.
 */
function Levantadores({ presentes, aberto }: { presentes: Player[]; aberto: boolean }) {
  const updatePlayer = useAppStore((s) => s.updatePlayer);
  const [open, setOpen] = useState(aberto);
  const levanta = (p: Player) => p.positions.volei === 'levantador' || Boolean(p.isKeeper);

  function alternar(p: Player) {
    const sim = !levanta(p);
    updatePlayer(p.id, {
      positions: { ...p.positions, volei: sim ? 'levantador' : '' },
      // isKeeper também conta como levantador no sorteio: desmarcar limpa os dois
      ...(sim ? {} : { isKeeper: false }),
    });
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-2 text-xs font-medium text-brand-400">
        Escolher levantadores
      </button>
    );
  }
  const ordenados = [...presentes].sort(
    (a, b) => Number(levanta(b)) - Number(levanta(a)) || nomeDeExibicao(a).localeCompare(nomeDeExibicao(b), 'pt-BR'),
  );
  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {ordenados.map((p) => {
        const sim = levanta(p);
        return (
          <button
            key={p.id}
            onClick={() => alternar(p)}
            aria-pressed={sim}
            className={cn(
              'flex min-h-9 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium',
              sim
                ? 'border-brand-500 bg-brand-500/15 text-brand-200'
                : 'border-ink-800 bg-ink-950 text-ink-400',
            )}
          >
            {sim && <Check size={12} />}
            {nomeDeExibicao(p)}
            {p.kind === 'convidado' && <span className="text-[10px] text-ink-500">conv.</span>}
          </button>
        );
      })}
    </div>
  );
}

export function DrawPage() {
  const navigate = useNavigate();
  // Vindo do Próximo jogo, o sorteio é de um jogo da nuvem e pode ir para o link
  const eventId = (useLocation().state as { eventId?: string } | null)?.eventId;
  const sport = useAppStore((s) => s.sport);
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const setResult = useAppStore((s) => s.setResult);
  const [drawing, setDrawing] = useState(false);

  const present = usePresentes();
  const jogo = useJogoAberto();
  const cfg = SPORTS[sport];

  /*
   * Primeiro a quantidade de times; os jogadores por time saem da divisão.
   * A base é o número de vagas do jogo (14 vagas em 2 times = 7 por time);
   * jogo sem limite divide quem confirmou. O organizador pode mudar à mão,
   * de 1 a 10 — trocar a quantidade de times refaz a conta.
   */
  const base = jogo?.vagas ?? present.length;
  const sugestao = (times: number) => sugerir(base, times);
  // Até 8 times (são 8 cores), e nunca mais times que duplas possíveis
  const maxTeams = Math.max(2, Math.min(8, Math.floor(present.length / 2)));

  useEffect(() => {
    if (settings.numberOfTeams > maxTeams) {
      updateSettings({ numberOfTeams: maxTeams, teamSize: sugerir(base, maxTeams) });
    }
  }, [base, maxTeams, settings.numberOfTeams, updateSettings]);

  // Ao abrir, sugere pela divisão. Uma vez só — e só quando já há base: numa
  // recarga direta nesta tela, os presentes chegam um instante depois, e
  // sugerir sobre zero daria times de 1.
  const sugeriu = useRef(false);
  useEffect(() => {
    if (sugeriu.current || base <= 0) return;
    sugeriu.current = true;
    const s = sugerir(base, settings.numberOfTeams);
    if (s !== settings.teamSize) updateSettings({ teamSize: s });
  }, [base, settings.numberOfTeams, settings.teamSize, updateSettings]);
  const sugerido = sugestao(settings.numberOfTeams);

  // Vagas não são jogadores: com menos presentes que vagas, todo mundo joga e
  // os times saem incompletos. Contar as vagas anunciava gente que não veio —
  // 5 presentes em times de 6 viravam "12 jogadores em quadra"
  const vagas = settings.teamSize * settings.numberOfTeams;
  const allocated = Math.min(present.length, vagas);
  const bench = present.length - allocated;
  const faltam = vagas - allocated;
  const needed = settersNeeded(settings.rotation);
  const setters = present.filter(
    (p) => p.positions.volei === 'levantador' || p.isKeeper,
  ).length;

  function handleDraw() {
    setDrawing(true);
    setTimeout(() => {
      const result = drawTeams(present, { ...settings, sport });
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
        <p className="mb-2 text-sm font-medium text-ink-300">Quantidade de times</p>
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          {Array.from({ length: Math.max(1, maxTeams - 1) }, (_, i) => i + 2).map((n) => (
            <button
              key={n}
              onClick={() => updateSettings({ numberOfTeams: n, teamSize: sugestao(n) })}
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
      </section>

      <section className="mt-5">
        <p className="mb-2 text-sm font-medium text-ink-300">Jogadores por time</p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => updateSettings({ teamSize: Math.max(1, settings.teamSize - 1) })}
            disabled={settings.teamSize <= 1}
            aria-label="Menos um jogador por time"
            className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-ink-800 bg-ink-900 text-ink-200 disabled:opacity-30"
          >
            <Minus size={20} />
          </button>
          <span
            className="min-w-12 text-center text-3xl font-bold tabular-nums text-ink-50"
            aria-live="polite"
          >
            {settings.teamSize}
          </span>
          <button
            onClick={() =>
              updateSettings({ teamSize: Math.min(MAX_POR_TIME, settings.teamSize + 1) })
            }
            disabled={settings.teamSize >= MAX_POR_TIME}
            aria-label="Mais um jogador por time"
            className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-ink-800 bg-ink-900 text-ink-200 disabled:opacity-30"
          >
            <Plus size={20} />
          </button>
          {settings.teamSize !== sugerido && (
            <button
              onClick={() => updateSettings({ teamSize: sugerido })}
              className="ml-auto text-xs font-medium text-brand-400"
            >
              Voltar para {sugerido}
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-ink-500">
          {base > 0
            ? `Sugerido: ${sugerido} — ${base} ${jogo?.vagas != null ? 'vagas' : 'confirmados'} ÷ ${settings.numberOfTeams} times. De 1 a ${MAX_POR_TIME}.`
            : `De 1 a ${MAX_POR_TIME}.`}
        </p>
        <p className="mt-1 text-xs text-ink-500">
          {allocated} {allocated === 1 ? 'jogador' : 'jogadores'} em quadra
          {bench > 0 && ` · ${bench} no banco`}
          {faltam > 0 && ` · faltam ${faltam} para completar os times`}
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
                Faltam {needed * settings.numberOfTeams - setters}. Toque abaixo em quem
                levanta.
              </p>
            )}
            {needed > 0 && (
              <Levantadores
                presentes={present}
                aberto={setters < needed * settings.numberOfTeams}
              />
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
