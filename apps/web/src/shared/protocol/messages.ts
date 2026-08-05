export const MessageType = {
  JOIN_ROOM: "JOIN_ROOM",
  ROOM_JOINED: "ROOM_JOINED",
  START_GAME: "START_GAME",
  ROLL_DICE: "ROLL_DICE",
  GAME_STATE: "GAME_STATE",
  PLAYER_DISCONNECTED: "PLAYER_DISCONNECTED",
  RECONNECT: "RECONNECT",
  ERROR: "ERROR",
} as const;

export type MessageType = typeof MessageType[keyof typeof MessageType];

export interface BaseMessage {
  type: MessageType;
  roomId?: string;
  payload?: any;
}

export interface JoinRoomMessage extends BaseMessage {
  type: typeof MessageType.JOIN_ROOM;
  roomId: string;
  name: string;
}

export interface RollDiceMessage extends BaseMessage {
  type: typeof MessageType.ROLL_DICE;
  roomId: string;
}

export interface GameStateMessage extends BaseMessage {
  type: typeof MessageType.GAME_STATE;
  state: any;
}
