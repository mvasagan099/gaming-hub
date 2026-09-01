export const GameEvents = {
  DICE_ROLLED:        "dice-rolled",
  DICE_ROLL_STARTED:  "dice-roll-started",
  TURN_CHANGED:       "turn-changed",
  GAME_OVER:          "game-over",
  MOVEMENT_STARTED:   "movement-started",
  MOVEMENT_FINISHED:  "movement-finished",
  TILE_REACHED:       "tile-reached",
  SNAKE_HIT:          "snake-hit",
  LADDER_CLIMB:       "ladder-climb",
  PLAYER_WIN:         "player-win",
} as const;

export type GameEventType = (typeof GameEvents)[keyof typeof GameEvents];
