/**
 * Chess-specific shared types: time controls and presets used by the client
 * (setup UI + clock rendering) and the server engine (authoritative clocks).
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
  /** Human-friendly label, e.g. "Blitz • 5+3". */
  label: string;
  /** Short category used for grouping, e.g. "Bullet". */
  category: "Bullet" | "Blitz" | "Rapid" | "Classical";
};

export const UNLIMITED_TIME_CONTROL: ChessTimeControlPreset = {
  label: "Unlimited",
  category: "Classical",
  baseSeconds: 0,
  incrementSeconds: 0,
  delaySeconds: 0,
};

export const CHESS_TIME_CONTROLS: readonly ChessTimeControlPreset[] = [
  { label: "Bullet • 1", category: "Bullet", baseSeconds: 60, incrementSeconds: 0, delaySeconds: 0 },
  { label: "Bullet • 2+1", category: "Bullet", baseSeconds: 120, incrementSeconds: 1, delaySeconds: 0 },
  { label: "Blitz • 3+2", category: "Blitz", baseSeconds: 180, incrementSeconds: 2, delaySeconds: 0 },
  { label: "Blitz • 5", category: "Blitz", baseSeconds: 300, incrementSeconds: 0, delaySeconds: 0 },
  { label: "Blitz • 5+3", category: "Blitz", baseSeconds: 300, incrementSeconds: 3, delaySeconds: 0 },
  { label: "Rapid • 10", category: "Rapid", baseSeconds: 600, incrementSeconds: 0, delaySeconds: 0 },
  { label: "Rapid • 15+10", category: "Rapid", baseSeconds: 900, incrementSeconds: 10, delaySeconds: 0 },
  { label: "Classical • 30", category: "Classical", baseSeconds: 1800, incrementSeconds: 0, delaySeconds: 0 },
];

export const DEFAULT_TIME_CONTROL: ChessTimeControlPreset = CHESS_TIME_CONTROLS[3]; // Blitz • 5

/** Stable string key used for matchmaking buckets so different controls never pair. */
export function timeControlKey(control: ChessTimeControlConfig | null | undefined): string {
  if (!control || control.baseSeconds <= 0) return "unlimited";
  return `${control.baseSeconds}+${control.incrementSeconds}/${control.delaySeconds}`;
}

/** Formats a clock config like a chess site would, e.g. "10", "3+2", "15+10". */
export function formatTimeControl(control: ChessTimeControlConfig | null | undefined): string {
  if (!control || control.baseSeconds <= 0) return "∞";
  const base = String(control.baseSeconds);
  if (control.incrementSeconds > 0) return `${base}+${control.incrementSeconds}`;
  return base;
}
