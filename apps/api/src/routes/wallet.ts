import type { FastifyInstance } from "fastify";
import { clampPagination } from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { requireUser } from "../lib/http";
import { getWallet, listTransactions } from "../services/wallet";

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
}
