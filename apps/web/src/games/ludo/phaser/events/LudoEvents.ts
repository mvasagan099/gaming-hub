export const LudoEvents = {
  // Dice
  DICE_ROLL_STARTED:   "ludo:dice-roll-started",
  DICE_ROLLED:         "ludo:dice-rolled",

  // Turn
  TURN_CHANGED:        "ludo:turn-changed",
  TURN_TIMEOUT:        "ludo:turn-timeout",

  // Token
  TOKEN_SELECTED:      "ludo:token-selected",
  TOKEN_MOVED:         "ludo:token-moved",
  TOKEN_ENTERED:       "ludo:token-entered",
  TOKEN_CAPTURED:      "ludo:token-captured",
  TOKEN_SAFE:          "ludo:token-safe",
  TOKEN_FINISHED:      "ludo:token-finished",

  // Game
  GAME_OVER:           "ludo:game-over",
  VALID_MOVES_READY:   "ludo:valid-moves-ready",
  NO_VALID_MOVES:      "ludo:no-valid-moves",

  // UI
  HIGHLIGHT_TOKENS:    "ludo:highlight-tokens",
  CLEAR_HIGHLIGHTS:    "ludo:clear-highlights",
} as const;

export type LudoEventType = (typeof LudoEvents)[keyof typeof LudoEvents];
