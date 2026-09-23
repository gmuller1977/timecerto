import type {
  CourtPosition,
  Lineup,
  Player,
  Rally,
  RotationSystem,
  SetLineup,
  SportId,
} from '@/types';
import { ROTATIONS } from '@/lib/rotation';

/**
 * Numeração oficial da quadra de vôlei.
 *
 *            R E D E
 *      [4]   [3]   [2]      ← rede (frente)
 *      [5]   [6]   [1]      ← fundo
 *
 * A posição 1 é o fundo direita e é de onde se saca.
 * O rodízio é horário: quem está em 2 vai para 1, 1 vai para 6,
 * 6 para 5, 5 para 4, 4 para 3, 3 para 2.
 */
export const COURT_ORDER: CourtPosition[] = [4, 3, 2, 5, 6, 1];

export const FRONT_ROW: CourtPosition[] = [4, 3, 2];
export const BACK_ROW: CourtPosition[] = [5, 6, 1];

export const POSITION_LABEL: Record<CourtPosition, string> = {
  1: 'Fundo direita',
  2: 'Rede direita',
  3: 'Rede meio',
  4: 'Rede esquerda',
  5: 'Fundo esquerda',
  6: 'Fundo meio',
};

export const POSITION_SHORT: Record<CourtPosition, string> = {
  1: 'Saque',
  2: 'Rede dir.',
  3: 'Meio',
  4: 'Rede esq.',
  5: 'Fundo esq.',
  6: 'Fundo meio',
};

/** Ordem do rodízio horário: cada posição recebe quem estava na anterior */
const ROTATE_FROM: Record<CourtPosition, CourtPosition> = {
  1: 2,
  6: 1,
  5: 6,
  4: 5,
  3: 4,
  2: 3,
};

export type Court = Partial<Record<CourtPosition, string>>;

/** Um rodízio: todo mundo anda uma casa no sentido horário */
export function rotateCourt(court: Court): Court {
  const next: Court = {};
  for (const pos of COURT_ORDER) {
    next[pos] = court[ROTATE_FROM[pos]];
  }
  return next;
}

/** As seis rotações a partir da escalação inicial */
export function allRotations(court: Court): Court[] {
  const out: Court[] = [court];
  let cur = court;
  for (let i = 1; i < 6; i++) {
    cur = rotateCourt(cur);
    out.push(cur);
  }
  return out;
}

/** Quem saca: sempre a posição 1 */
export function serverId(court: Court): string | undefined {
  return court[1];
}

export function isFrontRow(pos: CourtPosition): boolean {
  return FRONT_ROW.includes(pos);
}

export function courtPlayerIds(court: Court): string[] {
  return COURT_ORDER.map((p) => court[p]).filter((x): x is string => Boolean(x));
}

// ─────────────────────────────────────────────────────────────
// Validação da escalação
// ─────────────────────────────────────────────────────────────

export interface LineupProblem {
  severity: 'erro' | 'aviso';
  message: string;
}

/**
 * Confere a escalação contra o sistema de jogo escolhido.
 * Erro impede começar a partida; aviso é só alerta.
 */
export function validateLineup(
  lineup: Lineup,
  players: Player[],
  sport: SportId,
): LineupProblem[] {
  const problems: LineupProblem[] = [];
  const byId = new Map(players.map((p) => [p.id, p]));
  const onCourt = courtPlayerIds(lineup.court);

  const empty = COURT_ORDER.filter((p) => !lineup.court[p]);
  if (empty.length > 0) {
    problems.push({
      severity: 'erro',
      message:
        empty.length === 1
          ? `Falta jogador na posição ${empty[0]}.`
          : `Faltam jogadores nas posições ${empty.join(', ')}.`,
    });
  }

  const dup = onCourt.filter((id, i) => onCourt.indexOf(id) !== i);
  if (dup.length > 0) {
    problems.push({
      severity: 'erro',
      message: 'O mesmo jogador está em mais de uma posição.',
    });
  }

  const cfg = ROTATIONS[lineup.system];
  const setters = onCourt.filter(
    (id) => byId.get(id)?.positions[sport] === 'levantador',
  );

  if (cfg.setters > 0 && setters.length < cfg.setters) {
    problems.push({
      severity: 'erro',
      message: `O sistema ${cfg.name} precisa de ${cfg.setters} levantador${cfg.setters > 1 ? 'es' : ''} em quadra — há ${setters.length}.`,
    });
  }
  if (cfg.setters > 0 && setters.length > cfg.setters) {
    problems.push({
      severity: 'aviso',
      message: `Há ${setters.length} levantadores em quadra para um sistema ${cfg.name}. Um deles vai jogar fora da posição.`,
    });
  }

  // No 4x2 e 6x2 os levantadores devem ficar opostos no rodízio
  // (3 posições de distância), senão a rotação deixa a frente sem levantador.
  if (cfg.setters === 2 && setters.length === 2) {
    const pos = COURT_ORDER.filter((p) => {
      const id = lineup.court[p];
      return id ? setters.includes(id) : false;
    });
    if (pos.length === 2) {
      const cycle: CourtPosition[] = [1, 6, 5, 4, 3, 2];
      const d = Math.abs(cycle.indexOf(pos[0]) - cycle.indexOf(pos[1]));
      if (d !== 3) {
        problems.push({
          severity: 'aviso',
          message: `No ${cfg.name} os dois levantadores devem ficar opostos no rodízio — três posições de distância. Estão em ${pos[0]} e ${pos[1]}.`,
        });
      }
    }
  }

  if (lineup.liberoId) {
    if (onCourt.includes(lineup.liberoId)) {
      problems.push({
        severity: 'aviso',
        message: 'O líbero entra pelo fundo no lugar de um central — não precisa estar na escalação inicial.',
      });
    }
  }

  return problems;
}

