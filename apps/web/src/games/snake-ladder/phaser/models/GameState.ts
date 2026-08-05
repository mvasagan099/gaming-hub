export const GameState = {
  INITIALIZE: 0,
  WAIT_FOR_ROLL: 1,
  ROLLING_DICE: 2,
  MOVING_PLAYER: 3,
  CHECK_SNAKE_LADDER: 4,
  CHECK_WIN: 5,
  NEXT_PLAYER: 6,
  GAME_OVER: 7,
} as const;

export type GameState = typeof GameState[keyof typeof GameState];

export interface PlayerModel {
  id: number;
  name: string;
  position: number;
  finished: boolean;
  color: number;
  avatar: string;
}

export interface DiceModel {
  value: number;
  rolling: boolean;
}

export interface SerializableState {
  state: GameState;
  currentPlayerIdx: number;
  players: { id: number; position: number; finished: boolean }[];
  dice: number;
}
