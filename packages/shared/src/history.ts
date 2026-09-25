import type { GameId } from "./games";

export type ResultReason = "NORMAL" | "TIME_LIMIT" | "TIMEOUT" | "ABANDONED" | "DRAW" | "FORFEIT" | "DISCONNECT";


export interface MatchHistoryPlayer {
  userId: string;
  username: string;
  displayName?: string;
  avatarUrl?: string | null;
  seat: number;
  score: number;
  result: "WIN" | "LOSS" | "DRAW" | "FORFEIT" | "PENDING";
}

export interface MatchHistoryRecord {
  matchId: string;
  roomId?: string | null;
  gameType: GameId;
  gameId?: GameId;
  player1: MatchHistoryPlayer;
  player2?: MatchHistoryPlayer | null;
  players: MatchHistoryPlayer[];
  winner: string | null;
  winnerIds: string[];
  loser: string | null;
  resultReason: ResultReason;
  resultType: "WIN" | "LOSS" | "DRAW" | "CANCELLED" | "FORFEIT";
  startedAt: string | number | null;
  endedAt: string | number | null;
  durationSeconds: number;
  finalScores: Record<string, number>;
  tournamentId?: string | null;
  tournamentInfo?: {
    isTournament: boolean;
    tournamentId?: string;
    roundId?: string;
  };
  entryFee: number;
  configurationVersion: number;
  createdAt: string;
}

export interface MatchSummaryView {
  game: string;
  gameId: GameId;
  result: "WIN" | "LOSS" | "DRAW" | "CANCELLED" | "FORFEIT";
  opponentName: string;
  opponentAvatar?: string | null;
  myScore: number;
  opponentScore: number;
  formattedScore: string;
  matchDuration: string;
  durationSeconds: number;
  resultReason: ResultReason;
  startedAt: string;
  endedAt: string;
}

export interface ReplayEventRecord {
  eventId: string;
  matchId: string;
  sequence: number;
  playerId: string;
  eventType: string;
  timestamp: number;
  stateVersion: number;
  actionData: Record<string, unknown>;
  resultData: Record<string, unknown>;
}

export interface ReplaySnapshotRecord {
  snapshotId: string;
  matchId: string;
  sequence: number;
  timestamp: number;
  stateVersion: number;
  state: Record<string, unknown>;
}

export interface ReplayPackage {
  matchId: string;
  gameId: GameId;
  metadata: {
    players: { id: string; username: string; seat: number; score: number }[];
    startedAt: number;
    endedAt: number;
    durationMs: number;
    winnerIds: string[];
    resultReason: ResultReason;
    entryFee?: number;
    configurationVersion?: number;
    actionCount: number;
  };
  initialState: Record<string, unknown>;
  events: ReplayEventRecord[];
  snapshots: ReplaySnapshotRecord[];
  finalState: Record<string, unknown>;
  checksum?: string;
}

// Game-Specific Statistics Interfaces
export interface SnookerPlayerStats {
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  highestBreak: number;
  averageBreak: number;
  averageDuration: number;
  totalPots: number;
  fouls: number;
}

export interface ChessPlayerStats {
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  averageDuration: number;
  checkmates: number;
  totalMoves: number;
}

/** Legacy-only statistics retained so archived match records remain readable. */
export interface CricketPlayerStats {
  matches: number;
  wins: number;
  losses: number;
  runs: number;
  averageRuns: number;
  highestScore: number;
  wickets: number;
  boundaries: number;
  sixes: number;
  averageDuration: number;
}

export interface CarromPlayerStats {
  matches: number;
  wins: number;
  losses: number;
  points: number;
  highestScore: number;
  queensCovered: number;
  fouls: number;
  averageDuration: number;
}

export interface LudoPlayerStats {
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  tokensHome: number;
  captures: number;
  averageDuration: number;
}

export interface SnakeLadderPlayerStats {
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  laddersClimbed: number;
  snakesBitten: number;
  averageDuration: number;
}

export interface FruitNinjaPlayerStats {
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  highestScore: number;
  totalFruitsSliced: number;
  highestCombo: number;
  averageDuration: number;
}

export interface BubbleShooterPlayerStats {
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  highestScore: number;
  bubblesCleared: number;
  maxChain: number;
  averageDuration: number;
}

export interface TableTennisPlayerStats {
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  pointsWon: number;
  maxRally: number;
  averageDuration: number;
}

export interface SnakeVsWormsPlayerStats {
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  highestScore: number;
  totalKills: number;
  maxMass: number;
  averageDuration: number;
}

export type AllGameSpecificStats = {
  snooker: SnookerPlayerStats;
  chess: ChessPlayerStats;
  /** Legacy historical data only; Cricket is not an available game. */
  cricket: CricketPlayerStats;
  carrom: CarromPlayerStats;
  ludo: LudoPlayerStats;
  "snake-ladder": SnakeLadderPlayerStats;
  "fruit-ninja": FruitNinjaPlayerStats;
  "bubble-shooter": BubbleShooterPlayerStats;
  "table-tennis": TableTennisPlayerStats;
  "snake-vs-worms": SnakeVsWormsPlayerStats;
};

export interface GlobalPlayerStatistics {
  userId: string;
  totalMatches: number;
  totalWins: number;
  totalLosses: number;
  totalDraws: number;
  winRate: number;
  gamesPlayed: number;
  tournamentMatches: number;
  tournamentWins: number;
  averageMatchDuration: number;
  shortestMatch: number;
  longestMatch: number;
  timeLimitMatches: number;
  gameStats: Partial<AllGameSpecificStats>;
}

export interface TimeLimitAnalytics {
  gameId: string;
  normalCompletionCount: number;
  timeLimitCompletionCount: number;
  timeoutCount: number;
  abandonedCount: number;
  drawCount: number;
  totalCompleted: number;
  averageDuration: number;
  normalPercentage: number;
  timeLimitPercentage: number;
  timeoutPercentage: number;
}
