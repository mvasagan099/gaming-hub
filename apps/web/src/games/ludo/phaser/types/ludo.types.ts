// ─── Player & Token ──────────────────────────────────────────────────────────

export type PlayerColor = "red" | "blue" | "green" | "yellow";
export type TokenState  = "yard" | "active" | "finished";
export type GamePhase   = "waiting" | "rolling" | "selecting" | "moving" | "over";
export type GameMode    = "ai" | "pvp" | "multiplayer";
export type AIDifficulty = "easy" | "medium" | "hard";

export interface Token {
  id: string;            // e.g. "red-0", "blue-2"
  color: PlayerColor;
  index: number;         // 0–3 within that color
  /** Global board position.
   *  -1  = in the yard (not yet entered)
   *  0–51 = main circular path
   *  52–57 = color-specific home column (52=entry, 57=home)
   */
  position: number;
  state: TokenState;
}

export interface Player {
  id: number;            // 0–3
  color: PlayerColor;
  name: string;
  tokens: Token[];
  isAI: boolean;
  difficulty: AIDifficulty;
  tokensDone: number;    // tokens that reached home (state === "finished")
}

// ─── Game State ───────────────────────────────────────────────────────────────

export interface LudoGameState {
  players: Player[];
  activePlayers: PlayerColor[];   // colors actually in the game (2 or 4)
  currentPlayerIndex: number;
  dice: number;
  consecutiveSixes: number;
  phase: GamePhase;
  winner: PlayerColor | null;
  turnCount: number;
}

// ─── Move ─────────────────────────────────────────────────────────────────────

export interface TokenMove {
  token: Token;
  fromPosition: number;
  toPosition: number;
  isEnter: boolean;      // enters board from yard (requires 6)
  isCapture: boolean;
  capturedToken?: Token;
  isFinish: boolean;     // reaches home (position 57)
  isSafe: boolean;       // lands on safe tile
}

// ─── Settings ────────────────────────────────────────────────────────────────

export interface LudoSettings {
  playerCount: 2 | 4;
  mode: GameMode;
  allowThreeSixRule: boolean;  // 3 consecutive 6 = forfeit turn
  allowStacking: boolean;      // multiple tokens on same tile
  turnTimeoutMs: number;       // 0 = no limit
  aiDifficulty: AIDifficulty;
}

export const DEFAULT_SETTINGS: LudoSettings = {
  playerCount: 4,
  mode: "ai",
  allowThreeSixRule: true,
  allowStacking: true,
  turnTimeoutMs: 0,
  aiDifficulty: "medium",
};

// ─── Events payload types ─────────────────────────────────────────────────────

export interface DiceRolledPayload    { value: number; playerId: number; }
export interface TokenMovedPayload    { token: Token; path: number[]; }
export interface TokenCapturedPayload { attacker: Token; captured: Token; }
export interface TurnChangedPayload   { playerIndex: number; color: PlayerColor; }
export interface GameOverPayload      { winner: PlayerColor; playerName: string; }
