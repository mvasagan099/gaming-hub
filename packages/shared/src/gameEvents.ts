import type { GameId } from "./games";
import type { MatchConfigSnapshot } from "./gameConfig";

// ============================================================================
// 1. Standard Game Event Types (Central Architecture)
// ============================================================================

export const STANDARD_GAME_EVENT_TYPES = [
  // Matchmaking & Lobby
  "MATCH_JOINED",
  "MATCH_FOUND",
  "LOBBY_UPDATED",
  "PLAYER_CONNECTED",
  "PLAYER_DISCONNECTED",
  "PLAYER_READY",
  "PLAYER_UNREADY",
  "PLAYER_NOT_READY",
  "COUNTDOWN_STARTED",
  "COUNTDOWN_UPDATED",
  "MATCH_STARTED",
  "MATCH_STATE_SYNC",

  // Turn & Action Management
  "TURN_STARTED",
  "TURN_CHANGED",
  "TURN_TIMEOUT",
  "ACTION_ACCEPTED",
  "GAME_ACTION_ACCEPTED",
  "ACTION_REJECTED",
  "GAME_ACTION_REJECTED",

  // Scores & Points
  "SCORE_UPDATED",
  "FOUL_OCCURRED",
  "POINT_SCORED",
  "GOAL_SCORED",

  // Timer & Deadlines
  "TIME_WARNING",
  "MATCH_TIMER_WARNING",
  "TIME_EXPIRED",
  "MATCH_TIME_EXPIRED",

  // Player Connections & Grace Period
  "PLAYER_DISCONNECTED",
  "PLAYER_RECONNECTED",
  "PLAYER_FORFEITED",

  // State Sync & Recovery
  "STATE_RESYNC",
  "GAME_STATE_UPDATED",
  "GAME_STATE_SYNC",

  // Completion & Settlement
  "MATCH_COMPLETED",
  "GAME_FINISHED",
  "MATCH_CANCELLED",
  "RESULT_CREATED",
  "SETTLEMENT_STARTED",
  "SETTLEMENT_COMPLETED",

  // Tournament Lifecycle Events
  "TOURNAMENT_MATCH_ASSIGNED",
  "TOURNAMENT_MATCH_STARTED",
  "TOURNAMENT_ADVANCED",
  "TOURNAMENT_ELIMINATED",
  "TOURNAMENT_COMPLETED",

  // Rematch
  "REMATCH_REQUESTED",
  "REMATCH_ACCEPTED",
  "REMATCH_STARTED",
] as const;

export type StandardGameEventType = (typeof STANDARD_GAME_EVENT_TYPES)[number];

// ============================================================================
// 2. Game-Specific Event Types (All 10 Games)
// ============================================================================

