import type { Rally, ScoutSettings, VolleyAction } from '@/types';

export interface ActionOption {
  action: VolleyAction;
  label: string;
  hint?: string;
}

/**
 * Catálogo de finalizações, ordenado por frequência real de jogo.
 * Quanto mais comum, mais perto do polegar — é o que decide se o
 * scout acompanha o ritmo da partida ou atrasa.
 *
 * Distribuição típica: ataque ~45%, erro de ataque ~20%,
 * erro de saque ~15%, bloqueio ~8%, ace ~5%.
 */
export const POINT_ACTIONS: ActionOption[] = [
  { action: 'ataque', label: 'Ataque', hint: 'Bola no chão' },
  { action: 'bloqueio', label: 'Bloqueio', hint: 'Parou no bloqueio' },
  { action: 'saque', label: 'Ace', hint: 'Saque direto' },
];

export const ERROR_ACTIONS: ActionOption[] = [
  { action: 'ataque', label: 'Ataque fora', hint: 'Fora ou na rede' },
  { action: 'saque', label: 'Erro de saque' },
  { action: 'recepcao', label: 'Erro de recepção' },
  { action: 'falta', label: 'Rede / invasão', hint: 'Toque na rede, 4 toques' },
  { action: 'defesa', label: 'Bola no chão', hint: 'Ninguém defendeu' },
  { action: 'levantamento', label: 'Erro de levantamento', hint: 'Condução, 2 toques' },
];

export const ACTION_LABEL: Record<VolleyAction, string> = {
  ataque: 'Ataque',
  bloqueio: 'Bloqueio',
  saque: 'Saque',
  recepcao: 'Recepção',
  levantamento: 'Levantamento',
  defesa: 'Defesa',
  falta: 'Falta',
  indefinido: 'Não classificado',
};

export const DEFAULT_SCOUT: ScoutSettings = {
  mode: 'time',
  pointsToWin: 25,
  winByTwo: true,
  cap: 0,
};

export const POINTS_OPTIONS = [12, 15, 21, 25];

/** O set acabou? */
export function isSetOver(
  scoreA: number,
  scoreB: number,
  s: ScoutSettings,
): boolean {
  const hi = Math.max(scoreA, scoreB);
  const lo = Math.min(scoreA, scoreB);
  if (hi < s.pointsToWin) return false;
  if (s.cap > 0 && hi >= s.cap) return true;
  if (!s.winByTwo) return true;
  return hi - lo >= 2;
}

/** Quem está sacando: quem venceu o rally anterior (saque em rodízio) */
export function serverTeam(rallies: Rally[], teamAId: string): string | null {
  if (rallies.length === 0) return null;
  const last = rallies[rallies.length - 1];
  void teamAId;
  return last.teamId;
}

/** Sequência atual de pontos de um time — o "embalo" */
export function currentRun(rallies: Rally[]): { teamId: string; count: number } | null {
  if (rallies.length === 0) return null;
  const teamId = rallies[rallies.length - 1].teamId;
  let count = 0;
  for (let i = rallies.length - 1; i >= 0; i--) {
    if (rallies[i].teamId !== teamId) break;
    count++;
  }
  return { teamId, count };
}

export interface ScoutSummary {
  total: number;
  /** Pontos conquistados por mérito */
  earned: number;
  /** Pontos recebidos por erro do adversário */
  gifted: number;
  byAction: Record<VolleyAction, number>;
}

export function summarize(rallies: Rally[], teamId: string): ScoutSummary {
  const byAction = {} as Record<VolleyAction, number>;
  let earned = 0;
  let gifted = 0;

  for (const r of rallies) {
    if (r.teamId !== teamId) continue;
    if (r.kind === 'ponto') {
      earned++;
      byAction[r.action] = (byAction[r.action] ?? 0) + 1;
    } else {
      gifted++;
    }
  }
  return { total: earned + gifted, earned, gifted, byAction };
}

/** Erros cometidos por um time = pontos que o adversário ganhou como 'erro' */
export function errorsOf(rallies: Rally[], teamId: string): number {
  return rallies.filter((r) => r.kind === 'erro' && r.teamId !== teamId).length;
}
