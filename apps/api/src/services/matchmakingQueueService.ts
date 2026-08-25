import { prisma, type Prisma } from "@gaming-hub/db";
import {
  AppError,
  getGameDefinition,
  isGameId,
  MATCHMAKING_CONFIG,
  type GameId,
  type MatchmakingMode,
  type MatchmakingStatus,
  type MatchmakingQueueEntry,
  type MatchmakingStatusResponse,
} from "@gaming-hub/shared";
import { getSettings } from "./settings";

export interface JoinQueueParams {
  userId: string;
  gameId: string;
  entryFee?: number;
  gameMode?: MatchmakingMode;
  socketId?: string;
}

export interface MatchedPairResult {
  matchId: string;
  roomId: string;
  gameId: GameId;
  entryFee: number;
  gameMode: MatchmakingMode;
  playerIds: string[];
  queueIds: string[];
}

export class MatchmakingQueueService {
  /**
   * Retrieves configured matchmaking timeout from database or fallback to default.
   */
  static async getQueueTimeoutSeconds(): Promise<number> {
    try {
      const settings = await getSettings();
      return settings?.game?.matchmakingTimeoutSeconds ?? MATCHMAKING_CONFIG.DEFAULT_TIMEOUT_SECONDS;
    } catch {
      return MATCHMAKING_CONFIG.DEFAULT_TIMEOUT_SECONDS;
    }
  }

