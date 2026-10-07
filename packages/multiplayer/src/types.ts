/**
 * Core types and interfaces for the shared multiplayer framework.
 * Provides the foundation for room management, match lifecycle, player management,
 * synchronization, and anti-cheat systems.
 */

import type { ChessTimeControlConfig, GameId, JsonObject, RoomStatus, ConnectionStatus } from "@gaming-hub/shared";
import type { Socket } from "socket.io";

// ============================================================================
// Framework Core Types
// ============================================================================

/** Unique identifier for rooms */
export type RoomId = string;

/** Unique identifier for matches */
export type MatchId = string;

/** Unique identifier for players */
export type PlayerId = string;

/** Unique identifier for sockets */
export type SocketId = string;

/** Timestamp in milliseconds since epoch */
export type TimestampMs = number;

/** Milliseconds duration */
export type DurationMs = number;

// ============================================================================
// Player State
// ============================================================================

/** Player information stored in the multiplayer system */
export interface MultiplayerPlayer {
  id: PlayerId;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  seat: number | null;
  isReady: boolean;
  isHost: boolean;
  isSpectator: boolean;
  connectionStatus: ConnectionStatus;
  socketIds: Set<SocketId>;
  joinedAt: TimestampMs;
  lastActivityAt: TimestampMs;
  afkWarnings: number;
  statistics?: PlayerSessionStatistics;
}

/** Runtime player state with socket references */
export interface PlayerRuntime extends MultiplayerPlayer {
  socketIds: Set<SocketId>;
  pendingActions: QueuedAction[];
  reconnectionAttempts: number;
  lastPingMs: number | null;
  packetSequenceNumber: number;
}

/** Statistics tracked during a session */
export interface PlayerSessionStatistics {
  movesMade: number;
  timeSpentMs: number;
  afkTimeMs: number;
  disconnections: number;
  reconnections: number;
}

// ============================================================================
// Room State
// ============================================================================

/** Room configuration options */
export interface RoomConfig {
  gameId: GameId;
  isPrivate: boolean;
  stake: number;
  maxPlayers: number;
  minPlayers: number;
  password?: string | null;
  allowSpectators: boolean;
  maxSpectators: number;
  settings: RoomSettings;
}

/** Room settings that can be customized */
export interface RoomSettings {
  rated?: boolean;
  turnTimerDurationMs?: number;
  matchTimerDurationMs?: number;
  reconnectGracePeriodMs?: number;
  afkTimeoutMs?: number;
  allowRematch?: boolean;
  timeControl?: ChessTimeControlConfig | null;
  [key: string]: unknown;
}

/** Room runtime state */
export interface RoomRuntime {
  pendingMatchId?: string | null;
  id: RoomId;
  code: string;
  ioName: string;
  config: RoomConfig;
  hostId: PlayerId;
  status: RoomStatus;
  players: Map<PlayerId, PlayerRuntime>;
  spectators: Map<PlayerId, PlayerRuntime>;
  createdAt: TimestampMs;
  expiresAt: TimestampMs | null;
  locked: boolean;
  match: MatchRuntime | null;
  rematch: RematchState | null;
  lifecyclePhase?: "WAITING" | "READY_CHECK" | "COUNTDOWN" | "PLAYING" | "COMPLETED";
  countdownEndsAt?: number | null;
  chatHistory: ChatMessage[];
  eventLog: GameEvent[];
}

/** Room summary for public listings */
export interface RoomSummary {
  id: RoomId;
  code: string;
  gameId: GameId;
  hostId: PlayerId;
  status: RoomStatus;
  isPrivate: boolean;
  stake: number;
  playerCount: number;
  maxPlayers: number;
  spectatorCount: number;
  createdAt: string;
  hasPassword: boolean;
}

// ============================================================================
// Match State
// ============================================================================

/** Match runtime state */
export interface MatchRuntime {
  matchId: MatchId;
  participants?: Array<{ userId: string; seat: number }>;
  pendingResult?: import("./gameplay/types").MatchResult;
  startConfirmationRequired?: boolean;
  loadedPlayerIds?: string[];
  loadDeadline?: number | null;
  gameplayStartedAt?: number | null;
  engine: unknown; // EngineInstance from game-engine
  turnNumber: number;
  startedAt: TimestampMs;
  pausedAt: TimestampMs | null;
  pausedBy: PlayerId | null;
  finishedAt: TimestampMs | null;
  winnerIds: PlayerId[];
  winnerSeats: number[];
  stateSnapshots: StateSnapshot[];
  actionHistory: RecordedAction[];
}

