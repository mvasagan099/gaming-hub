import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError, updateProfileSchema, clampPagination } from "@gaming-hub/shared";
import { authenticate, optionalAuthenticate, touchUserPresence } from "../plugins/authenticate";
import { requireUser, parseSchema, routeParams, queryParams, queryString } from "../lib/http";
import { assertFeatureEnabled } from "../services/featureFlags";
import { updateUserProfile } from "../services/users";
import { PlayerProfileService } from "../services/playerProfileService";
import { getRankOfUser } from "../services/stats";

const privacyUpdateSchema = z.object({
  isPrivate: z.boolean(),
});

export async function usersRoutes(app: FastifyInstance) {
  /**
   * Current user's complete profile with private details & statistics.
   */
  app.get("/api/users/me/profile", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    return PlayerProfileService.getMyProfile(user.id);
  });

  /**
   * Public player profile with complete game stats, ratings, tournament results, and recent matches.
   */
  app.get("/api/users/:id/public-profile", { preHandler: optionalAuthenticate }, async (request) => {
    await assertFeatureEnabled("social.profiles", "Public profiles");
    const viewerId = request.user?.id;
    const isAdmin = request.user?.role === "ADMIN";
    const { id } = routeParams(request);
    return PlayerProfileService.getPublicProfile(id, viewerId, isAdmin);
  });

  /**
   * Standard user profile endpoint (backward compatible).
   */
  app.get("/api/users/:id", { preHandler: optionalAuthenticate }, async (request) => {
    await assertFeatureEnabled("social.profiles", "Public profiles");
    const viewerId = request.user?.id;
    const isAdmin = request.user?.role === "ADMIN";
    const { id } = routeParams(request);
    return PlayerProfileService.getPublicProfile(id, viewerId, isAdmin);
  });

  /**
   * Update current user's profile metadata.
   */
  app.patch("/api/users/me", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const data = parseSchema(updateProfileSchema, request.body);

    if (data.isPrivate !== undefined) {
      await PlayerProfileService.setProfilePrivacy(user.id, data.isPrivate);
    }

    const result = await updateUserProfile(user.id, data);
    return { user: result.user, profile: result.profile };
  });

  /**
   * Toggle profile privacy setting.
   */
  app.patch("/api/users/me/privacy", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const { isPrivate } = parseSchema(privacyUpdateSchema, request.body);
    const updated = await PlayerProfileService.setProfilePrivacy(user.id, isPrivate);
    return { isPrivate: updated };
  });

  /**
   * Search users by display name or username with pagination.
   */
  app.get("/api/users/search", { preHandler: authenticate }, async (request) => {
    await assertFeatureEnabled("social.profiles", "Public profiles");
    const user = requireUser(request);
    const q = queryParams(request);
    const query = queryString(q.q).trim();
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));

    if (!query) {
      return { items: [], total: 0, page, pageSize };
    }
    return PlayerProfileService.searchPlayers(query, page, pageSize, user.id);
  });

  /**
   * User rank query.
   */
  app.get("/api/users/me/rank", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const gameId = queryString(queryParams(request).gameId) || "overall";
    const rank = await getRankOfUser(gameId, user.id);
    return { rank };
  });

  /**
   * User presence heartbeat.
   */
  app.post("/api/users/heartbeat", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    touchUserPresence(user.id);
    return { ok: true, isOnline: true };
  });
}
