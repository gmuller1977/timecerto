import { useEffect, useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import type { CourtPosition, MatchTeam, Player, ScoutMode, VolleyAction } from '@/types';
import { BACK_ROW, FRONT_ROW, type Court } from '@/lib/court';
import { ERROR_ACTIONS, POINT_ACTIONS } from '@/lib/volley';
import { TEAM_COLOR_CLASSES } from '@/lib/draw';
import { cn } from '@/lib/utils';
import { nomeCurto, posicaoDaCor, siglaDa, useCoresDasPosicoes } from '@/lib/posicoes';

export interface PointDraft {
  kind: 'ponto' | 'erro';
  action: VolleyAction;
  playerId?: string;
}

interface Props {
  open: boolean;
  /** Time que marcou o ponto */
  scoringTeam: MatchTeam;
  /** Time adversário — é ele quem comete o erro */
  opponentTeam: MatchTeam;
  players: Player[];
  mode: ScoutMode;
  /** No profissional: pinta cada atleta com a cor da posição (08/10/2026) */
  pro?: {
    liberoId?: string;
    levantadorId?: string;
    numeros?: Record<string, number>;
    /** A quadra no momento do ponto: a lista sai na mesma disposição */
    quadra?: Court;
    homeTeamId?: string;
  };
  onConfirm: (draft: PointDraft) => void;
  onClose: () => void;
}

export function PointSheet({
  open,
  scoringTeam,
  opponentTeam,
  players,
  mode,
  pro,
  onConfirm,
  onClose,
}: Props) {
  const cores = useCoresDasPosicoes();
  const [draft, setDraft] = useState<PointDraft | null>(null);

  useEffect(() => {
    if (!open) setDraft(null);
  }, [open]);

  if (!open) return null;

  const c = TEAM_COLOR_CLASSES[scoringTeam.color];

  function pick(kind: 'ponto' | 'erro', action: VolleyAction) {
    // Só pergunta quem foi se o time em questão tem elenco cadastrado.
    // Time convidado sem jogadores entra no scout como contagem.
    const team = kind === 'ponto' ? scoringTeam : opponentTeam;
    const hasRoster = players.some((p) => team.playerIds.includes(p.id));
    if (mode === 'atleta' && hasRoster) {
      setDraft({ kind, action });
      return;
    }
    onConfirm({ kind, action });
  }

  // Passo 2 — quem fez a ação
  if (draft) {
    // Ponto = autor do time que marcou · Erro = autor do adversário
    const team = draft.kind === 'ponto' ? scoringTeam : opponentTeam;
    const list = players.filter((p) => team.playerIds.includes(p.id));

    return (
      <Overlay onClose={onClose}>
        <div className="mb-4 flex items-center gap-3">
          <button onClick={() => setDraft(null)} className="p-1 text-ink-400">
            <ArrowLeft size={20} />
          </button>
          <div>
            <p className="text-[15px] font-semibold text-ink-50">
              {draft.kind === 'ponto' ? 'Quem fez o ponto?' : 'Quem errou?'}
            </p>
            <p className="text-xs text-ink-500">{team.name}</p>
          </div>
        </div>

        {(() => {
          const byId = new Map(list.map((p) => [p.id, p]));
          // Como na quadra (08/10/2026): rede em cima (P4 P3 P2), fundo embaixo
          // (P5 P6 P1), e o líbero numa linha à parte
          const naQuadra = pro?.quadra && team.id === pro.homeTeamId;
          if (!naQuadra) return null;
          const celula = (pos: CourtPosition) => {
            const p = byId.get(pro.quadra![pos] ?? '');
            if (!p) return <div key={pos} />;
            const cp = posicaoDaCor(p, pro.liberoId, pro.levantadorId);
            const cor = cp ? cores[cp] : undefined;
            const numero = pro.numeros?.[p.id] ?? p.numero;
            return (
              <button
                key={pos}
                onClick={() => onConfirm({ ...draft, playerId: p.id })}
                className={cn(
                  'relative flex h-20 flex-col items-center justify-center rounded-xl border px-1 active:scale-[0.98]',
                  cor ? 'border-transparent text-ink-950' : 'border-ink-700 bg-ink-800 text-ink-50',
                )}
                style={cor ? { background: cor } : undefined}
              >
                <span className="absolute top-1 left-1.5 text-[9px] font-bold opacity-70">P{pos}</span>
                <span className="flex size-8 items-center justify-center rounded-full bg-ink-950/20 text-[10px] font-bold">
                  {siglaDa(cp)}
                </span>
                <span className="mt-1 max-w-full truncate text-[13px] font-semibold">
                  {numero != null ? `${numero} · ${nomeCurto(p)}` : nomeCurto(p)}
                </span>
              </button>
            );
          };
          const libero = pro.liberoId ? byId.get(pro.liberoId) : undefined;
          const naQuadraIds = new Set(Object.values(pro.quadra!));
          return (
            <>
              <div className="grid grid-cols-3 gap-2">
                {FRONT_ROW.map(celula)}
                {BACK_ROW.map(celula)}
              </div>
              {libero && !naQuadraIds.has(libero.id) && (
                <button
                  onClick={() => onConfirm({ ...draft, playerId: libero.id })}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-semibold text-ink-950 active:scale-[0.98]"
                  style={{ background: cores.libero }}
                >
                  <span className="text-[10px] font-bold opacity-75">LIB</span>
                  {(pro.numeros?.[libero.id] ?? libero.numero) != null
                    ? `${pro.numeros?.[libero.id] ?? libero.numero} · ${nomeCurto(libero)}`
                    : nomeCurto(libero)}
                </button>
              )}
            </>
          );
        })()}

        <div className={cn('grid grid-cols-2 gap-2', pro?.quadra && team.id === pro.homeTeamId && 'hidden')}>
          {list.map((p) => {
            // No profissional, a caixa pintada como na quadra: sigla, número e apelido
            const pos = pro ? posicaoDaCor(p, pro.liberoId, pro.levantadorId) : null;
            const cor = pos ? cores[pos] : undefined;
            const numero = pro ? (pro.numeros?.[p.id] ?? p.numero) : undefined;
            return (
              <button
                key={p.id}
                onClick={() => onConfirm({ ...draft, playerId: p.id })}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-3 py-3.5 text-left text-[15px] active:scale-[0.98]',
                  cor ? 'border-transparent font-semibold text-ink-950' : 'border-ink-700 bg-ink-800 font-medium text-ink-50',
                )}
                style={cor ? { background: cor } : undefined}
              >
                {cor && (
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink-950/20 text-[10px] font-bold">
                    {siglaDa(pos)}
                  </span>
                )}
                <span className="min-w-0 truncate">
                  {pro ? (numero != null ? `${numero} · ${nomeCurto(p)}` : nomeCurto(p)) : p.name}
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => onConfirm(draft)}
          className="mt-3 w-full rounded-xl border border-ink-800 py-3 text-sm font-medium text-ink-400"
        >
          Não sei quem foi
        </button>
      </Overlay>
    );
  }

  // Passo 1 — como o ponto aconteceu
  return (
    <Overlay onClose={onClose}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className={cn('size-3 rounded-full', c.bg)} />
          <p className="text-[15px] font-semibold text-ink-50">
            Ponto do {scoringTeam.name}
          </p>
        </div>
        <button onClick={onClose} className="p-1 text-ink-500">
          <X size={20} />
        </button>
      </div>

      <p className="mb-2 text-xs font-semibold tracking-wide text-brand-400 uppercase">
        Mérito do {scoringTeam.name}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {POINT_ACTIONS.map((a) => (
          <button
            key={a.action}
            onClick={() => pick('ponto', a.action)}
            className="rounded-xl border border-brand-500/40 bg-brand-500/10 px-2 py-3 active:scale-[0.98]"
          >
            <span className="block text-[15px] font-semibold text-brand-200">
              {a.label}
            </span>
            {a.hint && (
              <span className="mt-0.5 block text-[10px] leading-tight text-brand-300/60">
                {a.hint}
              </span>
            )}
          </button>
        ))}
      </div>

      <p className="mt-5 mb-2 text-xs font-semibold tracking-wide text-ink-400 uppercase">
        Erro do {opponentTeam.name}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {ERROR_ACTIONS.map((a) => (
          <button
            key={a.action + a.label}
            onClick={() => pick('erro', a.action)}
            className="rounded-xl border border-ink-700 bg-ink-800 px-3 py-3 text-left active:scale-[0.98]"
          >
            <span className="block text-[14px] font-medium text-ink-100">
              {a.label}
            </span>
            {a.hint && (
              <span className="mt-0.5 block text-[10px] leading-tight text-ink-500">
                {a.hint}
              </span>
            )}
          </button>
        ))}
      </div>

      <button
        onClick={() => onConfirm({ kind: 'ponto', action: 'indefinido' })}
        className="mt-4 w-full rounded-xl border border-ink-800 py-3 text-sm font-medium text-ink-400"
      >
        Só marcar o ponto
      </button>
    </Overlay>
  );
}

function Overlay({
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
