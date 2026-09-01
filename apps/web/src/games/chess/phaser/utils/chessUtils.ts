import { Chess } from "chess.js";
import type { ChessPiece, PieceType } from "../types/chess.types";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

const FULL_SET: PieceType[] = ["p","p","p","p","p","p","p","p","r","r","n","n","b","b","q","k"];

/**
 * Convert a FEN string into the ChessPiece[] list consumed by PieceManager.
 * IDs are stable within a single snapshot (color-type-index).
 */
export function fenToPieces(fen: string): ChessPiece[] {
  const chess = new Chess(fen);
  const pieces: ChessPiece[] = [];
  let wCount = 0;
  let bCount = 0;

  const boardState = chess.board();
  for (let r = 0; r < 8; r++) {
    const row = boardState[r];
    if (!row) continue;
    for (let c = 0; c < 8; c++) {
      const item = row[c];
      if (!item) continue;
      const square = (FILES[c] ?? "") + (RANKS[r] ?? "");
      const id = `${item.color}-${item.type}-${item.color === "w" ? wCount++ : bCount++}`;
      pieces.push({ id, type: item.type, color: item.color, square });
    }
  }

  return pieces;
}

/** Compute the list of pieces each side has captured. */
export function computeCaptures(chess: Chess): { w: PieceType[]; b: PieceType[] } {
  const active: Record<"w" | "b", PieceType[]> = { w: [], b: [] };
  for (const row of chess.board()) {
    for (const item of row) {
      if (item) active[item.color].push(item.type);
    }
  }

  const removeOne = (arr: PieceType[], val: PieceType) => {
    const idx = arr.indexOf(val);
    if (idx !== -1) arr.splice(idx, 1);
  };

  const capturedW = [...FULL_SET];
  active.w.forEach((p) => removeOne(capturedW, p));

  const capturedB = [...FULL_SET];
  active.b.forEach((p) => removeOne(capturedB, p));

  return { w: capturedW, b: capturedB };
}
