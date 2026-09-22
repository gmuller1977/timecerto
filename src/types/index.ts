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
