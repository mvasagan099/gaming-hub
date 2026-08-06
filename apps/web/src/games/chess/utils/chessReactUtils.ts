import { Chess } from "chess.js";
import type { ChessTimeControlConfig } from "@gaming-hub/shared";

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Formats milliseconds into "MM:SS" or "MM:SS:ms". */
export function formatClock(ms: number): string {
  if (ms < 0) return "0:00";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  const secStr = String(sec).padStart(2, "0");
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    return `${String(min).padStart(2, "0")}:${secStr}`;
  }
  return `${m}:${secStr}`;
}

/** Computes live remaining from a clock snapshot and client wall time. */
export function liveRemainingMs(
  clock: { remainingMs: number; startedAtMs: number | null },
  now: number,
): number {
  if (clock.startedAtMs == null) return clock.remainingMs;
  const elapsed = Math.max(0, now - clock.startedAtMs);
  return Math.max(0, clock.remainingMs - elapsed);
}

/** Material evaluation in centipawns (white-positive) from a FEN or Chess instance. */
export function materialEval(fenOrChess: string | Chess): number {
  const c = typeof fenOrChess === "string" ? new Chess(fenOrChess) : fenOrChess;
  let score = 0;
  for (const row of c.board()) {
    for (const item of row) {
      if (item) {
        const value = PIECE_VALUES[item.type] ?? 0;
        score += item.color === "w" ? value : -value;
      }
    }
  }
  return score * 100; // centipawns
}

/** Builds a compact PGN from a SAN history (no move numbers, just SANs). */
export function buildPgn(history: string[]): string {
  return history.join(" ");
}

/**
 * Returns the FEN at a given ply (0-based) from an initial FEN and history.
 */
export function fenAtPly(initialFen: string, history: string[], plyIndex: number): string {
  const chess = new Chess(initialFen);
  const count = Math.min(plyIndex + 1, history.length);
  for (let i = 0; i < count; i++) {
    const san = history[i];
    const match = chess.move({ san });
    if (!match) break;
  }
  return chess.fen();
}

/** Returns true if the given time control config is untimed (baseSeconds <= 0). */
export function isUntimed(tc: ChessTimeControlConfig | null | undefined): boolean {
  return !tc || tc.baseSeconds <= 0;
}
