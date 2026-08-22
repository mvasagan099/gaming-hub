import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  AppError,
  COUNTRIES,
  REGIONS,
  clampPagination,
  isGameId,
  LEADERBOARD_METRICS,
  LEADERBOARD_PERIODS,
  LEADERBOARD_SCOPES,
  type LeaderboardScope,
} from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { requireUser, parseSchema, routeParams, queryParams, queryString } from "../lib/http";
import { LeaderboardService } from "../services/leaderboardService";
import { isFeatureEnabled } from "../services/featureFlags";
import { getCategorySettings } from "../services/settings";

const leaderboardQuerySchema = z.object({
  scope: z.enum(LEADERBOARD_SCOPES).default("global"),
  period: z.enum(LEADERBOARD_PERIODS).default("all"),
  metric: z.enum(LEADERBOARD_METRICS).default("wins"),
  gameId: z.string().trim().optional(),
  country: z.string().trim().optional(),
  region: z.string().trim().optional(),
});

const matchCorrectionSchema = z.object({
  matchId: z.string().min(1, "matchId is required"),
  correctedWinnerIds: z.array(z.string()).default([]),
  isDraw: z.boolean().optional(),
  reason: z.string().min(3, "Reason for correction is required"),
});

const COUNTRY_CODES = new Set(COUNTRIES.map((c) => c.code));

function validateScopeInputs(scope: LeaderboardScope, gameId?: string, country?: string, region?: string) {
  if (scope === "game") {
    if (!gameId || !isGameId(gameId)) {
      throw new AppError("VALIDATION_ERROR", "A valid gameId is required for game leaderboards", 400);
    }
  } else if (scope === "country") {
    if (!country || !COUNTRY_CODES.has(country)) {
      throw new AppError("VALIDATION_ERROR", "A valid country code is required for country leaderboards", 400);
    }
  } else if (scope === "region") {
    if (!region || !REGIONS.includes(region)) {
      throw new AppError("VALIDATION_ERROR", "A valid region is required for region leaderboards", 400);
    }
  }
}

export async function leaderboardRoutes(app: FastifyInstance) {
  /**
   * Main unified ranked leaderboard endpoint.
   */
  app.get("/api/leaderboard", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);

    const leaderboardSettings = await getCategorySettings("leaderboard");
    if (!leaderboardSettings.enabled) {
      throw new AppError("FEATURE_DISABLED", "Leaderboards are disabled", 403);
    }
    if (!(await isFeatureEnabled("social.leaderboards"))) {
      throw new AppError("FEATURE_DISABLED", "Leaderboards are disabled", 403);
    }

    const q = queryParams(request);
    const str = (key: string) => {
      const value = queryString(q[key]);
      return value === "" ? undefined : value;
    };
    const raw = {
      scope: str("scope"),
      period: str("period"),
      metric: str("metric"),
      gameId: str("gameId"),
      country: str("country"),
      region: str("region"),
    };
    const parsed = parseSchema(leaderboardQuerySchema, raw);
    validateScopeInputs(parsed.scope, parsed.gameId, parsed.country, parsed.region);

    if (parsed.scope === "game" && !leaderboardSettings.gameEnabled) {
      throw new AppError("FEATURE_DISABLED", "Game leaderboards are disabled", 403);
    }
    if (parsed.scope === "country" && !leaderboardSettings.countryEnabled) {
      throw new AppError("FEATURE_DISABLED", "Country leaderboards are disabled", 403);
    }
    if (parsed.scope === "region" && !leaderboardSettings.regionEnabled) {
      throw new AppError("FEATURE_DISABLED", "Region leaderboards are disabled", 403);
    }
    if (parsed.scope === "friends" && !leaderboardSettings.friendsEnabled) {
      throw new AppError("FEATURE_DISABLED", "Friends leaderboards are disabled", 403);
    }
    if (parsed.scope === "tournament" && !leaderboardSettings.tournamentEnabled) {
      throw new AppError("FEATURE_DISABLED", "Tournament leaderboards are disabled", 403);
    }

    const period = leaderboardSettings.periodsEnabled ? parsed.period : "all";
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));

    return LeaderboardService.getLeaderboard(
      {
        scope: parsed.scope,
        gameId: parsed.gameId,
        country: parsed.country,
        region: parsed.region,
        period,
        metric: parsed.metric,
        page,
        pageSize,
      },
      user.id,
    );
  });

  /**
   * Dedicated global leaderboard endpoint.
   */
  app.get("/api/leaderboard/global", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const q = queryParams(request);
    const period = queryString(q.period) || "all";
    const metric = queryString(q.metric) || "rating";
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));

    return LeaderboardService.getGlobalLeaderboard(
      {
        period: (LEADERBOARD_PERIODS.includes(period as any) ? period : "all") as any,
        metric: (LEADERBOARD_METRICS.includes(metric as any) ? metric : "rating") as any,
        page,
        pageSize,
      },
      user.id,
    );
  });

  /**
   * Dedicated tournament leaderboard endpoint.
   */
  app.get("/api/leaderboard/tournament", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const q = queryParams(request);
    const period = queryString(q.period) || "all";
    const metric = queryString(q.metric) || "wins";
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));

    return LeaderboardService.getTournamentLeaderboard(
      {
        period: (LEADERBOARD_PERIODS.includes(period as any) ? period : "all") as any,
        metric: (LEADERBOARD_METRICS.includes(metric as any) ? metric : "wins") as any,
        page,
        pageSize,
      },
      user.id,
    );
  });

  /**
   * Dedicated user ranking summary across all game disciplines and global board.
   */
  app.get("/api/leaderboard/user/:userId/rank", { preHandler: authenticate }, async (request) => {
    const { userId } = routeParams(request);
    return LeaderboardService.getUserRankSummary(userId);
  });

  /**
   * Admin-authoritative result correction endpoint.
   * Modifies the match result and safely updates rankings with an audit trail.
   */
  app.post("/api/leaderboard/match-correction", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (user.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "Only administrators can correct match results", 403);
    }

    const payload = parseSchema(matchCorrectionSchema, request.body);

    return LeaderboardService.correctMatchResult({
      matchId: payload.matchId,
      correctedWinnerIds: payload.correctedWinnerIds,
      isDraw: payload.isDraw,
      adminId: user.id,
      reason: payload.reason,
    });
  });

  /**
   * Legacy and game-specific leaderboard endpoint.
   */
  app.get("/api/leaderboard/:gameId", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const { gameId: raw } = routeParams(request);
    const gameId = raw;

    if (gameId !== "overall" && !isGameId(gameId)) {
      return { items: [], total: 0, page: 1, pageSize: 20 };
    }

    const q = queryParams(request);
    const period = queryString(q.period) || "all";
    const metric = queryString(q.metric) || (gameId === "overall" ? "rating" : "wins");
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));

    if (gameId === "overall") {
      return LeaderboardService.getGlobalLeaderboard(
        {
          period: (LEADERBOARD_PERIODS.includes(period as any) ? period : "all") as any,
          metric: (LEADERBOARD_METRICS.includes(metric as any) ? metric : "rating") as any,
          page,
          pageSize,
        },
        user.id,
      );
    }

    return LeaderboardService.getGameLeaderboard(
      gameId,
      {
        period: (LEADERBOARD_PERIODS.includes(period as any) ? period : "all") as any,
        metric: (LEADERBOARD_METRICS.includes(metric as any) ? metric : "wins") as any,
        page,
        pageSize,
      },
      user.id,
    );
  });
}
