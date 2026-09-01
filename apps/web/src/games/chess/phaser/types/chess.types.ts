export type PieceType = "p" | "r" | "n" | "b" | "q" | "k";
export type PieceColor = "w" | "b";
export type BoardTheme = "classic" | "wood" | "cyber";

export interface ChessPiece {
  id: string; // e.g. "w-p-0"
  type: PieceType;
  color: PieceColor;
  square: string; // e.g. "e4"
}

export interface ChessGameState {
  fen: string;
  turn: PieceColor;
  isCheck: boolean;
  isCheckmate: boolean;
  isDraw: boolean;
  isStalemate: boolean;
  isThreefoldRepetition: boolean;
  captured: {
    w: PieceType[];
    b: PieceType[];
  };
}

export interface ChessMove {
  from: string; // e.g. "e2"
  to: string;   // e.g. "e4"
  promotion?: PieceType;
}

export interface ChessHistoryEntry {
  san: string;
  from: string;
  to: string;
  color: PieceColor;
  piece: PieceType;
}

export interface ChessSettings {
  mode: "ai" | "pvp";
  aiLevel: number; // 1 (easy), 2 (medium), 3 (hard)
  theme: BoardTheme;
  flipBoard: boolean;
}
