import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";

export class GameHistoryService {
  /**
   * 1. List Complete User Game History:
   * Returns historically accurate match results, stakes, payouts, and tournament links.
   */
  static async listUserGameHistory(params: {
    userId: string;
    gameId?: string;
    result?: string;
    status?: string;
    opponentId?: string;
    dateFrom?: Date | string;
    dateTo?: Date | string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, params.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    const resultFilter = params.result?.toUpperCase();

    const where: Record<string, unknown> = {
      players: {
        some: {
          userId: params.userId,
          ...(resultFilter && ["WIN", "LOSS", "DRAW", "FORFEIT"].includes(resultFilter)
            ? { result: resultFilter === "FORFEIT" ? "LOSS" : resultFilter }
            : {}),
        },
      },
    };

    if (params.gameId) {
      where.gameId = params.gameId;
    }

    if (params.status) {
      where.status = params.status;
    }

    if (params.opponentId) {
      where.players = {
        some: { userId: params.userId },
        every: {
          OR: [
            { userId: params.userId },
            { userId: params.opponentId },
          ],
        },
      };
    }

    if (params.dateFrom || params.dateTo) {
      const createdAtFilter: Record<string, Date> = {};
      if (params.dateFrom) createdAtFilter.gte = new Date(params.dateFrom);
      if (params.dateTo) createdAtFilter.lte = new Date(params.dateTo);
      where.createdAt = createdAtFilter;
    }

    const [matches, total] = await Promise.all([
      prisma.match.findMany({
        where,
        orderBy: [{ endedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: pageSize,
        include: {
          players: { include: { user: true } },
          stats: true,
        },
      }),
      prisma.match.count({ where }),
    ]);

    // Fetch related transaction references for auditability
    const matchIds = matches.map((m) => m.id);
    const transactions = await prisma.transaction.findMany({
      where: {
        userId: params.userId,
        referenceId: { in: matchIds },
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

    const items = matches.map((m) => {
      const myPlayer = m.players.find((p) => p.userId === params.userId);
      const opponents = m.players.filter((p) => p.userId !== params.userId);
      const primaryOpponent = opponents[0];

      const winnerIds = (m.winnerIds as string[]) || [];
      const isWinner = winnerIds.includes(params.userId);
      const isDraw = winnerIds.length === 0 && m.status === "FINISHED";
      const totalPot = m.stake * m.players.length;
      const prizePool = Math.round(totalPot * 0.9);
      const winnerPayout = winnerIds.length > 0 ? Math.round(prizePool / winnerIds.length) : 0;

      let resultType = "DRAW";
      let coinsWon = 0;
      let coinsLost = 0;

      if (m.status === "ABORTED") {
        resultType = "CANCELLED";
        coinsWon = m.stake; // 100% refund
        coinsLost = 0;
      } else if (isDraw) {
        resultType = "DRAW";
        coinsWon = m.stake;
        coinsLost = 0;
      } else if (isWinner) {
        resultType = "WIN";
        coinsWon = winnerPayout;
        coinsLost = 0;
      } else {
        resultType = myPlayer?.result === "LOSS" ? "LOSS" : "FORFEIT";
        coinsWon = 0;
        coinsLost = m.stake;
      }

      const netCoins = m.status === "ABORTED"
        ? 0
        : isWinner
          ? winnerPayout - m.stake
          : isDraw
            ? 0
            : -m.stake;

      const duration = m.stats?.durationSeconds ??
        (m.startedAt && m.endedAt ? Math.max(0, Math.round((m.endedAt.getTime() - m.startedAt.getTime()) / 1000)) : 0);

      // Tournament match reference metadata
      let tournamentInfo: { isTournament: boolean; tournamentId?: string; roundId?: string } = {
        isTournament: false,
      };

      if (m.roomId && m.roomId.startsWith("tournament_")) {
        const raw = m.roomId.replace(/^tournament_/, "");
        const parts = raw.split(":");
        tournamentInfo = {
          isTournament: true,
          tournamentId: parts[0],
          roundId: parts[1],
        };
      }

      return {
        id: m.id,
        matchId: m.id,
        roomId: m.roomId,
        gameId: m.gameId,
        status: m.status,
        resultType,
        result: myPlayer?.result ?? (isWinner ? "WIN" : isDraw ? "DRAW" : "LOSS"),
        playerId: params.userId,
        opponentId: primaryOpponent?.userId ?? null,
        opponentName: primaryOpponent?.user.displayName || primaryOpponent?.user.username || "Opponent",
        opponentAvatar: primaryOpponent?.user.avatarUrl ?? null,
        score: myPlayer?.score ?? 0,
        opponentScore: primaryOpponent?.score ?? 0,
        entryFee: m.stake,
        coinsWon,
        coinsLost,
        netCoins,
        duration,
        winnerIds,
        tournamentInfo,
        transactionIds: txMap.get(m.id) ?? [],
        startedAt: m.startedAt?.toISOString() ?? null,
        finishedAt: m.endedAt?.toISOString() ?? null,
        createdAt: m.createdAt.toISOString(),
        players: m.players.map((p) => ({
          seat: p.seat,
          userId: p.userId,
          username: p.user.username,
          displayName: p.user.displayName,
          avatarUrl: p.user.avatarUrl,
          result: p.result,
          score: p.score,
        })),
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

  /**
   * 2. Single Match Detailed View:
   * Returns complete match overview, players, moves history, and linked transactions.
   */
  static async getMatchDetails(userId: string, matchId: string) {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        players: { include: { user: true } },
        moves: { orderBy: { turnNumber: "asc" } },
        stats: true,
        gameState: true,
      },
    });

    if (!match) {
      throw new AppError("NOT_FOUND", "Match not found", 404);
    }

    const isParticipant = match.players.some((p) => p.userId === userId);
    if (!isParticipant) {
      throw new AppError("FORBIDDEN", "You are not a participant in this match", 403);
    }

    const transactions = await prisma.transaction.findMany({
      where: {
        userId,
        referenceId: matchId,
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

    const winnerIds = (match.winnerIds as string[]) || [];
    const isWinner = winnerIds.includes(userId);
    const totalPot = match.stake * match.players.length;
    const prizePool = Math.round(totalPot * 0.9);
    const winnerPayout = winnerIds.length > 0 ? Math.round(prizePool / winnerIds.length) : 0;

    return {
      matchId: match.id,
      gameId: match.gameId,
      status: match.status,
      stake: match.stake,
      pot: totalPot,
      prizePool,
      winnerPayout,
      winnerIds,
      startedAt: match.startedAt?.toISOString() ?? null,
      endedAt: match.endedAt?.toISOString() ?? null,
      durationSeconds: match.stats?.durationSeconds ?? 0,
      players: match.players.map((p) => ({
        seat: p.seat,
        userId: p.userId,
        username: p.user.username,
        displayName: p.user.displayName,
        result: p.result,
        score: p.score,
      })),
      moves: match.moves.map((m) => ({
        turnNumber: m.turnNumber,
        userId: m.userId,
        seat: m.seat,
        action: m.action,
        appliedAt: m.appliedAt.toISOString(),
      })),
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

  /**
   * 3. User Gameplay Statistics:
   * Aggregates wins, losses, win rates, and net earnings across all games.
   */
  static async getUserGameStats(userId: string, gameId?: string) {
    const where: Record<string, unknown> = {
      players: { some: { userId } },
      status: "FINISHED",
    };

    if (gameId) {
      where.gameId = gameId;
    }

    const matches = await prisma.match.findMany({
      where,
      include: { players: true },
    });

    let totalMatches = matches.length;
    let wins = 0;
    let losses = 0;
    let draws = 0;
    let totalCoinsWon = 0;
    let totalCoinsLost = 0;

    for (const m of matches) {
      const myPlayer = m.players.find((p) => p.userId === userId);
      const winnerIds = (m.winnerIds as string[]) || [];

      if (winnerIds.includes(userId)) {
        wins++;
        const prizePool = Math.round(m.stake * m.players.length * 0.9);
        totalCoinsWon += Math.round(prizePool / winnerIds.length);
      } else if (winnerIds.length === 0) {
        draws++;
        totalCoinsWon += m.stake;
      } else {
        losses++;
        totalCoinsLost += m.stake;
      }
    }

    const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;
    const netCoins = totalCoinsWon - totalCoinsLost;

    return {
      totalMatches,
      wins,
      losses,
      draws,
      winRate,
      totalCoinsWon,
      totalCoinsLost,
      netCoins,
    };
  }
}
