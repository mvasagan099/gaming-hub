import type { GameId } from "./games";
import type { User } from "./player";

export type RoomStatus = "waiting" | "starting" | "playing" | "ended";

export type ConnectionStatus = "connected" | "disconnected" | "reconnecting";

export interface RoomPlayer extends Pick<User, "id" | "username" | "displayName" | "avatarUrl"> {
  seat: number | null;
  isReady: boolean;
  isHost: boolean;
  isSpectator: boolean;
  connectionStatus: ConnectionStatus;
  joinedAt: string;
}

export interface RoomSummary {
  id: string;
  code: string;
  gameId: GameId;
  hostId: string;
  status: RoomStatus;
  isPrivate: boolean;
  stake: number;
  minPlayers: number;
  maxPlayers: number;
  hasStarted: boolean;
  createdAt: string;
  players: RoomPlayer[];
  spectators: RoomPlayer[];
}

export interface RoomFull extends RoomSummary {
  settings: Record<string, unknown>;
  matchId: string | null;
}

export interface CreateRoomInput {
  gameId: GameId;
  isPrivate: boolean;
  stake: number;
  maxPlayers: number;
}

export interface JoinRoomInput {
  roomId?: string;
  code?: string;
  asSpectator: boolean;
}
