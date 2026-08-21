import { prisma } from "@gaming-hub/db";
import type { Prisma } from "@gaming-hub/db";
import { AppError, isGameId } from "@gaming-hub/shared";
import type { GameId } from "@gaming-hub/shared";
import { WalletTransactionService } from "./walletTransactionService";
import { GameCoinService } from "./gameCoinService";
import { IdempotencyService } from "./idempotencyService";
import { GameConfigService } from "./gameConfigService";

export type EntryLifecycleStatus =
  | "CREATED"
  | "FEE_PENDING"
  | "FEE_PAID"
  | "PLAYER_JOINED"
  | "MATCH_READY"
  | "MATCH_STARTED"
  | "MATCH_FINISHED"
  | "SETTLED"
  | "CANCELLED"
  | "ABORTED";

export interface InitiateEntryParams {
  userId: string;
  gameId: GameId;
  stake: number;
  matchId: string;
  roomId?: string | null;
  seat?: number;
  isTournament?: boolean;
}

export interface EntryTrace {
  entryId: string;
  userId: string;
  username: string;
  displayName: string;
  gameId: string;
  gameName: string;
  matchId: string;
  roomId: string | null;
  seat: number;
  fee: number;
  status: EntryLifecycleStatus;
  result: string;
  score: number;
  timeline: {
    createdAt: string;
    paidAt: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    settledAt: string | null;
  };
  transactions: {
    id: string;
    type: string;
    referenceType: string;
    amount: number;
    balanceBefore: number | null;
    balanceAfter: number;
    createdAt: string;
  }[];
}

