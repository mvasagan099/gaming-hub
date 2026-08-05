export interface UserProfile {
  id: string;
  username: string;
  avatar: string;
  coins: number;
  gems: number;
  level: number;
  xp: number;
  wins: number;
  losses: number;
}

export type GameId = 
  | 'ludo' 
  | 'chess' 
  | 'carrom' 
  | 'snake-ladder' 
  | 'fruit-ninja' 
  | 'bubble-shooter' 
  | 'table-tennis' 
  | 'snake-vs-worms' 
  | 'cricket';

export interface GameMetadata {
  id: GameId;
  title: string;
  category: 'Strategy' | 'Arcade' | 'Sports' | 'Board';
  description: string;
  players: string;
  minEntryFee: number;
  rating: number;
  thumbnailUrl: string;
  bgGradient: string;
  isHot?: boolean;
  isNew?: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  avatar: string;
  score: number;
  coinsWon: number;
}

export interface ChatMessage {
  id: string;
  sender: string;
  avatar: string;
  text: string;
  timestamp: string;
  isSystem?: boolean;
}

export interface Tournament {
  id: string;
  gameId: GameId;
  title: string;
  prizePool: number;
  entryFee: number;
  registeredCount: number;
  maxPlayers: number;
  startTime: string;
  status: 'UPCOMING' | 'LIVE' | 'ENDED';
}
