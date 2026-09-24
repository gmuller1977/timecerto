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
  /** Id na nuvem (players.id), depois que o grupo foi criado no banco */
  remoteId?: string;
  /** Entrou pelo link do grupo — nível e posição ainda são um palpite */
  addedViaLink?: boolean;
  /** Ausente = mensalista (todo cadastro de antes desta distinção) */
  kind?: PlayerKind;
  /** Pedido de cadastro pelo link, ainda não aprovado: fora de sorteio e links */
  pending?: boolean;
  /** AAAA-MM-DD. Só o administrador vê */
  birthDate?: string;
  /** Como o grupo conhece a pessoa — aparece no lugar do nome (`nomeDeExibicao`) */
  nickname?: string;
  /** Só dígitos, com DDD. Só o administrador vê */
  phone?: string;
}

/**
 * Mensalista tem vaga garantida quando confirma; convidado entra na fila e
 * joga se sobrar vaga (`lib/vagas.ts`). Quem define é o administrador.
 */
export type PlayerKind = 'mensalista' | 'convidado';

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
  /**
   * Jogo da nuvem cuja lista gerou este sorteio. Só existe quando o sorteio
   * saiu dos Convites — é o que permite publicar os times no link dele.
   */
  eventId?: string;
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
  /** Modo profissional: escalação do time da casa neste set */
  lineup?: SetLineup;
}

/** Troca de jogador no meio do set */
export interface Substitution {
  /** Quantos rallies o set tinha quando a troca foi feita */
  atRally: number;
  outId: string;
  inId: string;
}

/**
 * O que o set guarda da escalação. Quem está em cada posição num dado
 * momento NÃO é guardado — sai de `courtStateAt`, recalculado a partir dos
 * rallies. É isso que mantém o desfazer certo sem código extra.
 */
export interface SetLineup {
  /** Posicionamento no primeiro saque do set */
  court: Partial<Record<CourtPosition, string>>;
  firstServeTeamId: string;
  subs: Substitution[];
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

/** Modo de uso do app — decide o fluxo inteiro */
export type AppMode = 'amador' | 'profissional';

/** Faixa etária das federações; `sub17` = quem faz no máximo 16 no ano */
export type AgeGroup =
  | 'sub13'
  | 'sub15'
  | 'sub17'
  | 'sub19'
  | 'sub21'
  | 'adulto'
  | 'master';

export type Naipe = 'masculino' | 'feminino' | 'misto';

/**
 * Atleta do modo profissional. Cadastro à parte do amador: são públicos
 * diferentes e os dados que importam também — ninguém pesa o amigo da pelada.
 */
export interface ProPlayer {
  id: string;
  name: string;
  /** AAAA-MM-DD. A idade é sempre calculada, nunca guardada */
  birthDate?: string;
  ageGroup: AgeGroup;
  naipe: Naipe;
  heightCm?: number;
  weightKg?: number;
  /** Id de posição do vôlei (`lib/sports.ts`) */
  position?: string;
  createdAt: string;
  /** Id na nuvem (players.id), depois que o grupo foi criado no banco */
  remoteId?: string;
  /** Token do link pessoal — vem do banco, nunca é gerado no aparelho */
  inviteToken?: string;
}

/**
 * Posição na quadra de vôlei, numeração oficial.
 * 4 3 2 na rede · 5 6 1 no fundo · saque sai da 1.
 */
export type CourtPosition = 1 | 2 | 3 | 4 | 5 | 6;

/** Escalação do treinador: quem começa, onde, e quem fica no banco */
export interface Lineup {
  id: string;
  sport: SportId;
  system: RotationSystem;
  squadId?: string;
  teamName: string;
  color: TeamColor;
  /** posição na quadra -> id do jogador */
  court: Partial<Record<CourtPosition, string>>;
  liberoId?: string;
  bench: string[];
  createdAt: string;
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
  /** Ausente = amador (partidas de antes da separação dos modos) */
  mode?: AppMode;
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
