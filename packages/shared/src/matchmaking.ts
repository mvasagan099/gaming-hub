import type { GameId } from "./games";
import type { MatchSettings } from "./room";

export type MatchmakingStatus = "WAITING" | "MATCHED" | "CANCELLED" | "EXPIRED";

export type MatchmakingMode = "casual" | "ranked";

export interface MatchmakingQueueEntry {
  id: string;
  userId: string;
  gameId: GameId;
  entryFee: number;
  gameMode: MatchmakingMode;
  rating?: number | null;
  status: MatchmakingStatus;
  position: number;
  joinedAt: string;
  expiresAt: string;
  socketId?: string | null;
  matchedWith?: string | null;
  roomId?: string | null;
  matchId?: string | null;
}

export interface MatchmakingJoinPayload {
  gameId: GameId;
  stake: number;
  gameMode?: MatchmakingMode;
  settings?: MatchSettings;
  socketId?: string;
}

export interface MatchmakingCancelPayload {
  gameId?: GameId;
}

export interface MatchmakingStatusResponse {
  queued: boolean;
  entry?: MatchmakingQueueEntry | null;
  position?: number;
  waitElapsedSeconds?: number;
  secondsRemaining?: number;
}

export interface MatchFoundPlayerInfo {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  rating?: number | null;
  seed?: number | null;
  seat: number;
  ready: boolean;
}

export interface MatchFoundNotificationPayload {
  matchId: string;
  roomId: string;
  gameId: GameId;
  entryFee: number;
  players: MatchFoundPlayerInfo[];
  status: "ready" | "countdown" | "playing";
  configurationSnapshot?: Record<string, unknown>;
}

export interface MatchReadyPayload {
  matchId: string;
  roomId: string;
  playerId: string;
  ready: boolean;
}

export interface MatchCountdownPayload {
  matchId: string;
  countdown: number; // 3, 2, 1, 0
}

export const MATCHMAKING_CONFIG = {
  DEFAULT_TIMEOUT_SECONDS: 90,
  READY_TIMEOUT_SECONDS: 30,
  DISCONNECT_GRACE_SECONDS: 30,
  COUNTDOWN_SECONDS: 3,
  MAX_BUCKET_SIZE: 100,
  MATCH_TIME_LIMIT_SECONDS: 600, // 10 minutes
} as const;
