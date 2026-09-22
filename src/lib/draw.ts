import type {
  DrawResult,
  DrawSettings,
  Player,
  SkillLevel,
  SportId,
  Team,
  TeamColor,
} from '@/types';
import { KEEPER_POSITION, SPORTS } from '@/lib/sports';
import { shuffle, uid } from '@/lib/utils';

const TEAM_COLORS: { color: TeamColor; name: string }[] = [
  { color: 'verde', name: 'Verde' },
  { color: 'azul', name: 'Azul' },
  { color: 'vermelho', name: 'Vermelho' },
  { color: 'amarelo', name: 'Amarelo' },
  { color: 'preto', name: 'Preto' },
  { color: 'branco', name: 'Branco' },
  { color: 'laranja', name: 'Laranja' },
  { color: 'roxo', name: 'Roxo' },
];

export const TEAM_COLOR_CLASSES: Record<TeamColor, { bg: string; text: string; ring: string }> = {
  verde: { bg: 'bg-emerald-500', text: 'text-emerald-400', ring: 'ring-emerald-500/40' },
  azul: { bg: 'bg-sky-500', text: 'text-sky-400', ring: 'ring-sky-500/40' },
  vermelho: { bg: 'bg-red-500', text: 'text-red-400', ring: 'ring-red-500/40' },
  amarelo: { bg: 'bg-amber-400', text: 'text-amber-300', ring: 'ring-amber-400/40' },
  preto: { bg: 'bg-zinc-800', text: 'text-zinc-300', ring: 'ring-zinc-600/40' },
  branco: { bg: 'bg-zinc-200', text: 'text-zinc-200', ring: 'ring-zinc-300/40' },
  laranja: { bg: 'bg-orange-500', text: 'text-orange-400', ring: 'ring-orange-500/40' },
  roxo: { bg: 'bg-violet-500', text: 'text-violet-400', ring: 'ring-violet-500/40' },
};

export function skillOf(player: Player, sport: SportId): SkillLevel {
  return player.skills[sport] ?? 3;
}

function isKeeper(player: Player, sport: SportId): boolean {
  const keeperPos = KEEPER_POSITION[sport];
  if (!keeperPos) return false;
  return player.isKeeper === true || player.positions[sport] === keeperPos;
}

function makeTeams(count: number): Team[] {
  const colors = shuffle(TEAM_COLORS).slice(0, count);
  return colors.map((c, i) => ({
    id: uid(),
    name: `Time ${c.name}`,
    color: colors[i]?.color ?? TEAM_COLORS[i % TEAM_COLORS.length].color,
    players: [],
    totalSkill: 0,
    avgSkill: 0,
  }));
}

function recalc(team: Team, sport: SportId) {
  team.totalSkill = team.players.reduce((s, p) => s + skillOf(p, sport), 0);
  team.avgSkill = team.players.length ? team.totalSkill / team.players.length : 0;
}

/** Diferença entre o time mais forte e o mais fraco (menor = melhor) */
export function balanceScore(teams: Team[]): number {
  if (teams.length < 2) return 0;
  const totals = teams.map((t) => t.totalSkill);
  return Math.max(...totals) - Math.min(...totals);
}

/**
 * Sorteio balanceado:
 * 1. Distribui goleiros/levantadores — 1 por time
 * 2. Ordena o resto por nível (serpentina) com embaralhamento dentro de cada nível
 * 3. Aloca sempre no time com menor soma de habilidade e vaga disponível
 * 4. Respeita posições ideais quando balanceByPosition está ligado
 */
