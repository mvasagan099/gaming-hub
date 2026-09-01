import type { FastifyInstance } from "fastify";
import { authenticate } from "../plugins/authenticate";
import { requireUser, queryParams, queryString } from "../lib/http";
import { SearchService } from "../services/search";
import type { SearchType } from "@gaming-hub/shared";

export async function searchRoutes(app: FastifyInstance) {
  /**
   * Centralized global platform search endpoint.
   * Supports: q, type, page, limit.
   */
  app.get("/api/search", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const q = queryParams(request);
    const query = queryString(q.q || q.query).trim();
    const type = (queryString(q.type) || "GLOBAL").toUpperCase() as SearchType;
    const page = Math.max(1, parseInt(queryString(q.page) || "1", 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(queryString(q.limit) || "20", 10) || 20));
    const isAdmin = (user as any).role === "ADMIN";

    return SearchService.globalSearch(
      user.id,
      {
        query,
        type,
        page,
        limit,
      },
      isAdmin
    );
  });

  /**
   * Search suggestions based on safe user search history.
   */
  app.get("/api/search/suggestions", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const q = queryParams(request);
    const prefix = queryString(q.q || q.query);
    if (!prefix.trim()) return [];
    const limit = Math.min(20, Math.max(1, parseInt(queryString(q.limit) || "8", 10) || 8));
    return SearchService.getSearchSuggestions(user.id, prefix, limit);
  });

  /**
   * Clear search history.
   */
  app.delete("/api/search/history", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    return SearchService.clearSearchHistory(user.id);
  });
}
