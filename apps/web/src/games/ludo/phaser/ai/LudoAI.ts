import type { LudoGameState, TokenMove, PlayerColor } from "../types/ludo.types";
import { HOME_COL_BASE } from "../data/boardLayout";

export class LudoAI {
  /**
   * Choose a move based on difficulty.
   */
  chooseMove(
    state: LudoGameState,
    legalMoves: TokenMove[],
    difficulty: "easy" | "medium" | "hard"
  ): TokenMove | null {
    if (legalMoves.length === 0) return null;
    if (legalMoves.length === 1) return legalMoves[0]!;

    switch (difficulty) {
      case "easy":
        return this.chooseRandomMove(legalMoves);
      case "medium":
        return this.chooseMediumMove(legalMoves);
      case "hard":
        return this.chooseHardMove(state, legalMoves);
    }
  }

  private chooseRandomMove(legalMoves: TokenMove[]): TokenMove {
    const idx = Math.floor(Math.random() * legalMoves.length);
    return legalMoves[idx]!;
  }

  private chooseMediumMove(legalMoves: TokenMove[]): TokenMove {
    // Priority 1: Captures
    const captures = legalMoves.filter((m) => m.isCapture);
    if (captures.length > 0) return this.chooseRandomMove(captures);

    // Priority 2: Unlocking/Entering tokens from the yard
    const enters = legalMoves.filter((m) => m.isEnter);
    if (enters.length > 0) return this.chooseRandomMove(enters);

    // Priority 3: Reaching home/finish
    const finishes = legalMoves.filter((m) => m.isFinish);
    if (finishes.length > 0) return this.chooseRandomMove(finishes);

    // Priority 4: Standard forward movement (prefer token furthest along path)
    return this.chooseFarthestMove(legalMoves);
  }

  private chooseHardMove(state: LudoGameState, legalMoves: TokenMove[]): TokenMove {
    let bestMove = legalMoves[0]!;
    let bestScore = -Infinity;

    for (const move of legalMoves) {
      let score = 0;

      // 1. Capture is highly beneficial
      if (move.isCapture) score += 100;

      // 2. Entering a token onto the board is good early on
      if (move.isEnter) score += 40;

      // 3. Reaching the home destination
      if (move.isFinish) score += 80;

      // 4. Moving to a safe tile
      if (move.isSafe) score += 20;

      // 5. Prefer moving tokens that are already far along to complete them
      score += move.fromPosition * 0.5;

      // 6. Danger avoidance: Check if ending position puts this token in immediate danger
      if (this.isTileThreatened(state, move.toPosition, move.token.color)) {
        score -= 50;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove;
  }

  private chooseFarthestMove(legalMoves: TokenMove[]): TokenMove {
    let best = legalMoves[0]!;
    for (const m of legalMoves) {
      if (m.fromPosition > best.fromPosition) {
        best = m;
      }
    }
    return best;
  }

  private isTileThreatened(state: LudoGameState, pos: number, ownColor: string): boolean {
    // Home column is safe
    if (pos >= HOME_COL_BASE[ownColor as PlayerColor]) return false;

    // Check distance of opponent tokens behind this position
    for (const player of state.players) {
      if (player.color === ownColor) continue;
      for (const t of player.tokens) {
        if (t.state !== "active") continue;
        const dist = (pos - t.position + 52) % 52;
        if (dist >= 1 && dist <= 6) return true;
      }
    }
    return false;
  }
}

export default LudoAI;