/** State snapshot for replay and reconnection */
export interface StateSnapshot {
  turnNumber: number;
  timestamp: TimestampMs;
  state: JsonObject;
  action?: RecordedAction;
}

/** Recorded action for replay system */
export interface RecordedAction {
  turnNumber: number;
  timestamp: TimestampMs;
  playerId: PlayerId;
  seat: number;
  action: GameAction;
  events: GameEvent[];
}

/** Rematch state */
export interface RematchState {
  requestedBy: PlayerId[];
  active: boolean;
  expiresAt: TimestampMs;
}

// ============================================================================
// Actions and Events
// ============================================================================

/** Base game action */
export interface GameAction {
  type: string;
  [key: string]: unknown;
}

/** Queued action for disconnected players */
export interface QueuedAction {
  action: GameAction;
  receivedAt: TimestampMs;
  sequenceNumber: number;
}

/** Game event emitted by engine or system */
export interface GameEvent {
  type: string;
  timestamp: TimestampMs;
  seat?: number;
  playerId?: PlayerId;
  [key: string]: unknown;
}

/** Chat message (shares shape with @gaming-hub/shared ChatMessage) */
export interface ChatMessage {
  id: string;
  roomId: RoomId;
  userId: string | null;
  senderName: string;
  body: string;
  isSystem: boolean;
  createdAt: string;
}

// ============================================================================
// Synchronization
// ============================================================================

/** State synchronization packet */
export interface StateSyncPacket {
  roomId: RoomId;
  matchId: MatchId;
  turnNumber: number;
  state: JsonObject;
  events: GameEvent[];
  timestamp: TimestampMs;
  checksum: string;
  sequenceNumber: number;
}

/** Action acknowledgment */
export interface ActionAcknowledgment {
  actionSequenceNumber: number;
  receivedAt: TimestampMs;
  processedAt: TimestampMs;
  result: "accepted" | "rejected";
  error?: string;
}

/** Connection quality metrics */
export interface ConnectionQuality {
  latencyMs: number;
  packetLoss: number;
  jitterMs: number;
  lastPingAt: TimestampMs;
}

// ============================================================================
// Timers
// ============================================================================

/** Timer configuration */
export interface TimerConfig {
  durationMs: DurationMs;
  warningThresholdMs: DurationMs;
  autoExecuteOnExpiry: boolean;
}

/** Timer state */
export interface TimerState {
  type: "turn" | "match" | "reconnect" | "afk" | "lobby" | "pause";
  startedAt: TimestampMs;
  expiresAt: TimestampMs;
  pausedAt: TimestampMs | null;
  remainingWhenPaused: DurationMs | null;
  ownerSeat: number | null;
}

// ============================================================================
// Anti-Cheat
// ============================================================================

/** Anti-cheat validation result */
export interface ValidationResult {
  valid: boolean;
  reason?: string;
  action?: "reject" | "kick" | "ban" | "flag";
  confidence: number; // 0-1
}

/** Suspicious event log entry */
export interface SuspiciousEvent {
  id: string;
  playerId: PlayerId;
  roomId: RoomId;
  eventType: string;
  details: JsonObject;
  timestamp: TimestampMs;
  severity: "low" | "medium" | "high" | "critical";
}

// ============================================================================
// Matchmaking
// ============================================================================

/** Matchmaking queue entry */
export interface MatchmakingEntry {
  playerId: PlayerId;
  gameId: GameId;
  stake: number;
  skillRating: number;
  region: string;
  queuedAt: TimestampMs;
  socket: Socket;
  settings: RoomSettings;
}

/** Matchmaking bucket */
export interface MatchmakingBucket {
  key: string;
  gameId: GameId;
  stake: number;
  settings: RoomSettings;
  entries: MatchmakingEntry[];
}

// ============================================================================
// Admin
// ============================================================================

/** Admin view of a room */
export interface AdminRoomView extends RoomSummary {
  players: MultiplayerPlayer[];
  spectators: MultiplayerPlayer[];
  matchStatus: string;
  connectionQuality: Record<PlayerId, ConnectionQuality>;
  suspiciousEvents: SuspiciousEvent[];
}

/** Server health metrics */
export interface ServerHealth {
  activeRooms: number;
  activeMatches: number;
  connectedPlayers: number;
  spectators: number;
  queuedPlayers: number;
  averageLatencyMs: number;
  uptimeSeconds: number;
  memoryUsage: NodeJS.MemoryUsage;
}
