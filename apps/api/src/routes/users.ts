import type { FastifyInstance } from "fastify";
import { AppError, updateProfileSchema } from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { requireUser, parseSchema, routeParams, queryParams, queryString } from "../lib/http";
import {
  getPublicProfileById,
  searchUsers,
  updateUserProfile,
} from "../services/users";
import { getRankOfUser } from "../services/stats";

export async function usersRoutes(app: FastifyInstance) {
  app.get("/api/users/:id", { preHandler: authenticate }, async (request) => {
    const { id } = routeParams(request);
    const profile = await getPublicProfileById(id);
    if (!profile) {
      throw new AppError("NOT_FOUND", "User not found", 404);
    }
    return profile;
  });

  app.patch("/api/users/me", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const data = parseSchema(updateProfileSchema, request.body);
    const result = await updateUserProfile(user.id, data);
    return { user: result.user, profile: result.profile };
  });

  app.get("/api/users/search", { preHandler: authenticate }, async (request) => {
    const query = queryString(queryParams(request).q).trim();
    if (!query) {
      return [];
    }
    return searchUsers(query, 12);
  });

  app.get("/api/users/me/rank", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const gameId = queryString(queryParams(request).gameId) || "overall";
    const rank = await getRankOfUser(gameId, user.id);
    return { rank };
  });
}
