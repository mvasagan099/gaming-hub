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
  TIMEOUT_RESOLUTIONS,
  type TimeoutResolution,
} from "@gaming-hub/shared";
import { authenticate, requireMfa } from "../plugins/authenticate";
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
  turnTimeout: z.number().int().min(0).max(600).optional(),
  matchDurationSeconds: z.number().int().min(30).max(600).optional(),
  maxMatchDuration: z.number().int().min(30).max(600).optional(),
  timeoutResolution: z.enum(TIMEOUT_RESOLUTIONS).optional(),
  allowDraw: z.boolean().optional(),
  prizeMode: z.enum(PRIZE_MODES).optional(),
  winnerPercentage: z.number().min(0).max(100).optional(),
  fixedPrizeAmount: z.number().int().min(0).optional(),
  drawPolicy: z.enum(DRAW_POLICIES).optional(),
  maxConcurrentMatches: z.number().int().min(1).max(100_000).optional(),
  gameSpecificSettings: z.record(z.string(), z.unknown()).optional(),
});

export async function adminGamesRoutes(app: FastifyInstance) {
  /**
   * GET /api/admin/games/statistics
   * Returns complete overview statistics across all platform games.
   */
  app.get("/api/admin/games/statistics", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:games:view", prisma);
    const q = queryParams(request);
    const { AdminGameStatsService } = await import("../services/adminGameStatsService");

    return AdminGameStatsService.getGamesOverviewStatistics({
      dateFrom: queryString(q.dateFrom),
      dateTo: queryString(q.dateTo),
      sortBy: queryString(q.sortBy),
    });
  });

  /**
   * GET /api/admin/games/statistics/:gameId
   * Returns deep analytical metrics for a single game.
   */
  app.get("/api/admin/games/statistics/:gameId", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:games:view", prisma);
    const { gameId } = routeParams(request);
    const q = queryParams(request);
    const { AdminGameStatsService } = await import("../services/adminGameStatsService");

    return AdminGameStatsService.getGameDetailStatistics(gameId, {
      dateFrom: queryString(q.dateFrom),
      dateTo: queryString(q.dateTo),
    });
  });

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
  app.post("/api/admin/games/:gameId/config", { preHandler: [authenticate, requireMfa] }, async (request) => {
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
  app.patch("/api/admin/games/:gameId/config", { preHandler: [authenticate, requireMfa] }, async (request) => {
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
  app.post("/api/admin/games/:gameId/enable", { preHandler: [authenticate, requireMfa] }, async (request) => {
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
  app.post("/api/admin/games/:gameId/disable", { preHandler: [authenticate, requireMfa] }, async (request) => {
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
  app.post("/api/admin/games/:gameId/online/enable", { preHandler: [authenticate, requireMfa] }, async (request) => {
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
  app.post("/api/admin/games/:gameId/online/disable", { preHandler: [authenticate, requireMfa] }, async (request) => {
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

  /**
   * GET /api/admin/entries
   * Filterable and paginated list of all game entries across the platform.
   */
  app.get("/api/admin/entries", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:games:view", prisma);
    const q = queryParams(request);
    const { GameEntryLifecycleService } = await import("../services/gameEntryLifecycleService");
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));

    return GameEntryLifecycleService.listAdminEntries({
      gameId: queryString(q.gameId),
      userId: queryString(q.userId),
      matchId: queryString(q.matchId),
      status: queryString(q.status),
      page,
      pageSize,
    });
  });

  /**
   * GET /api/admin/matches/:id/trace
   * Full lifecycle traceability of a match and its player entries.
   */
  app.get("/api/admin/matches/:id/trace", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:games:view", prisma);
    const { id } = routeParams(request);
    const { GameEntryLifecycleService } = await import("../services/gameEntryLifecycleService");
    const trace = await GameEntryLifecycleService.getEntryTrace(id);
    return { ok: true, matchId: id, trace };
  });

  /**
   * POST /api/admin/refunds/match
   * Admin-authorized refund for a match entry.
   */
  app.post("/api/admin/refunds/match", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:wallet:adjust", prisma);
    const body = parseSchema(
      z.object({
        matchId: z.string().min(1),
        userId: z.string().min(1),
        reason: z.string().min(1).max(255),
      }),
      request.body,
    );

    const { RefundService } = await import("../services/refundService");
    const result = await RefundService.processAdminRefund({
      referenceType: "MATCH",
      referenceId: body.matchId,
      userId: body.userId,
      reason: body.reason,
      adminId: admin.id,
    });

    return { ok: true, result };
  });

  /**
   * POST /api/admin/refunds/tournament
   * Admin-authorized refund for a tournament registration.
   */
  app.post("/api/admin/refunds/tournament", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:wallet:adjust", prisma);
    const body = parseSchema(
      z.object({
        tournamentId: z.string().min(1),
        userId: z.string().min(1),
        reason: z.string().min(1).max(255),
      }),
      request.body,
    );

    const { RefundService } = await import("../services/refundService");
    const result = await RefundService.processAdminRefund({
      referenceType: "TOURNAMENT",
      referenceId: body.tournamentId,
      userId: body.userId,
      reason: body.reason,
      adminId: admin.id,
    });

    return { ok: true, result };
  });

  /**
   * POST /api/admin/settlement/match
   * Admin-authorized settlement for a match.
   */
  app.post("/api/admin/settlement/match", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:wallet:adjust", prisma);
    const body = parseSchema(
      z.object({
        matchId: z.string().min(1),
        winnerIds: z.array(z.string()).default([]),
        reason: z.string().min(1).max(255),
      }),
      request.body,
    );

    const { SettlementService } = await import("../services/settlementService");
    const result = await SettlementService.processAdminSettlement({
      referenceType: "MATCH",
      referenceId: body.matchId,
      winnerIds: body.winnerIds,
      reason: body.reason,
      adminId: admin.id,
    });

    return { ok: true, result };
  });

  /**
   * POST /api/admin/settlement/tournament
   * Admin-authorized settlement for a tournament.
   */
  app.post("/api/admin/settlement/tournament", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:wallet:adjust", prisma);
    const body = parseSchema(
      z.object({
        tournamentId: z.string().min(1),
        reason: z.string().min(1).max(255),
      }),
      request.body,
    );

    const { SettlementService } = await import("../services/settlementService");
    const result = await SettlementService.processAdminSettlement({
      referenceType: "TOURNAMENT",
      referenceId: body.tournamentId,
      reason: body.reason,
      adminId: admin.id,
    });

    return { ok: true, result };
  });

  /**
   * GET /api/admin/matches/:id/timeout-status
   * Provides administrative visibility into match timeout status and timers.
   */
  app.get("/api/admin/matches/:id/timeout-status", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:games:manage", prisma);
    const { id } = routeParams(request);
    const { MatchTimeoutService } = await import("../services/matchTimeoutService");
    const status = await MatchTimeoutService.getAdminTimeoutStatus(id);
    return { ok: true, status };
  });

  /**
   * POST /api/admin/matches/:id/force-timeout
   * Manually triggers turn or match timeout from admin dashboard.
   */
  app.post("/api/admin/matches/:id/force-timeout", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:games:manage", prisma);
    const { id } = routeParams(request);
    const body = (request.body ?? {}) as { currentTurnSeat?: number };

    const { MatchTimeoutService } = await import("../services/matchTimeoutService");
    const result = await MatchTimeoutService.checkTurnTimeout({
      matchId: id,
      currentTurnSeat: body.currentTurnSeat ?? 0,
      turnStartedAt: new Date(0), // Forces immediate expiration
    });

    return { ok: true, result, triggeredBy: admin.id };
  });

  /**
   * POST /api/admin/matches/:id/abandon
   * Admin-authorized force-abandon / forfeit of a player with audit trail.
   */
  app.post("/api/admin/matches/:id/abandon", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:games:manage", prisma);
    const { id } = routeParams(request);
    const body = parseSchema(
      z.object({
        userId: z.string().min(1),
        reason: z.string().min(1).max(255),
      }),
      request.body,
    );

    const { MatchAbandonmentService } = await import("../services/matchAbandonmentService");
    const result = await MatchAbandonmentService.processAdminForceForfeit({
      matchId: id,
      userId: body.userId,
      adminId: admin.id,
      reason: body.reason,
    });

    return { ok: true, result };
  });

  /**
   * GET /api/admin/matches/recovery-overview
   * Provides administrative visibility into active match recovery metrics.
   */
  app.get("/api/admin/matches/recovery-overview", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:games:manage", prisma);
    const { PersistentMatchStateService } = await import("../services/persistentMatchStateService");
    const overview = await PersistentMatchStateService.getAdminRecoveryOverview();
    return { ok: true, overview };
  });

  /**
   * POST /api/admin/matches/:id/recover
   * Manually loads and revalidates persistent match state snapshot.
   */
  app.post("/api/admin/matches/:id/recover", { preHandler: [authenticate, requireMfa] }, async (request) => {
    await requirePermission(request, "admin:games:manage", prisma);
    const { id } = routeParams(request);
    const { PersistentMatchStateService } = await import("../services/persistentMatchStateService");
    const result = await PersistentMatchStateService.loadAuthoritativeState(id);
    return result;
  });

  /**
   * GET /api/admin/game-settings
   * Returns centralized game configuration including max duration and timeout strategies for all 10 games.
   */
  app.get("/api/admin/game-settings", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:games:view", prisma);
    const configs = await GameConfigService.getAllConfigs();
    return Object.values(configs).map((c) => ({
      gameId: c.gameId,
      gameType: c.gameId,
      name: c.name,
      enabled: c.enabled,
      maxMatchDuration: c.matchDurationSeconds ?? 600,
      matchDurationSeconds: c.matchDurationSeconds ?? 600,
      turnTimeout: c.turnTimerSeconds ?? 0,
      turnTimerSeconds: c.turnTimerSeconds ?? 0,
      timeoutResolution: c.timeoutResolution ?? "GAME_SPECIFIC",
      allowDraw: c.allowDraw !== false,
      configurationVersion: c.configVersion ?? 1,
      configVersion: c.configVersion ?? 1,
      updatedAt: c.updatedAt,
      updatedBy: c.updatedBy,
    }));
  });

  /**
   * PATCH /api/admin/game-settings/:gameId
   * Updates a game's timeout, duration, or enabled status.
   */
  app.patch("/api/admin/game-settings/:gameId", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:games:manage", prisma);
    const { gameId } = routeParams(request);
    const body = parseSchema(updateGameConfigSchema, request.body);

    if (!isGameId(gameId as GameId)) {
      throw new AppError("NOT_FOUND", `Game '${gameId}' not found`, 404);
    }

    const updates: Partial<GameConfig> = { ...body };
    if (body.maxMatchDuration !== undefined && updates.matchDurationSeconds === undefined) {
      updates.matchDurationSeconds = body.maxMatchDuration;
    }
    if (body.turnTimeout !== undefined && updates.turnTimerSeconds === undefined) {
      updates.turnTimerSeconds = body.turnTimeout;
    }

    const updated = await GameConfigService.updateGameConfig(gameId as GameId, updates, admin.id);
    return {
      ok: true,
      gameId: updated.gameId,
      gameType: updated.gameId,
      name: updated.name,
      enabled: updated.enabled,
      maxMatchDuration: updated.matchDurationSeconds,
      matchDurationSeconds: updated.matchDurationSeconds,
      turnTimeout: updated.turnTimerSeconds,
      turnTimerSeconds: updated.turnTimerSeconds,
      timeoutResolution: updated.timeoutResolution,
      allowDraw: updated.allowDraw,
      configurationVersion: updated.configVersion,
      configVersion: updated.configVersion,
      updatedAt: updated.updatedAt,
      updatedBy: updated.updatedBy,
    };
  });

  /**
   * GET /api/admin/match-settings
   * Returns platform-wide match limit and warning configuration.
   */
  app.get("/api/admin/match-settings", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:games:view", prisma);
    const settings = await GameConfigService.getMatchSettings();
    return { ok: true, settings };
  });

  /**
   * PATCH /api/admin/match-settings
   * Updates platform-wide match limit and warning times.
   */
  app.patch("/api/admin/match-settings", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:settings:edit", prisma);
    const body = parseSchema(
      z.object({
        maxMatchDurationSeconds: z.number().int().min(30).max(600).optional(),
        warningTimesSeconds: z.array(z.number().int().min(1).max(600)).optional(),
        defaultTurnTimeoutSeconds: z.number().int().min(5).max(120).optional(),
      }),
      request.body,
    );

    const updated = await GameConfigService.updateMatchSettings(body, admin.id);
    return { ok: true, settings: updated };
  });

  /**
   * GET /api/admin/game-settings/audit
   * Returns recent audit logs for game/match configuration changes.
   */
  app.get("/api/admin/game-settings/audit", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:games:view", prisma);
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(q.page, q.pageSize ?? 30);
    const skip = (page - 1) * pageSize;
    const limit = pageSize;

    const [total, rows] = await Promise.all([
      prisma.auditLog.count({
        where: {
          category: { in: ["game", "system"] },
          action: { in: ["GAME_CONFIG_UPDATED", "MATCH_SETTINGS_UPDATED", "GAME_ENABLED", "GAME_DISABLED", "TURN_TIMER_CHANGED"] },
        },
      }),
      prisma.auditLog.findMany({
        where: {
          category: { in: ["game", "system"] },
          action: { in: ["GAME_CONFIG_UPDATED", "MATCH_SETTINGS_UPDATED", "GAME_ENABLED", "GAME_DISABLED", "TURN_TIMER_CHANGED"] },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        adminId: r.actorId,
        action: r.action,
        gameType: r.targetId,
        setting: r.action,
        meta: r.meta,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
    };
  });

  /**
   * GET /api/admin/analytics/time-limits
   * Returns time-limit completion statistics, normal completion %, timeout % per game
   */
  app.get("/api/admin/analytics/time-limits", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:games:view", prisma);
    const { GameHistoryService } = await import("../services/gameHistoryService");
    const analytics = await GameHistoryService.getTimeLimitAnalytics();
    return { ok: true, data: analytics };
  });

  /**
   * GET /api/admin/matches/search
   * Admin indexed search across matches by matchId, user, game, date, result, tournament
   */
  app.get("/api/admin/matches/search", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:games:view", prisma);
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(q.page, q.pageSize ?? 20);
    const { GameHistoryService } = await import("../services/gameHistoryService");

    return GameHistoryService.adminSearchMatches({
      matchId: queryString(q.matchId),
      userId: queryString(q.userId),
      gameId: queryString(q.gameId),
      dateFrom: queryString(q.dateFrom),
      dateTo: queryString(q.dateTo),
      resultReason: queryString(q.resultReason),
      tournamentId: queryString(q.tournamentId),
      page,
      pageSize,
    });
  });
}