export const GAME_SPECIFIC_EVENT_TYPES = [
  // Snake & Ladder
  "DICE_ROLLED",
  "PLAYER_MOVED",
  "SNAKE_TRIGGERED",
  "LADDER_TRIGGERED",
  "PLAYER_FINISHED",
  "GAME_WON",

  // Ludo
  "LUDO_DICE_ROLLED",
  "LUDO_TOKEN_MOVED",
  "LUDO_TOKEN_CAPTURED",
  "TOKEN_MOVED",
  "TOKEN_CAPTURED",
  "TOKEN_COMPLETED",
  "LUDO_EXTRA_TURN",
  "LUDO_HOME_REACHED",
  "LUDO_WIN",

  // Chess
  "MOVE_MADE",
  "CHESS_MOVE_ACCEPTED",
  "CHECK",
  "CHESS_CHECK",
  "CHECKMATE",
  "CHESS_CHECKMATE",
  "STALEMATE",
  "CHESS_CASTLE",
  "CHESS_PROMOTION",
  "CHESS_DRAW_OFFERED",
  "CHESS_DRAW_ACCEPTED",
  "DRAW",
  "CHESS_RESIGNED",
  "CHESS_TIMEOUT",

  // Fruit Ninja
  "ROUND_STARTED",
  "ROUND_PROGRESS",
  "FRUIT_SPAWNED",
  "FRUIT_SLICED",
  "BOMB_HIT",
  "LIFE_LOST",
  "FRUIT_MISSED",
  "COMBO_EVENT",
  "COMBO_UPDATED",
  "SCORE_EVENT",

  // Bubble Shooter
  "BUBBLE_SHOT",
  "SHOT_RESOLVED",
  "BUBBLE_MATCHED",
  "BUBBLES_MATCHED",
  "BUBBLES_REMOVED",
  "LEVEL_PROGRESS",

  // Table Tennis
  "POINT_STARTED",
  "POINT_SCORED",
  "RALLY_STARTED",
  "RALLY_COMPLETED",
  "RALLY_UPDATED",
  "SET_WON",
  "SET_COMPLETED",
  "MATCH_WON",

  // Snake vs Worms
  "FOOD_COLLECTED",
  "COLLISION",
  "PLAYER_COLLISION",
  "KILL",
  "PLAYER_ELIMINATED",
  "OBJECTIVE_COMPLETED",
  "SPEED_CHANGED",

  // Cricket
  "DELIVERY_STARTED",
  "BALL_STARTED",
  "DELIVERY_COMPLETED",
  "BALL_RESOLVED",
  "RUNS_SCORED",
  "RUN_SCORED",
  "WICKET",
  "OVER_COMPLETED",
  "INNINGS_COMPLETED",
  "TARGET_REACHED",

  // Carrom
  "CARROM_SHOT_STARTED",
  "SHOT_STARTED",
  "CARROM_SHOT_RESOLVED",
  "SHOT_COMPLETED",
  "COIN_POCKETED",
  "CARROM_COIN_POCKETED",
  "CARROM_QUEEN_PENDING",
  "CARROM_QUEEN_COVERED",
  "QUEEN_COVERED",
  "CARROM_QUEEN_RETURNED",
  "CARROM_FOUL",
  "FOUL",

  // Snooker
  "SNOOKER_SHOT_STARTED",
  "SNOOKER_SHOT_RESOLVED",
  "BALL_POTTED",
  "SNOOKER_BALL_POCKETED",
  "SNOOKER_FOUL",
  "BREAK_UPDATED",
  "SNOOKER_BREAK_UPDATED",
  "TARGET_CHANGED",
  "FREE_BALL",
  "FRAME_COMPLETED",
  "SNOOKER_FRAME_WON",
  "SNOOKER_BALL_IN_HAND",
  "SNOOKER_RESPOT",
] as const;

