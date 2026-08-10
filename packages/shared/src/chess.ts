/**
 * Chess-specific shared types: the two game modes and their time controls,
 * used by the client (setup UI + clock rendering) and the server engine
 * (authoritative clocks).
 */

/** A serializable clock configuration. `null`/absent means untimed play. */
export type ChessTimeControlConfig = {
  /** Initial time each player receives, in seconds. */
  baseSeconds: number;
  /** Fischer increment added after every completed move, in seconds. */
  incrementSeconds: number;
  /** Simple delay before the clock starts ticking on each turn, in seconds. */
  delaySeconds: number;
};

export type ChessTimeControlPreset = ChessTimeControlConfig & {
  /** Human-friendly label, e.g. "10 Minutes". */
  label: string;
};

export const TEN_MINUTES_TIME_CONTROL: ChessTimeControlPreset = {
  label: "10 Minutes",
  baseSeconds: 600,
  incrementSeconds: 0,
  delaySeconds: 0,
};

export const UNLIMITED_TIME_CONTROL: ChessTimeControlPreset = {
  label: "Checkmate",
  baseSeconds: 0,
  incrementSeconds: 0,
  delaySeconds: 0,
};

/** The only two time controls the product offers. */
export const CHESS_TIME_CONTROLS: readonly ChessTimeControlPreset[] = [
  TEN_MINUTES_TIME_CONTROL,
  UNLIMITED_TIME_CONTROL,
];

export const DEFAULT_TIME_CONTROL: ChessTimeControlPreset = TEN_MINUTES_TIME_CONTROL;

/** The two supported chess game modes. */
export type ChessGameMode = "ten-minutes" | "checkmate";

export interface ChessGameModeDefinition {
  id: ChessGameMode;
  label: string;
  description: string;
  timeControl: ChessTimeControlConfig;
}

export const CHESS_GAME_MODES: readonly ChessGameModeDefinition[] = [
  {
    id: "ten-minutes",
    label: "10 Minutes",
    description: "Each player gets 10 minutes on the clock",
    timeControl: TEN_MINUTES_TIME_CONTROL,
  },
  {
    id: "checkmate",
    label: "Checkmate",
    description: "No clock — play until checkmate",
    timeControl: UNLIMITED_TIME_CONTROL,
  },
];

export function chessModeOf(id: ChessGameMode): ChessGameModeDefinition | undefined {
  return CHESS_GAME_MODES.find((m) => m.id === id);
}

/** Maps a time control config to the game mode it represents. */
export function chessModeId(control: ChessTimeControlConfig | null | undefined): ChessGameMode {
  if (!control || control.baseSeconds <= 0) return "checkmate";
  return "ten-minutes";
}

/** Stable string key used for matchmaking buckets so different modes never pair. */
export function timeControlKey(control: ChessTimeControlConfig | null | undefined): string {
  if (!control || control.baseSeconds <= 0) return "checkmate";
  return "10-minutes";
}

/** Formats a clock config like a chess site would, e.g. "10", "3+2". */
export function formatTimeControl(control: ChessTimeControlConfig | null | undefined): string {
  if (!control || control.baseSeconds <= 0) return "∞";
  const base = String(control.baseSeconds);
  if (control.incrementSeconds > 0) return `${base}+${control.incrementSeconds}`;
  return base;
}
