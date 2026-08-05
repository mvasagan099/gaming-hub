import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError, clampPagination, isGameId } from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { parseSchema, requireUser } from "../lib/http";
import { claimPracticeReward, getWallet, listTransactions } from "../services/wallet";

const practiceRewardSchema = z.object({
  gameId: z.string().min(1).max(40),
});

export async function walletRoutes(app: FastifyInstance) {
  app.get("/api/wallet", { preHandler: authenticate }, async (request) => {
    return getWallet(requireUser(request).id);
  });

  app.get("/api/wallet/transactions", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const query = request.query as Record<string, unknown>;
    const { page, pageSize } = clampPagination(query.page, query.pageSize);
    return listTransactions(user.id, page, pageSize);
  });

  app.post("/api/wallet/practice-reward", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const { gameId } = parseSchema(practiceRewardSchema, request.body);
    if (!isGameId(gameId)) {
      throw new AppError("VALIDATION_ERROR", "Unknown game", 400);
    }
    return claimPracticeReward(user.id, gameId);
  });
}
