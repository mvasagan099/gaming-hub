import { REGIONS } from "./countries";

export type LeaderboardScope = "global" | "country" | "region" | "friends" | "tournament" | "game";

export type LeaderboardPeriod = "all" | "daily" | "weekly" | "monthly" | "yearly";

export type LeaderboardMetric =
  | "rating"
  | "wins"
  | "xp"
  | "coins"
  | "matches"
  | "winRate"
  | "fastestWin"
  | "streak";

export const LEADERBOARD_SCOPES = [
  "global",
  "country",
  "region",
  "friends",
  "tournament",
  "game",
] as const satisfies readonly LeaderboardScope[];

export const LEADERBOARD_PERIODS = [
  "all",
  "daily",
  "weekly",
  "monthly",
  "yearly",
] as const satisfies readonly LeaderboardPeriod[];

export const LEADERBOARD_METRICS = [
  "rating",
  "wins",
  "xp",
  "coins",
  "matches",
  "winRate",
  "fastestWin",
  "streak",
] as const satisfies readonly LeaderboardMetric[];

export const LEADERBOARD_REGIONS: string[] = REGIONS;

/** Display labels used by the web client. */
export const LEADERBOARD_METRIC_LABELS: Record<LeaderboardMetric, string> = {
  rating: "Rating",
  wins: "Wins",
  xp: "XP",
  coins: "Coins",
  matches: "Matches",
  winRate: "Win rate",
  fastestWin: "Fastest win",
  streak: "Highest streak",
};

export const LEADERBOARD_PERIOD_LABELS: Record<LeaderboardPeriod, string> = {
  all: "All time",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

export const LEADERBOARD_SCOPE_LABELS: Record<LeaderboardScope, string> = {
  global: "Global",
  country: "Country",
  region: "Region",
  friends: "Friends",
  tournament: "Tournament",
  game: "Games",
};

export interface RankedLeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  country: string | null;
  region: string | null;
  level: number;
  gameId: string | null;
  metric: LeaderboardMetric;
  /** The value the board is ranked by. */
  metricValue: number;
  /** Rating points (cumulative, or per-game when scoped to a game). */
  score: number;
  wins: number;
  matches: number;
  losses: number;
  draws: number;
  winRate: number;
  xp: number;
  coins: number;
  /** Fastest winning match duration in seconds, or null when never won. */
  fastestWinSec: number | null;
  maxStreak: number;
  tournamentWins: number;
  tournamentPlayed: number;
}

export interface RankedLeaderboardPage {
  items: RankedLeaderboardEntry[];
  total: number;
  page: number;
  pageSize: number;
  scope: LeaderboardScope;
  period: LeaderboardPeriod;
  metric: LeaderboardMetric;
  /** Viewer's rank across the full board (1-based), or null when unranked. */
  viewerRank: number | null;
  /** Viewer's full entry, always returned so the UI can show it even off-page. */
  viewer: RankedLeaderboardEntry | null;
}

export interface LeaderboardQuery {
  scope: LeaderboardScope;
  gameId?: string;
  country?: string;
  region?: string;
  period: LeaderboardPeriod;
  metric: LeaderboardMetric;
  page: number;
  pageSize: number;
}
