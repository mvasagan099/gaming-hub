import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { requireUser, parseSchema, routeParams } from "../lib/http";
import { AchievementService } from "../services/achievementService";

const createAchievementSchema = z.object({
  code: z.string().min(2).max(50),
  title: z.string().min(2).max(100),
  description: z.string().min(5).max(300),
  icon: z.string().min(1).max(10),
  gameId: z.string().nullable().optional(),
  xpReward: z.number().int().min(0).max(10000).default(50),
  condition: z.record(z.string(), z.unknown()),
});

const updateAchievementSchema = z.object({
  title: z.string().min(2).max(100).optional(),
  description: z.string().min(5).max(300).optional(),
  icon: z.string().min(1).max(10).optional(),
  gameId: z.string().nullable().optional(),
  xpReward: z.number().int().min(0).max(10000).optional(),
  condition: z.record(z.string(), z.unknown()).optional(),
});

const manualUnlockSchema = z.object({
  userId: z.string().min(1),
  achievementId: z.string().min(1),
  reason: z.string().min(3).max(300),
});

export async function achievementsRoutes(app: FastifyInstance) {
  /**
   * List all system achievement definitions.
   */
  app.get("/api/achievements", { preHandler: authenticate }, async () => {
    return AchievementService.getPlayerAchievements("");
  });

  /**
   * Get current user's achievements with numerical progress.
   */
  app.get("/api/achievements/me", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    return AchievementService.getPlayerAchievements(user.id);
  });

  /**
   * Get another player's public achievements.
   */
  app.get("/api/users/:id/achievements", { preHandler: authenticate }, async (request) => {
    const { id } = routeParams(request);
    return AchievementService.getPlayerAchievements(id);
  });

  /**
   * Admin: List achievements with unlock statistics.
   */
  app.get("/api/admin/achievements", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (user.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "Admin access required", 403);
    }
    return AchievementService.listAdminAchievements();
  });

  /**
   * Admin: Create new achievement.
   */
  app.post("/api/admin/achievements", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (user.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "Admin access required", 403);
    }
    const data = parseSchema(createAchievementSchema, request.body);
    return AchievementService.createAchievement(data);
  });

  /**
   * Admin: Update existing achievement definition.
   */
  app.patch("/api/admin/achievements/:id", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (user.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "Admin access required", 403);
    }
    const { id } = routeParams(request);
    const data = parseSchema(updateAchievementSchema, request.body);
    return AchievementService.updateAchievement(id, data);
  });

  /**
   * Admin: Manually unlock an achievement for a player with audit logging.
   */
  app.post("/api/admin/achievements/manual-unlock", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (user.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "Admin access required", 403);
    }
    const { userId, achievementId, reason } = parseSchema(manualUnlockSchema, request.body);
    return AchievementService.adminManualUnlock(userId, achievementId, user.id, reason);
  });
}