export const GAME_EVENTS_BY_GAME: Record<GameId, readonly string[]> = {
  carrom: [
    "CARROM_SHOT_STARTED",
    "SHOT_STARTED",
    "CARROM_SHOT_RESOLVED",
    "SHOT_COMPLETED",
    "COIN_POCKETED",
    "CARROM_COIN_POCKETED",
    "CARROM_QUEEN_PENDING",
    "CARROM_QUEEN_COVERED",
    "QUEEN_COVERED",
    "CARROM_QUEEN_RETURNED",
    "CARROM_FOUL",
    "FOUL",
  ],
  chess: [
    "MOVE_MADE",
    "CHESS_MOVE_ACCEPTED",
    "CHECK",
    "CHESS_CHECK",
    "CHECKMATE",
    "CHESS_CHECKMATE",
    "STALEMATE",
    "CHESS_CASTLE",
    "CHESS_PROMOTION",
    "CHESS_DRAW_OFFERED",
    "CHESS_DRAW_ACCEPTED",
    "DRAW",
    "CHESS_RESIGNED",
    "CHESS_TIMEOUT",
  ],
  ludo: [
    "LUDO_DICE_ROLLED",
    "LUDO_TOKEN_MOVED",
    "LUDO_TOKEN_CAPTURED",
    "TOKEN_MOVED",
    "TOKEN_CAPTURED",
    "TOKEN_COMPLETED",
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
    "RALLY_STARTED",
    "RALLY_COMPLETED",
    "RALLY_UPDATED",
    "SET_WON",
    "SET_COMPLETED",
    "MATCH_WON",
  ],
  cricket: [
    "DELIVERY_STARTED",
    "BALL_STARTED",
    "DELIVERY_COMPLETED",
    "BALL_RESOLVED",
    "RUNS_SCORED",
    "RUN_SCORED",
    "WICKET",
    "OVER_COMPLETED",
    "INNINGS_COMPLETED",
    "TARGET_REACHED",
  ],
  "fruit-ninja": [
    "ROUND_STARTED",
    "ROUND_PROGRESS",
    "FRUIT_SPAWNED",
    "FRUIT_SLICED",
    "BOMB_HIT",
    "LIFE_LOST",
    "FRUIT_MISSED",
    "COMBO_EVENT",
    "COMBO_UPDATED",
    "SCORE_EVENT",
  ],
  "snake-vs-worms": [
    "FOOD_COLLECTED",
    "COLLISION",
    "PLAYER_COLLISION",
    "KILL",
    "PLAYER_ELIMINATED",
    "OBJECTIVE_COMPLETED",
    "SPEED_CHANGED",
  ],
  "bubble-shooter": [
    "BUBBLE_SHOT",
    "SHOT_RESOLVED",
    "BUBBLE_MATCHED",
    "BUBBLES_MATCHED",
    "BUBBLES_REMOVED",
    "LEVEL_PROGRESS",
  ],
  snooker: [
    "SNOOKER_SHOT_STARTED",
    "SNOOKER_SHOT_RESOLVED",
    "BALL_POTTED",
    "SNOOKER_BALL_POCKETED",
    "SNOOKER_FOUL",
    "BREAK_UPDATED",
    "SNOOKER_BREAK_UPDATED",
    "TARGET_CHANGED",
    "FREE_BALL",
    "FRAME_COMPLETED",
    "SNOOKER_FRAME_WON",
    "SNOOKER_BALL_IN_HAND",
    "SNOOKER_RESPOT",
  ],
};

export type GameSpecificEventType = (typeof GAME_SPECIFIC_EVENT_TYPES)[number];
export type AnyGameEventType = StandardGameEventType | GameSpecificEventType | (string & {});

// ============================================================================
// 3. Event Priorities & Classification
// ============================================================================

export type EventPriority = "CRITICAL" | "HIGH" | "NORMAL" | "LOW";

export function getEventPriority(eventType: AnyGameEventType): EventPriority {
  switch (eventType) {
    case "MATCH_COMPLETED":
    case "GAME_FINISHED":
    case "MATCH_CANCELLED":
    case "TIME_EXPIRED":
    case "MATCH_TIME_EXPIRED":
    case "TOURNAMENT_COMPLETED":
    case "CHECKMATE":
    case "CHESS_CHECKMATE":
      return "CRITICAL";

    case "TURN_CHANGED":
    case "TURN_STARTED":
    case "COUNTDOWN_STARTED":
    case "MATCH_STARTED":
    case "PLAYER_DISCONNECTED":
    case "PLAYER_RECONNECTED":
    case "STATE_RESYNC":
    case "TOURNAMENT_ADVANCED":
    case "TOURNAMENT_ELIMINATED":
      return "HIGH";

    case "ACTION_ACCEPTED":
    case "GAME_ACTION_ACCEPTED":
    case "ACTION_REJECTED":
    case "GAME_ACTION_REJECTED":
    case "SCORE_UPDATED":
    case "FOUL_OCCURRED":
    case "FOUL":
    case "CARROM_FOUL":
    case "SNOOKER_FOUL":
    case "POINT_SCORED":
    case "WICKET":
    case "CHECK":
    case "CHESS_CHECK":
    case "TOKEN_CAPTURED":
    case "LUDO_TOKEN_CAPTURED":
    case "TIME_WARNING":
    case "MATCH_TIMER_WARNING":
      return "NORMAL";

    default:
      return "LOW";
  }
}

