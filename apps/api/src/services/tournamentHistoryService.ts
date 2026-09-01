import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import type { TournamentStatus } from "@gaming-hub/shared";

export class TournamentHistoryService {
  /**
   * 1. List Complete User Tournament History:
   * Returns participated tournaments, final ranks, prizes, refunds, and bracket links.
   */
  static async listUserTournamentHistory(params: {
    userId: string;
    status?: TournamentStatus | string;
    result?: "WINNER" | "RUNNER_UP" | "ELIMINATED" | "COMPLETED" | "CANCELLED" | "REGISTERED" | "ALL" | string;
    dateFrom?: Date | string;
    dateTo?: Date | string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, params.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {
      players: {
        some: {
          userId: params.userId,
        },
      },
    };

    if (params.status && params.status !== "ALL") {
      where.status = params.status;
    }

    if (params.dateFrom || params.dateTo) {
      const createdAtFilter: Record<string, Date> = {};
      if (params.dateFrom) createdAtFilter.gte = new Date(params.dateFrom);
      if (params.dateTo) createdAtFilter.lte = new Date(params.dateTo);
      where.createdAt = createdAtFilter;
    }

    const [tournaments, total] = await Promise.all([
      prisma.tournament.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          players: { include: { user: true } },
          prizes: { where: { userId: params.userId } },
          rounds: { orderBy: { roundNumber: "asc" } },
        },
      }),
      prisma.tournament.count({ where }),
    ]);

    // Fetch related financial transactions
    const tournamentIds = tournaments.map((t) => t.id);
    const transactions = await prisma.transaction.findMany({
      where: {
        userId: params.userId,
        referenceId: { in: tournamentIds },
      },
      select: {
        id: true,
        referenceId: true,
        referenceType: true,
        amount: true,
      },
    });

    const txMap = new Map<string, string[]>();
    for (const tx of transactions) {
      if (tx.referenceId) {
        const list = txMap.get(tx.referenceId) ?? [];
        list.push(tx.id);
        txMap.set(tx.referenceId, list);
      }
    }

    const items = tournaments.map((t) => {
      const myPlayer = t.players.find((p) => p.userId === params.userId);
      const myPrize = t.prizes.find((p) => p.userId === params.userId);

      const prizeAmount = myPrize?.amount ?? 0;
      const isCancelled = t.status === "CANCELLED";
      const isSettled = t.status === "SETTLED" || t.status === "COMPLETED";
      const refundAmount = isCancelled ? t.entryFee : 0;

      let result = "REGISTERED";
      if (isCancelled) {
        result = "CANCELLED";
      } else if (myPlayer?.finalRank === 1) {
        result = "WINNER";
      } else if (myPlayer?.finalRank === 2) {
        result = "RUNNER_UP";
      } else if (myPlayer?.eliminated) {
        result = "ELIMINATED";
      } else if (isSettled) {
        result = "COMPLETED";
      } else if (t.status === "IN_PROGRESS") {
        result = "IN_PROGRESS";
      }

      const rankDisplay = myPlayer?.finalRank
        ? myPlayer.finalRank === 1
          ? "1st Place"
          : myPlayer.finalRank === 2
            ? "2nd Place"
            : myPlayer.finalRank === 3
              ? "3rd Place"
              : `${myPlayer.finalRank}th Place`
        : myPlayer?.eliminatedInRound
          ? `Eliminated Round ${myPlayer.eliminatedInRound}`
          : "N/A";

      return {
        tournamentId: t.id,
        name: t.title,
        gameId: t.gameId,
        status: t.status,
        result,
        entryFee: t.entryFee,
        prizePool: t.prizePool,
        prize: prizeAmount,
        refund: refundAmount,
        playerCount: t.players.length,
        finalRank: myPlayer?.finalRank ?? null,
        rankDisplay,
        eliminated: myPlayer?.eliminated ?? false,
        eliminatedInRound: myPlayer?.eliminatedInRound ?? null,
        bracketUrl: `/api/tournaments/${t.id}/bracket`,
        transactionIds: txMap.get(t.id) ?? [],
        registeredAt: myPlayer?.registeredAt.toISOString() ?? t.createdAt.toISOString(),
        startedAt: t.startTime.toISOString(),
        finishedAt: t.endTime?.toISOString() ?? null,
        settledAt: t.settledAt?.toISOString() ?? null,
      };
    });

    // Apply result filter in-memory if specified
    const filteredItems = params.result && params.result !== "ALL"
      ? items.filter((item) => item.result === params.result)
      : items;

    return {
      items: filteredItems,
      total: filteredItems.length === items.length ? total : filteredItems.length,
      page,
      pageSize,
      totalPages: Math.ceil((filteredItems.length === items.length ? total : filteredItems.length) / pageSize),
    };
  }

  /**
   * 2. Single Tournament Detailed History:
   * Returns player's complete journey, round matches, bracket data, and settlement status.
   */
  static async getTournamentHistoryDetails(userId: string, tournamentId: string) {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        players: { include: { user: true } },
        prizes: true,
        rounds: { orderBy: [{ roundNumber: "asc" }, { matchNumber: "asc" }] },
      },
    });

    if (!tournament) {
      throw new AppError("NOT_FOUND", "Tournament not found", 404);
    }

    const myPlayer = tournament.players.find((p) => p.userId === userId);
    if (!myPlayer) {
      throw new AppError("FORBIDDEN", "You were not registered in this tournament", 403);
    }

    const myPrize = tournament.prizes.find((p) => p.userId === userId);
    const isCancelled = tournament.status === "CANCELLED";
    const refundAmount = isCancelled ? tournament.entryFee : 0;

    // Filter user's specific round matches
    const myRoundMatches = tournament.rounds.filter(
      (r) => r.playerAId === myPlayer.id || r.playerBId === myPlayer.id,
    );

    const matchHistory = myRoundMatches.map((r) => {
      const isPlayerA = r.playerAId === myPlayer.id;
      const opponentPlayerId = isPlayerA ? r.playerBId : r.playerAId;
      const opponentPlayer = tournament.players.find((p) => p.id === opponentPlayerId);
      const isWinner = r.winnerId === myPlayer.id;

      return {
        roundNumber: r.roundNumber,
        matchNumber: r.matchNumber,
        status: r.status,
        isBye: r.isBye,
        isWinner,
        myScore: isPlayerA ? r.playerAScore : r.playerBScore,
        opponentScore: isPlayerA ? r.playerBScore : r.playerAScore,
        opponentName: opponentPlayer?.user.displayName || opponentPlayer?.user.username || (r.isBye ? "BYE" : "Opponent"),
        matchId: r.matchId,
        completedAt: r.completedAt?.toISOString() ?? null,
      };
    });

    // Associated transactions
    const transactions = await prisma.transaction.findMany({
      where: {
        userId,
        referenceId: tournamentId,
      },
      select: {
        id: true,
        type: true,
        amount: true,
        referenceType: true,
        balanceAfter: true,
        createdAt: true,
      },
    });

    return {
      tournamentId: tournament.id,
      name: tournament.title,
      description: tournament.description,
      gameId: tournament.gameId,
      format: tournament.format,
      status: tournament.status,
      entryFee: tournament.entryFee,
      prizePool: tournament.prizePool,
      playerCount: tournament.players.length,
      finalRank: myPlayer.finalRank,
      eliminated: myPlayer.eliminated,
      eliminatedInRound: myPlayer.eliminatedInRound,
      prizeReceived: myPrize?.amount ?? 0,
      refundReceived: refundAmount,
      registeredAt: myPlayer.registeredAt.toISOString(),
      startedAt: tournament.startTime.toISOString(),
      endedAt: tournament.endTime?.toISOString() ?? null,
      settledAt: tournament.settledAt?.toISOString() ?? null,
      bracketUrl: `/api/tournaments/${tournament.id}/bracket`,
      matches: matchHistory,
      transactions: transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        referenceType: t.referenceType,
        balanceAfter: t.balanceAfter,
        createdAt: t.createdAt.toISOString(),
      })),
    };
  }
}
