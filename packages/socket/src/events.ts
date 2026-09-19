import type {
  ChatEmoji,
  ChatMessage,
  ErrorCode,
  GameId,
  JsonObject,
  MatchSettings,
  RoomFull,
  RoomPlayer,
  GameEventEnvelope,
  InGameNotification,
  AuthoritativeMatchState,
  AuthoritativeStateSyncRequest,
  AuthoritativeStateSyncResponse,
  StandardMatchResult,
} from "@gaming-hub/shared";

/**
 * The full Socket.IO contract. Payload shapes are shared verbatim between the
 * web client and the socket server — no drift is possible at compile time.
 */

export type Ack<T> = (
  res: { ok: true; data: T } | { ok: false; error: { code: ErrorCode; message: string } },
) => void;

export interface SocketErrorPayload {
  code: ErrorCode;
  message: string;
}

export interface ClientToServerEvents {
  "room:create": (
    payload: { gameId: GameId; isPrivate: boolean; stake: number; maxPlayers?: number; settings?: MatchSettings },
    ack: Ack<RoomFull>,
  ) => void;

  "room:join": (
    payload: { roomId?: string; code?: string; asSpectator: boolean },
    ack: Ack<RoomFull>,
  ) => void;

  "room:leave": (payload: { roomId: string }, ack: Ack<{ roomId: string }>) => void;

  "room:ready": (payload: { roomId: string; ready: boolean }, ack: Ack<RoomFull>) => void;

  "room:start": (payload: { roomId: string }, ack: Ack<RoomFull>) => void;

  "room:kick": (
    payload: { roomId: string; targetUserId: string },
    ack: Ack<{ roomId: string; kickedUserId: string }>,
  ) => void;

  "matchmaking:join": (
    payload: { gameId: GameId; stake: number; settings?: MatchSettings },
    ack: Ack<{ position: number }>,
  ) => void;

  "matchmaking:leave": (payload: Record<string, never>, ack: Ack<{ left: boolean }>) => void;

  "game:action": (payload: { roomId: string; action: { type: string } & JsonObject }, ack: Ack<GameActionResult>) => void;

  "game:rematch": (payload: { roomId: string }, ack: Ack<RematchUpdate>) => void;

  "game:rematch-request": (payload: { roomId: string }, ack: Ack<RematchUpdate>) => void;

  "game:rematch-accept": (payload: { roomId: string }, ack: Ack<RematchUpdate>) => void;

  "game:rematch-decline": (payload: { roomId: string }, ack: Ack<RematchUpdate>) => void;

  "chat:message": (payload: { roomId: string; text: string }, ack: Ack<ChatMessage>) => void;

  "chat:emoji": (payload: { roomId: string; emoji: string }, ack: Ack<{ sent: true }>) => void;

  "chat:typing": (payload: { roomId: string }, ack: Ack<{ sent: true }>) => void;

  "game:state:ack": (payload: { roomId: string; matchId: string; timestamp: number }) => void;

  "game:sync": (
    payload: { roomId: string; matchId: string; lastStateVersion: number },
    ack: Ack<{ stateVersion: number; fullState: JsonObject }>,
  ) => void;

  "game:state-sync": (
    payload: AuthoritativeStateSyncRequest,
    ack: Ack<AuthoritativeStateSyncResponse>,
  ) => void;

  "game:event:ack": (payload: { matchId: string; eventId: string; stateVersion: number }) => void;

  "carrom:striker-position": (payload: {
    roomId?: string;
    matchId?: string;
    playerId?: string;
    turnNumber?: number;
    x: number;
    sequence: number;
    timestamp?: number;
  }) => void;

  "snooker:aim-position": (payload: {
    roomId?: string;
    matchId?: string;
    playerId?: string;
    angle: number;
    power: number;
    sequence: number;
    timestamp?: number;
  }) => void;

  "ping": (payload: { timestamp: number }, callback: () => void) => void;

  "tournament:subscribe": (payload: { tournamentId: string }, ack?: Ack<{ subscribed: boolean }>) => void;
  "tournament:unsubscribe": (payload: { tournamentId: string }) => void;

  "admin:analytics:subscribe": (ack?: Ack<{ subscribed: boolean }>) => void;
  "admin:analytics:unsubscribe": () => void;
}

export interface ServerToClientEvents {
  "room:update": (room: RoomFull) => void;
  "room:updated": (room: RoomFull) => void;
  "room:player-joined": (player: RoomPlayer) => void;
  "room:player-left": (payload: { userId: string; newHostUserId: string }) => void;
  "room:player-ready": (payload: { userId: string; ready: boolean }) => void;
  "room:started": (payload: { roomId: string; matchId: string; initialTurn?: number }) => void;
  "room:kicked": (payload: { roomId: string; reason: string }) => void;
  "room:closed": (payload: { roomId: string; reason: string }) => void;

  "player:joined": (payload: { roomId: string; player: RoomPlayer }) => void;
  "player:left": (payload: { roomId: string; playerId: string }) => void;
  "player:connection": (payload: {
    roomId: string;
    playerId: string;
    status: RoomPlayer["connectionStatus"];
  }) => void;
  "player:kicked": (payload: { roomId: string; playerId: string; byUserId: string; reason: string }) => void;

  "game:notification": (payload: InGameNotification) => void;
  "game:event": (envelope: GameEventEnvelope) => void;
  "game:authoritative-state": (state: AuthoritativeMatchState) => void;
  "game:state:authoritative": (payload: AuthoritativeMatchState) => void;
  "game:sync:response": (payload: { matchId: string; stateVersion: number; fullState: JsonObject }) => void;

