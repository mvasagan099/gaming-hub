export const ChessEvents = {
  // Turn & Game Play
  MOVE_MADE:        "chess:move-made",
  PIECE_SELECTED:   "chess:piece-selected",
  SQUARE_CLICKED:   "chess:square-clicked",
  PROMOTION_NEEDED: "chess:promotion-needed",
  PROMOTION_CHOSEN: "chess:promotion-chosen",

  // Game End Status
  CHECK:            "chess:check",
  CHECKMATE:        "chess:checkmate",
  DRAW:             "chess:draw",
  GAME_OVER:        "chess:game-over",

  // Replay (server state to Phaser board for move-by-move view)
  REPLAY_FEN:       "chess:replay-fen",
  REPLAY_EXIT:      "chess:replay-exit",

  // Settings
  THEME_CHANGED:    "chess:theme-changed",
  BOARD_FLIPPED:    "chess:board-flipped",
} as const;

export type ChessEventType = (typeof ChessEvents)[keyof typeof ChessEvents];
export default ChessEvents;
