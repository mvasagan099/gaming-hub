import type {
  ChatEmoji,
  ChatMessage,
  ErrorCode,
  GameId,
  JsonObject,
  MatchSettings,
  RoomFull,
  RoomPlayer,
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

  "carrom:striker-position": (payload: {
    roomId?: string;
    matchId?: string;
    playerId?: string;
    x: number;
    sequence: number;
    timestamp?: number;
  }) => void;

  "ping": (payload: { timestamp: number }, callback: () => void) => void;
}

export interface ServerToClientEvents {
  "room:update": (room: RoomFull) => void;
  "room:closed": (payload: { roomId: string; reason: string }) => void;

  "player:joined": (payload: { roomId: string; player: RoomPlayer }) => void;
  "player:left": (payload: { roomId: string; playerId: string }) => void;
  "player:connection": (payload: {
    roomId: string;
    playerId: string;
    status: RoomPlayer["connectionStatus"];
  }) => void;
  "player:kicked": (payload: { roomId: string; playerId: string; byUserId: string; reason: string }) => void;

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

  "carrom:striker-position": (payload: {
    roomId: string;
    matchId: string;
    playerId: string;
    seat: number;
    x: number;
    sequence: number;
    timestamp: number;
  }) => void;

  "chat:message": (message: ChatMessage) => void;
  "chat:emoji": (emoji: ChatEmoji) => void;
  "chat:typing": (payload: { roomId: string; userId: string; senderName: string; typing: boolean }) => void;

  "matchmaking:queued": (payload: { position: number }) => void;
  "matchmaking:found": (payload: { roomId: string }) => void;

  "wallet:updated": (payload: WalletUpdatePayload) => void;

  "latency:ping": (payload: { timestamp: number }, ack: () => void) => void;

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
