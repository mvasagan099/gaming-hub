import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError, clampPagination } from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { requireUser, parseSchema, queryParams, queryString } from "../lib/http";
import {
  applyReferral,
  ensureReferralCode,
  getReferralLeaderboard,
  getReferralSummary,
  listMyReferrals,
} from "../services/referrals";
import { isFeatureEnabled } from "../services/featureFlags";
import { getCategorySettings } from "../services/settings";

const applyReferralSchema = z.object({
  code: z.string().trim().min(3).max(24),
});

export async function referralsRoutes(app: FastifyInstance) {
  app.get("/api/referrals", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (!(await isFeatureEnabled("social.referrals"))) {
      throw new AppError("FEATURE_DISABLED", "Referrals are disabled", 403);
    }
    return getReferralSummary(user.id);
  });

  app.get("/api/referrals/list", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (!(await isFeatureEnabled("social.referrals"))) {
      throw new AppError("FEATURE_DISABLED", "Referrals are disabled", 403);
    }
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));
    return listMyReferrals(user.id, page, pageSize);
  });

  app.post("/api/referrals/apply", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (!(await isFeatureEnabled("social.referrals"))) {
      throw new AppError("FEATURE_DISABLED", "Referrals are disabled", 403);
    }
    const { code } = parseSchema(applyReferralSchema, request.body);
    const result = await applyReferral(user.id, code);
    return { ok: true, ...result };
  });

  app.get("/api/referrals/leaderboard", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    void user;
    const referralSettings = await getCategorySettings("referral");
    if (!referralSettings.leaderboardEnabled) {
      throw new AppError("FEATURE_DISABLED", "Referral leaderboard is disabled", 403);
    }
    return getReferralLeaderboard(50);
  });

  app.get("/api/referrals/code", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    return { code: await ensureReferralCode(user.id) };
  });
}