export class GameEntryLifecycleService {
  /**
   * 1. Initiate Player Entry:
   * AUTH -> VALIDATE GAME -> VALIDATE FEE -> CHECK AVAILABILITY -> DEDUCT FEE ATOMICALLY -> FEE_PAID -> JOIN MATCH
   */
  static async initiateEntry(params: InitiateEntryParams): Promise<{
    ok: true;
    matchId: string;
    userId: string;
    seat: number;
    status: EntryLifecycleStatus;
    fee: number;
  }> {
    if (!isGameId(params.gameId)) {
      throw new AppError("VALIDATION_ERROR", `Invalid game ID: ${params.gameId}`, 400);
    }
    if (params.stake < 0) {
      throw new AppError("VALIDATION_ERROR", "Stake cannot be negative", 400);
    }

    const gameConfig = await GameConfigService.getGameConfig(params.gameId);
    if (!gameConfig.enabled) {
      throw new AppError("GAME_DISABLED", `${gameConfig.name} is currently disabled`, 403);
    }
    if (!gameConfig.onlineEnabled) {
      throw new AppError("ONLINE_DISABLED", `Online multiplayer for ${gameConfig.name} is disabled`, 403);
    }

    if (params.stake > 0 && !params.isTournament) {
      const isAllowed = gameConfig.entryFees.includes(params.stake);
      const withinCustomRange =
        (gameConfig.minEntryFee === undefined || params.stake >= gameConfig.minEntryFee) &&
        (gameConfig.maxEntryFee === undefined || params.stake <= gameConfig.maxEntryFee);

      if (!isAllowed && !withinCustomRange) {
        throw new AppError(
          "INVALID_ENTRY_FEE",
          `Entry fee of ${params.stake} is not allowed for ${gameConfig.name}`,
          400,
        );
      }
    }

    const idempotencyKey = `ENTRY_INIT:${params.matchId}:${params.userId}`;

    return IdempotencyService.executeOnce({
      key: idempotencyKey,
      operation: "INITIATE_GAME_ENTRY",
      userId: params.userId,
      referenceId: params.matchId,
      handler: async (tx) => {
        // Ensure user exists and wallet is funded
        const wallet = await tx.wallet.findUnique({
          where: { userId: params.userId },
          select: { balance: true, isFrozen: true },
        });

        if (!wallet) {
          throw new AppError("NOT_FOUND", "Player wallet not found", 404);
        }
        if (wallet.isFrozen) {
          throw new AppError("WALLET_FROZEN", "Your wallet is currently frozen", 403);
        }

        const effectiveStake = params.isTournament ? 0 : params.stake;
        if (effectiveStake > 0 && wallet.balance < effectiveStake) {
          throw new AppError(
            "INSUFFICIENT_BALANCE",
            `Insufficient coins: You need ${effectiveStake} coins to join (Balance: ${wallet.balance})`,
            400,
          );
        }

        // Retrieve or create Match
        let match = await tx.match.findUnique({
          where: { id: params.matchId },
          include: { players: true },
        });

        if (!match) {
          match = await tx.match.create({
            data: {
              id: params.matchId,
              roomId: params.roomId ?? null,
              gameId: params.gameId,
              status: "CREATED",
              winnerIds: [],
              stake: effectiveStake,
            },
            include: { players: true },
          });
        }

        // Check if player is already joined
        const existingPlayer = match.players.find((p) => p.userId === params.userId);
        if (existingPlayer) {
          return {
            ok: true,
            matchId: match.id,
            userId: params.userId,
            seat: existingPlayer.seat,
            status: match.status === "ACTIVE" ? "MATCH_STARTED" : "FEE_PAID",
            fee: effectiveStake,
          };
        }

        // Assign seat
        const takenSeats = new Set(match.players.map((p) => p.seat));
        let assignedSeat = params.seat ?? 0;
        if (takenSeats.has(assignedSeat)) {
          assignedSeat = 0;
          while (takenSeats.has(assignedSeat)) {
            assignedSeat++;
          }
        }

        if (assignedSeat >= gameConfig.maxPlayers) {
          throw new AppError("ROOM_FULL", "Match capacity has been reached", 409);
        }

        // Create MatchPlayer entry
        await tx.matchPlayer.create({
          data: {
            matchId: match.id,
            userId: params.userId,
            seat: assignedSeat,
            result: "PENDING",
          },
        });

        // Deduct entry fee atomically if applicable
        if (effectiveStake > 0) {
          await WalletTransactionService.createGameEntry(tx, {
            userId: params.userId,
            matchId: match.id,
            gameId: params.gameId,
            entryFee: effectiveStake,
          });
        }

        return {
          ok: true,
          matchId: match.id,
          userId: params.userId,
          seat: assignedSeat,
          status: "FEE_PAID",
          fee: effectiveStake,
        };
      },
    });
  }

