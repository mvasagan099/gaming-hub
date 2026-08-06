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
import { getLeaderboard, getRankedLeaderboard } from "../services/stats";
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

    return getRankedLeaderboard(
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
