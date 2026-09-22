// ─────────────────────────────────────────────────────────────
// TimeCerto — Tipos centrais
// ─────────────────────────────────────────────────────────────

export type SportId = 'futebol' | 'volei' | 'basquete';

export interface SportConfig {
  id: SportId;
  name: string;
  emoji: string;
  /** Jogadores em quadra/campo por time (padrão) */
  defaultTeamSize: number;
  /** Opções de tamanho de time que o organizador pode escolher */
  teamSizeOptions: number[];
  /** Posições específicas do esporte */
  positions: Position[];
  /** Cor de destaque (token Tailwind) */
  accent: string;
}

export interface Position {
  id: string;
  label: string;
  short: string;
  /** Quantos desta posição são ideais por time (0 = sem restrição) */
  idealPerTeam: number;
}

/** Nível de habilidade 1–5 (estrelas) */
export type SkillLevel = 1 | 2 | 3 | 4 | 5;

export interface Player {
  id: string;
  name: string;
  /** Nível por esporte — um jogador pode ser 5 no vôlei e 2 no futebol */
  skills: Partial<Record<SportId, SkillLevel>>;
  /** Posição preferida por esporte */
  positions: Partial<Record<SportId, string>>;
  avatarUrl?: string;
  /** Marcado como presente no sorteio atual */
  present: boolean;
  /** Goleiro / líbero — posição fixa que o algoritmo distribui primeiro */
  isKeeper?: boolean;
  createdAt: string;
  notes?: string;
}

export interface Team {
  id: string;
  name: string;
  color: TeamColor;
  players: Player[];
  /** Soma dos níveis — usada para balancear */
  totalSkill: number;
  avgSkill: number;
}

export type TeamColor =
  | 'verde'
  | 'azul'
  | 'vermelho'
  | 'amarelo'
  | 'preto'
  | 'branco'
  | 'laranja'
  | 'roxo';

export interface DrawSettings {
  sport: SportId;
  teamSize: number;
  numberOfTeams: number;
  /** Balancear por nível de habilidade */
  balanceBySkill: boolean;
  /** Distribuir posições de forma equilibrada */
  balanceByPosition: boolean;
  /** Distribuir goleiros/líberos um por time */
  distributeKeepers: boolean;
  /** Vôlei: sistema de jogo — define quantos levantadores por time */
  rotation: RotationSystem;
  /** Evitar repetir os mesmos times do sorteio anterior */
  avoidRepeat: boolean;
}

export interface DrawResult {
  id: string;
  createdAt: string;
  sport: SportId;
  teams: Team[];
  /** Jogadores que sobraram (reservas) */
  bench: Player[];
  settings: DrawSettings;
  /** Diferença entre o time mais forte e o mais fraco */
  balanceScore: number;
}

export interface Group {
  id: string;
  name: string;
  sport: SportId;
  ownerId: string;
  players: Player[];
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────
// Partidas e estatísticas
// ─────────────────────────────────────────────────────────────

/** Foto do time no momento da pelada — nomes podem mudar depois */
export interface MatchTeam {
  id: string;
  name: string;
  color: TeamColor;
  playerIds: string[];
}

/** Fundamento do vôlei em que o rally terminou */
export type VolleyAction =
  | 'ataque'
  | 'bloqueio'
  | 'saque'
  | 'recepcao'
  | 'levantamento'
  | 'defesa'
  | 'falta'
  | 'indefinido';

/**
 * Um rally do vôlei. Todo ponto é OU um acerto de quem pontuou
 * OU um erro do adversário — essa dualidade é a base do scout.
 */
export interface Rally {
  id: string;
  /** Time que marcou o ponto */
  teamId: string;
  /** 'ponto' = mérito de quem marcou · 'erro' = falha do adversário */
  kind: 'ponto' | 'erro';
  action: VolleyAction;
  /** Autor da ação: quem pontuou, ou quem errou */
  playerId?: string;
  /** Placar do set depois deste rally */
  scoreA: number;
  scoreB: number;
  at: string;
}

/** Um confronto entre dois times — um set no vôlei, um jogo no futebol */
export interface Game {
  id: string;
  teamAId: string;
  teamBId: string;
  scoreA: number;
  scoreB: number;
  /** Confronto ainda não jogado — ignorado nas estatísticas */
  played: boolean;
  finished?: boolean;
  /** Scout detalhado, rally a rally */
  rallies?: Rally[];
}

// ─────────────────────────────────────────────────────────────
// Sistemas de jogo do vôlei
// ─────────────────────────────────────────────────────────────

export type RotationSystem = '6x0' | '4x2' | '6x2' | '5x1' | 'fixo';

export interface RotationConfig {
  id: RotationSystem;
  name: string;
  /** Levantadores que o time precisa ter */
  setters: number;
  summary: string;
  description: string;
  /** O time roda ou joga em posições fixas */
  rotates: boolean;
}

/** Elenco fixo — um time que existe fora do sorteio */
export interface Squad {
  id: string;
  name: string;
  sport: SportId;
  color: TeamColor;
  playerIds: string[];
  system?: RotationSystem;
  /** O time da casa, o seu */
  isMine: boolean;
  createdAt: string;
}

/** Quanto detalhe o scout captura — muda o número de toques por ponto */
export type ScoutMode = 'placar' | 'time' | 'atleta';

export interface ScoutSettings {
  mode: ScoutMode;
  /** Pontos para vencer o set (25 oficial, 15 ou 21 em pelada) */
  pointsToWin: number;
  /** Exigir 2 pontos de vantagem */
  winByTwo: boolean;
  /** Teto de pontos quando há vantagem (0 = sem teto) */
  cap: number;
}

export interface Match {
  id: string;
  date: string;
  sport: SportId;
  teams: MatchTeam[];
  games: Game[];
  /** Gols/pontos por jogador: playerId -> quantidade */
  scorers: Record<string, number>;
  /** Todos que compareceram, inclusive reservas */
  attendance: string[];
  drawId?: string;
  notes?: string;
}

export interface PlayerStats {
  playerId: string;
  name: string;
  /** Peladas em que compareceu */
  appearances: number;
  /** Confrontos disputados */
  games: number;
  wins: number;
  draws: number;
  losses: number;
  /** Pontos corridos: 3 por vitória, 1 por empate, sobre o total possível */
  winRate: number;
  goals: number;
  goalsPerGame: number;
  /** Presença sobre o total de peladas do grupo */
  attendanceRate: number;
  lastPlayed?: string;
  /** Sequência atual: positivo = vitórias seguidas, negativo = derrotas */
  streak: number;
  topPosition?: string;
  currentSkill: SkillLevel;
}

// ─────────────────────────────────────────────────────────────
// Financeiro (fase 2)
// ─────────────────────────────────────────────────────────────

export interface Expense {
  id: string;
  groupId: string;
  description: string;
  amountCents: number;
  date: string;
  paidBy?: string;
  splitAmong: string[];
}

export interface Payment {
  id: string;
  groupId: string;
  playerId: string;
  amountCents: number;
  date: string;
  status: 'pendente' | 'pago' | 'atrasado';
  method?: 'pix' | 'dinheiro' | 'transferencia';
}
