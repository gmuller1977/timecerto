import { useState } from 'react';
import { ArrowLeftRight, X } from 'lucide-react';
import type { CourtPosition, MatchTeam, Player, SetLineup } from '@/types';
import {
  BACK_ROW,
  FRONT_ROW,
  POSITION_LABEL,
  SUBS_PER_SET,
  courtPlayerIds,
  type Court,
  type CourtState,
} from '@/lib/court';
import { getPositionLabel } from '@/lib/sports';
import { cn } from '@/lib/utils';
import { nomeCurto, posicaoDaCor, siglaDa, useCoresDasPosicoes } from '@/lib/posicoes';

interface Props {
  home: MatchTeam;
  away: MatchTeam;
  lineup: SetLineup;
  state: CourtState;
  /** O set ainda não teve nenhum ponto — a escalação pode mudar de graça */
  beforeFirstRally: boolean;
  rotates: boolean;
  liberoId?: string;
  /** O número de cada atleta nesta partida (08/10/2026) */
  numeros?: Record<string, number>;
  /** O levantador escolhido na escalação */
  levantadorId?: string;
  players: Player[];
  onFirstServe: (teamId: string) => void;
  onStartCourt: (court: Court) => void;
  onSubstitute: (outId: string, inId: string) => void;
}

/**
 * A quadra do time da casa durante o set: quem está onde, quem saca,
 * e a porta para substituir. Antes do primeiro ponto, trocar alguém de lugar
 * é ajuste de escalação e não gasta substituição.
 */
