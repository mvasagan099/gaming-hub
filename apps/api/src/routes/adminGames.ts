import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@gaming-hub/db";
import {
  AppError,
  clampPagination,
  isGameId,
  type GameId,
  type GameConfig,
  PRIZE_MODES,
  DRAW_POLICIES,
} from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { parseSchema, routeParams, queryParams, queryString } from "../lib/http";
import { requirePermission } from "../lib/permissions";
import { GameConfigService } from "../services/gameConfigService";

const updateGameConfigSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  enabled: z.boolean().optional(),
  onlineEnabled: z.boolean().optional(),
  minPlayers: z.number().int().min(1).max(10).optional(),
  maxPlayers: z.number().int().min(1).max(10).optional(),
  entryFees: z.array(z.number().int().min(0).max(1_000_000)).min(1).optional(),
  defaultEntryFee: z.number().int().min(0).max(1_000_000).optional(),
  minEntryFee: z.number().int().min(0).max(1_000_000).optional(),
  maxEntryFee: z.number().int().min(0).max(1_000_000).optional(),
  reconnectWindowSeconds: z.number().int().min(5).max(300).optional(),
  turnTimerSeconds: z.number().int().min(0).max(600).optional(),
  matchDurationSeconds: z.number().int().min(0).max(3600).optional(),
  prizeMode: z.enum(PRIZE_MODES).optional(),
  winnerPercentage: z.number().min(0).max(100).optional(),
  fixedPrizeAmount: z.number().int().min(0).optional(),
  drawPolicy: z.enum(DRAW_POLICIES).optional(),
  maxConcurrentMatches: z.number().int().min(1).max(100_000).optional(),
  gameSpecificSettings: z.record(z.string(), z.unknown()).optional(),
});

export async function adminGamesRoutes(app: FastifyInstance) {
  /**
   * GET /api/admin/games
   * Returns list of all games with configuration, version, active match counts.
   */
  app.get("/api/admin/games", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:games:view", prisma);
    const configs = await GameConfigService.getAllConfigs();

    // Query active match counts per game
    const activeMatches = await prisma.match.groupBy({
      by: ["gameId"],
      where: { status: "ACTIVE" },
      _count: { id: true },
    });

    const activeCountMap = new Map(activeMatches.map((m) => [m.gameId, m._count.id]));

    return Object.values(configs).map((c) => ({
      ...c,
      activeMatchesCount: activeCountMap.get(c.gameId) ?? 0,
    }));
  });

  /**
   * GET /api/admin/games/:gameId/config
   * Returns full configuration for a single game.
   */
  app.get("/api/admin/games/:gameId/config", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:games:view", prisma);
    const { gameId } = routeParams(request);
    if (!isGameId(gameId as GameId)) {
      throw new AppError("NOT_FOUND", `Game '${gameId}' not found`, 404);
    }
    return GameConfigService.getGameConfig(gameId as GameId);
  });

  /**
   * POST /api/admin/games/:gameId/config
   * Full or partial update of game configuration.
   */
  app.post("/api/admin/games/:gameId/config", { preHandler: authenticate }, async (request) => {
    const user = await requirePermission(request, "admin:games:manage", prisma);
    const { gameId } = routeParams(request);
    if (!isGameId(gameId as GameId)) {
      throw new AppError("NOT_FOUND", `Game '${gameId}' not found`, 404);
    }

    const body = parseSchema(updateGameConfigSchema, request.body);
    const updated = await GameConfigService.updateGameConfig(gameId as GameId, body as Partial<GameConfig>, user.id);
    return { ok: true, config: updated };
  });

  /**
   * PATCH /api/admin/games/:gameId/config
   */
  app.patch("/api/admin/games/:gameId/config", { preHandler: authenticate }, async (request) => {
    const user = await requirePermission(request, "admin:games:manage", prisma);
    const { gameId } = routeParams(request);
    if (!isGameId(gameId as GameId)) {
      throw new AppError("NOT_FOUND", `Game '${gameId}' not found`, 404);
    }

    const body = parseSchema(updateGameConfigSchema, request.body);
    const updated = await GameConfigService.updateGameConfig(gameId as GameId, body as Partial<GameConfig>, user.id);
    return { ok: true, config: updated };
  });

  /**
   * POST /api/admin/games/:gameId/enable
   */
  app.post("/api/admin/games/:gameId/enable", { preHandler: authenticate }, async (request) => {
    const user = await requirePermission(request, "admin:games:manage", prisma);
    const { gameId } = routeParams(request);
    if (!isGameId(gameId as GameId)) {
      throw new AppError("NOT_FOUND", `Game '${gameId}' not found`, 404);
    }
    const updated = await GameConfigService.setGameEnabled(gameId as GameId, true, user.id);
    return { ok: true, config: updated };
  });

  /**
   * POST /api/admin/games/:gameId/disable
   */
  app.post("/api/admin/games/:gameId/disable", { preHandler: authenticate }, async (request) => {
    const user = await requirePermission(request, "admin:games:manage", prisma);
    const { gameId } = routeParams(request);
    if (!isGameId(gameId as GameId)) {
      throw new AppError("NOT_FOUND", `Game '${gameId}' not found`, 404);
    }
    const updated = await GameConfigService.setGameEnabled(gameId as GameId, false, user.id);
    return { ok: true, config: updated };
  });

  /**
   * POST /api/admin/games/:gameId/online/enable
   */
  app.post("/api/admin/games/:gameId/online/enable", { preHandler: authenticate }, async (request) => {
    const user = await requirePermission(request, "admin:games:manage", prisma);
    const { gameId } = routeParams(request);
    if (!isGameId(gameId as GameId)) {
      throw new AppError("NOT_FOUND", `Game '${gameId}' not found`, 404);
    }
    const updated = await GameConfigService.setOnlineEnabled(gameId as GameId, true, user.id);
    return { ok: true, config: updated };
  });

  /**
   * POST /api/admin/games/:gameId/online/disable
   */
  app.post("/api/admin/games/:gameId/online/disable", { preHandler: authenticate }, async (request) => {
    const user = await requirePermission(request, "admin:games:manage", prisma);
    const { gameId } = routeParams(request);
    if (!isGameId(gameId as GameId)) {
      throw new AppError("NOT_FOUND", `Game '${gameId}' not found`, 404);
    }
    const updated = await GameConfigService.setOnlineEnabled(gameId as GameId, false, user.id);
    return { ok: true, config: updated };
  });

  /**
   * GET /api/admin/games/audit-logs
   * Retrieves configuration audit logs.
   */
  app.get("/api/admin/games/audit-logs", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:audit:view", prisma);
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: {
          category: "game",
          targetType: "game_config",
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditLog.count({
        where: {
          category: "game",
          targetType: "game_config",
        },
      }),
    ]);

    return {
      items: items.map((l) => ({
        id: l.id,
        action: l.action,
        gameId: l.targetId,
        adminId: l.actorId,
        adminUsername: l.actorId ? `admin-${l.actorId.slice(0, 6)}` : "system",
        adminDisplayName: "Admin",
        meta: (l.meta ?? {}) as Record<string, any>,
        createdAt: l.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  });
}
