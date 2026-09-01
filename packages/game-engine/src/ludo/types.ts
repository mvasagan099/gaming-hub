import type { JsonObject } from "@gaming-hub/shared";
import type { BaseState } from "../base/MultiplayerGameEngine";

export type LudoColor = "red" | "blue" | "green" | "yellow";
export type LudoTokenState = "yard" | "active" | "finished";

export type LudoTokenView = JsonObject & {
  id: string;
  color: LudoColor;
  index: number;
  position: number;
  state: LudoTokenState;
};

export type LudoPlayerState = JsonObject & {
  seat: number;
  color: LudoColor;
  name: string;
  tokensDone: number;
  tokens: LudoTokenView[];
};

export type LudoLastMove = JsonObject & {
  tokenId: string;
  from: number;
  to: number;
  isEnter: boolean;
  isCapture: boolean;
  capturedTokenId: string | null;
  isFinish: boolean;
};

export interface LudoServerStateBase {
  players: LudoPlayerState[];
  currentSeat: number;
  dice: number | null;
  consecutiveSixes: number;
  phase: "rolling" | "selecting" | "finished";
  winnerSeats: number[];
  finished: boolean;
  turnCount: number;
  legalMoves: string[];
  lastMove: LudoLastMove | null;
  logs: string[];
}

export type LudoServerState = BaseState & LudoServerStateBase;

export type LudoAction = { type: "roll" } | { type: "move"; tokenId: string };

export function isLudoState(state: JsonObject): state is LudoServerState {
  return state.phase !== undefined && Array.isArray(state.players) && "legalMoves" in state;
}
