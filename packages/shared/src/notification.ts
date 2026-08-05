import type { GameId } from "./games";

export type NotificationType =
  | "MATCH_INVITE"
  | "FRIEND_REQUEST"
  | "FRIEND_ACCEPTED"
  | "MATCH_RESULT"
  | "TOURNAMENT"
  | "SYSTEM";

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface Achievement {
  code: string;
  title: string;
  description: string;
  icon: string;
  gameId: GameId | null;
  xpReward: number;
}

export interface UserAchievement {
  code: string;
  title: string;
  description: string;
  icon: string;
  xpReward: number;
  unlockedAt: string;
}
