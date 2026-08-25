import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../plugins/authenticate";
import { requireUser, queryParams, queryString } from "../lib/http";
import { MatchmakingQueueService } from "../services/matchmakingQueueService";

const joinSchema = z.object({
  gameId: z.string().min(1),
  stake: z.number().int().min(0).default(0),
  gameMode: z.enum(["casual", "ranked"]).optional().default("casual"),
  socketId: z.string().optional(),
});

const cancelSchema = z.object({
  gameId: z.string().optional(),
});

export async function matchmakingRoutes(app: FastifyInstance) {
  /**
   * POST /api/matchmaking/join
   * Join the authoritative matchmaking queue.
   */
  app.post("/api/matchmaking/join", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const input = joinSchema.parse(request.body);
    const result = await MatchmakingQueueService.joinQueue({
      userId: user.id,
      gameId: input.gameId,
      entryFee: input.stake,
      gameMode: input.gameMode,
      socketId: input.socketId,
    });
    return { ok: true, data: result };
  });

  /**
   * POST /api/matchmaking/cancel
   * Cancel waiting matchmaking queue entry safely.
   */
  app.post("/api/matchmaking/cancel", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const input = cancelSchema.parse(request.body || {});
    const result = await MatchmakingQueueService.cancelQueue(user.id, input.gameId);
    return { ok: true, data: result };
  });

  /**
   * GET /api/matchmaking/status
   * Get current matchmaking queue status, position, and elapsed time.
   */
  app.get("/api/matchmaking/status", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const q = queryParams(request);
    const gameId = queryString(q.gameId);
    const result = await MatchmakingQueueService.getQueueStatus(user.id, gameId);
    return { ok: true, data: result };
  });
}
