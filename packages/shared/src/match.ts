import type { GameId } from "./games";
import type { User } from "./player";

export type MatchStatus = "created" | "active" | "finished" | "aborted";

export type MatchPlayerResult = "pending" | "win" | "loss" | "draw";

export interface MatchPlayer {
  seat: number;
  user: Pick<User, "id" | "username" | "displayName" | "avatarUrl">;
  result: MatchPlayerResult;
  score: number;
}

export interface MatchSummary {
  id: string;
  roomId: string | null;
  gameId: GameId;
  status: MatchStatus;
  winnerIds: string[];
  stake: number;
  startedAt: string | null;
  endedAt: string | null;
}

export interface MatchFull extends MatchSummary {
  players: MatchPlayer[];
  moves: MatchMove[];
}

export interface MatchMove {
  id: string;
  matchId: string;
  userId: string;
  seat: number;
  turnNumber: number;
  action: Record<string, unknown>;
  appliedAt: string;
}

export interface MatchPage {
  items: MatchSummary[];
  total: number;
  page: number;
  pageSize: number;
}
