export interface Snake {
  from: number;
  to: number;
}

export interface Ladder {
  from: number;
  to: number;
}

export interface PlayerData {
  id: number;
  name: string;
  avatar: string;
  color: string;
  position: number;
  isAI: boolean;
}

export interface SnakeLadderState {
  currentPlayer: number;
  dice: number;
  isRolling: boolean;
  isMoving: boolean;
  winner?: number;
  players: [PlayerData, PlayerData];
  logs: string[];
}
