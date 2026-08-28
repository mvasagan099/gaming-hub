import { prisma } from "@gaming-hub/db";
import {
  AppError,
  type GameId,
  type ResultReason,
  type MatchHistoryRecord,
  type MatchHistoryPlayer,
  type MatchSummaryView,
  type ReplayPackage,
  type GlobalPlayerStatistics,
  type AllGameSpecificStats,
  type TimeLimitAnalytics,
} from "@gaming-hub/shared";

function formatDurationSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

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
    isTournament?: boolean;
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

    if (params.gameId && params.gameId !== "all") {
      where.gameId = params.gameId;
    }

    if (params.status) {
      where.status = params.status;
    }

    if (params.isTournament) {
      where.roomId = { startsWith: "tournament_" };
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
          room: true,
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

      let resultType: "WIN" | "LOSS" | "DRAW" | "CANCELLED" | "FORFEIT" = "DRAW";
      let coinsWon = 0;
      let coinsLost = 0;

      if (m.status === "ABORTED") {
        resultType = "CANCELLED";
        coinsWon = m.stake;
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

      const durationSeconds = m.stats?.durationSeconds ??
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

      const roomSettings = (m.room?.settings ?? {}) as Record<string, unknown>;
      const configVersion = (roomSettings.configSnapshot as any)?.configVersion ?? 1;

      const playersFormatted: MatchHistoryPlayer[] = m.players.map((p) => ({
        userId: p.userId,
        username: p.user.username,
        displayName: p.user.displayName,
        avatarUrl: p.user.avatarUrl,
        seat: p.seat,
        score: p.score,
        result: p.result as "WIN" | "LOSS" | "DRAW" | "FORFEIT" | "PENDING",
      }));

      const player1 = playersFormatted.find((p) => p.userId === params.userId) ?? playersFormatted[0]!;
      const player2 = playersFormatted.find((p) => p.userId !== params.userId) ?? playersFormatted[1] ?? null;

      const finalScores: Record<string, number> = {};
      for (const p of m.players) {
        finalScores[p.userId] = p.score;
      }

      const rawReason = (m.resultReason ?? "NORMAL").toUpperCase();
      const resultReason: ResultReason = rawReason.includes("TIME")
        ? "TIME_LIMIT"
        : rawReason.includes("FORFEIT")
          ? "TIMEOUT"
          : rawReason.includes("ABANDON")
            ? "ABANDONED"
            : rawReason.includes("DRAW")
              ? "DRAW"
              : "NORMAL";

      const record: MatchHistoryRecord & {
        id: string;
        playerId: string;
        opponentId: string | null;
        opponentName: string;
        opponentAvatar: string | null;
        score: number;
        opponentScore: number;
        coinsWon: number;
        coinsLost: number;
        netCoins: number;
        duration: number;
        transactionIds: string[];
        finishedAt: string | null;
      } = {
        id: m.id,
        matchId: m.id,
        roomId: m.roomId,
        gameType: m.gameId as GameId,
        gameId: m.gameId as GameId,
        player1,
        player2,
        players: playersFormatted,
        winner: winnerIds[0] ?? null,
        winnerIds,
        loser: player2?.userId ?? null,
        resultReason,
        resultType,
        startedAt: m.startedAt?.toISOString() ?? null,
        endedAt: m.endedAt?.toISOString() ?? null,
        durationSeconds,
        finalScores,
        tournamentId: tournamentInfo.tournamentId ?? null,
        tournamentInfo,
        entryFee: m.stake,
        configurationVersion: configVersion,
        createdAt: m.createdAt.toISOString(),
        playerId: params.userId,
        opponentId: primaryOpponent?.userId ?? null,
        opponentName: primaryOpponent?.user.displayName || primaryOpponent?.user.username || "Opponent",
        opponentAvatar: primaryOpponent?.user.avatarUrl ?? null,
        score: myPlayer?.score ?? 0,
        opponentScore: primaryOpponent?.score ?? 0,
        coinsWon,
        coinsLost,
        netCoins,
        duration: durationSeconds,
        transactionIds: txMap.get(m.id) ?? [],
        finishedAt: m.endedAt?.toISOString() ?? null,
      };

      return record;
    });

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
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
        room: true,
      },
    });

    if (!match) {
      throw new AppError("NOT_FOUND", "Match not found", 404);
    }

    const isParticipant = match.players.some((p) => p.userId === userId);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const isAdmin = user?.role === "ADMIN";
    if (!isParticipant && !isAdmin) {
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
    const durationSeconds = match.stats?.durationSeconds ??
      (match.startedAt && match.endedAt ? Math.max(0, Math.round((match.endedAt.getTime() - match.startedAt.getTime()) / 1000)) : 0);

    const rawReason = (match.resultReason ?? "NORMAL").toUpperCase();
    const resultReason: ResultReason = rawReason.includes("TIME")
      ? "TIME_LIMIT"
      : rawReason.includes("FORFEIT")
        ? "TIMEOUT"
        : rawReason.includes("ABANDON")
          ? "ABANDONED"
          : rawReason.includes("DRAW")
            ? "DRAW"
            : "NORMAL";

    return {
      matchId: match.id,
      gameId: match.gameId,
      status: match.status,
      stake: match.stake,
      pot: totalPot,
      prizePool,
      winnerPayout,
      winnerIds,
      resultReason,
      startedAt: match.startedAt?.toISOString() ?? null,
      endedAt: match.endedAt?.toISOString() ?? null,
      durationSeconds,
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
   * 3. Formatted Match Summary View (Requirement 2):
   */
  static async getMatchSummary(userId: string, matchId: string): Promise<MatchSummaryView> {
    const details = await this.getMatchDetails(userId, matchId);
    const myPlayer = details.players.find((p) => p.userId === userId) ?? details.players[0]!;
    const opponent = details.players.find((p) => p.userId !== userId) ?? details.players[1];

    const isWinner = details.winnerIds.includes(userId);
    const isDraw = details.winnerIds.length === 0;
    const result: "WIN" | "LOSS" | "DRAW" | "CANCELLED" | "FORFEIT" =
      details.status === "ABORTED"
        ? "CANCELLED"
        : isDraw
          ? "DRAW"
          : isWinner
            ? "WIN"
            : myPlayer.result === "LOSS"
              ? "LOSS"
              : "FORFEIT";

    const myScore = myPlayer.score;
    const opponentScore = opponent?.score ?? 0;
    const formattedScore = `${myPlayer.displayName || myPlayer.username} ${myScore} - ${opponent?.displayName || opponent?.username || "Opponent"} ${opponentScore}`;

    return {
      game: details.gameId.toUpperCase(),
      gameId: details.gameId as GameId,
      result,
      opponentName: opponent?.displayName || opponent?.username || "Opponent",
      myScore,
      opponentScore,
      formattedScore,
      matchDuration: formatDurationSeconds(details.durationSeconds),
      durationSeconds: details.durationSeconds,
      resultReason: details.resultReason,
      startedAt: details.startedAt ?? new Date().toISOString(),
      endedAt: details.endedAt ?? new Date().toISOString(),
    };
  }

  /**
   * 4. Secure Match Replay Retrieval:
   */
  static async getMatchReplay(userId: string, matchId: string): Promise<ReplayPackage> {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { players: true, room: true },
    });

    if (!match) {
      throw new AppError("NOT_FOUND", "Match not found", 404);
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const isParticipant = match.players.some((p) => p.userId === userId);
    const isAdmin = user?.role === "ADMIN";
    const isTournamentMatch = Boolean(match.roomId?.startsWith("tournament_"));

    if (!isParticipant && !isAdmin && !isTournamentMatch) {
      throw new AppError("FORBIDDEN", "Unauthorized access to match replay", 403);
    }

    const replay = await prisma.replay.findUnique({ where: { matchId } });
    if (replay && replay.payload) {
      return replay.payload as unknown as ReplayPackage;
    }

    // Fallback: reconstruct minimal package from moves
    const moves = await prisma.move.findMany({
      where: { matchId },
      orderBy: { turnNumber: "asc" },
    });

    const events = moves.map((m, idx) => ({
      eventId: `ev_${m.id}`,
      matchId,
      sequence: idx + 1,
      playerId: m.userId,
      eventType: (m.action as any)?.type ?? "ACTION",
      timestamp: m.appliedAt.getTime(),
      stateVersion: m.turnNumber,
      actionData: m.action as Record<string, unknown>,
      resultData: {},
    }));

    return {
      matchId: match.id,
      gameId: match.gameId as GameId,
      metadata: {
        players: match.players.map((p) => ({ id: p.userId, username: p.userId, seat: p.seat, score: p.score })),
        startedAt: match.startedAt?.getTime() ?? Date.now(),
        endedAt: match.endedAt?.getTime() ?? Date.now(),
        durationMs: match.startedAt && match.endedAt ? match.endedAt.getTime() - match.startedAt.getTime() : 0,
        winnerIds: (match.winnerIds as string[]) || [],
        resultReason: (match.resultReason as ResultReason) ?? "NORMAL",
        actionCount: events.length,
      },
      initialState: {},
      events,
      snapshots: [],
      finalState: {},
    };
  }

  /**
   * 5. User Gameplay & Game-Specific Statistics (Requirements 4, 5, 6):
   */
  static async getPlayerStatistics(userId: string): Promise<GlobalPlayerStatistics> {
    const matches = await prisma.match.findMany({
      where: {
        players: { some: { userId } },
        status: "FINISHED",
      },
      include: {
        players: true,
        stats: true,
      },
    });

    let totalMatches = matches.length;
    let totalWins = 0;
    let totalLosses = 0;
    let totalDraws = 0;
    let tournamentMatches = 0;
    let tournamentWins = 0;
    let timeLimitMatches = 0;
    let totalDuration = 0;
    let shortestMatch = totalMatches > 0 ? Infinity : 0;
    let longestMatch = 0;

    const gameStatsMap: Record<string, any> = {};

    for (const m of matches) {
      const myPlayer = m.players.find((p) => p.userId === userId);
      const winnerIds = (m.winnerIds as string[]) || [];
      const isWinner = winnerIds.includes(userId);
      const isDraw = winnerIds.length === 0;
      const isTournament = Boolean(m.roomId?.startsWith("tournament_"));

      const duration = m.stats?.durationSeconds ??
        (m.startedAt && m.endedAt ? Math.max(0, Math.round((m.endedAt.getTime() - m.startedAt.getTime()) / 1000)) : 0);

      totalDuration += duration;
      if (duration < shortestMatch) shortestMatch = duration;
      if (duration > longestMatch) longestMatch = duration;

      if ((m.resultReason ?? "").toUpperCase().includes("TIME")) {
        timeLimitMatches++;
      }

      if (isTournament) {
        tournamentMatches++;
        if (isWinner) tournamentWins++;
      }

      if (isWinner) {
        totalWins++;
      } else if (isDraw) {
        totalDraws++;
      } else {
        totalLosses++;
      }

      // Aggregate Game-Specific Statistics
      const gId = m.gameId;
      if (!gameStatsMap[gId]) {
        gameStatsMap[gId] = {
          matches: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          scores: [] as number[],
          durations: [] as number[],
          totalScore: 0,
          highestScore: 0,
          breaks: [] as number[],
        };
      }

      const g = gameStatsMap[gId];
      g.matches++;
      if (isWinner) g.wins++;
      else if (isDraw) g.draws++;
      else g.losses++;

      const score = myPlayer?.score ?? 0;
      g.scores.push(score);
      g.totalScore += score;
      if (score > g.highestScore) g.highestScore = score;
      g.durations.push(duration);
    }

    const winRate = totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : 0;
    const averageMatchDuration = totalMatches > 0 ? Math.round(totalDuration / totalMatches) : 0;
    if (shortestMatch === Infinity) shortestMatch = 0;

    // Build specific structures for all 10 games
    const gameStats: Partial<AllGameSpecificStats> = {};

    if (gameStatsMap["snooker"]) {
      const g = gameStatsMap["snooker"];
      const avgDuration = g.durations.length > 0 ? Math.round(g.durations.reduce((a: number, b: number) => a + b, 0) / g.durations.length) : 0;
      gameStats.snooker = {
        matches: g.matches,
        wins: g.wins,
        losses: g.losses,
        winRate: g.matches > 0 ? Math.round((g.wins / g.matches) * 100) : 0,
        highestBreak: g.highestScore,
        averageBreak: g.scores.length > 0 ? Math.round(g.totalScore / g.scores.length) : 0,
        averageDuration: avgDuration,
        totalPots: g.totalScore,
        fouls: 0,
      };
    }

    if (gameStatsMap["chess"]) {
      const g = gameStatsMap["chess"];
      const avgDuration = g.durations.length > 0 ? Math.round(g.durations.reduce((a: number, b: number) => a + b, 0) / g.durations.length) : 0;
      gameStats.chess = {
        matches: g.matches,
        wins: g.wins,
        losses: g.losses,
        draws: g.draws,
        winRate: g.matches > 0 ? Math.round((g.wins / g.matches) * 100) : 0,
        averageDuration: avgDuration,
        checkmates: g.wins,
        totalMoves: g.totalScore,
      };
    }

    if (gameStatsMap["cricket"]) {
      const g = gameStatsMap["cricket"];
      const avgRuns = g.scores.length > 0 ? Math.round(g.totalScore / g.scores.length) : 0;
      const avgDuration = g.durations.length > 0 ? Math.round(g.durations.reduce((a: number, b: number) => a + b, 0) / g.durations.length) : 0;
      gameStats.cricket = {
        matches: g.matches,
        wins: g.wins,
        losses: g.losses,
        runs: g.totalScore,
        averageRuns: avgRuns,
        highestScore: g.highestScore,
        wickets: 0,
        boundaries: 0,
        sixes: 0,
        averageDuration: avgDuration,
      };
    }

    if (gameStatsMap["carrom"]) {
      const g = gameStatsMap["carrom"];
      const avgDuration = g.durations.length > 0 ? Math.round(g.durations.reduce((a: number, b: number) => a + b, 0) / g.durations.length) : 0;
      gameStats.carrom = {
        matches: g.matches,
        wins: g.wins,
        losses: g.losses,
        points: g.totalScore,
        highestScore: g.highestScore,
        queensCovered: 0,
        fouls: 0,
        averageDuration: avgDuration,
      };
    }

    const gamesPlayed = Object.keys(gameStatsMap).length;

    return {
      userId,
      totalMatches,
      totalWins,
      totalLosses,
      totalDraws,
      winRate,
      gamesPlayed,
      tournamentMatches,
      tournamentWins,
      averageMatchDuration,
      shortestMatch,
      longestMatch,
      timeLimitMatches,
      gameStats,
    };
  }

  /**
   * 6. Time-Limit & Duration Analytics (Requirements 6, 7, 35):
   */
  static async getTimeLimitAnalytics(): Promise<TimeLimitAnalytics[]> {
    const matches = await prisma.match.findMany({
      where: { status: "FINISHED" },
      include: { stats: true },
    });

    const byGame: Record<string, {
      normal: number;
      timeLimit: number;
      timeout: number;
      abandoned: number;
      draw: number;
      durations: number[];
    }> = {};

    for (const m of matches) {
      if (!byGame[m.gameId]) {
        byGame[m.gameId] = { normal: 0, timeLimit: 0, timeout: 0, abandoned: 0, draw: 0, durations: [] };
      }
      const entry = byGame[m.gameId]!;
      const reason = (m.resultReason ?? "NORMAL").toUpperCase();
      if (reason.includes("TIME_LIMIT") || reason.includes("TIME")) entry.timeLimit++;
      else if (reason.includes("TIMEOUT") || reason.includes("FORFEIT")) entry.timeout++;
      else if (reason.includes("ABANDON")) entry.abandoned++;
      else if (reason.includes("DRAW")) entry.draw++;
      else entry.normal++;

      const duration = m.stats?.durationSeconds ??
        (m.startedAt && m.endedAt ? Math.max(0, Math.round((m.endedAt.getTime() - m.startedAt.getTime()) / 1000)) : 0);
      entry.durations.push(duration);
    }

    return Object.entries(byGame).map(([gameId, data]) => {
      const totalCompleted = data.normal + data.timeLimit + data.timeout + data.abandoned + data.draw;
      const averageDuration = data.durations.length > 0 ? Math.round(data.durations.reduce((a, b) => a + b, 0) / data.durations.length) : 0;
      const normalPercentage = totalCompleted > 0 ? Math.round((data.normal / totalCompleted) * 100) : 0;
      const timeLimitPercentage = totalCompleted > 0 ? Math.round((data.timeLimit / totalCompleted) * 100) : 0;
      const timeoutPercentage = totalCompleted > 0 ? Math.round((data.timeout / totalCompleted) * 100) : 0;

      return {
        gameId,
        normalCompletionCount: data.normal,
        timeLimitCompletionCount: data.timeLimit,
        timeoutCount: data.timeout,
        abandonedCount: data.abandoned,
        drawCount: data.draw,
        totalCompleted,
        averageDuration,
        normalPercentage,
        timeLimitPercentage,
        timeoutPercentage,
      };
    });
  }

  /**
   * 7. Admin Search Across Matches (Requirement 37):
   */
  static async adminSearchMatches(query: {
    matchId?: string;
    userId?: string;
    gameId?: string;
    dateFrom?: string;
    dateTo?: string;
    resultReason?: string;
    tournamentId?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, query.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};

    if (query.matchId) {
      where.id = { contains: query.matchId, mode: "insensitive" };
    }
    if (query.gameId) {
      where.gameId = query.gameId;
    }
    if (query.userId) {
      where.players = { some: { userId: query.userId } };
    }
    if (query.resultReason) {
      where.resultReason = { contains: query.resultReason, mode: "insensitive" };
    }
    if (query.tournamentId) {
      where.roomId = { contains: query.tournamentId };
    }
    if (query.dateFrom || query.dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (query.dateFrom) dateFilter.gte = new Date(query.dateFrom);
      if (query.dateTo) dateFilter.lte = new Date(query.dateTo);
      where.createdAt = dateFilter;
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

    return {
      items: matches.map((m) => ({
        matchId: m.id,
        gameId: m.gameId,
        status: m.status,
        winnerIds: m.winnerIds,
        stake: m.stake,
        resultReason: m.resultReason ?? "NORMAL",
        durationSeconds: m.stats?.durationSeconds ?? 0,
        startedAt: m.startedAt?.toISOString() ?? null,
        endedAt: m.endedAt?.toISOString() ?? null,
        createdAt: m.createdAt.toISOString(),
        players: m.players.map((p) => ({
          userId: p.userId,
          username: p.user.username,
          displayName: p.user.displayName,
          seat: p.seat,
          score: p.score,
          result: p.result,
        })),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /**
   * 8. User Game Statistics Backward-Compatible Aggregator:
   */
  static async getUserGameStats(userId: string, gameId?: string) {
    const where: Record<string, unknown> = {
      players: { some: { userId } },
      status: "FINISHED",
    };

    if (gameId && gameId !== "all") {
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

