import type { Chess, Square } from "chess.js";

// Simplified piece-square values for positional weights
const PAWN_VALS = [
  [0.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0],
  [5.0,  5.0,  5.0,  5.0,  5.0,  5.0,  5.0,  5.0],
  [1.0,  1.0,  2.0,  3.0,  3.0,  2.0,  1.0,  1.0],
  [0.5,  0.5,  1.0,  2.5,  2.5,  1.0,  0.5,  0.5],
  [0.0,  0.0,  0.0,  2.0,  2.0,  0.0,  0.0,  0.0],
  [0.5, -0.5, -1.0,  0.0,  0.0, -1.0, -0.5,  0.5],
  [0.5,  1.0, 1.0,  -2.0, -2.0,  1.0,  1.0,  0.5],
  [0.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0]
];

const KNIGHT_VALS = [
  [-5.0, -4.0, -3.0, -3.0, -3.0, -3.0, -4.0, -5.0],
  [-4.0, -2.0,  0.0,  0.0,  0.0,  0.0, -2.0, -4.0],
  [-3.0,  0.0,  1.0,  1.5,  1.5,  1.0,  0.0, -3.0],
  [-3.0,  0.5,  1.5,  2.0,  2.0,  1.5,  0.5, -3.0],
  [-3.0,  0.0,  1.5,  2.0,  2.0,  1.5,  0.0, -3.0],
  [-3.0,  0.5,  1.0,  1.5,  1.5,  1.0,  0.5, -3.0],
  [-4.0, -2.0,  0.0,  0.5,  0.5,  0.0, -2.0, -4.0],
  [-5.0, -4.0, -3.0, -3.0, -3.0, -3.0, -4.0, -5.0]
];

const BISHOP_VALS = [
  [-2.0, -1.0, -1.0, -1.0, -1.0, -1.0, -1.0, -2.0],
  [-1.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0, -1.0],
  [-1.0,  0.0,  0.5,  1.0,  1.0,  0.5,  0.0, -1.0],
  [-1.0,  0.5,  0.5,  1.0,  1.0,  0.5,  0.5, -1.0],
  [-1.0,  0.0,  1.0,  1.0,  1.0,  1.0,  0.0, -1.0],
  [-1.0,  1.0,  1.0,  1.0,  1.0,  1.0,  1.0, -1.0],
  [-1.0,  0.5,  0.0,  0.0,  0.0,  0.0,  0.5, -1.0],
  [-2.0, -1.0, -1.0, -1.0, -1.0, -1.0, -1.0, -2.0]
];

const ROOK_VALS = [
  [0.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0],
  [0.5,  1.0,  1.0,  1.0,  1.0,  1.0,  1.0,  0.5],
  [-0.5, 0.0,  0.0,  0.0,  0.0,  0.0,  0.0, -0.5],
  [-0.5, 0.0,  0.0,  0.0,  0.0,  0.0,  0.0, -0.5],
  [-0.5, 0.0,  0.0,  0.0,  0.0,  0.0,  0.0, -0.5],
  [-0.5, 0.0,  0.0,  0.0,  0.0,  0.0,  0.0, -0.5],
  [-0.5, 0.0,  0.0,  0.0,  0.0,  0.0,  0.0, -0.5],
  [0.0,  0.0,  0.0,  0.5,  0.5,  0.0,  0.0,  0.0]
];

const QUEEN_VALS = [
  [-2.0, -1.0, -1.0, -0.5, -0.5, -1.0, -1.0, -2.0],
  [-1.0,  0.0,  0.0,  0.0,  0.0,  0.0,  0.0, -1.0],
  [-1.0,  0.0,  0.5,  0.5,  0.5,  0.5,  0.0, -1.0],
  [-0.5,  0.0,  0.5,  0.5,  0.5,  0.5,  0.0, -0.5],
  [0.0,   0.0,  0.5,  0.5,  0.5,  0.5,  0.0, -0.5],
  [-1.0,  0.5,  0.5,  0.5,  0.5,  0.5,  0.0, -1.0],
  [-1.0,  0.0,  0.5,  0.0,  0.0,  0.5,  0.0, -1.0],
  [-2.0, -1.0, -1.0, -0.5, -0.5, -1.0, -1.0, -2.0]
];

const KING_VALS_MIDDLE = [
  [-3.0, -4.0, -4.0, -5.0, -5.0, -4.0, -4.0, -3.0],
  [-3.0, -4.0, -4.0, -5.0, -5.0, -4.0, -4.0, -3.0],
  [-3.0, -4.0, -4.0, -5.0, -5.0, -4.0, -4.0, -3.0],
  [-3.0, -4.0, -4.0, -5.0, -5.0, -4.0, -4.0, -3.0],
  [-2.0, -3.0, -3.0, -4.0, -4.0, -3.0, -3.0, -2.0],
  [-1.0, -2.0, -2.0, -2.0, -2.0, -2.0, -2.0, -1.0],
  [2.0,  2.0,  0.0,  0.0,  0.0,  0.0,  2.0,  2.0],
  [2.0,  3.0,  1.0,  0.0,  0.0,  1.0,  3.0,  2.0]
];

