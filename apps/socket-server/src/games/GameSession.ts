import { prisma } from "@gaming-hub/db";
import type { MatchRuntime } from "../rooms/types";

/**
 * Wraps a live engine instance with the persistence side effects that must
 * happen for every accepted action: the move row and the full state snapshot
 * used for reconnect and replay.
 */
export class GameSession {
  readonly match: MatchRuntime;

  constructor(match: MatchRuntime) {
    this.match = match;
  }

  get engine() {
    return this.match.engine;
  }

  get state() {
    return this.match.engine.serialize();
  }

  get turnNumber(): number {
    return this.match.turnNumber;
  }

  async apply(userId: string, seat: number, action: { type: string; [key: string]: unknown }) {
    const result = this.match.engine.apply(action, seat);

    if (result.ok) {
      this.match.turnNumber += 1;
      const turnNumber = this.match.turnNumber;
      const matchId = this.match.matchId;

      // Persist move and state snapshot asynchronously in background so action loop is not blocked by DB latency
      void (async () => {
        try {
          await Promise.all([
            prisma.move.create({
              data: {
                matchId,
                userId,
                seat,
                turnNumber,
                action: action as object,
              },
            }),
            prisma.gameState.upsert({
              where: { matchId },
              create: {
                matchId,
                state: result.state as object,
                turnNumber,
              },
              update: {
                state: result.state as object,
                turnNumber,
              },
            }),
          ]);
        } catch (err) {
          console.error(`[GameSession] Background state persistence failed for match ${matchId}:`, err);
        }
      })();
    }

    return result;
  }
}