  /**
   * 2. Server-Authoritative Check: MATCH_READY
   * Confirms all required players have paid entry fees and joined.
   */
  static async checkMatchReady(matchId: string): Promise<{
    isReady: boolean;
    currentPlayers: number;
    minPlayers: number;
    maxPlayers: number;
    match: any;
  }> {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { players: { include: { user: true } } },
    });

    if (!match) {
      throw new AppError("NOT_FOUND", "Match not found", 404);
    }

    const gameConfig = await GameConfigService.getGameConfig(match.gameId as GameId);
    const isReady =
      match.players.length >= gameConfig.minPlayers &&
      match.players.length <= gameConfig.maxPlayers &&
      match.status === "CREATED";

    return {
      isReady,
      currentPlayers: match.players.length,
      minPlayers: gameConfig.minPlayers,
      maxPlayers: gameConfig.maxPlayers,
      match,
    };
  }

  /**
   * 3. Server-Authoritative Match Start: MATCH_READY -> MATCH_STARTED
   * Prevents duplicate starts.
   */
  static async startMatch(matchId: string) {
    return prisma.$transaction(async (tx) => {
      const match = await tx.match.findUnique({
        where: { id: matchId },
        include: { players: true },
      });

      if (!match) {
        throw new AppError("NOT_FOUND", "Match not found", 404);
      }

      if (match.status === "ACTIVE") {
        return match; // Idempotent
      }

      if (match.status !== "CREATED") {
        throw new AppError("INVALID_ACTION", `Cannot start match with status ${match.status}`, 409);
      }

      const gameConfig = await GameConfigService.getGameConfig(match.gameId as GameId);
      if (match.players.length < gameConfig.minPlayers) {
        throw new AppError(
          "INVALID_ACTION",
          `Cannot start match: Need at least ${gameConfig.minPlayers} players, have ${match.players.length}`,
          400,
        );
      }

      return tx.match.update({
        where: { id: matchId },
        data: {
          status: "ACTIVE",
          startedAt: new Date(),
        },
        include: { players: true },
      });
    });
  }

  /**
   * 4. Match Finish & Settlement: MATCH_STARTED -> MATCH_FINISHED -> SETTLED
   */
  static async finishAndSettleMatch(
    matchId: string,
    winnerIds: string[],
    options: {
      scores?: Record<string, number>;
      reason?: string;
      resultType?: "WIN" | "LOSS" | "DRAW" | "FORFEIT";
    } = {},
  ) {
    return GameCoinService.settleMatch(matchId, winnerIds, options);
  }

  /**
   * 5. Disconnect / Reconnect / Abandonment Handling
   */
  static async handleDisconnect(matchId: string, userId: string): Promise<{
    disconnected: boolean;
    gracePeriodSeconds: number;
  }> {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
    });
    if (!match) throw new AppError("NOT_FOUND", "Match not found", 404);

    const gameConfig = await GameConfigService.getGameConfig(match.gameId as GameId);
    const gracePeriodSeconds = gameConfig.reconnectWindowSeconds || 30;

    return {
      disconnected: true,
      gracePeriodSeconds,
    };
  }

  static async handleReconnect(matchId: string, userId: string): Promise<{
    reconnected: boolean;
    match: any;
  }> {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { players: true },
    });
    if (!match) throw new AppError("NOT_FOUND", "Match not found", 404);

    return {
      reconnected: true,
      match,
    };
  }

  static async handleAbandonment(matchId: string, abandoningUserId: string) {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { players: true },
    });
    if (!match) throw new AppError("NOT_FOUND", "Match not found", 404);
    if (match.status !== "ACTIVE") return match;

    // Remaining players are winners
    const remainingWinners = match.players
      .filter((p) => p.userId !== abandoningUserId)
      .map((p) => p.userId);

    return this.finishAndSettleMatch(matchId, remainingWinners, {
      resultType: "FORFEIT",
      reason: "player_abandonment",
    });
  }

  /**
   * 6. Failed Initialization / Pre-Game Cancellation Recovery
   * 100% full refund to all paying participants via central refund engine.
   */
  static async abortAndRefundMatch(matchId: string, reason = "match_initialization_failed") {
    return GameCoinService.cancelMatch(matchId, reason);
  }

  /**
   * 7. Full Traceability: USER -> GAME ENTRY -> MATCH/ROOM -> WALLET TRANSACTIONS
   */
  static async getEntryTrace(matchId: string, userId?: string): Promise<EntryTrace[]> {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        players: {
          where: userId ? { userId } : undefined,
          include: { user: true },
        },
        room: true,
      },
    });

    if (!match) {
      throw new AppError("NOT_FOUND", "Match not found", 404);
    }

    const transactions = await prisma.transaction.findMany({
      where: { referenceId: matchId },
      orderBy: { createdAt: "asc" },
    });

    const gameDef = await GameConfigService.getGameConfig(match.gameId as GameId);

    return match.players.map((p) => {
      const userTx = transactions.filter((t) => t.userId === p.userId);
      const paidTx = userTx.find((t) => t.referenceType === "MATCH_WAGER");
      const settleTx = userTx.find((t) => t.referenceType === "MATCH_PAYOUT" || t.referenceType === "WAGER_REFUND");

      let status: EntryLifecycleStatus = "CREATED";
      if (match.status === "ABORTED") {
        status = "ABORTED";
      } else if (match.status === "FINISHED") {
        status = "SETTLED";
      } else if (match.status === "ACTIVE") {
        status = "MATCH_STARTED";
      } else if (match.players.length >= gameDef.minPlayers) {
        status = "MATCH_READY";
      } else if (paidTx || match.stake === 0) {
        status = "FEE_PAID";
      } else {
        status = "FEE_PENDING";
      }

      return {
        entryId: p.id,
        userId: p.userId,
        username: p.user.username,
        displayName: p.user.displayName,
        gameId: match.gameId,
        gameName: gameDef.name,
        matchId: match.id,
        roomId: match.roomId,
        seat: p.seat,
        fee: match.stake,
        status,
        result: p.result,
        score: p.score,
        timeline: {
          createdAt: p.createdAt.toISOString(),
          paidAt: paidTx ? paidTx.createdAt.toISOString() : null,
          startedAt: match.startedAt ? match.startedAt.toISOString() : null,
          finishedAt: match.endedAt ? match.endedAt.toISOString() : null,
          settledAt: settleTx ? settleTx.createdAt.toISOString() : null,
        },
        transactions: userTx.map((t) => ({
          id: t.id,
          type: t.type,
          referenceType: t.referenceType,
          amount: t.amount,
          balanceBefore: t.balanceBefore,
          balanceAfter: t.balanceAfter,
          createdAt: t.createdAt.toISOString(),
        })),
      };
    });
  }

  /**
   * 8. Admin Visibility: List game entries across the platform with filtering
   */
  static async listAdminEntries(query: {
    gameId?: string;
    userId?: string;
    matchId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));

    const where: Prisma.MatchPlayerWhereInput = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.matchId ? { matchId: query.matchId } : {}),
      ...(query.gameId ? { match: { gameId: query.gameId } } : {}),
      ...(query.status && query.status !== "ALL"
        ? {
            match: {
              status: query.status as any,
            },
          }
        : {}),
    };

    const [players, total] = await Promise.all([
      prisma.matchPlayer.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          user: true,
          match: {
            include: { room: true },
          },
        },
      }),
      prisma.matchPlayer.count({ where }),
    ]);

    const matchIds = Array.from(new Set(players.map((p) => p.matchId)));
    const transactions = await prisma.transaction.findMany({
      where: { referenceId: { in: matchIds } },
    });

    const txMap = new Map<string, typeof transactions>();
    for (const tx of transactions) {
      const key = `${tx.referenceId}:${tx.userId}`;
      const list = txMap.get(key) || [];
      list.push(tx);
      txMap.set(key, list);
    }

    const items = players.map((p) => {
      const userTxs = txMap.get(`${p.matchId}:${p.userId}`) || [];
      const paidTx = userTxs.find((t) => t.referenceType === "MATCH_WAGER");
      const settleTx = userTxs.find((t) => t.referenceType === "MATCH_PAYOUT" || t.referenceType === "WAGER_REFUND");

      let status: EntryLifecycleStatus = "CREATED";
      if (p.match.status === "ABORTED") {
        status = "ABORTED";
      } else if (p.match.status === "FINISHED") {
        status = "SETTLED";
      } else if (p.match.status === "ACTIVE") {
        status = "MATCH_STARTED";
      } else if (paidTx || p.match.stake === 0) {
        status = "FEE_PAID";
      }

      return {
        entryId: p.id,
        userId: p.userId,
        username: p.user.username,
        displayName: p.user.displayName,
        gameId: p.match.gameId,
        matchId: p.matchId,
        roomId: p.match.roomId,
        seat: p.seat,
        fee: p.match.stake,
        status,
        result: p.result,
        score: p.score,
        createdAt: p.createdAt.toISOString(),
        paidAt: paidTx?.createdAt.toISOString() ?? null,
        startedAt: p.match.startedAt?.toISOString() ?? null,
        finishedAt: p.match.endedAt?.toISOString() ?? null,
        settledAt: settleTx?.createdAt.toISOString() ?? null,
        transactionsCount: userTxs.length,
      };
    });

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
