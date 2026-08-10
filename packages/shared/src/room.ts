import type { GameId } from "./games";
import type { User } from "./player";
import type { ChessTimeControlConfig } from "./chess";

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

export type MatchSettings = {
  /** Chess time control. Absent for games without clocks. */
  timeControl?: ChessTimeControlConfig | null;
  /** Rating-affecting match. Defaults to true when absent. */
  rated?: boolean;
  /** Player count for games that support 2 or 4 players (e.g., Ludo, Snake & Ladder) */
  playerCount?: 2 | 4;
};

export interface CreateRoomInput {
  gameId: GameId;
  isPrivate: boolean;
  stake: number;
  maxPlayers: number;
  settings?: MatchSettings;
}

export interface JoinRoomInput {
  roomId?: string;
  code?: string;
  asSpectator: boolean;
}
