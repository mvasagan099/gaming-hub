export type ChessColor = "w" | "b";
export type ChessPieceType = "p" | "n" | "b" | "r" | "q" | "k";

const PIECE_GLYPHS: Record<ChessColor, Record<ChessPieceType, string>> = {
  w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" },
  b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" },
};

export function chessPieceGlyph(color: ChessColor, piece: ChessPieceType): string {
  return PIECE_GLYPHS[color][piece];
}

export interface ChessParticipant {
  userId: string;
  seat: number;
  color: ChessColor;
}

/** The board camera changes; logical FEN squares and piece colors do not. */
export function orientationForChessColor(color: ChessColor | null | undefined): "white" | "black" {
  return color === "b" ? "black" : "white";
}

/** Resolve identity and color from the server's match assignment, never array order. */
export function resolveChessParticipants(
  players: readonly ChessParticipant[] | undefined,
  userId: string | null | undefined,
): { local: ChessParticipant; opponent: ChessParticipant } | null {
  if (!userId || !players) return null;
  const local = players.find((player) => player.userId === userId);
  if (!local) return null;
  const opponent = players.find((player) => player.color !== local.color);
  return opponent ? { local, opponent } : null;
}

export function pairChessHistory(history: readonly string[]): Array<{ num: number; white: string; black?: string }> {
  const pairs: Array<{ num: number; white: string; black?: string }> = [];
  for (let i = 0; i < history.length; i += 2) {
    pairs.push({ num: i / 2 + 1, white: history[i]!, black: history[i + 1] });
  }
  return pairs;
}
