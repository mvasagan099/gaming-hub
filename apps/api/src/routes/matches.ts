import type { FastifyInstance } from "fastify";
import { prisma } from "@gaming-hub/db";
import { AppError, clampPagination } from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { requireUser, routeParams, queryParams, queryString } from "../lib/http";

export async function matchesRoutes(app: FastifyInstance) {
  const handleMatchHistory = async (request: any) => {
    const user = requireUser(request);
    const q = queryParams(request);
    const requestedLimit = Number(queryString(q.limit) || queryString(q.pageSize) || 20);
    const clampedLimit = Math.max(1, Math.min(100, requestedLimit));
    const { page, pageSize } = clampPagination(queryString(q.page), String(clampedLimit));

    const gameIdFilter = queryString(q.gameId);
    const resultFilter = queryString(q.result)?.toUpperCase();

    const where: any = {
      players: {
        some: {
          userId: user.id,
          ...(resultFilter && ["WIN", "LOSS", "DRAW", "FORFEIT"].includes(resultFilter)
            ? { result: resultFilter === "FORFEIT" ? "LOSS" : resultFilter }
            : {}),
        },
      },
      ...(gameIdFilter ? { gameId: gameIdFilter } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.match.findMany({
        where,
        orderBy: [{ endedAt: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          players: { include: { user: true } },
          stats: true,
        },
      }),
      prisma.match.count({ where }),
    ]);

    const historyItems = items.map((m) => {
      const myPlayer = m.players.find((p) => p.userId === user.id);
      const opponentPlayer = m.players.find((p) => p.userId !== user.id);
      const winnerIds = (m.winnerIds as string[]) || [];
      const isWinner = winnerIds.includes(user.id);
      const isDraw = winnerIds.length === 0 && m.status === "FINISHED";
      const totalPot = m.stake * m.players.length;
      const prizePool = Math.round(totalPot * 0.9);
      const winnerPayout = winnerIds.length > 0 ? Math.round(prizePool / winnerIds.length) : 0;

      let resultType = "DRAW";
      let coinsWon = 0;
      let coinsLost = 0;

      if (isDraw) {
        resultType = "DRAW";
        coinsWon = m.stake;
        coinsLost = 0;
      } else if (isWinner) {
        resultType = "WIN";
        coinsWon = winnerPayout;
        coinsLost = 0;
      } else {
        resultType = "LOSS";
        coinsWon = 0;
        coinsLost = m.stake;
      }

      const netCoins = isWinner ? winnerPayout - m.stake : isDraw ? 0 : -m.stake;
      const duration = m.stats?.durationSeconds ?? (m.startedAt && m.endedAt ? Math.max(0, Math.round((m.endedAt.getTime() - m.startedAt.getTime()) / 1000)) : 0);

      return {
        id: m.id,
        matchId: m.id,
        roomId: m.roomId,
        gameId: m.gameId,
        status: m.status,
        resultType,
        result: myPlayer?.result ?? (isWinner ? "WIN" : isDraw ? "DRAW" : "LOSS"),
        playerId: user.id,
        opponentId: opponentPlayer?.userId ?? null,
        opponentName: opponentPlayer?.user.displayName || opponentPlayer?.user.username || "Opponent",
        opponentAvatar: opponentPlayer?.user.avatarUrl ?? null,
        score: myPlayer?.score ?? 0,
        opponentScore: opponentPlayer?.score ?? 0,
        entryFee: m.stake,
        coinsWon,
        coinsLost,
        netCoins,
        duration,
        winnerIds,
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
      items: historyItems,
      total,
      page,
      limit: pageSize,
      pageSize,
    };
  };

  app.get("/api/matches", { preHandler: authenticate }, handleMatchHistory);
  app.get("/api/matches/history", { preHandler: authenticate }, handleMatchHistory);
  app.get("/matches/history", { preHandler: authenticate }, handleMatchHistory);

  app.get("/api/matches/:id", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const { id } = routeParams(request);
    const match = await prisma.match.findUnique({
      where: { id },
      include: {
        players: { include: { user: true } },
        moves: { orderBy: { turnNumber: "asc" } },
        gameState: true,
        stats: true,
      },
    });

    if (!match) {
      throw new AppError("NOT_FOUND", "Match not found", 404);
    }

    const isParticipant = match.players.some((p) => p.userId === user.id);
    const isAdmin = user.role === "ADMIN";
    if (!isParticipant && !isAdmin) {
      throw new AppError("FORBIDDEN", "You cannot view this match", 403);
    }

    const winnerIds = (match.winnerIds as string[]) || [];
    const totalPot = match.stake * match.players.length;
    const prizePool = Math.round(totalPot * 0.9);
    const winnerPayout = winnerIds.length > 0 ? Math.round(prizePool / winnerIds.length) : 0;

    return {
      id: match.id,
      matchId: match.id,
      roomId: match.roomId,
      gameId: match.gameId,
      status: match.status,
      winnerIds,
      stake: match.stake,
      pot: totalPot,
      prizePool,
      winnerPayout,
      startedAt: match.startedAt?.toISOString() ?? null,
      endedAt: match.endedAt?.toISOString() ?? null,
      finishedAt: match.endedAt?.toISOString() ?? null,
      duration: match.stats?.durationSeconds ?? 0,
      players: match.players.map((p) => ({
        seat: p.seat,
        userId: p.userId,
        username: p.user.username,
        displayName: p.user.displayName,
        avatarUrl: p.user.avatarUrl,
        result: p.result,
        score: p.score,
      })),
      moves: match.moves.map((m) => ({
        id: m.id,
        matchId: m.matchId,
        userId: m.userId,
        seat: m.seat,
        turnNumber: m.turnNumber,
        action: m.action as Record<string, unknown>,
        appliedAt: m.appliedAt.toISOString(),
      })),
      finalState: match.gameState?.state,
    };
  });
}
