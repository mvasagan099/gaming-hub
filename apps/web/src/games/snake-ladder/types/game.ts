export type PlayerId = 'player1' | 'player2';

export interface PlayerState {
  id: PlayerId;
  name: string;
  avatar: string;
  color: string;
  position: number;
  isAI: boolean;
}

export interface SnakeOrLadder {
  from: number;
  to: number;
}

export interface GameState {
  players: PlayerState[];
  currentTurnIndex: number;
  diceValue: number;
  isRolling: boolean;
  isMoving: boolean;
  winner: PlayerState | null;
  logs: string[];
}
