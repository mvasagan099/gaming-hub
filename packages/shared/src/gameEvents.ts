import type { GameId } from "./games";
import type { MatchConfigSnapshot } from "./gameConfig";

// ============================================================================
// 1. Standard Game Event Types
// ============================================================================

export const STANDARD_GAME_EVENT_TYPES = [
  // Matchmaking & Lobby
  "MATCH_FOUND",
  "LOBBY_UPDATED",
  "PLAYER_READY",
  "PLAYER_UNREADY",
  "COUNTDOWN_STARTED",
  "COUNTDOWN_UPDATED",
  "MATCH_STARTED",

  // Turn & Timer Management
  "TURN_STARTED",
  "TURN_CHANGED",
  "TURN_TIMEOUT",

  // Player Connections & Forfeit
  "PLAYER_DISCONNECTED",
  "PLAYER_RECONNECTED",
  "PLAYER_FORFEITED",

  // Action Acceptance & State Sync
  "GAME_ACTION_ACCEPTED",
  "GAME_ACTION_REJECTED",
  "GAME_STATE_UPDATED",
  "GAME_STATE_SYNC",

  // Completion & Settlement
  "GAME_FINISHED",
  "RESULT_CREATED",
  "SETTLEMENT_STARTED",
  "SETTLEMENT_COMPLETED",

  // Lifecycle & Rematch
  "MATCH_CANCELLED",
  "REMATCH_REQUESTED",
  "REMATCH_ACCEPTED",
  "REMATCH_STARTED",
] as const;

export type StandardGameEventType = (typeof STANDARD_GAME_EVENT_TYPES)[number];

// ============================================================================
// 2. Game-Specific Event Types (All 9 Games)
// ============================================================================

export const GAME_SPECIFIC_EVENT_TYPES = [
  // Carrom
  "CARROM_SHOT_STARTED",
  "CARROM_SHOT_RESOLVED",
  "CARROM_COIN_POCKETED",
  "CARROM_QUEEN_PENDING",
  "CARROM_QUEEN_COVERED",
  "CARROM_QUEEN_RETURNED",
  "CARROM_FOUL",

  // Chess
  "CHESS_MOVE_ACCEPTED",
  "CHESS_CHECK",
  "CHESS_CHECKMATE",
  "CHESS_CASTLE",
  "CHESS_PROMOTION",
  "CHESS_DRAW_OFFERED",
  "CHESS_DRAW_ACCEPTED",
  "CHESS_RESIGNED",
  "CHESS_TIMEOUT",

  // Ludo
  "LUDO_DICE_ROLLED",
  "LUDO_TOKEN_MOVED",
  "LUDO_TOKEN_CAPTURED",
  "LUDO_EXTRA_TURN",
  "LUDO_HOME_REACHED",
  "LUDO_WIN",

  // Snake & Ladder
  "DICE_ROLLED",
  "PLAYER_MOVED",
  "SNAKE_TRIGGERED",
  "LADDER_TRIGGERED",
  "PLAYER_FINISHED",
  "GAME_WON",

  // Table Tennis
  "POINT_STARTED",
  "POINT_SCORED",
  "RALLY_UPDATED",
  "SET_WON",
  "MATCH_WON",

  // Cricket
  "BALL_STARTED",
  "BALL_RESOLVED",
  "RUN_SCORED",
  "WICKET",
  "OVER_COMPLETED",
  "INNINGS_COMPLETED",
  "TARGET_REACHED",

  // Fruit Ninja
  "ROUND_STARTED",
  "FRUIT_SPAWNED",
  "FRUIT_SLICED",
  "BOMB_HIT",
  "LIFE_LOST",
  "FRUIT_MISSED",
  "COMBO_UPDATED",
  "TIME_UPDATED",

  // Snake vs Worms
  "FOOD_COLLECTED",
  "PLAYER_COLLISION",
  "PLAYER_ELIMINATED",
  "SPEED_CHANGED",
  "SCORE_UPDATED",

  // Bubble Shooter
  "BUBBLE_SHOT",
  "BUBBLES_MATCHED",
  "BUBBLES_REMOVED",
] as const;

export const GAME_EVENTS_BY_GAME: Record<GameId, readonly string[]> = {
  carrom: [
    "CARROM_SHOT_STARTED",
    "CARROM_SHOT_RESOLVED",
    "CARROM_COIN_POCKETED",
    "CARROM_QUEEN_PENDING",
    "CARROM_QUEEN_COVERED",
    "CARROM_QUEEN_RETURNED",
    "CARROM_FOUL",
  ],
  chess: [
    "CHESS_MOVE_ACCEPTED",
    "CHESS_CHECK",
    "CHESS_CHECKMATE",
    "CHESS_CASTLE",
    "CHESS_PROMOTION",
    "CHESS_DRAW_OFFERED",
    "CHESS_DRAW_ACCEPTED",
    "CHESS_RESIGNED",
    "CHESS_TIMEOUT",
  ],
  ludo: [
    "LUDO_DICE_ROLLED",
    "LUDO_TOKEN_MOVED",
    "LUDO_TOKEN_CAPTURED",
    "LUDO_EXTRA_TURN",
    "LUDO_HOME_REACHED",
    "LUDO_WIN",
  ],
  "snake-ladder": [
    "DICE_ROLLED",
    "PLAYER_MOVED",
    "SNAKE_TRIGGERED",
    "LADDER_TRIGGERED",
    "PLAYER_FINISHED",
    "GAME_WON",
  ],
  "table-tennis": [
    "POINT_STARTED",
    "POINT_SCORED",
    "RALLY_UPDATED",
    "SET_WON",
    "MATCH_WON",
  ],
  cricket: [
    "BALL_STARTED",
    "BALL_RESOLVED",
    "RUN_SCORED",
    "WICKET",
    "OVER_COMPLETED",
    "INNINGS_COMPLETED",
    "TARGET_REACHED",
  ],
  "fruit-ninja": [
    "ROUND_STARTED",
    "FRUIT_SPAWNED",
    "FRUIT_SLICED",
    "BOMB_HIT",
    "LIFE_LOST",
    "FRUIT_MISSED",
    "COMBO_UPDATED",
    "TIME_UPDATED",
  ],
  "snake-vs-worms": [
    "FOOD_COLLECTED",
    "PLAYER_COLLISION",
    "PLAYER_ELIMINATED",
    "SPEED_CHANGED",
    "SCORE_UPDATED",
  ],
  "bubble-shooter": [
    "BUBBLE_SHOT",
    "BUBBLES_MATCHED",
    "BUBBLES_REMOVED",
  ],
};

