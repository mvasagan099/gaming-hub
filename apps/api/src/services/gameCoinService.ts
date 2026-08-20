import { prisma } from "@gaming-hub/db";
import { AppError, getGameDefinition } from "@gaming-hub/shared";
import type { GameId } from "@gaming-hub/shared";
import { applyTransaction } from "./wallet";
import { recordMatchResult } from "./stats";
import { checkAndUnlock } from "./achievements";
import { createNotification } from "./notifications";

/**
 * 10% house rake for online games:
 * In a 2-player match with 100 stake each:
 * Total Pot = 200
 * Prize Pool = 200 * 0.9 = 180 coins awarded to the winner.
 */
export const PAYOUT_RATE = 0.9;

export interface GameCoinConfig {
  gameId: GameId;
  defaultEntryFee: number;
  currency: "COINS";
  minPlayers: number;
  maxPlayers: number;
}

export interface SettlementResult {
  matchId: string;
  winners: string[];
  pot: number;
  payouts: { userId: string; amount: number }[];
  newlyUnlocked: { code: string; title: string; icon: string }[];
}

/**
 * Centralized GameCoinService for all online multiplayer games
 * (Carrom, Ludo, Snake & Ladder, Table Tennis, Cricket, Fruit Ninja, Snake vs Worms, Bubble Shooter, Chess, etc.)
 */
export class GameCoinService {
  /**
   * Returns standard centralized entry fee and player configurations.
   */
  static getGameConfig(gameId: GameId): GameCoinConfig {
    const def = getGameDefinition(gameId);
    return {
      gameId: def.id,
      defaultEntryFee: def.defaultStake,
      currency: "COINS",
      minPlayers: def.minPlayers,
      maxPlayers: def.maxPlayers,
    };
  }

  /**
   * 1. Server-authoritative check on player balance before joining or queueing.
   * Throws INSUFFICIENT_COINS if balance is less than entry fee.
   */
  static async checkPlayerBalance(
    playerId: string,
    entryFee: number,
  ): Promise<{ ok: true; balance: number }> {
    if (entryFee <= 0) {
      return { ok: true, balance: 0 };
    }

    const wallet = await prisma.wallet.findUnique({
      where: { userId: playerId },
      select: { balance: true, isFrozen: true },
    });

    if (!wallet) {
      throw new AppError("NOT_FOUND", "Player wallet not found", 404);
    }
    if (wallet.isFrozen) {
      throw new AppError("WALLET_FROZEN", "Your wallet is currently frozen", 403);
    }
    if (wallet.balance < entryFee) {
      throw new AppError(
        "INSUFFICIENT_COINS",
        `Insufficient coins: You need ${entryFee} coins to join this match (Current balance: ${wallet.balance})`,
        400,
      );
    }

    return { ok: true, balance: wallet.balance };
  }

  /**
   * 2 & 3. Atomic Entry Reservation & Deduction at match start.
   * Debits entry fee from ALL players atomically.
   * If any player lacks funds, the entire transaction rolls back and 0 coins are deducted.
   * Idempotent: If match is already ACTIVE or FINISHED, returns without double deduction.
   */
  static async reserveMatchEntry(matchId: string) {
    return prisma.$transaction(async (tx) => {
      const match = await tx.match.findUnique({
        where: { id: matchId },
        include: { players: true },
      });

      if (!match) {
        throw new AppError("NOT_FOUND", "Match not found", 404);
      }
      if (match.status !== "CREATED") {
        // Idempotent: Already held wagers and moved to ACTIVE/FINISHED
        return match;
      }

      if (match.stake > 0) {
        for (const player of match.players) {
          const transactionId = `entry-${match.id}-${player.userId}`;
          await applyTransaction(tx, player.userId, -match.stake, "MATCH_WAGER", match.id, {
            transactionId,
            gameId: match.gameId,
            entryFee: match.stake,
            status: "COMPLETED",
          });
        }
      }

      return tx.match.update({
        where: { id: matchId },
        data: { status: "ACTIVE", startedAt: new Date() },
      });
    });
  }

