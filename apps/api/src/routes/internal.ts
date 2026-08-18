import type { FastifyInstance } from "fastify";
import { AppError } from "@gaming-hub/shared";
import { env } from "../env";
import { routeParams } from "../lib/http";
import { holdMatchWagers, settleMatch, GameCoinService } from "../services/settlement";
import { processMatchResult } from "../services/tournamentEngine";

/**
 * Internal endpoints consumed only by the socket server. Protected by a shared
 * secret rather than user auth because these mutate financial state.
 */
export async function internalRoutes(app: FastifyInstance) {
  app.addHook("preHandler", async (request, _reply) => {
    const key = request.headers["x-internal-key"];
    if (key !== env.INTERNAL_API_KEY) {
      throw new AppError("UNAUTHORIZED", "Invalid internal key", 401);
    }
  });

  const RATE_LIMIT = { max: 60, timeWindow: "1 minute" };

  app.post("/internal/matches/:id/hold-wagers", { config: { rateLimit: RATE_LIMIT } }, async (request) => {
    try {
      const { id } = routeParams(request);
      const match = await holdMatchWagers(id);
      return { ok: true, status: match.status };
    } catch (error) {
      request.log.error({ error }, "hold-wagers failed");
      throw error;
    }
  });

  app.post("/internal/matches/:id/settle", { config: { rateLimit: RATE_LIMIT } }, async (request) => {
    const { id } = routeParams(request);
    const body = (request.body ?? {}) as {
      rated?: boolean;
      winnerIds?: string[];
      scores?: Record<string, number>;
      resultType?: "WIN" | "LOSS" | "DRAW" | "FORFEIT";
      reason?: string;
    };
    const result = await GameCoinService.settleMatch(id, body.winnerIds ?? [], {
      rated: body.rated,
      scores: body.scores,
      resultType: body.resultType,
      reason: body.reason,
    });
    return { ok: true, result };
  });

  app.post("/internal/matches/:id/cancel", { config: { rateLimit: RATE_LIMIT } }, async (request) => {
    const { id } = routeParams(request);
    const body = (request.body ?? {}) as { reason?: string };
    const result = await GameCoinService.cancelMatch(id, body.reason);
    return { ok: true, result };
  });

  app.post("/internal/wallet/check-balance", { config: { rateLimit: RATE_LIMIT } }, async (request) => {
    const body = (request.body ?? {}) as { userId: string; entryFee: number };
    const result = await GameCoinService.checkPlayerBalance(body.userId, body.entryFee);
    return { ok: true, result };
  });

  /**
   * Tournament match result — called by socket server after a tournament match ends.
   * Drives advancement through the bracket: winner moves to next slot,
   * loser is eliminated, round completion checked, and auto-settlement triggered.
   */
  app.post("/internal/tournament/match-result", { config: { rateLimit: RATE_LIMIT } }, async (request) => {
    const body = (request.body ?? {}) as {
      matchId: string;
      tournamentId: string;
      roundId: string;
      winnerId: string;
      loserId?: string;
      scores?: Record<string, number>;
    };

    if (!body.matchId || !body.tournamentId || !body.roundId || !body.winnerId) {
      throw new AppError("VALIDATION_ERROR", "matchId, tournamentId, roundId and winnerId are required", 422);
    }

    await processMatchResult({
      matchId: body.matchId,
      tournamentId: body.tournamentId,
      roundId: body.roundId,
      winnerId: body.winnerId,
      loserId: body.loserId,
      scores: body.scores,
    });

    return { ok: true };
  });
}