// ============================================================================
// 4. Centralized Event Envelope
// ============================================================================

export interface GameEventEnvelope<TPayload = unknown> {
  eventId: string;
  eventType: AnyGameEventType;
  matchId: string;
  gameId: GameId;
  sequence: number;
  stateVersion: number;
  priority: EventPriority;
  timestamp: number;
  payload: TPayload;
}

// ============================================================================
// 5. Standard Event Payloads
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

export interface CountdownStartedPayload {
  seconds: number;
  startedAt: number;
}

export interface CountdownUpdatedPayload {
  value: number; // 3, 2, 1
}

export interface MatchStartedPayload {
  matchId: string;
  gameType: GameId;
  gameId: GameId;
  entryFee: number;
  configSnapshot?: MatchConfigSnapshot;
  configurationVersion?: number;
  players: Array<{
    playerId: string;
    seat: number;
    displayName: string;
    avatarUrl?: string | null;
  }>;
  matchStartedAt: number;
  startedAt: number;
  matchDeadline: number;
  matchDurationSeconds?: number;
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
  previousPlayerId?: string;
  currentPlayerId: string;
  nextPlayerId?: string;
  reason?: TurnChangeReason;
  turnNumber?: number;
  stateVersion?: number;
  turnStartedAtMs?: number;
  turnExpiresAtMs?: number;
}

export interface ActionAcceptedPayload {
  actionId: string;
  actionType: string;
  playerId: string;
  sequence?: number;
  stateVersion?: number;
}

export interface ActionRejectedPayload {
  actionId: string;
  actionType: string;
  playerId: string;
  reason: string;
}

export interface ScoreUpdatedPayload {
  scores: Record<string, number>;
  player1Score?: number;
  player2Score?: number;
  stateVersion: number;
  reason?: string;
}

export interface FoulOccurredPayload {
  playerId: string;
  reason: string;
  penaltyPoints?: number;
  foulType?: string;
  stateVersion?: number;
}

export interface TimeWarningPayload {
  remainingSeconds: number;
  thresholdSeconds: number;
  matchDeadline: number;
}

export interface TimeExpiredPayload {
  matchId: string;
  expiredAt: number;
  reason: "10_MIN_GLOBAL_DEADLINE" | "TURN_TIMEOUT";
}

export interface MatchCompletedPayload {
  matchId: string;
  gameType?: GameId;
  gameId?: GameId;
  winnerId: string | null;
  loserId: string | null;
  winnerSeats?: number[];
  resultReason: "NORMAL" | "TIME_LIMIT" | "TIMEOUT" | "ABANDONED" | "DRAW";
  finalScore?: Record<string, number>;
  scores?: Record<string, number>;
  endedAt: number;
  durationSeconds?: number;
}

export interface PlayerDisconnectedPayload {
  playerId: string;
  reconnectExpiresAt: number;
  gracePeriodSeconds?: number;
}

export interface PlayerReconnectedPayload {
  playerId: string;
  reconnectedAt: number;
}

export interface StateResyncPayload<TState = unknown> {
  matchId: string;
  stateVersion: number;
  matchStatus: string;
  currentPlayer: string | null;
  scores: Record<string, number>;
  matchDeadline: number;
  gameState: TState;
}

export interface TournamentMatchEventPayload {
  tournamentId: string;
  roundId?: string;
  matchId: string;
  playerIds: string[];
  winnerId?: string;
  nextMatchId?: string;
}

import type { NotificationType } from "./notification";

export interface PersistentNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  referenceId?: string;
  referenceType?: "MATCH" | "TOURNAMENT" | "TRANSACTION" | "WALLET";
  data?: Record<string, unknown>;
  createdAt: string;
}

export interface InGameNotification {
  id: string;
  priority: EventPriority;
  title: string;
  message: string;
  eventType: AnyGameEventType;
  matchId: string;
  gameId: GameId;
  timestamp: number;
  targetUserId?: string;
  ephemeralMs?: number;
}
