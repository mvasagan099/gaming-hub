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
  connectionStatus: "connected" | "disconnected" | "reconnecting";
  socketIds: Set<string>;
  joinedAt: number;
}

export interface MatchRuntime {
  matchId: string;
  engine: EngineInstance;
  turnNumber: number;
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
}
