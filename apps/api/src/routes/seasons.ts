import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { requireUser, parseSchema, routeParams } from "../lib/http";
import { SeasonService } from "../services/seasonService";

const createSeasonSchema = z.object({
  title: z.string().min(2).max(100),
  description: z.string().min(5).max(1000),
  status: z.enum(["DRAFT", "SCHEDULED", "ACTIVE"]).optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  bannerUrl: z.string().url().nullable().optional(),
  gameIds: z.array(z.string()).optional(),
  rules: z
    .object({
      winPoints: z.number().int().min(0).max(1000).optional(),
      matchPoints: z.number().int().min(0).max(1000).optional(),
      tournamentWinPoints: z.number().int().min(0).max(1000).optional(),
      tournamentPodiumPoints: z.number().int().min(0).max(1000).optional(),
    })
    .optional(),
  rewards: z
    .array(
      z.object({
        rankMin: z.number().int().min(1),
        rankMax: z.number().int().min(1),
        rewardType: z.enum(["COINS", "ACHIEVEMENT", "BADGE"]),
        title: z.string().min(1).max(100),
        amount: z.number().int().min(0).optional(),
        achievementCode: z.string().optional(),
        icon: z.string().optional(),
      }),
    )
    .optional(),
});

const updateSeasonSchema = z.object({
  title: z.string().min(2).max(100).optional(),
  description: z.string().min(5).max(1000).optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  bannerUrl: z.string().url().nullable().optional(),
  gameIds: z.array(z.string()).optional(),
  rules: z
    .object({
      winPoints: z.number().int().min(0).max(1000).optional(),
      matchPoints: z.number().int().min(0).max(1000).optional(),
      tournamentWinPoints: z.number().int().min(0).max(1000).optional(),
      tournamentPodiumPoints: z.number().int().min(0).max(1000).optional(),
    })
    .optional(),
  rewards: z
    .array(
      z.object({
        rankMin: z.number().int().min(1),
        rankMax: z.number().int().min(1),
        rewardType: z.enum(["COINS", "ACHIEVEMENT", "BADGE"]),
        title: z.string().min(1).max(100),
        amount: z.number().int().min(0).optional(),
        achievementCode: z.string().optional(),
        icon: z.string().optional(),
      }),
    )
    .optional(),
});

const cancelSeasonSchema = z.object({
  reason: z.string().min(3).max(300).optional(),
});

export async function seasonsRoutes(app: FastifyInstance) {
  /**
   * Public: List seasonal events.
   */
  app.get("/api/seasons", async (request) => {
    const query = request.query as { status?: string };
    const statusFilter = query.status as any;
    return SeasonService.listSeasons(statusFilter);
  });

  /**
   * Public / Authenticated: Get single season details and standing.
   */
  app.get("/api/seasons/:id", async (request) => {
    const { id } = routeParams(request);
    const user = (request as any).user;
    return SeasonService.getSeason(id, user?.id);
  });

  /**
   * Public / Authenticated: Get seasonal leaderboard.
   */
  app.get("/api/seasons/:id/leaderboard", async (request) => {
    const { id } = routeParams(request);
    const query = request.query as { page?: string; pageSize?: string };
    const page = Math.max(1, parseInt(query.page || "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize || "20", 10) || 20));
    const user = (request as any).user;
    return SeasonService.getSeasonLeaderboard(id, page, pageSize, user?.id);
  });

  /**
   * Admin: List all seasons.
   */
  app.get("/api/admin/seasons", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (user.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "Admin access required", 403);
    }
    return SeasonService.listSeasons();
  });

  /**
   * Admin: Create seasonal event.
   */
  app.post("/api/admin/seasons", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (user.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "Admin access required", 403);
    }
    const data = parseSchema(createSeasonSchema, request.body);
    return SeasonService.createSeason(data, user.id);
  });

  /**
   * Admin: Update seasonal event.
   */
  app.patch("/api/admin/seasons/:id", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (user.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "Admin access required", 403);
    }
    const { id } = routeParams(request);
    const data = parseSchema(updateSeasonSchema, request.body);
    return SeasonService.updateSeason(id, data, user.id);
  });

  /**
   * Admin: Activate seasonal event.
   */
  app.post("/api/admin/seasons/:id/activate", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (user.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "Admin access required", 403);
    }
    const { id } = routeParams(request);
    return SeasonService.activateSeason(id, user.id);
  });

  /**
   * Admin: End seasonal event and settle rewards.
   */
  app.post("/api/admin/seasons/:id/end", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (user.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "Admin access required", 403);
    }
    const { id } = routeParams(request);
    return SeasonService.endSeason(id, user.id);
  });

  /**
   * Admin: Cancel seasonal event.
   */
  app.post("/api/admin/seasons/:id/cancel", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (user.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "Admin access required", 403);
    }
    const { id } = routeParams(request);
    const { reason } = parseSchema(cancelSeasonSchema, request.body || {});
    return SeasonService.cancelSeason(id, user.id, reason);
  });
}
