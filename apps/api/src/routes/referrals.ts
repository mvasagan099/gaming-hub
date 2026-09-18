import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@gaming-hub/db";
import { AppError, clampPagination } from "@gaming-hub/shared";
import { authenticate, requireMfa } from "../plugins/authenticate";
import { requireUser, parseSchema, queryParams, queryString, routeParams } from "../lib/http";
import { requirePermission } from "../lib/permissions";
import { ReferralService } from "../services/referrals";
import { isFeatureEnabled } from "../services/featureFlags";
import { getCategorySettings } from "../services/settings";
import { audit } from "../services/audit";

const applyReferralSchema = z.object({
  code: z.string().trim().min(3).max(24),
});

const reverseReferralSchema = z.object({
  reason: z.string().trim().min(3).max(300),
});

const reviewRiskEventSchema = z.object({
  status: z.enum(["REVIEWED", "DISMISSED"]),
  note: z.string().optional(),
});

const blockReferralSchema = z.object({
  reason: z.string().trim().min(1).max(300),
});

const updateReferralSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  affiliateMode: z.enum(["ONE_TIME", "CONTINUOUS"]).optional(),
  referrerReward: z.number().int().min(0).max(100_000).optional(),
  referrerFirstDepositBonus: z.number().int().min(0).max(100_000).optional(),
  referredReward: z.number().int().min(0).max(100_000).optional(),
  commissionPercent: z.number().min(0).max(100).optional(),
  minDepositToReward: z.number().int().min(0).max(100_000).optional(),
  minimumFirstDeposit: z.number().int().min(0).max(1_000_000).optional(),
  qualificationRule: z
    .enum(["REGISTRATION", "FIRST_GAME", "FIRST_WIN", "FIRST_DEPOSIT", "TOURNAMENT_JOIN"])
    .optional(),
  maxRewardsPerUser: z.number().int().min(0).max(100_000).optional(),
  campaignStartDate: z.string().nullable().optional(),
  campaignEndDate: z.string().nullable().optional(),
  leaderboardEnabled: z.boolean().optional(),
  codeAutoGenerate: z.boolean().optional(),
  affiliateEnabled: z.boolean().optional(),
  affiliateDepositPercent: z.number().min(0).max(100).optional(),
  affiliateOnFirstDeposit: z.boolean().optional(),
  referrerSignupBonus: z.number().int().min(0).max(100_000).optional(),
  refereeSignupBonus: z.number().int().min(0).max(100_000).optional(),
  maxAffiliateCommissionPerDeposit: z.number().int().min(0).max(10_000_000).optional(),
  maxAffiliateCommissionPerDay: z.number().int().min(0).max(10_000_000).optional(),
  minDepositEligible: z.number().int().min(0).max(10_000_000).optional(),
  affiliateDailyCommissionCap: z.number().int().min(0).max(10_000_000).optional(),
  affiliateMonthlyCommissionCap: z.number().int().min(0).max(100_000_000).optional(),
  affiliateMaxCommissionPerDeposit: z.number().int().min(0).max(10_000_000).optional(),
  affiliateMinEligibleDeposit: z.number().int().min(0).max(10_000_000).optional(),
  affiliateCommissionHoldMinutes: z.number().int().min(0).max(144_000).optional(),
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

  app.get("/api/referrals/commissions", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (!(await isFeatureEnabled("social.referrals"))) {
      throw new AppError("FEATURE_DISABLED", "Referrals are disabled", 403);
    }
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));
    const { AffiliateService } = await import("../services/affiliateService");
    return AffiliateService.listCommissions(user.id, page, pageSize);
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

  app.get("/api/admin/referrals/settings", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (user.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "Admin access required", 403);
    }
    const settings = await getCategorySettings("referral");
    return {
      enabled: settings.enabled,
      affiliateEnabled: settings.affiliateEnabled,
      affiliateMode: settings.affiliateMode,
      affiliateDepositPercent: settings.affiliateDepositPercent,
      minDepositEligible: settings.minDepositEligible,
      maxAffiliateCommissionPerDeposit: settings.maxAffiliateCommissionPerDeposit,
      affiliateDailyCommissionCap: settings.affiliateDailyCommissionCap,
      affiliateMonthlyCommissionCap: settings.affiliateMonthlyCommissionCap,
      affiliateMaxCommissionPerDeposit: settings.affiliateMaxCommissionPerDeposit ?? settings.maxAffiliateCommissionPerDeposit,
      affiliateMinEligibleDeposit: settings.affiliateMinEligibleDeposit ?? settings.minDepositEligible,
      affiliateCommissionHoldMinutes: settings.affiliateCommissionHoldMinutes,
      affiliateOnFirstDeposit: settings.affiliateOnFirstDeposit,
      referrerFirstDepositBonus: settings.referrerFirstDepositBonus,
      minimumFirstDeposit: settings.minimumFirstDeposit,
    };
  });

  app.patch("/api/admin/referrals/settings", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:settings:edit", prisma);
    const data = parseSchema(updateReferralSettingsSchema, request.body);
    return ReferralService.adminUpdateSettings(data, admin.id);
  });

  app.get("/api/admin/affiliates/stats", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (user.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "Admin access required", 403);
    }
    const { AffiliateService } = await import("../services/affiliateService");
    return AffiliateService.getAdminAffiliateStats();
  });

  app.get("/api/admin/affiliates/commissions", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (user.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "Admin access required", 403);
    }
    const q = queryParams(request);
    const { AffiliateService } = await import("../services/affiliateService");
    return AffiliateService.listAdminCommissions({
      page: q.page ? Number(q.page) : 1,
      pageSize: q.pageSize ? Number(q.pageSize) : 20,
      status: queryString(q.status),
      mode: queryString(q.mode),
      searchReferrer: queryString(q.searchReferrer),
      searchReferred: queryString(q.searchReferred),
      startDate: queryString(q.startDate),
      endDate: queryString(q.endDate),
    });
  });

  app.get("/api/admin/affiliates/audit", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (user.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "Admin access required", 403);
    }
    const { AffiliateService } = await import("../services/affiliateService");
    return AffiliateService.getAdminAffiliateAudit();
  });

  app.post("/api/admin/affiliates/reconcile", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:settings:edit", prisma);
    const { AffiliateService } = await import("../services/affiliateService");
    const body = (request.body as any) ?? {};
    const limit = body.limit ? Number(body.limit) : 100;
    const since = body.since ? new Date(body.since) : undefined;
    const dryRun = body.dryRun !== false; // defaults to safe preview
    const result = await AffiliateService.reconcileCommissions({ limit, since, dryRun });

    audit({
      actorType: "user",
      actorId: admin.id,
      action: dryRun ? "affiliate.reconciliation.dry_run" : "affiliate.reconciliation.executed",
      category: "wallet",
      targetType: "AffiliateCommission",
      meta: {
        dryRun,
        scanned: result.scanned,
        eligible: result.eligible,
        missing: result.missing,
        duplicates: result.duplicates,
        repairsRequired: result.repairsRequired,
        repaired: result.repaired,
        skipped: result.skipped,
      },
    });

    return result;
  });

  app.get("/api/admin/affiliates/risk", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (user.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "Admin access required", 403);
    }
    const q = queryParams(request);
    const { AffiliateService } = await import("../services/affiliateService");
    const [overview, eventsData, alerts] = await Promise.all([
      AffiliateService.getAdminRiskOverview(),
      AffiliateService.listRiskEvents({
        severity: queryString(q.severity),
        status: queryString(q.status),
        page: q.page ? Number(q.page) : 1,
        pageSize: q.pageSize ? Number(q.pageSize) : 20,
      }),
      Promise.resolve(AffiliateService.checkAffiliateAlertConditions()),
    ]);
    return {
      overview,
      ...eventsData,
      alerts,
    };
  });

  app.patch("/api/admin/affiliates/risk/:id/review", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:settings:edit", prisma);
    const { id } = routeParams(request);
    const { status, note } = parseSchema(reviewRiskEventSchema, request.body);
    const { AffiliateService } = await import("../services/affiliateService");
    return AffiliateService.reviewRiskEvent(id, admin.id, status, note);
  });

  app.patch("/api/admin/affiliates/referrals/:id/block", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:settings:edit", prisma);
    const { id } = routeParams(request);
    const { reason } = parseSchema(blockReferralSchema, request.body);
    const { AffiliateService } = await import("../services/affiliateService");
    return AffiliateService.blockReferralAffiliate(id, admin.id, reason);
  });

  app.patch("/api/admin/affiliates/referrals/:id/unblock", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:settings:edit", prisma);
    const { id } = routeParams(request);
    const { AffiliateService } = await import("../services/affiliateService");
    return AffiliateService.unblockReferralAffiliate(id, admin.id);
  });

  app.get("/api/admin/affiliates/analytics", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (user.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "Admin access required", 403);
    }
    const { AffiliateService } = await import("../services/affiliateService");
    return AffiliateService.getAffiliateAnalytics();
  });

  app.get("/api/admin/affiliates/daily-report", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (user.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "Admin access required", 403);
    }
    const q = queryParams(request);
    const { AffiliateService } = await import("../services/affiliateService");
    return AffiliateService.generateDailyAffiliateReport(queryString(q.date));
  });

  app.post("/api/admin/affiliates/release-held", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:settings:edit", prisma);
    const { AffiliateService } = await import("../services/affiliateService");
    const result = await AffiliateService.releaseMaturedHeldCommissions();
    audit({
      actorType: "user",
      actorId: admin.id,
      action: "affiliate.held_commissions.released_manual",
      category: "wallet",
      targetType: "AffiliateCommission",
      meta: result,
    });
    return result;
  });
}
