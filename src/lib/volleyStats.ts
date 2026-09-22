import type { Match, Rally, VolleyAction } from '@/types';

/** Paleta categórica validada para a superfície escura do app (ΔE CVD ≥ 8) */
export const SERIES = {
  ataque: '#3987e5',
  bloqueio: '#d95926',
  saque: '#199e70',
  recepcao: '#c98500',
  falta: '#d55181',
  defesa: '#008300',
  levantamento: '#9085e9',
  indefinido: '#65758f',
} satisfies Record<VolleyAction, string>;

export const STATUS = {
  good: '#0ca30c',
  critical: '#d03b3b',
};

export function allRallies(match: Match): Rally[] {
  return match.games.flatMap((g) => g.rallies ?? []);
}

export interface TeamScout {
  teamId: string;
  points: number;
  /** Pontos conquistados por mérito próprio */
  earned: number;
  /** Pontos recebidos de graça, por erro do adversário */
  gifted: number;
  /** Erros cometidos — pontos que o adversário ganhou como 'erro' */
  errors: number;
  earnedByAction: Partial<Record<VolleyAction, number>>;
  errorsByAction: Partial<Record<VolleyAction, number>>;
  /**
   * Eficiência: dos lances em que o time decidiu o rally,
   * quantos foram acerto. Mérito / (mérito + erro).
   */
  efficiency: number;
  /** Quanto dos pontos veio de erro do adversário, não de jogo próprio */
  giftedShare: number;
}

export function teamScout(match: Match, teamId: string): TeamScout {
  const rallies = allRallies(match);
  const earnedByAction: Partial<Record<VolleyAction, number>> = {};
  const errorsByAction: Partial<Record<VolleyAction, number>> = {};
  let earned = 0;
  let gifted = 0;
  let errors = 0;

  for (const r of rallies) {
    if (r.teamId === teamId) {
      if (r.kind === 'ponto') {
        earned++;
        earnedByAction[r.action] = (earnedByAction[r.action] ?? 0) + 1;
      } else {
        gifted++;
      }
    } else if (r.kind === 'erro') {
      // O adversário pontuou por erro deste time
      errors++;
      errorsByAction[r.action] = (errorsByAction[r.action] ?? 0) + 1;
    }
  }

  const points = earned + gifted;
  const decided = earned + errors;

  return {
    teamId,
    points,
    earned,
    gifted,
    errors,
    earnedByAction,
    errorsByAction,
    efficiency: decided > 0 ? earned / decided : 0,
    giftedShare: points > 0 ? gifted / points : 0,
  };
}

export interface PlayerScout {
  playerId: string;
  points: number;
  errors: number;
  /** A conta mais honesta do vôlei: o que somou menos o que custou */
  balance: number;
  pointsByAction: Partial<Record<VolleyAction, number>>;
  errorsByAction: Partial<Record<VolleyAction, number>>;
}

export function playerScouts(matches: Match[]): Map<string, PlayerScout> {
  const map = new Map<string, PlayerScout>();

  const get = (id: string): PlayerScout => {
    let s = map.get(id);
    if (!s) {
      s = {
        playerId: id,
        points: 0,
        errors: 0,
        balance: 0,
        pointsByAction: {},
        errorsByAction: {},
      };
      map.set(id, s);
    }
    return s;
  };

  for (const match of matches) {
    for (const r of allRallies(match)) {
      if (!r.playerId) continue;
      const s = get(r.playerId);
      if (r.kind === 'ponto') {
        s.points++;
        s.pointsByAction[r.action] = (s.pointsByAction[r.action] ?? 0) + 1;
      } else {
        s.errors++;
        s.errorsByAction[r.action] = (s.errorsByAction[r.action] ?? 0) + 1;
      }
      s.balance = s.points - s.errors;
    }
  }
  return map;
}

/** Sets vencidos por time */
export function setsWonBy(match: Match, teamId: string): number {
  return match.games.filter(
    (g) =>
      (g.teamAId === teamId && g.scoreA > g.scoreB) ||
      (g.teamBId === teamId && g.scoreB > g.scoreA),
  ).length;
}

export function matchWinner(match: Match): string | null {
  if (match.teams.length < 2) return null;
  const [a, b] = match.teams;
  const sa = setsWonBy(match, a.id);
  const sb = setsWonBy(match, b.id);
  if (sa === sb) return null;
  return sa > sb ? a.id : b.id;
}

/**
 * A leitura que o placar sozinho nunca dá.
 * Num time de pelada a proporção de pontos vindos de erro costuma ser alta —
 * e é o número mais acionável que existe, porque erro se treina.
 */
export function readGiftedShare(share: number): string {
  const pct = Math.round(share * 100);
  if (pct >= 50)
    return `${pct}% dos pontos vieram de erro do adversário — o jogo foi decidido por quem errou menos, não por quem jogou melhor.`;
  if (pct >= 35)
    return `${pct}% dos pontos vieram de erro do adversário, proporção comum em jogo equilibrado de base.`;
  return `${pct}% dos pontos vieram de erro do adversário — a maioria foi conquistada jogando.`;
}

export function hasDetail(match: Match): boolean {
  return allRallies(match).some((r) => r.action !== 'indefinido');
}

export function hasPlayerDetail(match: Match): boolean {
  return allRallies(match).some((r) => Boolean(r.playerId));
}
