export const SocketEvents = {
  JOIN_ROOM: "join-room",
  PLAYER_JOINED: "player-joined",
  START_GAME: "start-game",
  ROLL_DICE: "roll-dice",
  DICE_RESULT: "dice-result",
  MOVE_PLAYER: "move-player",
  TURN_CHANGED: "turn-changed",
  GAME_OVER: "game-over",
  PLAYER_LEFT: "player-left",
} as const;

export type SocketEvents = typeof SocketEvents[keyof typeof SocketEvents];