function buildDraw(players: Player[], settings: DrawSettings): { teams: Team[]; bench: Player[] } {
  const { sport, teamSize, numberOfTeams } = settings;
  const teams = makeTeams(numberOfTeams);
  const capacity = teamSize;

  let pool = players.filter((p) => p.present);
  const bench: Player[] = [];

  // Sobra: quem não cabe vai pro banco (sorteado, não os piores)
  const totalSlots = capacity * numberOfTeams;

  // 1) Goleiros primeiro
  if (settings.distributeKeepers) {
    const keepers = shuffle(pool.filter((p) => isKeeper(p, sport)));
    const rest = pool.filter((p) => !isKeeper(p, sport));
    // ordena goleiros por nível para espalhar o melhor e o pior
    keepers.sort((a, b) => skillOf(b, sport) - skillOf(a, sport));
    keepers.forEach((k, i) => {
      if (i < numberOfTeams) {
        teams[i].players.push(k);
        recalc(teams[i], sport);
      } else {
        rest.push(k);
      }
    });
    pool = rest;
  }

  // 2) Ordena por nível (desc), embaralhando dentro do mesmo nível
  const byLevel = new Map<number, Player[]>();
  for (const p of pool) {
    const lvl = skillOf(p, sport);
    if (!byLevel.has(lvl)) byLevel.set(lvl, []);
    byLevel.get(lvl)!.push(p);
  }
  const ordered: Player[] = [];
  for (const lvl of [5, 4, 3, 2, 1]) {
    ordered.push(...shuffle(byLevel.get(lvl) ?? []));
  }

  // 3) Aloca no time mais fraco com vaga
  const positionCount = new Map<string, Map<string, number>>();
  teams.forEach((t) => positionCount.set(t.id, new Map()));

  for (const player of ordered) {
    const open = teams.filter((t) => t.players.length < capacity);
    if (open.length === 0) {
      bench.push(player);
      continue;
    }

    let candidates = open;

    // Prioriza times que ainda precisam da posição do jogador
    if (settings.balanceByPosition) {
      const posId = player.positions[sport];
      const posCfg = SPORTS[sport].positions.find((p) => p.id === posId);
      if (posCfg && posCfg.idealPerTeam > 0) {
        const needing = open.filter((t) => {
          const count = positionCount.get(t.id)!.get(posCfg.id) ?? 0;
          return count < posCfg.idealPerTeam;
        });
        if (needing.length > 0) candidates = needing;
      }
    }

    // Menor soma de habilidade; desempate por menos jogadores, depois aleatório
    const sorted = settings.balanceBySkill
      ? shuffle(candidates).sort(
          (a, b) => a.totalSkill - b.totalSkill || a.players.length - b.players.length,
        )
      : shuffle(candidates).sort((a, b) => a.players.length - b.players.length);

    const target = sorted[0];
    target.players.push(player);
    recalc(target, sport);

    const posId = player.positions[sport];
    if (posId) {
      const map = positionCount.get(target.id)!;
      map.set(posId, (map.get(posId) ?? 0) + 1);
    }
  }

  // Ordena jogadores dentro do time por nível (visual)
  teams.forEach((t) => {
    t.players.sort((a, b) => skillOf(b, sport) - skillOf(a, sport));
    recalc(t, sport);
  });

  void totalSlots;
  return { teams, bench };
}

/**
 * Executa várias tentativas e devolve a mais equilibrada.
 * Mantém o fator sorte (embaralhamento) mas garante times justos.
 */
export function drawTeams(
  players: Player[],
  settings: DrawSettings,
  attempts = 40,
): DrawResult {
  let best: { teams: Team[]; bench: Player[] } | null = null;
  let bestScore = Infinity;

  for (let i = 0; i < attempts; i++) {
    const result = buildDraw(players, settings);
    const score = balanceScore(result.teams);
    if (score < bestScore) {
      bestScore = score;
      best = result;
      if (score === 0) break;
    }
  }

  const final = best!;
  return {
    id: uid(),
    createdAt: new Date().toISOString(),
    sport: settings.sport,
    teams: final.teams,
    bench: final.bench,
    settings,
    balanceScore: bestScore,
  };
}

/** Quantos times cabem com os presentes */
export function suggestTeamCount(presentCount: number, teamSize: number): number {
  return Math.max(2, Math.floor(presentCount / teamSize));
}
