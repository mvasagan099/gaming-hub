import type { FastifyInstance } from "fastify";
import { AppError, clampPagination, isGameId } from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { requireUser, routeParams, queryParams, queryString } from "../lib/http";
import {
  cancelRegistration,
  getTournamentDetail,
  listTournaments,
  registerForTournament,
} from "../services/tournaments";

export async function tournamentsRoutes(app: FastifyInstance) {
  app.get("/api/tournaments", { preHandler: authenticate }, async (request) => {
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));
    const status = queryString(q.status) as "UPCOMING" | "LIVE" | "ENDED" | undefined;
    const gameId = queryString(q.gameId) || undefined;
    if (gameId && !isGameId(gameId)) {
      throw new AppError("VALIDATION_ERROR", "Unknown game", 400);
    }
    return listTournaments(page, pageSize, status, gameId);
  });

  app.get("/api/tournaments/:id", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const { id } = routeParams(request);
    return getTournamentDetail(id, user.id);
  });

  app.post("/api/tournaments/:id/register", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const { id } = routeParams(request);
    return registerForTournament(user.id, id);
  });

  app.post("/api/tournaments/:id/cancel", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const { id } = routeParams(request);
    return cancelRegistration(user.id, id);
  });
}
