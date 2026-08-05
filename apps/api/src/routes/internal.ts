import type { FastifyInstance } from "fastify";
import { AppError } from "@gaming-hub/shared";
import { env } from "../env";
import { routeParams } from "../lib/http";
import { holdMatchWagers, settleMatch } from "../services/settlement";

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

  app.post("/internal/matches/:id/hold-wagers", async (request) => {
    const { id } = routeParams(request);
    const match = await holdMatchWagers(id);
    return { ok: true, status: match.status };
  });

  app.post("/internal/matches/:id/settle", async (request) => {
    const { id } = routeParams(request);
    const result = await settleMatch(id);
    return { ok: true, result };
  });
}
