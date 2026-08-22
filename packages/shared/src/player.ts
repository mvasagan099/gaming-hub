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
  isPrivate?: boolean;
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

// ---------------------------------------------------------------------------
// Detailed Public Profile & Game Statistics (Feature 29)
// ---------------------------------------------------------------------------

export interface PublicGameStatistic {
  gameId: string;
  gameName: string;
  icon: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  rating: number;
  bestScore: number;
  rank: number | null;
}

export interface PublicTournamentStatistic {
  tournamentsJoined: number;
  tournamentsCompleted: number;
  wins: number;
  podiums: number;
  bestRank: number | null;
  totalMatches: number;
}

export interface RecentMatchItem {
  matchId: string;
  gameId: string;
  gameName: string;
  icon: string;
  result: "WIN" | "LOSS" | "DRAW";
  score: number;
  opponent: {
    userId: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  } | null;
  endedAt: string;
}

export interface RecentTournamentItem {
  tournamentId: string;
  title: string;
  gameId: string;
  gameName: string;
  icon: string;
  rank: number | null;
  eliminated: boolean;
  endedAt: string | null;
}

export interface DetailedPublicProfile {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  country: string | null;
  level: number;
  xp: number;
  joinedAt: string;
  isOnline: boolean;
  lastSeenAt: string | null;
  isPrivate: boolean;

  // Overall performance stats
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  globalRating: number;

  // Detailed breakdowns
  gameStats: PublicGameStatistic[];
  tournamentStats: PublicTournamentStatistic;
  recentMatches: RecentMatchItem[];
  recentTournaments: RecentTournamentItem[];

  // Achievements
  achievements: {
    unlockedCount: number;
    totalCount: number;
    recent: {
      code: string;
      title: string;
      description: string;
      icon: string;
      unlockedAt: string;
    }[];
  };
}