  /**
   * Enters or updates a player in the authoritative matchmaking queue.
   * Ensures idempotency: duplicate requests return the existing queue position without creating redundant records.
   */
  static async joinQueue(params: JoinQueueParams): Promise<{
    queued: boolean;
    queueId: string;
    position: number;
    gameId: GameId;
    entryFee: number;
    gameMode: MatchmakingMode;
    expiresAt: Date;
    isExisting: boolean;
  }> {
    const { userId, gameId, entryFee = 0, gameMode = "casual", socketId } = params;

    // 1. Validate Game
    if (!isGameId(gameId)) {
      throw new AppError("VALIDATION_ERROR", `Invalid gameId: ${gameId}`, 400);
    }
    const def = getGameDefinition(gameId);
    if (!def.online) {
      throw new AppError("INVALID_ACTION", `${def.name} is not playable in online multiplayer`, 400);
    }

    // 2. Validate User Authentication and existence
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { wallet: true, profile: true },
    });
    if (!user) {
      throw new AppError("UNAUTHORIZED", "User not found", 401);
    }

    // 3. Validate Entry Fee & Wallet Balance
    if (entryFee < 0) {
      throw new AppError("VALIDATION_ERROR", "Entry fee cannot be negative", 400);
    }

    if (entryFee > 0) {
      const balance = user.wallet?.balance ?? 0;
      if (balance < entryFee) {
        throw new AppError(
          "INSUFFICIENT_BALANCE",
          `Insufficient coins. Entry fee is ${entryFee} coins, but your balance is ${balance} coins.`,
          400,
        );
      }
    }

    // 4. Validate not in an active playing match
    const activeMatchPlayer = await prisma.matchPlayer.findFirst({
      where: {
        userId,
        match: {
          status: { in: ["CREATED", "ACTIVE"] },
        },
      },
    });
    if (activeMatchPlayer) {
      throw new AppError(
        "ALREADY_IN_ACTIVE_MATCH",
        "You are currently in an active match. Please finish or leave that match before entering matchmaking.",
        409,
      );
    }

    const timeoutSec = await this.getQueueTimeoutSeconds();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + timeoutSec * 1000);

    // 5. Idempotency Check: Existing WAITING queue entry
    const existingQueue = await prisma.matchmakingQueue.findFirst({
      where: {
        userId,
        status: "WAITING",
        expiresAt: { gt: now },
      },
      orderBy: { joinedAt: "desc" },
    });

    if (existingQueue) {
      // If joining exact same game, entryFee and mode -> return existing queue state
      if (
        existingQueue.gameId === gameId &&
        existingQueue.entryFee === entryFee &&
        existingQueue.gameMode === gameMode
      ) {
        if (socketId && existingQueue.socketId !== socketId) {
          await prisma.matchmakingQueue.update({
            where: { id: existingQueue.id },
            data: { socketId },
          });
        }

        const position = await this.calculateQueuePosition(
          existingQueue.gameId,
          existingQueue.entryFee,
          existingQueue.gameMode as MatchmakingMode,
          existingQueue.joinedAt,
        );

        return {
          queued: true,
          queueId: existingQueue.id,
          position,
          gameId: existingQueue.gameId as GameId,
          entryFee: existingQueue.entryFee,
          gameMode: existingQueue.gameMode as MatchmakingMode,
          expiresAt: existingQueue.expiresAt,
          isExisting: true,
        };
      } else {
        // Player switched to a different game or stake -> cancel old queue entry first
        await prisma.matchmakingQueue.update({
          where: { id: existingQueue.id },
          data: { status: "CANCELLED" },
        });
      }
    }

    // 6. Create fresh WAITING Queue record
    const newQueue = await prisma.matchmakingQueue.create({
      data: {
        userId,
        gameId,
        entryFee,
        gameMode,
        rating: 1000,
        status: "WAITING",
        socketId,
        expiresAt,
      },
    });

    const position = await this.calculateQueuePosition(gameId, entryFee, gameMode, newQueue.joinedAt);

    return {
      queued: true,
      queueId: newQueue.id,
      position,
      gameId,
      entryFee,
      gameMode,
      expiresAt: newQueue.expiresAt,
      isExisting: false,
    };
  }

  /**
   * Computes the 1-based position of an entry in its specific (game, entryFee, mode) queue.
   */
  static async calculateQueuePosition(
    gameId: string,
    entryFee: number,
    gameMode: string,
    joinedAt: Date,
  ): Promise<number> {
    const aheadCount = await prisma.matchmakingQueue.count({
      where: {
        gameId,
        entryFee,
        gameMode,
        status: "WAITING",
        expiresAt: { gt: new Date() },
        joinedAt: { lte: joinedAt },
      },
    });
    return Math.max(1, aheadCount);
  }

  /**
   * Retrieves player's current queue status.
   */
  static async getQueueStatus(userId: string, gameId?: string): Promise<MatchmakingStatusResponse> {
    const now = new Date();
    const whereClause: Prisma.MatchmakingQueueWhereInput = {
      userId,
      status: "WAITING",
    };
    if (gameId) {
      whereClause.gameId = gameId;
    }

    const queue = await prisma.matchmakingQueue.findFirst({
      where: whereClause,
      orderBy: { joinedAt: "desc" },
    });

    if (!queue) {
      return { queued: false };
    }

    // Check if queue has timed out
    if (queue.expiresAt <= now) {
      await prisma.matchmakingQueue.update({
        where: { id: queue.id },
        data: { status: "EXPIRED" },
      });
      return { queued: false };
    }

    const position = await this.calculateQueuePosition(
      queue.gameId,
      queue.entryFee,
      queue.gameMode,
      queue.joinedAt,
    );

    const waitElapsedSeconds = Math.max(0, Math.floor((now.getTime() - queue.joinedAt.getTime()) / 1000));
    const secondsRemaining = Math.max(0, Math.floor((queue.expiresAt.getTime() - now.getTime()) / 1000));

    const entry: MatchmakingQueueEntry = {
      id: queue.id,
      userId: queue.userId,
      gameId: queue.gameId as GameId,
      entryFee: queue.entryFee,
      gameMode: queue.gameMode as MatchmakingMode,
      rating: queue.rating,
      status: queue.status as MatchmakingStatus,
      position,
      joinedAt: queue.joinedAt.toISOString(),
      expiresAt: queue.expiresAt.toISOString(),
      socketId: queue.socketId,
      matchedWith: queue.matchedWith,
      roomId: queue.roomId,
      matchId: queue.matchId,
    };

    return {
      queued: true,
      entry,
      position,
      waitElapsedSeconds,
      secondsRemaining,
    };
  }

  /**
   * Cancels player's active queue entry safely without balance penalties.
   */
  static async cancelQueue(userId: string, gameId?: string): Promise<{ cancelled: boolean; queueId?: string }> {
    const whereClause: Prisma.MatchmakingQueueWhereInput = {
      userId,
      status: "WAITING",
    };
    if (gameId) {
      whereClause.gameId = gameId;
    }

    const queue = await prisma.matchmakingQueue.findFirst({
      where: whereClause,
      orderBy: { joinedAt: "desc" },
    });

    if (!queue) {
      return { cancelled: false };
    }

    await prisma.matchmakingQueue.update({
      where: { id: queue.id },
      data: { status: "CANCELLED" },
    });

    return { cancelled: true, queueId: queue.id };
  }

  /**
   * Atomic Pair Matching Worker.
   * Finds compatible WAITING players in the exact same game, entryFee, and gameMode.
   * Uses concurrency guards to ensure that if multiple workers run simultaneously, only one pairs the players.
   */
  static async tryMatchCompatiblePlayers(
    gameId: string,
    entryFee: number,
    gameMode: MatchmakingMode = "casual",
    targetCount = 2,
  ): Promise<MatchedPairResult | null> {
    const now = new Date();

    return await prisma.$transaction(async (tx) => {
      // 1. Find oldest WAITING players for this specific game bucket
      const candidates = await tx.matchmakingQueue.findMany({
        where: {
          gameId,
          entryFee,
          gameMode,
          status: "WAITING",
          expiresAt: { gt: now },
        },
        orderBy: { joinedAt: "asc" },
        take: targetCount,
        include: {
          user: {
            select: {
              id: true,
              wallet: { select: { balance: true } },
            },
          },
        },
      });

      if (candidates.length < targetCount) {
        return null;
      }

      // 2. Verify all candidates are still eligible (sufficient balance, not in another active match)
      const validCandidates: typeof candidates = [];
      for (const candidate of candidates) {
        // Balance check
        if (entryFee > 0 && (candidate.user?.wallet?.balance ?? 0) < entryFee) {
          await tx.matchmakingQueue.update({
            where: { id: candidate.id },
            data: { status: "CANCELLED" },
          });
          continue;
        }

        // Active match check
        const activeMatch = await tx.matchPlayer.findFirst({
          where: {
            userId: candidate.userId,
            match: { status: { in: ["CREATED", "ACTIVE"] } },
          },
        });
        if (activeMatch) {
          await tx.matchmakingQueue.update({
            where: { id: candidate.id },
            data: { status: "CANCELLED" },
          });
          continue;
        }

        validCandidates.push(candidate);
      }

      if (validCandidates.length < targetCount) {
        return null;
      }

      const selected = validCandidates.slice(0, targetCount);
      const selectedIds = selected.map((s) => s.id);
      const playerIds = selected.map((s) => s.userId);

      // Generate identifiers
      const matchId = `match_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const roomId = `room_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // 3. Atomic status transition from WAITING -> MATCHED
      // Concurrency guard: update only records that are strictly still WAITING
      const updateResult = await tx.matchmakingQueue.updateMany({
        where: {
          id: { in: selectedIds },
          status: "WAITING",
        },
        data: {
          status: "MATCHED",
          matchedAt: now,
          matchedWith: playerIds.join(","),
          roomId,
          matchId,
        },
      });

      // If race condition occurred and another worker already claimed any candidate, abort
      if (updateResult.count !== targetCount) {
        throw new AppError("CONCURRENCY_CONFLICT", "Candidate was already matched by another worker", 409);
      }

      return {
        matchId,
        roomId,
        gameId: gameId as GameId,
        entryFee,
        gameMode,
        playerIds,
        queueIds: selectedIds,
      };
    }).catch((err) => {
      if (err instanceof AppError && err.code === "CONCURRENCY_CONFLICT") {
        return null;
      }
      throw err;
    });
  }

  /**
   * Sweeps expired queue entries safely.
   */
  static async sweepExpiredQueues(): Promise<number> {
    const now = new Date();
    const result = await prisma.matchmakingQueue.updateMany({
      where: {
        status: "WAITING",
        expiresAt: { lte: now },
      },
      data: {
        status: "EXPIRED",
      },
    });
    return result.count;
  }

  /**
   * Recovers matchmaking state on server boot by expiring old waiting records.
   */
  static async recoverOnStartup(): Promise<void> {
    await prisma.matchmakingQueue.updateMany({
      where: { status: "WAITING" },
      data: { status: "EXPIRED" },
    });
  }
}
