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
      await prisma.move.create({
        data: {
          matchId: this.match.matchId,
          userId,
          seat,
          turnNumber: this.match.turnNumber,
          action: action as object,
        },
      });
      await prisma.gameState.upsert({
        where: { matchId: this.match.matchId },
        create: {
          matchId: this.match.matchId,
          state: result.state as object,
          turnNumber: this.match.turnNumber,
        },
        update: {
          state: result.state as object,
          turnNumber: this.match.turnNumber,
        },
      });
    }

    return result;
  }
}