export function CourtPanel({
  home,
  away,
  lineup,
  state,
  beforeFirstRally,
  rotates,
  liberoId,
  numeros,
  levantadorId,
  players,
  onFirstServe,
  onStartCourt,
  onSubstitute,
}: Props) {
  const [picking, setPicking] = useState<CourtPosition | null>(null);
  const cores = useCoresDasPosicoes();

  const byId = new Map(players.map((p) => [p.id, p]));
  // O apelido, ou o primeiro nome (08/10/2026)
  const firstName = (id?: string) => (id ? nomeCurto(byId.get(id)) : '—');
  // "7 · Ana": o número desta partida, ou o do cadastro
  const comNumero = (id?: string) => {
    if (!id) return '—';
    const n = numeros?.[id] ?? byId.get(id)?.numero;
    return n != null ? `${n} · ${firstName(id)}` : firstName(id);
  };
  const corDe = (id?: string) => {
    const pos = posicaoDaCor(id ? byId.get(id) : undefined, liberoId, levantadorId);
    return { cor: pos ? cores[pos] : undefined, sigla: siglaDa(pos) };
  };
  // Como o vôlei chama a rotação: onde está o levantador (08/10/2026)
  const posDoLevantador = (Object.keys(state.court) as unknown as CourtPosition[])
    .map(Number)
    .find((p) => {
      const id = state.court[p as CourtPosition];
      return levantadorId ? id === levantadorId : byId.get(id ?? '')?.positions.volei === 'levantador';
    });

  const homeServes = state.servingTeamId === home.id;
  const onCourt = courtPlayerIds(state.court);
  const bench = home.playerIds.filter(
    (id) => !onCourt.includes(id) && id !== liberoId && byId.has(id),
  );
  const subsLeft = SUBS_PER_SET - state.subsUsed;

  function choose(playerId: string) {
    if (picking === null) return;
    const outId = state.court[picking];
    if (beforeFirstRally) {
      // Ajuste de escalação: se quem entra já está em quadra, os dois trocam
      const next: Court = { ...lineup.court };
      const from = (Object.keys(next) as unknown as CourtPosition[])
        .map(Number)
        .find((p) => next[p as CourtPosition] === playerId) as
        | CourtPosition
        | undefined;
      if (from !== undefined) next[from] = outId;
      next[picking] = playerId;
      onStartCourt(next);
    } else if (outId) {
      onSubstitute(outId, playerId);
    }
    setPicking(null);
  }

  return (
    <div className="mx-2 mt-2 rounded-2xl border border-ink-800 bg-ink-900 px-3 pt-2.5 pb-3">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span className="font-semibold text-ink-200">{home.name}</span>
        {rotates &&
          (posDoLevantador ? (
            <span className="font-medium text-ink-300">Levantador em P{posDoLevantador}</span>
          ) : (
            <span className="text-ink-400">Rotação {(state.rotations % 6) + 1}</span>
          ))}
        <span className={cn(subsLeft <= 0 ? 'text-amber-300' : 'text-ink-400')}>
          Subst. {state.subsUsed}/{SUBS_PER_SET}
        </span>
        {liberoId && (
          <span className="text-ink-400">Líbero {firstName(liberoId)}</span>
        )}
        <span className="ml-auto font-medium text-brand-300">
          {homeServes ? `Saca ${comNumero(state.court[1])}` : 'Recebendo'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {[...FRONT_ROW, ...BACK_ROW].map((pos) => {
          const serving = homeServes && pos === 1;
          const { cor, sigla } = corDe(state.court[pos]);
          return (
            <button
              key={pos}
              onClick={() => setPicking(pos)}
              className={cn(
                'relative flex h-12 flex-col items-center justify-center rounded-lg border-2 px-1 active:scale-[0.98]',
                cor ? '' : FRONT_ROW.includes(pos) ? 'bg-ink-800' : 'bg-ink-950',
                // Quem saca ganha a borda clara, por cima da cor
                serving ? 'border-ink-50' : 'border-transparent',
              )}
              style={cor ? { background: cor } : undefined}
            >
              <span className={cn('absolute top-0.5 left-1.5 text-[9px] font-bold', cor ? 'text-ink-950/70' : 'text-ink-500')}>
                P{pos}
              </span>
              <span
                className={cn('max-w-full truncate text-[13px] font-semibold', cor ? 'text-ink-950' : 'text-ink-100')}
              >
                {comNumero(state.court[pos])}
              </span>
              {sigla && (
                <span className={cn('text-[9px] font-bold leading-none', cor ? 'text-ink-950/80' : 'text-ink-400')}>
                  {sigla}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {beforeFirstRally && (
        <div className="mt-2.5">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[11px] text-ink-400">1º saque</span>
            {[home, away].map((t) => (
              <button
                key={t.id}
                onClick={() => onFirstServe(t.id)}
                className={cn(
                  'min-w-0 flex-1 truncate rounded-lg border px-2 py-1.5 text-xs font-medium',
                  lineup.firstServeTeamId === t.id
                    ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                    : 'border-ink-800 bg-ink-950 text-ink-400',
                )}
              >
                {t.name}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-ink-500">
            Antes do primeiro ponto, trocar alguém de lugar ajusta a escalação e
            não conta como substituição.
          </p>
        </div>
      )}

      {picking !== null && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/70" onClick={() => setPicking(null)} />
          <div className="safe-bottom relative max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-ink-700 bg-ink-900 px-4 pt-4 pb-6">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink-700" />
            <div className="mb-3 flex items-center justify-between">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-ink-50">
                  {beforeFirstRally ? 'Trocar' : 'Substituir'}{' '}
                  {byId.get(state.court[picking] ?? '')?.name ?? 'posição vazia'}
                </p>
                <p className="text-xs text-ink-500">
                  Posição {picking} · {POSITION_LABEL[picking]}
                </p>
              </div>
              <button onClick={() => setPicking(null)} className="p-1 text-ink-500">
                <X size={20} />
              </button>
            </div>

            {!beforeFirstRally && subsLeft <= 0 && (
              <p className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-200">
                As {SUBS_PER_SET} substituições do set já foram usadas. A regra
                oficial não permite outra — registre só se o seu jogo permitir.
              </p>
            )}

            {/* Só as reservas: quem está em quadra não aparece (pedido do Guilherme, 08/10/2026) */}
            {bench
              .filter((id) => id !== state.court[picking])
              .map((id) => {
                const p = byId.get(id)!;
                const inCourt = onCourt.includes(id);
                // Pintada com a cor da posição, como a quadra (08/10/2026)
                const { cor, sigla } = corDe(id);
                return (
                  <button
                    key={id}
                    onClick={() => choose(id)}
                    className={cn(
                      'mb-2 flex w-full items-center gap-2 rounded-xl border px-3 py-3 text-left active:scale-[0.98]',
                      cor ? 'border-transparent' : 'border-ink-700 bg-ink-800',
                    )}
                    style={cor ? { background: cor } : undefined}
                  >
                    {sigla && (
                      <span
                        className={cn(
                          'flex size-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                          cor ? 'bg-ink-950/20 text-ink-950' : 'bg-ink-900 text-ink-50',
                        )}
                      >
                        {sigla}
                      </span>
                    )}
                    <span
                      className={cn('min-w-0 flex-1 truncate text-[15px] font-semibold', cor ? 'text-ink-950' : 'text-ink-50')}
                    >
                      {comNumero(id)}
                    </span>
                    <span className={cn('shrink-0 text-xs', cor ? 'text-ink-950/80' : 'text-ink-500')}>
                      {inCourt
                        ? 'em quadra — troca de lugar'
                        : getPositionLabel('volei', p.positions.volei)}
                    </span>
                    {!inCourt && (
                      <ArrowLeftRight size={15} className={cn('shrink-0', cor ? 'text-ink-950' : 'text-brand-400')} />
                    )}
                  </button>
                );
              })}

            {bench.length === 0 && (
              <p className="text-sm leading-relaxed text-ink-500">
                Ninguém no banco. Marque mais jogadores como presentes antes da
                próxima partida para ter reservas.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
