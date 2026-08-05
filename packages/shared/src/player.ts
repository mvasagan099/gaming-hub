import type { GameId } from "./games";

export type UserRole = "user" | "admin";

export interface User {
  id: string;
  email: string | null;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: UserRole;
  createdAt: string;
}

export interface Profile {
  userId: string;
  bio: string | null;
  country: string | null;
  coins: number;
  gems: number;
  xp: number;
  level: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface PublicProfile extends Profile {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isOnline: boolean;
  lastSeenAt: string | null;
}

export interface PlayerStatistic {
  userId: string;
  gameId: GameId;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  bestScore: number;
  totalXp: number;
  rating: number;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  gameId: GameId | "overall";
  score: number;
  wins: number;
  gamesPlayed: number;
  winRate: number;
}

export interface FriendRequest {
  id: string;
  requester: PublicProfile;
  addressee: PublicProfile;
  status: "PENDING" | "ACCEPTED" | "BLOCKED";
  createdAt: string;
}
