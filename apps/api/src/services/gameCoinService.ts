import { prisma } from "@gaming-hub/db";
import { AppError, getGameDefinition, isGameId } from "@gaming-hub/shared";
import type { GameId, MatchFundingRequest } from "@gaming-hub/shared";
import { WalletTransactionService } from "./walletTransactionService";
import { IdempotencyService } from "./idempotencyService";
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
 * (Carrom, Ludo, Snake & Ladder, Table Tennis, Fruit Ninja, Snake vs Worms, Bubble Shooter, Chess, etc.)
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
   * Throws INSUFFICIENT_BALANCE if balance is less than entry fee.
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
        "INSUFFICIENT_BALANCE",
        `Insufficient coins: You need ${entryFee} coins to join this match (Current balance: ${wallet.balance})`,
        400,
      );
    }

    return { ok: true, balance: wallet.balance };
  }

  /**
   * 2. Completely Atomic Match Creation and Entry Fee Deduction.
   * Creates the Match, MatchPlayer records, and debits all participants atomically.
   * If any participant lacks sufficient balance or if match creation fails,
   * the entire transaction rolls back cleanly with 0 coins deducted.
   */
  static async createAndFundMatch(params: MatchFundingRequest) {
    if (!isGameId(params.gameId)) {
      throw new AppError("VALIDATION_ERROR", `Invalid game ID: ${params.gameId}`, 400);
    }
    if (params.stake < 0) {
      throw new AppError("VALIDATION_ERROR", "Stake cannot be negative", 400);
    }
    if (params.room) {
      const room = params.room;
      const def = getGameDefinition(params.gameId);
      if (!params.roomId || !room.code || !params.players.some(p => p.userId === room.hostId) ||
          room.minPlayers !== def.minPlayers || !Number.isInteger(room.maxPlayers) ||
          room.maxPlayers < room.minPlayers || room.maxPlayers > def.maxPlayers ||
          params.players.length < room.minPlayers || params.players.length > room.maxPlayers ||
          new Set(params.players.map(p => p.userId)).size !== params.players.length ||
          new Set(params.players.map(p => p.seat)).size !== params.players.length ||
          params.players.some(p => !Number.isInteger(p.seat) || p.seat < 0 || p.seat >= room.maxPlayers)) {
        throw new AppError("VALIDATION_ERROR", "Invalid authoritative multiplayer room snapshot", 400);
      }
    }

    // Authoritative check on game & entry fee
    const { GameConfigService } = await import("./gameConfigService");
    const gameConfig = await GameConfigService.getGameConfig(params.gameId);
    if (!gameConfig.enabled) {
      throw new AppError("GAME_DISABLED", `${gameConfig.name} is currently disabled`, 403);
    }
    if (!gameConfig.onlineEnabled) {
      throw new AppError("ONLINE_DISABLED", `Online multiplayer for ${gameConfig.name} is disabled`, 403);
    }
    if (params.stake > 0) {
      const isExplicitlyAllowed = gameConfig.entryFees.includes(params.stake);
      const hasCustomRange = gameConfig.minEntryFee !== undefined || gameConfig.maxEntryFee !== undefined;
      const withinCustomRange =
        hasCustomRange &&
        (gameConfig.minEntryFee === undefined || params.stake >= gameConfig.minEntryFee) &&
        (gameConfig.maxEntryFee === undefined || params.stake <= gameConfig.maxEntryFee);

      if (!isExplicitlyAllowed && !withinCustomRange) {
        throw new AppError(
          "INVALID_ENTRY_FEE",
          `Entry fee of ${params.stake} is not allowed for ${gameConfig.name}. Allowed: [${gameConfig.entryFees.join(", ")}]`,
          400,
        );
      }
    }

    const idempotencyKey = `MATCH_FUND:${params.matchId}`;
    return IdempotencyService.executeOnce({
      key: idempotencyKey,
      operation: "CREATE_AND_FUND_MATCH",
      referenceId: params.matchId,
      handler: async (tx) => {
        // Idempotency: return existing match if already created
        const existing = await tx.match.findUnique({
          where: { id: params.matchId },
          include: { players: true },
        });
        if (existing) {
          return existing;
        }

        // Framework rooms initially exist only in memory. Persist the trusted
        // socket snapshot in the same transaction as the match and its debits.
        // A funding failure therefore rolls back the room as well.
        if (params.roomId) {
          const existingRoom = await tx.room.findUnique({ where: { id: params.roomId } });
          if (params.room) {
            const room = params.room;
            if (existingRoom && (existingRoom.gameId !== params.gameId ||
                existingRoom.hostId !== room.hostId || existingRoom.code !== room.code ||
                existingRoom.stake !== params.stake)) {
              throw new AppError("VALIDATION_ERROR", "Multiplayer room identity does not match its persisted record", 400);
            }
            if (!existingRoom) {
              await tx.room.create({ data: {
                id: params.roomId, code: room.code, hostId: room.hostId,
                gameId: params.gameId, stake: params.stake, status: "PLAYING",
                isPrivate: room.isPrivate, minPlayers: room.minPlayers, maxPlayers: room.maxPlayers,
                settings: room.settings,
                players: { create: params.players.map(p => ({
                  userId: p.userId, seat: p.seat, isReady: true, isHost: p.userId === room.hostId,
                })) },
              } });
            } else {
              await tx.room.update({ where: { id: params.roomId }, data: { status: "PLAYING" } });
            }
          } else if (!existingRoom) {
            throw new AppError("NOT_FOUND", "Multiplayer room must exist or include its authoritative snapshot", 404);
          }
        }

        // Create Match record with status ACTIVE
        const match = await tx.match.create({
          data: {
            id: params.matchId,
            roomId: params.roomId ?? null,
            gameId: params.gameId,
            status: "ACTIVE",
            winnerIds: [],
            stake: params.stake,
            startedAt: new Date(),
          },
        });

        // Create MatchPlayer entries
        await tx.matchPlayer.createMany({
          data: params.players.map((p) => ({
            matchId: params.matchId,
            userId: p.userId,
            seat: p.seat,
            result: "PENDING",
          })),
        });

        // Atomic Coin Deduction via Central Wallet Transaction Ledger
        if (params.stake > 0) {
          for (const p of params.players) {
            await WalletTransactionService.createGameEntry(tx, {
              userId: p.userId,
              matchId: params.matchId,
              gameId: params.gameId,
              entryFee: params.stake,
            });
          }
        }

        return match;
      },
    });
  }

  /**
   * 3. Atomic Entry Reservation & Deduction on existing match.
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
          await WalletTransactionService.createGameEntry(tx, {
            userId: player.userId,
            matchId: match.id,
            gameId: match.gameId,
            entryFee: match.stake,
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
   * - Never pays twice (idempotent via IdempotencyService & status checks).
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
    const { SettlementService } = await import("./settlementService");
    const summary = await SettlementService.settleMatch({
      matchId,
      winnerIds,
      options,
    });

    return {
      matchId: summary.matchId,
      winners: summary.winners,
      pot: summary.totalPot,
      payouts: summary.payouts
        .filter((p) => p.amount > 0)
        .map((p) => ({ userId: p.userId, amount: p.amount })),
      newlyUnlocked: summary.newlyUnlocked,
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
    if (match.status === "FINISHED" || match.status === "ABORTED") {
      return { ok: true, matchId, status: "ALREADY_FINISHED" };
    }

    const idempotencyKey = `MATCH_CANCEL:${matchId}`;

    return IdempotencyService.executeOnce({
      key: idempotencyKey,
      operation: "MATCH_CANCEL",
      referenceId: matchId,
      handler: async (tx) => {
        const currentMatch = await tx.match.findUnique({
          where: { id: matchId },
          include: { players: true },
        });

        if (!currentMatch) {
          throw new AppError("NOT_FOUND", "Match not found", 404);
        }
        if (currentMatch.status === "FINISHED" || currentMatch.status === "ABORTED") {
          return { ok: true, matchId, status: "ALREADY_FINISHED" };
        }

        if ((currentMatch.status === "ACTIVE" || currentMatch.status === "CREATED") && currentMatch.stake > 0) {
          // Check if wagers were actually debited for this match
          const wagers = await tx.transaction.findMany({
            where: { referenceId: matchId, referenceType: "MATCH_WAGER" },
          });
          const debitedUserIds = new Set(wagers.map((w) => w.userId));

          for (const player of currentMatch.players) {
            if (debitedUserIds.has(player.userId)) {
              await WalletTransactionService.createGameRefund(tx, {
                userId: player.userId,
                matchId: currentMatch.id,
                gameId: currentMatch.gameId,
                refundAmount: currentMatch.stake,
                reason,
              });
            }
          }
        }

        await tx.match.update({
          where: { id: matchId },
          data: {
            status: "ABORTED",
            winnerIds: [],
            endedAt: new Date(),
          },
        });

        return { ok: true, matchId, status: "CANCELLED" };
      },
    });
  }
}