  /**
   * 6, 7, 8, 9. Settle a finished match:
   * - Calculates pot and winner payouts on the server.
   * - Never pays twice (idempotent, checks status !== ACTIVE).
   * - Credits winner(s) with configured prize.
   * - If draw, refunds entry fee to both players.
   */
  static async settleMatch(
    matchId: string,
    winnerIds: string[],
    options: {
      rated?: boolean;
      reason?: string;
      scores?: Record<string, number>;
      resultType?: "WIN" | "LOSS" | "DRAW" | "FORFEIT";
    } = {},
  ): Promise<SettlementResult> {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { players: true, room: true },
    });

    if (!match) {
      throw new AppError("NOT_FOUND", "Match not found", 404);
    }
    if (match.status === "FINISHED") {
      // Idempotency: never pay twice!
      const pot = match.stake * match.players.length;
      return {
        matchId,
        winners: (match.winnerIds as string[]) || winnerIds,
        pot,
        payouts: [],
        newlyUnlocked: [],
      };
    }
    if (match.status !== "ACTIVE") {
      throw new AppError("INVALID_ACTION", "Match is not active for settlement", 409);
    }

    // Retrieve or generate match config snapshot
    const roomSettings = (match.room?.settings ?? {}) as Record<string, unknown>;
    let snapshot = roomSettings.configSnapshot as import("@gaming-hub/shared").MatchConfigSnapshot | undefined;
    if (!snapshot) {
      const { GameConfigService } = await import("./gameConfigService");
      snapshot = await GameConfigService.createSnapshot(match.gameId as import("@gaming-hub/shared").GameId, match.stake);
    }

    const { GameConfigService } = await import("./gameConfigService");
    const settlement = GameConfigService.calculatePrizeSettlement(snapshot, match.players.length, winnerIds);

    const rated = options.rated !== false;
    const winnerSet = new Set(winnerIds);
    const isDraw = winnerSet.size === 0;
    const totalPot = settlement.totalPot;
    const prizePool = settlement.prizePool;
    const winnerPayout = settlement.winnerPayout;
    const refundPerPlayer = settlement.refundPerPlayer;
    const resultType = options.resultType ?? (isDraw ? "DRAW" : "WIN");

    console.log("[MATCH] RESULT_CREATED", {
      matchId,
      gameId: match.gameId,
      resultType,
      winnerIds: Array.from(winnerSet),
      scores: options.scores,
      configVersion: snapshot.configVersion,
      prizeMode: snapshot.prizeMode,
    });
    console.log("[MATCH] SETTLEMENT_STARTED", { matchId, totalPot, prizePool });

    let payouts: { userId: string; amount: number }[] = [];

    await prisma.$transaction(async (tx) => {
      for (const player of match.players) {
        let result: "win" | "loss" | "draw";

        if (isDraw) {
          result = "draw";
          if (refundPerPlayer > 0) {
            const transactionId = `draw-refund-${match.id}-${player.userId}`;
            payouts.push({ userId: player.userId, amount: refundPerPlayer });
            await applyTransaction(tx, player.userId, refundPerPlayer, "WAGER_REFUND", match.id, {
              transactionId,
              gameId: match.gameId,
              reason: "draw_refund",
              status: "REFUNDED",
            });
          }
        } else if (winnerSet.has(player.userId)) {
          result = "win";
          if (winnerPayout > 0) {
            const transactionId = `payout-${match.id}-${player.userId}`;
            payouts.push({ userId: player.userId, amount: winnerPayout });
            await applyTransaction(tx, player.userId, winnerPayout, "MATCH_PAYOUT", match.id, {
              transactionId,
              gameId: match.gameId,
              reason: options.reason || "winner_payout",
              status: "COMPLETED",
            });
          }
        } else {
          result = "loss";
        }

        const playerScore = options.scores?.[player.userId] ?? player.score ?? 0;

        await tx.matchPlayer.update({
          where: { id: player.id },
          data: {
            result: result.toUpperCase() as "WIN" | "LOSS" | "DRAW",
            score: playerScore,
          },
        });

        await recordMatchResult(tx, {
          userId: player.userId,
          gameId: match.gameId,
          result,
          score: playerScore,
          rated,
        });
      }

      const durationSeconds = match.startedAt
        ? Math.max(0, Math.round((Date.now() - match.startedAt.getTime()) / 1000))
        : 0;

      await tx.matchStatistics.upsert({
        where: { matchId },
        create: {
          matchId,
          durationSeconds,
          startedAt: match.startedAt ?? new Date(),
          endedAt: new Date(),
          coinsAwarded: { totalPot, prizePool, winnerPayout },
        },
        update: {
          durationSeconds,
          endedAt: new Date(),
          coinsAwarded: { totalPot, prizePool, winnerPayout },
        },
      }).catch(() => undefined);

      await tx.match.update({
        where: { id: matchId },
        data: {
          status: "FINISHED",
          winnerIds: Array.from(winnerSet),
          endedAt: new Date(),
        },
      });
    });

    console.log("[MATCH] SETTLEMENT_COMPLETED", {
      matchId,
      pot: totalPot,
      payouts,
    });

    const newlyUnlocked: { code: string; title: string; icon: string }[] = [];

    for (const player of match.players) {
      const won = winnerSet.has(player.userId);
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
          ? `You won your ${match.gameId} match and earned ${winnerPayout} coins!`
          : isDraw
            ? `Your ${match.gameId} match ended in a draw. Entry fee refunded.`
            : `Your ${match.gameId} match has ended. Better luck next time!`,
        { matchId, gameId: match.gameId },
      );
    }

    return {
      matchId,
      winners: Array.from(winnerSet),
      pot: totalPot,
      payouts,
      newlyUnlocked,
    };
  }

  /**
   * 10. Match Cancellation / Abort:
   * If a match never started or is cancelled, safely releases/refunds reserved coins.
   */
  static async cancelMatch(matchId: string, reason = "match_cancelled") {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { players: true },
    });

    if (!match) {
      throw new AppError("NOT_FOUND", "Match not found", 404);
    }
    if (match.status === "FINISHED") {
      return { ok: true, matchId, status: "ALREADY_FINISHED" };
    }

    await prisma.$transaction(async (tx) => {
      if (match.status === "ACTIVE" && match.stake > 0) {
        for (const player of match.players) {
          const transactionId = `cancel-refund-${match.id}-${player.userId}`;
          await applyTransaction(tx, player.userId, match.stake, "WAGER_REFUND", match.id, {
            transactionId,
            gameId: match.gameId,
            reason,
            status: "REFUNDED",
          });
        }
      }

      await tx.match.update({
        where: { id: matchId },
        data: {
          status: "FINISHED",
          winnerIds: [],
          endedAt: new Date(),
        },
      });
    });

    return { ok: true, matchId, status: "CANCELLED" };
  }
}
