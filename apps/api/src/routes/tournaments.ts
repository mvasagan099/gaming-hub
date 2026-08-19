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
import {
  getTournamentBracket,
  getPlayerTournamentStatus,
} from "../services/tournamentEngine";
import { TournamentMatchService } from "../services/tournamentMatchService";

export async function tournamentsRoutes(app: FastifyInstance) {
  /** List tournaments (filterable by status/gameId) */
  app.get("/api/tournaments", { preHandler: authenticate }, async (request) => {
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));
    const status = queryString(q.status) as "UPCOMING" | "LIVE" | "ENDED" | "REGISTRATION_OPEN" | "IN_PROGRESS" | undefined;
    const gameId = queryString(q.gameId) || undefined;
    if (gameId && !isGameId(gameId)) {
      throw new AppError("VALIDATION_ERROR", "Unknown game", 400);
    }
    return listTournaments(page, pageSize, status as any, gameId);
  });

  /** Full tournament detail including player list */
  app.get("/api/tournaments/:id", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const { id } = routeParams(request);
    return getTournamentDetail(id, user.id);
  });

  /** Register for a tournament */
  app.post("/api/tournaments/:id/register", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const { id } = routeParams(request);
    return registerForTournament(user.id, id);
  });

  /** Cancel registration */
  app.post("/api/tournaments/:id/cancel", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const { id } = routeParams(request);
    return cancelRegistration(user.id, id);
  });

  /** DELETE unregister — alias for cancel */
  app.delete("/api/tournaments/:id/register", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const { id } = routeParams(request);
    return cancelRegistration(user.id, id);
  });

  /** Full bracket state */
  app.get("/api/tournaments/:id/bracket", { preHandler: authenticate }, async (request) => {
    const { id } = routeParams(request);
    return getTournamentBracket(id);
  });

  /** Current player status in this tournament */
  app.get("/api/tournaments/:id/my-status", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const { id } = routeParams(request);
    return getPlayerTournamentStatus(id, user.id);
  });

  /** Tournament full state (tournament + bracket + my-status combined for sync) */
  app.get("/api/tournaments/:id/state", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const { id } = routeParams(request);
    const [detail, bracket, myStatus] = await Promise.all([
      getTournamentDetail(id, user.id),
      getTournamentBracket(id),
      getPlayerTournamentStatus(id, user.id),
    ]);
    return { detail, bracket, myStatus };
  });

  /** Current active tournament match for the player */
  app.get("/api/tournaments/:id/current-match", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const { id } = routeParams(request);
    const match = await TournamentMatchService.getCurrentMatchForPlayer(id, user.id);
    if (!match) {
      throw new AppError("NOT_FOUND", "No active tournament match", 404);
    }
    return match;
  });
}