const VALUE_MAP = { p: 10, r: 50, n: 30, b: 30, q: 90, k: 9000 };

export class ChessAI {
  /**
   * Find the best move for the active turn player.
   * depth: 1 (easy), 2 (medium), 3 (hard)
   */
  findBestMove(chess: Chess, level: number): string | null {
    const moves = chess.moves({ verbose: true });
    if (moves.length === 0) return null;

    if (level === 1) {
      // Easy: Random move
      const randomMove = moves[Math.floor(Math.random() * moves.length)];
      return randomMove ? randomMove.san : null;
    }

    // Medium/Hard: Minimax search
    // Increase depth to make AI smarter (was previously 2 or 3, which is too shallow)
    const depth = level === 2 ? 3 : (level === 3 ? 4 : 3);
    let bestMove = moves[0]!;
    let bestVal = chess.turn() === "w" ? -Infinity : Infinity;
    let alpha = -Infinity;
    let beta = Infinity;

    for (const move of moves) {
      chess.move(move);
      const val = this.minimax(chess, depth - 1, alpha, beta, chess.turn() === "w");
      chess.undo();

      if (chess.turn() === "w") {
        if (val > bestVal) {
          bestVal = val;
          bestMove = move;
        }
        alpha = Math.max(alpha, bestVal);
      } else {
        if (val < bestVal) {
          bestVal = val;
          bestMove = move;
        }
        beta = Math.min(beta, bestVal);
      }
    }

    return bestMove.san;
  }

  private minimax(
    chess: Chess,
    depth: number,
    alpha: number,
    beta: number,
    isMaximizing: boolean
  ): number {
    if (chess.isGameOver()) {
      if (chess.isCheckmate()) {
        // If it's White's turn and they are in checkmate, White lost.
        // Add depth to prefer faster mates and delay getting mated.
        return chess.turn() === "w" ? -9999 - depth : 9999 + depth;
      }
      return 0; // Draw
    }

    if (depth === 0) {
      return this.evaluateBoard(chess);
    }

    const moves = chess.moves({ verbose: true });
    
    // Move Ordering: Evaluate captures and promotions first to maximize pruning
    moves.sort((a, b) => {
      const scoreA = (a.captured ? 10 : 0) + (a.promotion ? 5 : 0);
      const scoreB = (b.captured ? 10 : 0) + (b.promotion ? 5 : 0);
      return scoreB - scoreA;
    });

    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const move of moves) {
        chess.move(move);
        const score = this.minimax(chess, depth - 1, alpha, beta, false);
        chess.undo();
        maxEval = Math.max(maxEval, score);
        alpha = Math.max(alpha, score);
        if (beta <= alpha) break; // Pruning
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const move of moves) {
        chess.move(move);
        const score = this.minimax(chess, depth - 1, alpha, beta, true);
        chess.undo();
        minEval = Math.min(minEval, score);
        beta = Math.min(beta, score);
        if (beta <= alpha) break; // Pruning
      }
      return minEval;
    }
  }

  private evaluateBoard(chess: Chess): number {
    let score = 0;
    const board = chess.board();

    for (let r = 0; r < 8; r++) {
      const row = board[r];
      if (!row) continue;
      for (let c = 0; c < 8; c++) {
        const item = row[c];
        if (!item) continue;

        const pieceVal = VALUE_MAP[item.type];
        const positionWeight = this.getPosWeight(item.type, item.color, r, c);
        const sign = item.color === "w" ? 1 : -1;

        score += sign * (pieceVal + positionWeight);
      }
    }

    return score;
  }

  private getPosWeight(type: string, color: string, row: number, col: number): number {
    // Invert row index for black pieces positional weights
    const r = color === "w" ? row : 7 - row;

    switch (type) {
      case "p": return PAWN_VALS[r]?.[col] ?? 0;
      case "n": return KNIGHT_VALS[r]?.[col] ?? 0;
      case "b": return BISHOP_VALS[r]?.[col] ?? 0;
      case "r": return ROOK_VALS[r]?.[col] ?? 0;
      case "q": return QUEEN_VALS[r]?.[col] ?? 0;
      case "k": return KING_VALS_MIDDLE[r]?.[col] ?? 0;
      default: return 0;
    }
  }
}

export default ChessAI;
