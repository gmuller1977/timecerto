import type { Match, Player, PlayerStats, SkillLevel, SportId } from '@/types';
import { SPORTS } from '@/lib/sports';

/** Resultado de um confronto do ponto de vista de um time */
type Outcome = 'V' | 'E' | 'D';

function outcomeFor(teamId: string, game: { teamAId: string; scoreA: number; scoreB: number; teamBId: string }): Outcome | null {
  if (game.teamAId !== teamId && game.teamBId !== teamId) return null;
  const mine = game.teamAId === teamId ? game.scoreA : game.scoreB;
  const theirs = game.teamAId === teamId ? game.scoreB : game.scoreA;
  if (mine > theirs) return 'V';
  if (mine < theirs) return 'D';
  return 'E';
}

/** Confrontos de um jogador, do mais recente para o mais antigo */
export function playerTimeline(
  playerId: string,
  matches: Match[],
  sport?: SportId,
): { date: string; outcome: Outcome; scoreLabel: string; matchId: string }[] {
  const out: { date: string; outcome: Outcome; scoreLabel: string; matchId: string }[] = [];
  const sorted = [...matches].sort((a, b) => b.date.localeCompare(a.date));

  for (const match of sorted) {
    if (sport && match.sport !== sport) continue;
    const team = match.teams.find((t) => t.playerIds.includes(playerId));
    if (!team) continue;
    for (const game of match.games) {
      if (!game.played) continue;
      const outcome = outcomeFor(team.id, game);
      if (!outcome) continue;
      const mine = game.teamAId === team.id ? game.scoreA : game.scoreB;
      const theirs = game.teamAId === team.id ? game.scoreB : game.scoreA;
      out.push({
        date: match.date,
        outcome,
        scoreLabel: `${mine} x ${theirs}`,
        matchId: match.id,
      });
    }
  }
  return out;
}

export function computeStats(
  player: Player,
  matches: Match[],
  sport: SportId,
): PlayerStats {
  const relevant = matches.filter((m) => m.sport === sport);

  let appearances = 0;
  let games = 0;
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goals = 0;
  let lastPlayed: string | undefined;

  for (const match of relevant) {
    if (!match.attendance.includes(player.id)) continue;
    appearances++;
    if (!lastPlayed || match.date > lastPlayed) lastPlayed = match.date;
    goals += match.scorers[player.id] ?? 0;

    const team = match.teams.find((t) => t.playerIds.includes(player.id));
    if (!team) continue;

    for (const game of match.games) {
      if (!game.played) continue;
      const outcome = outcomeFor(team.id, game);
      if (!outcome) continue;
      games++;
      if (outcome === 'V') wins++;
      else if (outcome === 'E') draws++;
      else losses++;
    }
  }

  // Sequência atual a partir do confronto mais recente
  const timeline = playerTimeline(player.id, relevant, sport);
  let streak = 0;
  if (timeline.length > 0 && timeline[0].outcome !== 'E') {
    const first = timeline[0].outcome;
    for (const entry of timeline) {
      if (entry.outcome !== first) break;
      streak++;
    }
    if (first === 'D') streak = -streak;
  }

  const points = wins * 3 + draws;
  const possible = games * 3;

  return {
    playerId: player.id,
    name: player.name,
    appearances,
    games,
    wins,
    draws,
    losses,
    winRate: possible > 0 ? points / possible : 0,
    goals,
    goalsPerGame: games > 0 ? goals / games : 0,
    attendanceRate: relevant.length > 0 ? appearances / relevant.length : 0,
    lastPlayed,
    streak,
    topPosition: player.positions[sport],
    currentSkill: (player.skills[sport] ?? 3) as SkillLevel,
  };
}

export function computeAllStats(
  players: Player[],
  matches: Match[],
  sport: SportId,
): PlayerStats[] {
  return players.map((p) => computeStats(p, matches, sport));
}

// ─────────────────────────────────────────────────────────────
// Rankings
// ─────────────────────────────────────────────────────────────

export interface RankingEntry {
  stats: PlayerStats;
  value: number;
  label: string;
}

/** Mínimo de confrontos para entrar nos rankings de média — evita o cara de 1 jogo liderando */
export const MIN_GAMES_FOR_RATE = 3;

export function topScorers(all: PlayerStats[], limit = 5): RankingEntry[] {
  return all
    .filter((s) => s.goals > 0)
    .sort((a, b) => b.goals - a.goals || b.goalsPerGame - a.goalsPerGame)
    .slice(0, limit)
    .map((s) => ({ stats: s, value: s.goals, label: s.goals === 1 ? '1 gol' : `${s.goals} gols` }));
}

export function topWinRate(all: PlayerStats[], limit = 5): RankingEntry[] {
  return all
    .filter((s) => s.games >= MIN_GAMES_FOR_RATE)
    .sort((a, b) => b.winRate - a.winRate || b.games - a.games)
    .slice(0, limit)
    .map((s) => ({
      stats: s,
      value: s.winRate,
      label: `${Math.round(s.winRate * 100)}% de aproveitamento`,
    }));
}

export function topAttendance(all: PlayerStats[], limit = 5): RankingEntry[] {
  return all
    .filter((s) => s.appearances > 0)
    .sort((a, b) => b.appearances - a.appearances || b.attendanceRate - a.attendanceRate)
    .slice(0, limit)
    .map((s) => ({
      stats: s,
      value: s.appearances,
      label: `${s.appearances} ${s.appearances === 1 ? 'pelada' : 'peladas'} · ${Math.round(s.attendanceRate * 100)}%`,
    }));
}

export function positionLabel(sport: SportId, positionId?: string): string {
  if (!positionId) return 'Sem posição';
  return SPORTS[sport].positions.find((p) => p.id === positionId)?.label ?? 'Sem posição';
}

export function streakLabel(streak: number): string | null {
  if (streak >= 3) return `${streak} vitórias seguidas 🔥`;
  if (streak <= -3) return `${Math.abs(streak)} derrotas seguidas`;
  return null;
}

/** Nome do esporte em que o jogador tem mais partidas — útil no Scout */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}