export type GameSpecificEventType = (typeof GAME_SPECIFIC_EVENT_TYPES)[number];
export type AnyGameEventType = StandardGameEventType | GameSpecificEventType | (string & {});

// ============================================================================
// 3. Centralized Event Envelope
// ============================================================================

export interface GameEventEnvelope<TPayload = unknown> {
  eventId: string;
  eventType: AnyGameEventType;
  matchId: string;
  gameId: GameId;
  stateVersion: number;
  timestamp: number;
  payload: TPayload;
}

// ============================================================================
// 4. Standard Event Payloads
// ============================================================================

export interface MatchFoundPayload {
  matchId: string;
  gameId: GameId;
  entryFee: number;
  opponent: {
    playerId: string;
    displayName: string;
    avatarUrl: string | null;
  };
  players: Array<{
    playerId: string;
    seat: number;
    displayName: string;
    avatarUrl: string | null;
  }>;
}

export interface LobbyUpdatedPayload {
  roomId: string;
  matchId?: string;
  gameId: GameId;
  entryFee: number;
  status: string;
  players: Array<{
    playerId: string;
    displayName: string;
    avatarUrl: string | null;
    seat: number | null;
    isReady: boolean;
    isHost: boolean;
    connected: boolean;
  }>;
}

export interface PlayerReadyPayload {
  playerId: string;
  ready: boolean;
}

export interface CountdownUpdatedPayload {
  value: number; // 3, 2, 1
}

export interface MatchStartedPayload {
  matchId: string;
  gameId: GameId;
  entryFee: number;
  configSnapshot?: MatchConfigSnapshot;
  players: Array<{
    playerId: string;
    seat: number;
    displayName: string;
  }>;
  startedAt: number;
}

export interface TurnStartedPayload {
  playerId: string;
  turnNumber: number;
  turnStartedAtMs: number;
  turnExpiresAtMs: number;
}

export type TurnChangeReason =
  | "OWN_COIN"
  | "OPPONENT_COIN"
  | "NOTHING"
  | "FOUL"
  | "TIMEOUT"
  | "EXTRA_TURN"
  | "QUEEN_COVERED"
  | "QUEEN_COVER_FAILED"
  | "PASS"
  | "NORMAL_MOVE"
  | (string & {});

export interface TurnChangedPayload {
  previousPlayerId: string;
  nextPlayerId: string;
  reason: TurnChangeReason;
  turnNumber: number;
  turnStartedAtMs?: number;
  turnExpiresAtMs?: number;
}

export interface TurnTimeoutPayload {
  playerId: string;
  turnNumber: number;
}

export interface PlayerDisconnectedPayload {
  playerId: string;
  reconnectExpiresAt: number;
}

export interface PlayerReconnectedPayload {
  playerId: string;
}

export interface PlayerForfeitedPayload {
  playerId: string;
  winnerId: string;
  reason?: string;
}

export interface GameActionAcceptedPayload {
  actionId: string;
  actionType: string;
  playerId: string;
}

export interface GameActionRejectedPayload {
  actionId: string;
  actionType: string;
  playerId: string;
  reason: string;
}

export interface GameStateUpdatedPayload<TState = unknown> {
  matchId: string;
  state: TState;
  events?: Array<{ type: string; [key: string]: unknown }>;
}

export interface GameStateSyncResponsePayload<TState = unknown> {
  matchId: string;
  stateVersion: number;
  fullState: TState;
}

export interface GameFinishedPayload {
  matchId: string;
  gameId: GameId;
  resultType: "WIN" | "DRAW" | "FORFEIT" | "ABORT";
  winnerId: string | null;
  loserId: string | null;
  winnerSeats: number[];
  scores?: Record<string, number>;
}

export interface SettlementStartedPayload {
  matchId: string;
  totalPot: number;
  entryFee: number;
}

export interface SettlementCompletedPayload {
  matchId: string;
  prizePool: number;
  winnerPayout: number;
  refundPerPlayer: number;
  isDraw: boolean;
  winnerIds: string[];
}

export interface RematchPayload {
  roomId: string;
  requestedBy: string[];
  active: boolean;
  newMatchId?: string;
}

// ============================================================================
// 5. In-Game Player Notification Models
// ============================================================================

export type NotificationPriority = "HIGH" | "MEDIUM" | "LOW";

export interface InGameNotification {
  id: string;
  priority: NotificationPriority;
  title: string;
  message: string;
  eventType: AnyGameEventType;
  matchId: string;
  gameId: GameId;
  timestamp: number;
  targetUserId?: string; // Optional: If directed to a specific player
  ephemeralMs?: number;  // Auto-dismiss countdown
}
