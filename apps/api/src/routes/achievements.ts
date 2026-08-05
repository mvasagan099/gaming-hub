import type { FastifyInstance } from "fastify";
import { authenticate } from "../plugins/authenticate";
import { requireUser } from "../lib/http";
import { getMyAchievements, listAchievementDefinitions } from "../services/achievements";

export async function achievementsRoutes(app: FastifyInstance) {
  app.get("/api/achievements", { preHandler: authenticate }, async () => {
    return listAchievementDefinitions();
  });

  app.get("/api/achievements/me", { preHandler: authenticate }, async (request) => {
    return getMyAchievements(requireUser(request).id);
  });
}
