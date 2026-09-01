import type { GameId } from "./games";

export type AchievementCategory =
  | "FIRST_WIN"
  | "GAMES"
  | "WINS"
  | "STREAK"
  | "TOURNAMENT"
  | "GAME_MASTERY"
  | "COMPETITIVE"
  | "SOCIAL";

export type AchievementRule =
  | "first-win"
  | "games"
  | "wins"
  | "streak"
  | "tournament-wins"
  | "tournament-podium"
  | "tournament-joined"
  | "game-win"
  | "game-games"
  | "game-rating"
  | "level"
  | "xp"
  | "friends"
  | "referrals";

export interface AchievementConditionPayload {
  rule: AchievementRule;
  count?: number;
  min?: number;
  level?: number;
  gameId?: string;
  category?: AchievementCategory;
  secret?: boolean;
}

export interface AchievementDefinition {
  id: string;
  code: string;
  title: string;
  description: string;
  icon: string;
  gameId: GameId | null;
  xpReward: number;
  category: AchievementCategory;
  condition: AchievementConditionPayload;
}

export interface AchievementProgress {
  current: number;
  target: number;
  percentage: number;
}

export interface UserAchievementItem {
  code: string;
  title: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  gameId: string | null;
  xpReward: number;
  unlocked: boolean;
  unlockedAt: string | null;
  progress: AchievementProgress;
}