  "rematch:update": (payload: RematchUpdate) => void;

  "game:state": (payload: {
    roomId: string;
    matchId: string;
    state: JsonObject;
    seat: number | null;
    events: { type: string }[];
    /** Monotonically increasing per-room packet order; clients dedupe/order on it. */
    sequenceNumber: number;
    timestamp: number;
    turnNumber: number;
  }) => void;

  "game:over": (payload: {
    roomId: string;
    matchId: string;
    winnerSeats: number[];
    winnerIds: string[];
    state: JsonObject;
  }) => void;

  "game:finished": (payload: StandardMatchResult) => void;

  "game:settlement-completed": (payload: {
    matchId: string;
    resultType: string;
    coinsWon: number;
  }) => void;

  "carrom:striker-position": (payload: {
    roomId: string;
    matchId: string;
    playerId: string;
    seat: number;
    turnNumber?: number;
    x: number;
    sequence: number;
    timestamp: number;
  }) => void;

  "snooker:aim-position": (payload: {
    roomId: string;
    matchId: string;
    playerId: string;
    seat: number;
    angle: number;
    power: number;
    sequence: number;
    timestamp: number;
  }) => void;

  "chat:message": (message: ChatMessage) => void;
  "chat:emoji": (emoji: ChatEmoji) => void;
  "chat:typing": (payload: { roomId: string; userId: string; senderName: string; typing: boolean }) => void;

  "matchmaking:queued": (payload: { position: number }) => void;
  "matchmaking:found": (payload: { roomId: string }) => void;

  "wallet:updated": (payload: WalletUpdatePayload) => void;

  "tournament:updated": (data: { tournamentId: string; stateVersion: number }) => void;
  "tournament:player-count-updated": (data: { tournamentId: string; registeredPlayers: number; maxPlayers: number }) => void;
  "tournament:player-registered": (data: { tournamentId: string; userId?: string }) => void;
  "tournament:match-assigned": (data: { tournamentId: string; matchId?: string; roundNumber?: number }) => void;
  "tournament:match-created": (data: { tournamentId: string; matchId: string; roundNumber: number }) => void;
  "tournament:match-started": (data: { tournamentId: string; matchId: string }) => void;
  "tournament:match-completed": (data: { tournamentId: string; matchId: string; winnerId?: string }) => void;
  "tournament:player-advanced": (data: { tournamentId: string; userId: string; roundNumber: number }) => void;
  "tournament:player-eliminated": (data: { tournamentId: string; userId: string; roundNumber: number }) => void;
  "tournament:final-started": (data: { tournamentId: string }) => void;
  "tournament:completed": (data: { tournamentId: string; winnerId: string }) => void;
  "tournament:settlement-completed": (data: { tournamentId: string }) => void;

  "admin:analytics:tournament-updated": (data: {
    tournamentId: string;
    status: string;
    title?: string;
    registeredPlayers?: number;
    gameId?: string;
    tier?: string;
    timestamp?: string;
  }) => void;
  "admin:analytics:match-updated": (data: {
    matchId: string;
    tournamentId?: string;
    status: string;
    roundNumber?: number;
    winnerId?: string;
    timestamp?: string;
  }) => void;
  "admin:analytics:registration-updated": (data: {
    tournamentId: string;
    userId: string;
    registeredPlayers: number;
    maxPlayers: number;
    entryFee: number;
    timestamp?: string;
  }) => void;
  "admin:analytics:settlement-updated": (data: {
    tournamentId: string;
    prizeId?: string;
    status: "PAID" | "PENDING" | "FAILED" | string;
    amount?: number;
    userId?: string;
    timestamp?: string;
  }) => void;
  "admin:analytics:refund-updated": (data: {
    tournamentId: string;
    refundId?: string;
    status: "COMPLETED" | "FAILED" | "PENDING" | string;
    amount?: number;
    userId?: string;
    timestamp?: string;
  }) => void;
  "admin:analytics:notification-failed": (data: {
    notificationId: string;
    channel: string;
    tournamentId?: string;
    error?: string;
    timestamp?: string;
  }) => void;
  "admin:analytics:scheduler-status": (data: {
    isPaused: boolean;
    status: string;
    lastRunAt?: string | null;
    nextRunAt?: string | null;
    timestamp?: string;
  }) => void;

  "latency:ping": (payload: { timestamp: number }, ack: () => void) => void;

  "auth:session-revoked": (payload: { reason: string }) => void;

  "error": (payload: SocketErrorPayload) => void;
}

export interface WalletUpdatePayload {
  event:
    | "wallet-balance"
    | "deposit-approved"
    | "deposit-rejected"
    | "withdrawal-approved"
    | "withdrawal-rejected"
    | "wallet-frozen"
    | "wallet-unfrozen";
  requestId?: string;
  kind?: "DEPOSIT" | "WITHDRAWAL";
  status?: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  balance?: number;
  bonusBalance?: number;
  message?: string;
}

export interface RematchUpdate {
  roomId: string;
  /** Users who have requested/confirmed a rematch. Match restarts once everyone has. */
  requestedBy: string[];
  /** False when the rematch offer has been cleared or the match has restarted. */
  active: boolean;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId: string;
  username: string;
}

export interface GameActionResult {
  ok: boolean;
  error?: string;
  events: { type: string }[];
  state: JsonObject;
  finished: boolean;
  winnerSeats: number[];
}
