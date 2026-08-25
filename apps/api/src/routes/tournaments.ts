import type { FastifyInstance } from "fastify";
import { AppError, clampPagination, isGameId } from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { requireUser, routeParams, queryParams, queryString } from "../lib/http";
import {
  cancelRegistration,
  getTournamentDetail,
  listTournaments,
  registerForTournament,
  getRegistrationInfo,
} from "../services/tournaments";
import {
  getTournamentBracket,
  getPlayerTournamentStatus,
  getPlayerMatchView,
} from "../services/tournamentEngine";
import { TournamentMatchService } from "../services/tournamentMatchService";

export async function tournamentsRoutes(app: FastifyInstance) {
  /** User Tournament History */
  app.get("/api/tournaments/history", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));
    const { TournamentHistoryService } = await import("../services/tournamentHistoryService");

    return TournamentHistoryService.listUserTournamentHistory({
      userId: user.id,
      status: queryString(q.status),
      result: queryString(q.result) as any,
      dateFrom: queryString(q.dateFrom),
      dateTo: queryString(q.dateTo),
      page,
      pageSize,
    });
  });

  /** User Specific Tournament History Details */
  app.get("/api/tournaments/history/:id", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const { id } = routeParams(request);
    const { TournamentHistoryService } = await import("../services/tournamentHistoryService");
    return TournamentHistoryService.getTournamentHistoryDetails(user.id, id);
  });

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

  /** Get registration and eligibility status */
  app.get("/api/tournaments/:id/registration", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const { id } = routeParams(request);
    return getRegistrationInfo(id, user.id);
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

  /** Detailed player match view ("MY MATCH") */
  app.get("/api/tournaments/:id/my-match", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const { id } = routeParams(request);
    return getPlayerMatchView(id, user.id);
  });

  /** Player's complete tournament dashboard */
  app.get("/api/tournaments/:id/dashboard", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const { id } = routeParams(request);
    const { getPlayerTournamentDashboard } = await import("../services/tournamentPlayerDashboard");
    return getPlayerTournamentDashboard(id, user.id);
  });

  /** List all tournaments the player participates in */
  app.get("/api/tournaments/my-tournaments", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const { getPlayerTournamentsList } = await import("../services/tournamentPlayerDashboard");
    return getPlayerTournamentsList(user.id);
  });

  /** Submit a match dispute / report result */
  app.post("/api/tournaments/disputes", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const body = request.body as any;
    const { createTournamentDispute } = await import("../services/tournamentDisputeService");
    return createTournamentDispute(user.id, body);
  });

  /** List user's submitted disputes */
  app.get("/api/tournaments/disputes", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const { listPlayerDisputes } = await import("../services/tournamentDisputeService");
    return listPlayerDisputes(user.id);
  });

  /** Get specific dispute detail (player view) */
  app.get("/api/tournaments/disputes/:id", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const { id } = routeParams(request);
    const { getDisputeDetail } = await import("../services/tournamentDisputeService");
    return getDisputeDetail(id, user.id, false);
  });

  /** Get match result snapshot */
  app.get("/api/tournaments/matches/:matchId/snapshot", { preHandler: authenticate }, async (request) => {
    const { matchId } = routeParams(request);
    const { getTournamentResultSnapshot } = await import("../services/tournamentResultVerification");
    const snapshot = await getTournamentResultSnapshot(matchId);
    if (!snapshot) throw new AppError("NOT_FOUND", "Snapshot not found", 404);
    return snapshot;
  });

  /** Get player's prize and settlement status for a tournament */
  app.get("/api/tournaments/:id/settlement", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const { id } = routeParams(request);
    const { TournamentSettlementService } = await import("../services/tournamentSettlementService");
    const settlement = await TournamentSettlementService.getPlayerSettlement(id, user.id);
    return settlement ?? { status: "NONE", prizeAmount: 0, rank: null };
  });

  /** Get tournament prize distribution & snapshot */
  app.get("/api/tournaments/:id/prizes", { preHandler: authenticate }, async (request) => {
    const { id } = routeParams(request);
    const { TournamentSettlementService } = await import("../services/tournamentSettlementService");
    return TournamentSettlementService.getAuthoritativePrizeSnapshot(id);
  });

  /** Get tournament leaderboard & standings */
  app.get("/api/tournaments/:id/leaderboard", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const { id } = routeParams(request);
    const q = queryParams(request);
    const page = q.page ? parseInt(queryString(q.page), 10) : 1;
    const pageSize = q.pageSize ? parseInt(queryString(q.pageSize), 10) : 50;
    const search = queryString(q.search);
    const status = queryString(q.status);
    const roundNumber = q.round ? parseInt(queryString(q.round), 10) : undefined;

    const { TournamentLeaderboardService } = await import("../services/tournamentLeaderboardService");
    return TournamentLeaderboardService.getTournamentLeaderboard(id, {
      page,
      pageSize,
      search,
      status,
      roundNumber,
      viewerId: user.id,
    });
  });

  /** Get player's tournament career statistics profile */
  app.get("/api/tournaments/players/:userId/career", { preHandler: authenticate }, async (request) => {
    const { userId } = routeParams(request);
    const { TournamentLeaderboardService } = await import("../services/tournamentLeaderboardService");
    return TournamentLeaderboardService.getPlayerCareerStats(userId);
  });

  /** Get game-specific tournament rankings */
  app.get("/api/tournaments/games/:gameId/rankings", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const { gameId } = routeParams(request);
    const q = queryParams(request);
    const page = q.page ? parseInt(queryString(q.page), 10) : 1;
    const pageSize = q.pageSize ? parseInt(queryString(q.pageSize), 10) : 20;

    const { TournamentLeaderboardService } = await import("../services/tournamentLeaderboardService");
    return TournamentLeaderboardService.getGameTournamentRankings(gameId, {
      page,
      pageSize,
      viewerId: user.id,
    });
  });
}


