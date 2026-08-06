import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import { applyTransaction } from "./wallet";
import { recordMatchResult } from "./stats";
import { checkAndUnlock } from "./achievements";
import { createNotification } from "./notifications";

/** 10% house rake, matching the client's prize pool of stake * 1.8 (2 players). */
export const PAYOUT_RATE = 0.9;

/**
 * Debits each player's entry stake once at match start. Idempotent: only
 * matches in CREATED status can be held, and they are moved to ACTIVE here.
 */
export async function holdMatchWagers(matchId: string) {
  return prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({
      where: { id: matchId },
      include: { players: true },
    });
    if (!match) {
      throw new AppError("NOT_FOUND", "Match not found", 404);
    }
    if (match.status !== "CREATED") {
      return match;
    }

    for (const player of match.players) {
      await applyTransaction(tx, player.userId, -match.stake, "MATCH_WAGER", match.id, {
        gameId: match.gameId,
      });
    }

    return tx.match.update({
      where: { id: matchId },
      data: { status: "ACTIVE", startedAt: new Date() },
    });
  });
}

export interface SettlementResult {
  matchId: string;
  winners: string[];
  payouts: { userId: string; amount: number }[];
  newlyUnlocked: { code: string; title: string; icon: string }[];
}

/**
 * Settles a finished match: distributes the prize pool to winners (or refunds
 * on a draw), updates profiles/statistics/leaderboards, evaluates achievements
 * and fires result notifications. Runs atomically for the money movement.
 *
 * `rated` controls whether rating (and thus leaderboard score) is updated;
 * casual matches still earn XP and count toward statistics.
 */
export async function settleMatch(matchId: string, rated = true): Promise<SettlementResult> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { players: true },
  });

  if (!match) {
    throw new AppError("NOT_FOUND", "Match not found", 404);
  }
  if (match.status === "FINISHED") {
    return { matchId, winners: match.winnerIds as string[], payouts: [], newlyUnlocked: [] };
  }
  if (match.status !== "ACTIVE") {
    throw new AppError("INVALID_ACTION", "Match is not active", 409);
  }

  const winnerIds = new Set(match.winnerIds as string[]);
  const isDraw = winnerIds.size === 0;

  let payouts: { userId: string; amount: number }[] = [];

  await prisma.$transaction(async (tx) => {
    for (const player of match.players) {
      let result: "win" | "loss" | "draw";
      if (isDraw) {
        result = "draw";
        await applyTransaction(tx, player.userId, match.stake, "MATCH_WAGER", match.id, {
          gameId: match.gameId,
          reason: "draw_refund",
        });
      } else if (winnerIds.has(player.userId)) {
        result = "win";
        const payout = Math.round(match.stake * PAYOUT_RATE);
        payouts.push({ userId: player.userId, amount: payout });
        await applyTransaction(tx, player.userId, payout, "MATCH_PAYOUT", match.id, {
          gameId: match.gameId,
        });
      } else {
        result = "loss";
      }

      await tx.matchPlayer.update({
        where: { id: player.id },
        data: { result: result.toUpperCase() as "WIN" | "LOSS" | "DRAW" },
      });

      await recordMatchResult(tx, {
        userId: player.userId,
        gameId: match.gameId,
        result,
        score: 0,
        rated,
      });
    }

    await tx.match.update({
      where: { id: matchId },
      data: { status: "FINISHED", endedAt: new Date() },
    });
  });

  const newlyUnlocked: { code: string; title: string; icon: string }[] = [];

  for (const player of match.players) {
    const won = winnerIds.has(player.userId);
    const unlocked = await checkAndUnlock(player.userId, {
      userId: player.userId,
      matchResult: { won, gameId: match.gameId },
    });

    for (const achievement of unlocked) {
      newlyUnlocked.push({
        code: achievement.code,
        title: achievement.title,
        icon: achievement.icon,
      });
    }

    await createNotification(
      player.userId,
      "MATCH_RESULT",
      won ? "Victory!" : isDraw ? "Match drawn" : "Defeat",
      won
        ? `You won your ${match.gameId} match and earned a payout.`
        : isDraw
          ? `Your ${match.gameId} match ended in a draw. Entry stake refunded.`
          : `You lost your ${match.gameId} match. Better luck next time!`,
      { matchId, gameId: match.gameId },
    );
  }

  return {
    matchId,
    winners: [...winnerIds],
    payouts,
    newlyUnlocked,
  };
}
