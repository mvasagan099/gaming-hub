import type { GameId, RoomStatus } from "@gaming-hub/shared";
import type { EngineInstance } from "@gaming-hub/game-engine";

export interface RoomPlayerRuntime {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  seat: number | null;
  isReady: boolean;
  isHost: boolean;
  isSpectator: boolean;
  connectionStatus: "connected" | "disconnected" | "reconnecting" | "forfeited";
  socketIds: Set<string>;
  joinedAt: number;
  reconnectExpiresAt?: number | null;
}

export type MatchLifecycleStatus =
  | "WAITING"
  | "PLAYERS_READY"
  | "COUNTDOWN"
  | "MATCH_STARTED"
  | "ACTIVE"
  | "TIME_EXPIRED"
  | "FINALIZING"
  | "COMPLETED"
  | "CANCELLED";

export type MatchResultReason = "NORMAL" | "TIME_LIMIT" | "TIMEOUT" | "ABANDONED";

export interface MatchRuntime {
  matchId: string;
  engine: EngineInstance;
  turnNumber: number;
  startedAt?: number;
  matchStartedAt?: number;
  matchDeadline?: number;
  matchStatus?: MatchLifecycleStatus;
  endedAt?: number | null;
  resultReason?: MatchResultReason | null;
  timeExpired?: boolean;
}

export interface RematchRuntime {
  requestedBy: string[];
}

export interface RoomRuntime {
  id: string;
  code: string;
  ioName: string;
  gameId: GameId;
  hostId: string;
  status: RoomStatus;
  isPrivate: boolean;
  stake: number;
  minPlayers: number;
  maxPlayers: number;
  players: Map<string, RoomPlayerRuntime>;
  match: MatchRuntime | null;
  createdAt: number;
  settings: Record<string, unknown>;
  rematch: RematchRuntime | null;
  pendingMatchId?: string | null;
  readyExpiresAt?: number | null;
  readyTimer?: NodeJS.Timeout | null;
  countdownStarted?: boolean;
  countdownTimer?: NodeJS.Timeout | null;
  stateVersion?: number;
}