export function blocksStart(problems: LineupProblem[]): boolean {
  return problems.some((p) => p.severity === 'erro');
}

/**
 * Preenche a quadra automaticamente a partir dos jogadores disponíveis,
 * respeitando o sistema: levantador na 1 (saca primeiro e chega na frente
 * depois de três rodízios) e, nos sistemas de dois, o segundo na oposta.
 * No levantador fixo, ele vai para a 3.
 */
export function autoFill(
  playerIds: string[],
  players: Player[],
  system: RotationSystem,
  sport: SportId,
): Court {
  const byId = new Map(players.map((p) => [p.id, p]));
  const pool = [...playerIds];
  const court: Court = {};

  const take = (predicate: (p: Player) => boolean): string | undefined => {
    const i = pool.findIndex((id) => {
      const p = byId.get(id);
      return p ? predicate(p) : false;
    });
    return i >= 0 ? pool.splice(i, 1)[0] : undefined;
  };

  const needed = ROTATIONS[system].setters;
  if (needed >= 1) {
    const s1 = take((p) => p.positions[sport] === 'levantador');
    // No levantador fixo ele fica parado no meio da rede
    if (s1) court[system === 'fixo' ? 3 : 1] = s1;
  }
  if (needed >= 2) {
    const s2 = take((p) => p.positions[sport] === 'levantador');
    if (s2) court[4] = s2; // oposta à 1 no rodízio
  }

  for (const pos of COURT_ORDER) {
    if (court[pos]) continue;
    const next = pool.shift();
    if (!next) break;
    court[pos] = next;
  }
  return court;
}

// ─────────────────────────────────────────────────────────────
// Quadra durante a partida
// ─────────────────────────────────────────────────────────────

/** Substituições permitidas por set na regra oficial */
export const SUBS_PER_SET = 6;

export interface CourtState {
  court: Court;
  servingTeamId: string;
  /** Quantas vezes o time girou neste set */
  rotations: number;
  subsUsed: number;
}

function substitute(court: Court, outId: string, inId: string): Court {
  const next: Court = { ...court };
  for (const pos of COURT_ORDER) {
    if (next[pos] === outId) next[pos] = inId;
  }
  return next;
}

/**
 * Onde cada um está depois dos rallies jogados — derivado, nunca guardado.
 *
 * A regra do rodízio: o time só gira quando ganha o ponto sobre o saque do
 * adversário (side-out). Ponto no próprio saque mantém o sacador.
 * Substituições entram na ordem em que foram feitas, antes do rally de
 * número `atRally`.
 */
export function courtStateAt(
  lineup: SetLineup,
  rallies: Rally[],
  homeTeamId: string,
  rotates: boolean,
): CourtState {
  let court: Court = { ...lineup.court };
  let serving = lineup.firstServeTeamId;
  let rotations = 0;
  let s = 0;

  for (let i = 0; i <= rallies.length; i++) {
    while (s < lineup.subs.length && lineup.subs[s].atRally <= i) {
      court = substitute(court, lineup.subs[s].outId, lineup.subs[s].inId);
      s++;
    }
    if (i === rallies.length) break;

    const winner = rallies[i].teamId;
    if (winner === homeTeamId && serving !== homeTeamId) {
      rotations++;
      if (rotates) court = rotateCourt(court);
    }
    serving = winner;
  }
  // Troca registrada depois de um rally que foi desfeito
  for (; s < lineup.subs.length; s++) {
    court = substitute(court, lineup.subs[s].outId, lineup.subs[s].inId);
  }

  return { court, servingTeamId: serving, rotations, subsUsed: lineup.subs.length };
}
