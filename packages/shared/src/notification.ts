import type { GameId } from "./games";

export type NotificationType =
  | "MATCH_INVITE"
  | "FRIEND_REQUEST"
  | "FRIEND_ACCEPTED"
  | "MATCH_RESULT"
  | "TOURNAMENT"
  | "SYSTEM"
  | "REFERRAL"
  | "COUPON"
  | "ANNOUNCEMENT"
  | "MESSAGE"
  | "SUPPORT"
  | "PROMOTION"
  | "WALLET"
  | "ACHIEVEMENT"
  | "SYSTEM_ALERT";

export type TournamentNotificationEvent =
  | "TOURNAMENT_REGISTERED"
  | "TOURNAMENT_REGISTRATION_CLOSING"
  | "TOURNAMENT_REGISTRATION_CLOSED"
  | "TOURNAMENT_STARTING"
  | "TOURNAMENT_STARTED"
  | "TOURNAMENT_MATCH_ASSIGNED"
  | "TOURNAMENT_MATCH_READY"
  | "TOURNAMENT_MATCH_REMINDER"
  | "TOURNAMENT_BYE"
  | "TOURNAMENT_MATCH_STARTED"
  | "TOURNAMENT_MATCH_COMPLETED"
  | "TOURNAMENT_ADVANCED"
  | "TOURNAMENT_ELIMINATED"
  | "TOURNAMENT_FINAL"
  | "TOURNAMENT_WON"
  | "TOURNAMENT_PODIUM"
  | "TOURNAMENT_COMPLETED"
  | "TOURNAMENT_PRIZE_CREDITED"
  | "TOURNAMENT_CANCELLED"
  | "TOURNAMENT_REFUNDED"
  | "TOURNAMENT_ADMIN_ERROR"
  | "TOURNAMENT_ADMIN_STUCK"
  | "TOURNAMENT_SETTLEMENT_FAILED"
  | "TOURNAMENT_BRACKET_INCONSISTENCY";

export const TOURNAMENT_NOTIFICATION_EVENTS: TournamentNotificationEvent[] = [
  "TOURNAMENT_REGISTERED",
  "TOURNAMENT_REGISTRATION_CLOSING",
  "TOURNAMENT_REGISTRATION_CLOSED",
  "TOURNAMENT_STARTING",
  "TOURNAMENT_STARTED",
  "TOURNAMENT_MATCH_ASSIGNED",
  "TOURNAMENT_MATCH_READY",
  "TOURNAMENT_MATCH_REMINDER",
  "TOURNAMENT_BYE",
  "TOURNAMENT_MATCH_STARTED",
  "TOURNAMENT_MATCH_COMPLETED",
  "TOURNAMENT_ADVANCED",
  "TOURNAMENT_ELIMINATED",
  "TOURNAMENT_FINAL",
  "TOURNAMENT_WON",
  "TOURNAMENT_PODIUM",
  "TOURNAMENT_COMPLETED",
  "TOURNAMENT_PRIZE_CREDITED",
  "TOURNAMENT_CANCELLED",
  "TOURNAMENT_REFUNDED",
  "TOURNAMENT_ADMIN_ERROR",
  "TOURNAMENT_ADMIN_STUCK",
  "TOURNAMENT_SETTLEMENT_FAILED",
  "TOURNAMENT_BRACKET_INCONSISTENCY",
];

export type TournamentTimelineStatus =
  | "COMPLETED"
  | "ACTIVE"
  | "UPCOMING"
  | "SKIPPED"
  | "FAILED";

export interface TournamentTimelineStep {
  id: string;
  label: string;
  description: string;
  status: TournamentTimelineStatus;
  timestamp?: string;
  meta?: Record<string, unknown>;
}

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  tournamentEventType: string | null;
  referenceId: string | null;
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
