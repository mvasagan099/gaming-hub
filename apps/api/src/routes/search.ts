import type { FastifyInstance } from "fastify";
import { AppError } from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { requireUser, queryParams, queryString } from "../lib/http";
import { clearSearchHistory, getSearchSuggestions, globalSearch } from "../services/search";

export async function searchRoutes(app: FastifyInstance) {
  app.get("/api/search", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const q = queryParams(request);
    const query = queryString(q.q).trim();
    if (!query) {
      throw new AppError("SEARCH_QUERY_REQUIRED", "Search query is required", 422);
    }
    const type = queryString(q.type) as "GLOBAL" | "USERS" | "GAMES" | "TOURNAMENTS" | undefined;
    const limit = Number(queryString(q.limit)) || undefined;

    return globalSearch(user.id, {
      query,
      type: type ?? "GLOBAL",
      limit: limit ? Math.min(50, Math.max(1, limit)) : undefined,
    });
  });

  app.get("/api/search/suggestions", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const q = queryParams(request);
    const prefix = queryString(q.q);
    if (!prefix.trim()) return [];
    const limit = Number(queryString(q.limit)) || 8;
    return getSearchSuggestions(user.id, prefix, limit);
  });

  app.delete("/api/search/history", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    return clearSearchHistory(user.id);
  });
}
