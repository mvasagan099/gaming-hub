import type {
  ChatEmoji,
  ChatMessage,
  ErrorCode,
  GameId,
  JsonObject,
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
    payload: { gameId: GameId; isPrivate: boolean; stake: number; maxPlayers?: number },
    ack: Ack<RoomFull>,
  ) => void;

  "room:join": (
    payload: { roomId?: string; code?: string; asSpectator: boolean },
    ack: Ack<RoomFull>,
  ) => void;

  "room:leave": (payload: { roomId: string }, ack: Ack<{ roomId: string }>) => void;

  "room:ready": (payload: { roomId: string; ready: boolean }, ack: Ack<RoomFull>) => void;

  "room:start": (payload: { roomId: string }, ack: Ack<RoomFull>) => void;

  "matchmaking:join": (
    payload: { gameId: GameId; stake: number },
    ack: Ack<{ position: number }>,
  ) => void;

  "matchmaking:leave": (payload: Record<string, never>, ack: Ack<{ left: boolean }>) => void;

  "game:action": (payload: { roomId: string; action: { type: string } & JsonObject }, ack: Ack<GameActionResult>) => void;

  "game:rematch": (payload: { roomId: string }, ack: Ack<RoomFull>) => void;

  "chat:message": (payload: { roomId: string; text: string }, ack: Ack<ChatMessage>) => void;

  "chat:emoji": (payload: { roomId: string; emoji: string }, ack: Ack<{ sent: true }>) => void;
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

  "game:state": (payload: {
    roomId: string;
    matchId: string;
    state: JsonObject;
    seat: number | null;
    events: { type: string }[];
  }) => void;

  "game:over": (payload: {
    roomId: string;
    matchId: string;
    winnerSeats: number[];
    winnerIds: string[];
    state: JsonObject;
  }) => void;

  "chat:message": (message: ChatMessage) => void;
  "chat:emoji": (emoji: ChatEmoji) => void;

  "matchmaking:queued": (payload: { position: number }) => void;
  "matchmaking:found": (payload: { roomId: string }) => void;

  "error": (payload: SocketErrorPayload) => void;
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
