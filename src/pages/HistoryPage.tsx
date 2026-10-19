import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PartidasPeloLink } from '@/components/scout/PartidasPeloLink';
import { ArrowLeft, ChevronRight, Trash2, X } from 'lucide-react';
import { useMatchStore } from '@/store/useMatchStore';
import { useAppStore } from '@/store/useAppStore';
import { TEAM_COLOR_CLASSES } from '@/lib/draw';
import { SPORTS } from '@/lib/sports';
import { hasDetail, setsWonBy } from '@/lib/volleyStats';
import { formatDate } from '@/lib/stats';
import { cn } from '@/lib/utils';

// O dia da partida no horário do aparelho, AAAA-MM-DD — o formato do <input type="date">
const diaLocal = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// O período sobrevive a abrir uma partida e voltar. Memória da sessão
let periodoGuardado = { de: '', ate: '' };

export function HistoryPage() {
  const navigate = useNavigate();
  const all = useMatchStore((s) => s.matches);
  // Cada modo vê só as próprias partidas; sem modo gravado é amador
  const pro = useAppStore((s) => s.mode) === 'profissional';
  const doModo = all.filter((m) => (m.mode === 'profissional') === pro);
  // Filtro por período (pedido do Guilherme, 19/10/2026): de/até, um dos dois basta
  const [periodo, setPeriodoState] = useState(periodoGuardado);
  const setPeriodo = (p: Partial<typeof periodo>) => {
    periodoGuardado = { ...periodo, ...p };
    setPeriodoState(periodoGuardado);
  };
  const filtrando = Boolean(periodo.de || periodo.ate);
  const matches = doModo.filter((m) => {
    const dia = diaLocal(m.date);
    return (!periodo.de || dia >= periodo.de) && (!periodo.ate || dia <= periodo.ate);
  });
  const removeMatch = useMatchStore((s) => s.removeMatch);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-10">
      <header className="safe-top flex items-center gap-3 pt-6 pb-4">
        <button
          onClick={() => navigate(pro ? '/profissional/jogo' : '/amador')}
          className="p-1 text-ink-400"
        >
          <ArrowLeft size={22} />
        </button>
        <div>
          <h1 className="text-xl font-bold">{pro ? 'Partidas' : 'Jogos'}</h1>
          <p className="text-xs text-ink-400">
            {filtrando && doModo.length > 0
              ? `${matches.length} de ${doModo.length} no período`
              : matches.length === 0
              ? pro
                ? 'Nenhuma ainda'
                : 'Nenhum ainda'
              : pro
                ? `${matches.length} ${matches.length === 1 ? 'registrada' : 'registradas'}`
                : `${matches.length} ${matches.length === 1 ? 'registrado' : 'registrados'}`}
          </p>
        </div>
      </header>

      <PartidasPeloLink />

      {doModo.length > 0 && (
        <section className="mb-3 flex items-end gap-2" aria-label="Filtrar por data">
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-[11px] text-ink-400">De</span>
            <input
              type="date"
              value={periodo.de}
              max={periodo.ate || undefined}
              onChange={(e) => setPeriodo({ de: e.target.value })}
              className={cn(CAMPO, !periodo.de && 'text-ink-500')}
            />
          </label>
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-[11px] text-ink-400">Até</span>
            <input
              type="date"
              value={periodo.ate}
              min={periodo.de || undefined}
              onChange={(e) => setPeriodo({ ate: e.target.value })}
              className={cn(CAMPO, !periodo.ate && 'text-ink-500')}
            />
          </label>
          {filtrando && (
            <button
              onClick={() => setPeriodo({ de: '', ate: '' })}
              className="flex h-10 shrink-0 items-center gap-1 rounded-lg border border-ink-800 px-2.5 text-xs text-ink-300"
              aria-label="Limpar o filtro de data"
            >
              <X size={14} /> Limpar
            </button>
          )}
        </section>
      )}

      {filtrando && doModo.length > 0 && matches.length === 0 && (
        <p className="mt-8 text-center text-sm text-ink-400">Nenhuma partida nesse período.</p>
      )}

      {doModo.length === 0 && (
        <div className="mt-12 text-center">
          <p className="text-5xl">🏐</p>
          <p className="mt-3 text-sm leading-relaxed text-ink-400">
            {pro ? 'As partidas com scout aparecem aqui,' : 'Os jogos com scout aparecem aqui,'}
            <br />
            {pro ? 'com o resumo de cada uma.' : 'com o resumo de cada um.'}
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
                  {/* Os nomes inteiros em cima; placar e data embaixo, em branco (pedido do Guilherme, 19/10/2026) */}
                  <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[15px] font-medium text-ink-50">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className={cn('size-2 shrink-0 rounded-full', TEAM_COLOR_CLASSES[a.color].bg)} />
                      <span className="break-words">{a.name}</span>
                    </span>
                    <span className="text-ink-400">x</span>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className={cn('size-2 shrink-0 rounded-full', TEAM_COLOR_CLASSES[b.color].bg)} />
                      <span className="break-words">{b.name}</span>
                    </span>
                  </span>
                  <span className="mt-1 block text-[13px] text-ink-50">
                    <span className="font-bold tabular-nums">
                      {sa} × {sb}
                    </span>
                    {' · '}
                    {formatDate(m.date)} · {m.games.length} {m.games.length === 1 ? 'set' : 'sets'}
                    {hasDetail(m) ? ' · com scout' : ' · só placar'}
                  </span>
                </span>
                <ChevronRight size={17} className="shrink-0 text-ink-600" />
              </button>
              <button
                onClick={() => {
                  if (window.confirm(pro ? 'Apagar esta partida?' : 'Apagar este jogo?')) removeMatch(m.id);
                }}
                className="shrink-0 p-1.5 text-ink-700 hover:text-red-400"
                aria-label={pro ? 'Apagar partida' : 'Apagar jogo'}
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

const CAMPO =
  'h-10 w-full rounded-lg border border-ink-800 bg-ink-950 px-2.5 text-xs text-ink-200 outline-none [color-scheme:dark]';
