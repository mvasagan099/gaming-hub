import type { FastifyInstance } from "fastify";
import { prisma } from "@gaming-hub/db";
import { AppError, clampPagination } from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { requireUser, routeParams, queryParams, queryString } from "../lib/http";

export async function matchesRoutes(app: FastifyInstance) {
  app.get("/api/matches", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));

    const where = {
      players: { some: { userId: user.id } },
    };

    const [items, total] = await Promise.all([
      prisma.match.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { players: { include: { user: true } } },
      }),
      prisma.match.count({ where }),
    ]);

    return {
      items: items.map((m) => ({
        id: m.id,
        roomId: m.roomId,
        gameId: m.gameId,
        status: m.status,
        winnerIds: m.winnerIds as string[],
        stake: m.stake,
        startedAt: m.startedAt?.toISOString() ?? null,
        endedAt: m.endedAt?.toISOString() ?? null,
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
      })),
      total,
      page,
      pageSize,
    };
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

    return {
      id: match.id,
      roomId: match.roomId,
      gameId: match.gameId,
      status: match.status,
      winnerIds: match.winnerIds as string[],
      stake: match.stake,
      startedAt: match.startedAt?.toISOString() ?? null,
      endedAt: match.endedAt?.toISOString() ?? null,
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
