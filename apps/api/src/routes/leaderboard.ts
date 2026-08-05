import type { FastifyInstance } from "fastify";
import { clampPagination, isGameId } from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { routeParams, queryParams, queryString } from "../lib/http";
import { getLeaderboard } from "../services/stats";

export async function leaderboardRoutes(app: FastifyInstance) {
  app.get("/api/leaderboard/:gameId", { preHandler: authenticate }, async (request) => {
    const { gameId: raw } = routeParams(request);
    const gameId = raw;
    if (gameId !== "overall" && !isGameId(gameId)) {
      return { items: [], total: 0, page: 1, pageSize: 20 };
    }

    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));
    return getLeaderboard(gameId, page, pageSize);
  });
}
