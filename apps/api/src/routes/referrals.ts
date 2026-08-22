import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError, clampPagination } from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { requireUser, parseSchema, queryParams, queryString, routeParams } from "../lib/http";
import { ReferralService } from "../services/referrals";
import { isFeatureEnabled } from "../services/featureFlags";
import { getCategorySettings } from "../services/settings";

const applyReferralSchema = z.object({
  code: z.string().trim().min(3).max(24),
});

const reverseReferralSchema = z.object({
  reason: z.string().trim().min(3).max(300),
});

const updateReferralSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  referrerReward: z.number().int().min(0).max(100_000).optional(),
  referredReward: z.number().int().min(0).max(100_000).optional(),
  commissionPercent: z.number().min(0).max(100).optional(),
  minDepositToReward: z.number().int().min(0).max(100_000).optional(),
  qualificationRule: z
    .enum(["REGISTRATION", "FIRST_GAME", "FIRST_WIN", "FIRST_DEPOSIT", "TOURNAMENT_JOIN"])
    .optional(),
  maxRewardsPerUser: z.number().int().min(0).max(100_000).optional(),
  campaignStartDate: z.string().nullable().optional(),
  campaignEndDate: z.string().nullable().optional(),
  leaderboardEnabled: z.boolean().optional(),
  codeAutoGenerate: z.boolean().optional(),
});

export async function referralsRoutes(app: FastifyInstance) {
  // ---------------------------------------------------------------------------
  // User Endpoints
  // ---------------------------------------------------------------------------

  app.get("/api/referrals", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (!(await isFeatureEnabled("social.referrals"))) {
      throw new AppError("FEATURE_DISABLED", "Referrals are disabled", 403);
    }
    return ReferralService.getReferralSummary(user.id);
  });

  app.get("/api/referrals/list", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (!(await isFeatureEnabled("social.referrals"))) {
      throw new AppError("FEATURE_DISABLED", "Referrals are disabled", 403);
    }
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));
    return ReferralService.listMyReferrals(user.id, page, pageSize);
  });

  app.post("/api/referrals/apply", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (!(await isFeatureEnabled("social.referrals"))) {
      throw new AppError("FEATURE_DISABLED", "Referrals are disabled", 403);
    }
    const { code } = parseSchema(applyReferralSchema, request.body);
    const result = await ReferralService.applyReferral(user.id, code, {
      ip: request.ip,
      userAgent: request.headers["user-agent"],
    });
    return { ok: true, ...result };
  });

  app.get("/api/referrals/leaderboard", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    void user;
    const referralSettings = await getCategorySettings("referral");
    if (!referralSettings.leaderboardEnabled) {
      throw new AppError("FEATURE_DISABLED", "Referral leaderboard is disabled", 403);
    }
    return ReferralService.getReferralLeaderboard(50);
  });

  app.get("/api/referrals/code", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    return { code: await ReferralService.ensureReferralCode(user.id) };
  });

  // ---------------------------------------------------------------------------
  // Admin Endpoints
  // ---------------------------------------------------------------------------

  app.get("/api/admin/referrals/stats", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (user.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "Admin access required", 403);
    }
    return ReferralService.getAdminReferralStats();
  });

  app.get("/api/admin/referrals", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (user.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "Admin access required", 403);
    }
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));
    const status = queryString(q.status);
    const search = queryString(q.search);

    return ReferralService.listAdminReferrals({
      status,
      search,
      page,
      pageSize,
    });
  });

  app.post("/api/admin/referrals/:id/reverse", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (user.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "Admin access required", 403);
    }
    const { id } = routeParams(request);
    const { reason } = parseSchema(reverseReferralSchema, request.body);
    return ReferralService.reverseReferral(id, user.id, reason);
  });

  app.patch("/api/admin/referrals/settings", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (user.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "Admin access required", 403);
    }
    const data = parseSchema(updateReferralSettingsSchema, request.body);
    return ReferralService.adminUpdateSettings(data, user.id);
  });
}
