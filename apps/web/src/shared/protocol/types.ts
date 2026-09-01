export interface PlayerInfo {
  id: string;
  name: string;
}

export interface PlayerState {
  id: string;
  name?: string;
  position: number;
}

export interface GameState {
  roomId: string;
  players: PlayerState[];
  currentTurn: string;
  winner?: string;
  dice?: number;
  logs?: string[];
}
