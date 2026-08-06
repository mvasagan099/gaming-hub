import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError, clampPagination } from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { requireUser, parseSchema, queryParams, queryString } from "../lib/http";
import { listMyRedemptions, redeemCoupon } from "../services/coupons";
import { isFeatureEnabled } from "../services/featureFlags";

const redeemSchema = z.object({
  code: z.string().trim().min(1).max(40),
});

export async function couponsRoutes(app: FastifyInstance) {
  app.post("/api/coupons/redeem", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (!(await isFeatureEnabled("content.coupons"))) {
      throw new AppError("FEATURE_DISABLED", "Coupons are disabled", 403);
    }
    const { code } = parseSchema(redeemSchema, request.body);
    return redeemCoupon(user.id, code);
  });

  app.get("/api/coupons/redemptions", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));
    return listMyRedemptions(user.id, page, pageSize);
  });
}
