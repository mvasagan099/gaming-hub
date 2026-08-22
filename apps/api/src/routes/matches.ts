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

    const { GameHistoryService } = await import("../services/gameHistoryService");

    return GameHistoryService.listUserGameHistory({
      userId: user.id,
      gameId: queryString(q.gameId),
      result: queryString(q.result),
      status: queryString(q.status),
      opponentId: queryString(q.opponentId),
      dateFrom: queryString(q.dateFrom),
      dateTo: queryString(q.dateTo),
      page,
      pageSize,
    });
  };

  app.get("/api/games/history", { preHandler: authenticate }, handleMatchHistory);
  app.get("/api/matches", { preHandler: authenticate }, handleMatchHistory);
  app.get("/api/matches/history", { preHandler: authenticate }, handleMatchHistory);
  app.get("/matches/history", { preHandler: authenticate }, handleMatchHistory);

  app.get("/api/games/history/stats", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const q = queryParams(request);
    const { GameHistoryService } = await import("../services/gameHistoryService");
    return GameHistoryService.getUserGameStats(user.id, queryString(q.gameId));
  });

  app.get("/api/games/history/:id", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const { id } = routeParams(request);
    const { GameHistoryService } = await import("../services/gameHistoryService");
    return GameHistoryService.getMatchDetails(user.id, id);
  });

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

  /**
   * GET /api/matches/active
   * Returns active match state snapshot for authenticated reconnecting player.
   */
  app.get("/api/matches/active", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const { MatchRecoveryService } = await import("../services/matchRecoveryService");
    const activeMatch = await MatchRecoveryService.getActiveMatchForUser(user.id);
    return { ok: true, activeMatch };
  });

  /**
   * POST /api/matches/:id/reconnect
   * Reconnects player to specific match and retrieves state.
   */
  app.post("/api/matches/:id/reconnect", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const { id } = routeParams(request);
    const { MatchRecoveryService } = await import("../services/matchRecoveryService");
    const result = await MatchRecoveryService.reconnectMatch({
      matchId: id,
      userId: user.id,
    });
    return result;
  });
}
